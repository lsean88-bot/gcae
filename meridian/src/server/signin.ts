import { randomBytes } from "crypto";
import { eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, loginAttempts, people, sessions } from "@/db/schema";
import { MAX_PASSWORD_LENGTH, verifyAgainstNothing, verifyPassword } from "@/lib/password";
import { hashToken } from "@/server/session-store";
import { LOCK_WINDOW_MS, MAX_IP_FAILURES, MAX_ROLE_FAILURES, clearScope, releaseAttempts, reserveAttempts } from "@/server/throttle";

export async function recordSecurityEvent(actor: string, action: string, objectId: string, detail: string) {
  await db.insert(auditEvents).values({
    id: `log-${randomBytes(8).toString("hex")}`,
    at: new Date().toISOString(),
    actor,
    action,
    objectType: "session",
    objectId,
    beforeState: null,
    afterState: null,
    detail,
  });
}

export type Attempt =
  | { ok: true; person: typeof people.$inferSelect }
  | { ok: false; locked: boolean };

/**
 * Throttle and verify a sign-in. No cookies are touched here.
 * A failed-attempt slot is reserved atomically before the password is checked, so parallel guesses
 * cannot exceed the limit. Audit rows are capped: the first failure and the lockout, per window.
 */
export async function attemptSignIn(role: string, password: string, ip: string | null): Promise<Attempt> {
  const now = Date.now();
  // The role scope is hashed so a made-up role behaves exactly like a real one.
  const roleScope = `role:${hashToken(role.slice(0, 200)).slice(0, 16)}`;
  const ipScope = ip ? `ip:${ip}` : null;

  await db.delete(loginAttempts).where(lt(loginAttempts.at, now - 24 * 60 * 60 * 1000));
  await db.delete(sessions).where(lt(sessions.expiresAt, now));

  const scopes = [{ scope: roleScope, max: MAX_ROLE_FAILURES }, ...(ipScope ? [{ scope: ipScope, max: MAX_IP_FAILURES }] : [])];
  const reservation = await reserveAttempts(scopes, now);
  if (reservation.locked) return { ok: false, locked: true };

  const [person] = await db.select().from(people).where(eq(people.role, role));
  const valid =
    password.length > 0 && password.length <= MAX_PASSWORD_LENGTH && person?.passwordHash
      ? verifyPassword(password, person.passwordHash)
      : verifyAgainstNothing(password.slice(0, MAX_PASSWORD_LENGTH));

  if (person && valid) {
    await clearScope(roleScope);
    if (ipScope) await releaseAttempts([reservation.ids[ipScope]]);
    return { ok: true, person };
  }

  const who = person?.name ?? "Unknown role";
  const objectId = person?.id ?? "unknown";
  const where = ip ? ` from ${ip}` : "";
  const roleCount = reservation.counts[roleScope];
  const minutes = LOCK_WINDOW_MS / 60000;
  if (roleCount === 1) await recordSecurityEvent(who, "Sign-in failed", objectId, `Failed sign-in${where}. Further failures in this ${minutes} minute window are counted, not logged.`);
  if (roleCount === MAX_ROLE_FAILURES) await recordSecurityEvent(who, "Sign-in locked", objectId, `Locked for ${minutes} minutes after ${MAX_ROLE_FAILURES} failed attempts${where}.`);
  if (ipScope && reservation.counts[ipScope] === MAX_IP_FAILURES) {
    await recordSecurityEvent("Unknown role", "Sign-in locked", "ip", `Address ${ip} locked for ${minutes} minutes after ${MAX_IP_FAILURES} failed attempts.`);
  }
  const locked = roleCount >= MAX_ROLE_FAILURES || (ipScope ? reservation.counts[ipScope] >= MAX_IP_FAILURES : false);
  return { ok: false, locked };
}
