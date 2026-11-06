import { and, eq, ne } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { db } from "@/db";
import { people, sessions } from "@/db/schema";
import { attemptSignIn, recordSecurityEvent } from "@/server/signin";
import { ABSOLUTE_TTL_MS, createSessionRow, hashToken, sessionState } from "@/server/session-store";
import { ensureSeed } from "@/lib/seed";

const COOKIE = "meridian_session";
const TOUCH_EVERY_MS = 60 * 1000;

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

// Client address headers are trusted only when the app runs behind a proxy that sets them (TRUST_PROXY=1).
// Otherwise a caller could forge them, so no per-address scope is used.
async function clientIp() {
  if (process.env.TRUST_PROXY !== "1") return null;
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || h.get("x-real-ip")?.trim();
  return ip ? ip.slice(0, 64) : null;
}

export async function getSessionActor() {
  await ensureSeed();
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const tokenHash = hashToken(token);
  const [row] = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash));
  if (!row) return null;
  const now = Date.now();
  if (sessionState(row, now) !== "ok") {
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    return null;
  }
  if (now - row.lastSeen > TOUCH_EVERY_MS) {
    await db.update(sessions).set({ lastSeen: now }).where(eq(sessions.tokenHash, tokenHash));
  }
  const [person] = await db.select().from(people).where(eq(people.id, row.personId));
  return person ?? null;
}

export type SignInResult =
  | { ok: true; person: { id: string; name: string; role: string; authority: string }; mustChange: boolean }
  | { ok: false; locked: boolean };

export async function startSession(role: string, password: string): Promise<SignInResult> {
  await ensureSeed();
  const now = Date.now();
  const ip = await clientIp();
  const attempt = await attemptSignIn(role, password, ip);
  if (!attempt.ok) return { ok: false, locked: attempt.locked };
  const person = attempt.person;

  // Rotate: drop any session presented with this request, then issue a fresh token.
  const jar = await cookies();
  const old = jar.get(COOKIE)?.value;
  if (old) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(old)));
  const token = await createSessionRow(person.id, now);
  jar.set(COOKIE, token, cookieOptions(ABSOLUTE_TTL_MS / 1000));
  await recordSecurityEvent(person.name, "Signed in", person.id, `Sign-in succeeded${ip ? ` from ${ip}` : ""}.${person.mustChange ? " One-time password: change required." : ""}`);
  return { ok: true, person: { id: person.id, name: person.name, role: person.role, authority: person.authority }, mustChange: person.mustChange };
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    const tokenHash = hashToken(token);
    const [row] = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash));
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    if (row) {
      const [person] = await db.select().from(people).where(eq(people.id, row.personId));
      await recordSecurityEvent(person?.name ?? "Unknown", "Signed out", row.personId, "Session ended by the user.");
    }
  }
  jar.set(COOKIE, "", cookieOptions(0));
}

/** After a password change, end every other session for the person and keep the current one. */
export async function endOtherSessions(personId: string) {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  const keep = token ? hashToken(token) : "";
  await db.delete(sessions).where(and(eq(sessions.personId, personId), ne(sessions.tokenHash, keep)));
}
