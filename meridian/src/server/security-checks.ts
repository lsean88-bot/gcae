import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "@/db";
import { agentRuns, apiTokens, engagements, evidence, findings, lessons, loginAttempts, people, sessions } from "@/db/schema";
import { weakensIronRule } from "@/lib/lessons";
import { draftFinding, draftReportText, proposeLesson } from "@/server/api-drafts";
import { authenticateBearer, createToken, hashApiToken, tokenCreationRefusal, type ApiActor } from "@/server/api-tokens";
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

  // T-33 to T-38: personal access tokens and the draft-only API.
  const [gcaePerson] = await db.select().from(people).where(eq(people.id, "p-gcae"));
  const made = await createToken(gcaePerson, "uat-token", 90, false);
  const created = made.ok ? made : null;
  const stored = created ? await db.select().from(apiTokens).where(eq(apiTokens.id, created.id)) : [];
  const rawLookup = created ? await db.select().from(apiTokens).where(eq(apiTokens.tokenHash, created.token)) : [];
  check("T-33", "API token is stored as a SHA-256 hash, never raw, with at most 90 days life", Boolean(created) && stored.length === 1 && rawLookup.length === 0 && stored[0].tokenHash === hashApiToken(created!.token) && /^[0-9a-f]{64}$/.test(stored[0].tokenHash) && stored[0].expiresAt - stored[0].createdAt <= 90 * 86400000, `stored=${stored.length} raw found=${rawLookup.length} days=${stored[0] ? Math.round((stored[0].expiresAt - stored[0].createdAt) / 86400000) : "n/a"}`);

  const req = (token: string, extra: Record<string, string> = {}) => new Request("http://x/api/v1/engagements", { headers: { authorization: `Bearer ${token}`, ...extra } });
  const control = created ? await authenticateBearer(req(created.token), "read") : null;
  const tokenFor = async (id: string, patch: { revokedAt?: number; expiresAt?: number; scopes?: string[] }) => {
    const raw = `mt_uat${id}${"x".repeat(24)}`;
    const now = Date.now();
    await db.insert(apiTokens).values({ id, personId: "p-gcae", name: id, tokenHash: hashApiToken(raw), scopes: patch.scopes || ["read", "draft"], createdAt: now - 1000, expiresAt: patch.expiresAt ?? now + 86400000, revokedAt: patch.revokedAt ?? null });
    return raw;
  };
  const revokedRaw = await tokenFor("tok-uat-revoked", { revokedAt: Date.now() });
  const expiredRaw = await tokenFor("tok-uat-expired", { expiresAt: Date.now() - 1000 });
  const readOnlyRaw = await tokenFor("tok-uat-readonly", { scopes: ["read"] });
  const revoked = await authenticateBearer(req(revokedRaw), "read");
  const expired = await authenticateBearer(req(expiredRaw), "read");
  const noDraftScope = await authenticateBearer(req(readOnlyRaw), "draft");
  const cookie = created ? await authenticateBearer(req(created.token, { cookie: "meridian_session=abc" }), "read") : null;
  const garbage = await authenticateBearer(req("mt_" + "z".repeat(40)), "read");
  check("T-34", "Revoked, expired, unknown, scope-less and cookie-carrying requests are refused; a live token works", control?.ok === true && !revoked.ok && revoked.status === 401 && !expired.ok && expired.status === 401 && !garbage.ok && garbage.status === 401 && !noDraftScope.ok && noDraftScope.status === 403 && cookie?.ok === false, `live=${control?.ok} revoked=${!revoked.ok && revoked.status} expired=${!expired.ok && expired.status} unknown=${!garbage.ok && garbage.status} read-only token on draft=${!noDraftScope.ok && noDraftScope.status} cookie=${cookie && !cookie.ok && cookie.status}`);

  const [eng] = await db.select().from(engagements).where(eq(engagements.id, "eng-ap"));
  const evRows = await db.select().from(evidence).where(eq(evidence.engagementId, "eng-ap"));
  const evId = evRows[0]?.id || "";
  const actor: ApiActor = { person: gcaePerson, authority: "gcae", tokenId: "tok-uat", tokenName: "uat-token", scopes: ["read", "draft"], actorLabel: "UAT via Claude token uat-token" };
  const goodBody = { engagementId: "eng-ap", title: "UAT draft finding", condition: "Approvals were missing on sampled invoices.", rootCause: "[ROOT CAUSE TO BE CONFIRMED WITH MANAGEMENT]", evidenceIds: [evId], likelihood: 3, likelihoodRationale: "Seen in the sample.", impacts: { financial: { score: 4, note: "Payments leave the group.", relevant: true } }, riskRating: "Low", priorityScore: 1, status: "Closed" };
  const drafted = await draftFinding(actor, goodBody);
  const draftedId = String(drafted.body.id || "");
  const [row] = draftedId ? await db.select().from(findings).where(eq(findings.id, draftedId)) : [];
  const [engAfter] = await db.select().from(engagements).where(eq(engagements.id, "eng-ap"));
  check("T-35", "A draft finding is forced to Draft, scored server-side, and never issues or changes the engagement", drafted.status === 201 && row?.status === "Draft" && row.priorityScore === 12 && row.priorityBand === "High" && engAfter?.status === eng?.status && engAfter?.gcaeApproved === eng?.gcaeApproved, `http=${drafted.status} status=${row?.status} score=${row?.priorityScore} ${row?.priorityBand} engagement status unchanged=${engAfter?.status === eng?.status}`);

  const withFigure = await draftFinding(actor, { ...goodBody, condition: "Approvals were missing on 987654 invoices." });
  const [anyEng] = [eng];
  const reportBad = await draftReportText(actor, "eng-ap", { text: "The loss across the population is MYR 987654 in total and the report may be issued now." });
  const runsBad = (await db.select().from(agentRuns).where(eq(agentRuns.engagementId, "eng-ap"))).filter((run) => (run.output?.draft || "").includes("987654"));
  const reportGood = await draftReportText(actor, "eng-ap", { text: "Draft for review only. The file records the control objective and the limitations as written. No figure is added." });
  if (typeof reportGood.body.id === "string") await db.delete(agentRuns).where(eq(agentRuns.id, reportGood.body.id));
  const fraudBad = await draftFinding(actor, { ...goodBody, condition: "Fraud was confirmed and the clerk committed fraud." });
  check("T-36", "Figure guard and fraud-conclusion guard refuse drafts through the API path", Boolean(anyEng) && withFigure.status === 422 && reportBad.status === 422 && runsBad.length === 0 && reportGood.status === 201 && fraudBad.status === 422, `finding with new figure=${withFigure.status} report with new figure=${reportBad.status} stored=${runsBad.length} clean report=${reportGood.status} fraud conclusion=${fraudBad.status}`);

  const apiRoot = join(process.cwd(), "src", "app", "api", "v1");
  const routeFiles: string[] = [];
  const walk = (dir: string) => { for (const entry of readdirSync(dir, { withFileTypes: true })) { const full = join(dir, entry.name); if (entry.isDirectory()) walk(full); else routeFiles.push(full); } };
  try { walk(apiRoot); } catch { /* reported below */ }
  const forbiddenName = /issue|approve|rating|threshold|delete|overwrite|close|conclude|waive|clear|qa|materiality|decide/i;
  const badPaths = routeFiles.filter((file) => forbiddenName.test(file.slice(apiRoot.length)));
  const badMethods = routeFiles.filter((file) => /export\s+(async\s+)?function\s+(PUT|PATCH|DELETE)\b/.test(readFileSync(file, "utf8")));
  const weak = await proposeLesson(actor, { title: "Speed up", observation: "Audits are slow.", change: "Waive the evidence step to go faster.", ironRule: "None" });
  const okLesson = await proposeLesson(actor, { title: "UAT lesson", observation: "Seen once.", change: "Record the population count next to records tested.", ironRule: "An evidence gap is not a pass." });
  const lessonStatus = typeof okLesson.body.id === "string" ? (await db.select().from(lessons).where(eq(lessons.id, okLesson.body.id)))[0]?.status : undefined;
  if (typeof okLesson.body.id === "string") await db.delete(lessons).where(eq(lessons.id, okLesson.body.id));
  check("T-37", "No API route can issue, approve, close, clear QA, delete or change thresholds; a lesson that weakens an iron rule is refused; accepted lessons stay proposed", routeFiles.length > 5 && badPaths.length === 0 && badMethods.length === 0 && weak.status === 422 && okLesson.status === 201 && lessonStatus === "proposed", `routes=${routeFiles.length} forbidden paths=${badPaths.length} PUT/PATCH/DELETE=${badMethods.length} weakening lesson=${weak.status} lesson status=${lessonStatus}`);

  const refusals = (["owner", "executive", "none"] as const).map((authority) => tokenCreationRefusal({ authority, mustChange: false }));
  const lockedRefusal = tokenCreationRefusal({ authority: "gcae", mustChange: true });
  const allowed = ["gcae", "manager", "auditor", "qa"].map((authority) => tokenCreationRefusal({ authority, mustChange: false }));
  const ownerAttempt = await createToken({ id: "p-owner-x", name: "Owner", authority: "owner", mustChange: false }, "x", 90, false);
  const lockedAttempt = await createToken({ id: "p-gcae", name: "Locked", authority: "gcae", mustChange: true }, "x", 90, false);
  const leaked = await db.select().from(apiTokens).where(eq(apiTokens.personId, "p-owner-x"));
  check("T-38", "Owners, executives, signed-out and one-time-password users cannot create a token; IA roles can", refusals.every(Boolean) && Boolean(lockedRefusal) && allowed.every((x) => x === null) && !ownerAttempt.ok && !lockedAttempt.ok && leaked.length === 0, `owner/exec/none refused=${refusals.every(Boolean)} locked refused=${Boolean(lockedRefusal)} IA roles allowed=${allowed.every((x) => x === null)} owner create ok=${ownerAttempt.ok} locked create ok=${lockedAttempt.ok}`);

  const legit = ["Never close a finding without evidence", "Use bypass lists carefully"].map(weakensIronRule);
  const weakening = ["Agents may bypass QA", "Auto-approve materiality", "Waive the evidence step to go faster", "Issue without GCAE review"].map(weakensIronRule);
  check("T-39", "Lesson screen passes legitimate rule-keeping sentences and rejects rule-relaxing ones", legit.every((x) => !x) && weakening.every(Boolean), `legit flagged=${legit.join(",")} relaxing flagged=${weakening.join(",")}`);

  // Clean up the test rows. The audit log keeps its events.
  if (draftedId) await db.delete(findings).where(eq(findings.id, draftedId));
  await db.delete(apiTokens).where(inArray(apiTokens.id, ["tok-uat-revoked", "tok-uat-expired", "tok-uat-readonly", ...(created ? [created.id] : [])]));

  return cases;
}
