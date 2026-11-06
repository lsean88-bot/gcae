import { readFileSync } from "fs";
import { join } from "path";
import { eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { loginAttempts, people, sessions } from "@/db/schema";
import { AUDIT_ROLES, denyAuthority, effectiveAuthority } from "@/lib/guard";
import { hashPassword, validateNewPassword } from "@/lib/password";
import { resolveSecret, openSecret } from "@/lib/secret-box";
import { ABSOLUTE_TTL_MS, IDLE_TTL_MS, createSessionRow, hashToken, sessionState } from "@/server/session-store";
import { attemptSignIn } from "@/server/signin";
import { LOCK_WINDOW_MS, MAX_ROLE_FAILURES, recentFailures, recordFailure } from "@/server/throttle";

export type SecurityCase = { id: string; name: string; pass: boolean; evidence: string };

function throws(fn: () => unknown) {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

export async function securityChecks(): Promise<SecurityCase[]> {
  const cases: SecurityCase[] = [];
  const check = (id: string, name: string, pass: boolean, evidence: string) => cases.push({ id, name, pass, evidence });

  // T-23: no password literal in password.ts
  let source = "";
  try {
    source = readFileSync(join(process.cwd(), "src", "lib", "password.ts"), "utf8");
  } catch {
    source = "";
  }
  const literal = /password\s*[:=]\s*["'`][^"'`]{4,}["'`]|["'`][A-Za-z]+-[A-Za-z]+-\d{4}["'`]|PRACTICE_PASSWORD|ACCESS_REGISTER|Change-Me/i;
  check("T-23", "No hardcoded password literal in password.ts", source.length > 0 && !literal.test(source), source.length ? `scanned ${source.length} chars, no match` : "source file not readable, scan not performed");

  // T-24: lockout after 5 failures, released after the window
  const scope = `uat:${Date.now()}`;
  const t0 = Date.now();
  const flags: boolean[] = [];
  for (let i = 0; i < MAX_ROLE_FAILURES; i += 1) {
    await recordFailure(scope, t0);
    flags.push((await recentFailures(scope, t0)) >= MAX_ROLE_FAILURES);
  }
  const lockedAt5 = flags[MAX_ROLE_FAILURES - 1] && !flags.slice(0, MAX_ROLE_FAILURES - 1).some(Boolean);
  const freeAfter = (await recentFailures(scope, t0 + LOCK_WINDOW_MS + 1)) < MAX_ROLE_FAILURES;
  await db.delete(loginAttempts).where(eq(loginAttempts.scope, scope));
  check("T-24", "Five failed sign-ins lock the role for 15 minutes", lockedAt5 && freeAfter, `locked at 5th failure=${lockedAt5} released after window=${freeAfter}`);

  // T-25: one-time password holder has no authority
  const guard = effectiveAuthority({ authority: "gcae", mustChange: true });
  const normal = effectiveAuthority({ authority: "gcae", mustChange: false });
  check("T-25", "A one-time password holder has no authority until the password is changed", guard === "locked" && normal === "gcae", `must_change -> ${guard}, changed -> ${normal}`);

  // T-26: secret-box fails closed in production
  const noSecret = throws(() => resolveSecret({ NODE_ENV: "production" }));
  const shortSecret = throws(() => resolveSecret({ NODE_ENV: "production", APP_SECRET: "too-short" }));
  const goodSecret = !throws(() => resolveSecret({ NODE_ENV: "production", APP_SECRET: "x".repeat(32) }));
  const plain = openSecret("sk-plain-text-key-should-not-be-returned") === undefined;
  check("T-26", "Secret box refuses production use without a strong APP_SECRET and never returns unprefixed text", noSecret && shortSecret && goodSecret && plain, `missing=${noSecret} short=${shortSecret} 32chars-ok=${goodSecret} unprefixed-rejected=${plain}`);

  // T-27: session token is stored hashed
  const token = await createSessionRow("p-gcae", Date.now());
  const rows = await db.select().from(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  const raw = await db.select().from(sessions).where(eq(sessions.tokenHash, token));
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  check("T-27", "Session token is stored as a SHA-256 hash, not raw", rows.length === 1 && raw.length === 0 && rows[0].tokenHash !== token && /^[0-9a-f]{64}$/.test(rows[0].tokenHash), `hash found=${rows.length === 1} raw found=${raw.length > 0}`);

  // T-28: idle and absolute limits
  const now = Date.now();
  const idle = sessionState({ lastSeen: now - IDLE_TTL_MS - 1000, expiresAt: now + 1000 }, now);
  const absolute = sessionState({ lastSeen: now, expiresAt: now - 1 }, now);
  const live = sessionState({ lastSeen: now, expiresAt: now + ABSOLUTE_TTL_MS }, now);
  check("T-28", "Sessions end after 30 minutes idle or 12 hours absolute", idle === "idle" && absolute === "expired" && live === "ok", `idle=${idle} absolute=${absolute} live=${live}`);

  // T-29: password policy
  const sample = { id: "p-qa", role: "Independent QA reviewer" };
  const old = hashPassword("Correct-Horse-Battery-9");
  const short = validateNewPassword("Short1!", sample, old);
  const same = validateNewPassword("Correct-Horse-Battery-9", sample, old);
  const hasRole = validateNewPassword("my-independent-qa-reviewer-2026", sample, old);
  const hasId = validateNewPassword("zz-P-QA-zz-long-enough", sample, old);
  const fine = validateNewPassword("Different-Staple-Orbit-42", sample, old);
  check("T-29", "Password policy rejects short, unchanged, and role or id passwords", Boolean(short && same && hasRole && hasId) && fine === null, `short=${Boolean(short)} same=${Boolean(same)} role=${Boolean(hasRole)} id=${Boolean(hasId)} good=${fine === null}`);

  // T-30: audit_events is append-only at the database
  const client = await pool.connect();
  let updateBlocked = false;
  let deleteBlocked = false;
  let probed = false;
  try {
    const probe = await client.query("select id from audit_events limit 1");
    probed = probe.rows.length > 0;
    if (probed) {
      const id = probe.rows[0].id;
      await client.query("begin");
      try { await client.query("update audit_events set detail = detail where id = $1", [id]); } catch { updateBlocked = true; }
      await client.query("rollback");
      await client.query("begin");
      try { await client.query("delete from audit_events where id = $1", [id]); } catch { deleteBlocked = true; }
      await client.query("rollback");
    }
  } finally {
    client.release();
  }
  check("T-30", "Audit log rejects UPDATE and DELETE at the database", updateBlocked && deleteBlocked, probed ? `update blocked=${updateBlocked} delete blocked=${deleteBlocked}` : "no audit row to probe. Run npm run db:harden after first use");

  // T-31: the real sign-in path locks after 5 wrong passwords and then refuses the right one
  const suffix = Math.random().toString(36).slice(2, 8);
  const testId = `p-uat-${suffix}`;
  const testRole = `UAT throwaway role ${suffix}`;
  const goodPassword = `Uat-${suffix}-Correct-Horse-91`;
  await db.insert(people).values({ id: testId, name: "UAT test person (delete)", role: testRole, team: "UAT", email: `${testId}@uat.invalid`, authority: "auditor", passwordHash: hashPassword(goodPassword), mustChange: false });
  const results: string[] = [];
  let lockedAtFifth = false;
  let rightRefused = false;
  let rightWorksBefore = false;
  try {
    // Control: the right password works while not locked, and does not count against the limit.
    const control = await attemptSignIn(testRole, goodPassword, null);
    rightWorksBefore = control.ok;
    for (let i = 1; i <= MAX_ROLE_FAILURES; i += 1) {
      const r = await attemptSignIn(testRole, `wrong-password-${i}`, null);
      results.push(r.ok ? "ok" : r.locked ? "locked" : "refused");
    }
    lockedAtFifth = results.slice(0, 4).every((x) => x === "refused") && results[4] === "locked";
    const after = await attemptSignIn(testRole, goodPassword, null);
    rightRefused = !after.ok && after.locked;
  } finally {
    const { createHash } = await import("crypto");
    const scope = `role:${createHash("sha256").update(testRole).digest("hex").slice(0, 16)}`;
    await db.delete(loginAttempts).where(eq(loginAttempts.scope, scope));
    await db.delete(people).where(eq(people.id, testId));
  }
  check("T-31", "Real sign-in path: 5 wrong passwords lock the role, then the correct password is refused", rightWorksBefore && lockedAtFifth && rightRefused, `control ok=${rightWorksBefore} sequence=${results.join(",")} correct-after-lock refused=${rightRefused}`);

  // T-32: decideAgentRun and runScreener refuse signed-out and locked callers
  let mutationSource = "";
  try {
    mutationSource = readFileSync(join(process.cwd(), "src", "server", "mutations.ts"), "utf8");
  } catch {
    mutationSource = "";
  }
  const guarded = (fn: string) => {
    const start = mutationSource.indexOf(`export async function ${fn}(`);
    return start >= 0 && /deny\(who\.authority, AUDIT_ROLES/.test(mutationSource.slice(start, start + 600));
  };
  const signedOut = denyAuthority("none", AUDIT_ROLES, "x");
  const locked = denyAuthority(effectiveAuthority({ authority: "gcae", mustChange: true }), AUDIT_ROLES, "x");
  const owner = denyAuthority("owner", AUDIT_ROLES, "x");
  const auditor = denyAuthority("auditor", AUDIT_ROLES, "x");
  check("T-32", "decideAgentRun and runScreener refuse signed-out, locked and non-audit callers", Boolean(signedOut && locked && owner) && auditor === null && guarded("decideAgentRun") && guarded("runScreener"), `signed-out=${Boolean(signedOut)} locked=${Boolean(locked)} owner=${Boolean(owner)} auditor allowed=${auditor === null} guard in decideAgentRun=${guarded("decideAgentRun")} runScreener=${guarded("runScreener")}`);

  return cases;
}
