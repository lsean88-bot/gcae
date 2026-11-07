import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentRuns, auditEvents, engagements, testRuns, type AgentStep } from "@/db/schema";
import { todayIso, uid } from "@/lib/format";
import { HIGH_BAND_MAX } from "@/lib/scoring";
import { deriveEvidenceTags, lintText, severityCap, type LintHit, type TagSource } from "@/lib/iron-rules";
import { captureLesson } from "@/lib/lessons";
import { engagementForObject } from "@/server/access";

/**
 * Server side of the iron-rule guardrails. One place, reusing agent_runs, gates and audit_events.
 * - stageRun():       every staged agent draft is checked and the result is stored on the run.
 * - approvalGate():   a run with a blocking violation cannot be approved.
 * - overrideGuardrailAs(): GCAE only, with a reason, audit-logged, and captured as a lesson.
 */

export type Violation = { rule: string; level: "block" | "note"; message: string; excerpt?: string };
export type RunGuardrail = {
  status: "clear" | "blocked" | "overridden";
  violations: Violation[];
  checkedAt: string;
  override?: { by: string; byId: string; reason: string; at: string };
};

type RunInsert = typeof agentRuns.$inferInsert;
type RunLike = { agent: string; summary: string; limitations: string | null; reasoning: AgentStep[]; output: Record<string, string> };
export type Who = { id: string; name: string; authority: string };

const GUARD_KEYS = ["guardrail", "guardrailStatus"];

const toViolation = (hit: LintHit): Violation => ({ rule: hit.rule, level: "block", message: hit.message, excerpt: hit.excerpt });

/** All agent-written text on a run, except the guardrail record itself. */
export function collectRunText(run: Pick<RunLike, "summary" | "limitations" | "reasoning" | "output">): string {
  const out = Object.entries(run.output ?? {}).filter(([key]) => !GUARD_KEYS.includes(key)).map(([, value]) => String(value));
  return [run.summary, run.limitations ?? "", ...(run.reasoning ?? []).map((step) => `${step.title}. ${step.detail}`), ...out].join("\n");
}

export type CheckOptions = {
  /** Where the draft sits on the fraud ladder. Agent drafts default to the lowest rung. */
  evidenceState?: string;
  /** Text to lint instead of the whole run. Used when a run also carries quoted source data. */
  texts?: string[];
  /** A proposed severity and the evidence tags behind it, for the severity cap. */
  severity?: string;
  evidenceTags?: string[];
};

export function evaluateText(text: string, opts: CheckOptions = {}): { violations: Violation[]; severity?: string } {
  const violations = lintText(text, opts.evidenceState).map(toViolation);
  let severity: string | undefined;
  if (opts.severity) {
    const cap = severityCap(opts.severity, opts.evidenceTags ?? []);
    severity = cap.severity;
    if (cap.capped) {
      // The proposal is already lowered, so this is recorded for the reviewer and does not block.
      violations.push({ rule: "severity-cap", level: "note", message: `Critical lowered to High: evidence is only REP/ANA. Flag: ${cap.flag}.` });
    }
  }
  return { violations, severity };
}

const statusOf = (violations: Violation[]): RunGuardrail["status"] => (violations.some((v) => v.level === "block") ? "blocked" : "clear");

export function readGuardrail(output: Record<string, string> | null | undefined): RunGuardrail | null {
  const raw = output?.guardrail;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RunGuardrail;
  } catch {
    return null;
  }
}

/** Insert an agent run after checking its text. Returns the stored guardrail result. */
export async function stageRun(values: RunInsert, opts: CheckOptions & { chain?: boolean } = {}) {
  const text = opts.texts ? opts.texts.join("\n") : collectRunText({ summary: values.summary, limitations: values.limitations ?? null, reasoning: values.reasoning as AgentStep[], output: (values.output ?? {}) as Record<string, string> });
  const { violations, severity } = evaluateText(text, opts);
  const guardrail: RunGuardrail = { status: statusOf(violations), violations, checkedAt: todayIso() };
  const blocking = violations.filter((v) => v.level === "block");
  const reasoning = [...((values.reasoning as AgentStep[]) ?? [])];
  reasoning.push({
    n: reasoning.length + 1,
    title: "Guardrail check",
    detail: violations.length
      ? `${blocking.length} blocking and ${violations.length - blocking.length} noted. ${violations.map((v) => `[${v.rule}] ${v.message}`).join(" ")}`
      : "Fraud ladder, confidence wording and severity cap checked. Nothing flagged.",
    kind: blocking.length ? "limit" : "guard",
  });
  if (opts.chain) {
    reasoning.push({
      n: reasoning.length + 1,
      title: "Human decision",
      detail: blocking.length
        ? "Approval is blocked until the GCAE overrides with a recorded reason. Rejecting is always open."
        : "Waiting for a person. The harness has not applied, approved or issued anything.",
      kind: "decide",
    });
  }
  const output: Record<string, string> = { ...(values.output as Record<string, string>), guardrail: JSON.stringify(guardrail), guardrailStatus: guardrail.status };
  if (severity) output.severity = severity;
  await db.insert(agentRuns).values({ ...values, reasoning, output });
  if (violations.length) {
    await db.insert(auditEvents).values({
      id: uid("log"),
      at: todayIso(),
      actor: "Guardrail",
      action: blocking.length ? "Guardrail blocked agent draft" : "Guardrail noted agent draft",
      objectType: "agent",
      objectId: values.id,
      beforeState: null,
      afterState: guardrail.status,
      detail: violations.map((v) => `${v.rule}: ${v.message}`).join(" | ").slice(0, 500),
      engagementId: values.engagementId ?? null,
    });
  }
  return guardrail;
}

/** Approval gate. A stored guardrail is authoritative. A run staged before this feature existed is checked now. */
export function approvalGate(run: RunLike): { blocked: boolean; violations: Violation[]; message: string } {
  const stored = readGuardrail(run.output);
  const violations = stored ? stored.violations : evaluateText(collectRunText(run)).violations;
  const status = stored ? stored.status : statusOf(violations);
  const blocking = violations.filter((v) => v.level === "block");
  if (status === "blocked") {
    return { blocked: true, violations, message: `Approval blocked by guardrail (${[...new Set(blocking.map((v) => v.rule))].join(", ")}). The GCAE can override with a written reason, or the draft can be rejected.` };
  }
  return { blocked: false, violations, message: "" };
}

export async function auditAs(who: Who, action: string, objectType: string, objectId: string, detail: string, before?: string, after?: string) {
  await db.insert(auditEvents).values({
    id: uid("log"),
    at: todayIso(),
    actor: who.name,
    action,
    objectType,
    objectId,
    beforeState: before || null,
    afterState: after || null,
    detail,
    engagementId: await engagementForObject(objectType, objectId),
  });
}

/** GCAE-only override of a blocked run. It does not approve the run. It makes approval possible, on the record. */
export async function overrideGuardrailAs(who: Who, runId: string, reason: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  if (who.authority !== "gcae") return { ok: false, error: "Only the GCAE can override a guardrail." };
  const note = String(reason ?? "").trim();
  if (note.length < 10) return { ok: false, error: "Write the reason for the override (at least a sentence). It is audit-logged." };
  const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, runId));
  if (!run) return { ok: false, error: "Agent run not found." };
  if (run.status !== "suggested") return { ok: false, error: "This suggestion has already been decided." };
  // A run staged before this feature has no stored record. approvalGate() checks it now, so it can be overridden too.
  const gate = approvalGate(run);
  if (!gate.blocked) return { ok: false, error: "This run has no blocking guardrail violation to override." };
  const guard: RunGuardrail = readGuardrail(run.output) ?? { status: "blocked", violations: gate.violations, checkedAt: todayIso() };
  const next: RunGuardrail = { ...guard, status: "overridden", override: { by: who.name, byId: who.id, reason: note, at: todayIso() } };
  const blockingRules = [...new Set(guard.violations.filter((v) => v.level === "block").map((v) => v.rule))];
  const claimed = await db.update(agentRuns).set({ output: { ...run.output, guardrail: JSON.stringify(next), guardrailStatus: "overridden" } }).where(and(eq(agentRuns.id, runId), eq(agentRuns.status, "suggested"))).returning({ id: agentRuns.id });
  if (!claimed.length) return { ok: false, error: "This suggestion has already been decided." };
  await auditAs(who, "Overrode guardrail", "agent", runId, `Rules: ${blockingRules.join(", ")}. Reason: ${note}`, "blocked", "overridden");
  for (const rule of blockingRules) {
    await captureLesson({ kind: "override", agent: run.agent, rule, reason: note, engagementId: run.engagementId, decidedBy: who.name });
  }
  return { ok: true, message: "Guardrail overridden and logged. The draft is still not approved. Decide it next." };
}

/** Rules a rejected run broke, or one generic rule when the reviewer simply disagreed. */
export function rulesForRejection(run: RunLike): string[] {
  const stored = readGuardrail(run.output);
  const violations = stored ? stored.violations : evaluateText(collectRunText(run)).violations;
  const rules = [...new Set(violations.filter((v) => v.level === "block").map((v) => v.rule))];
  return rules.length ? rules : ["reviewer-judgement"];
}

/** Codes, titles and ids of ALL restricted engagements. Built from the global set, never from a viewer's filtered data. */
export async function restrictedMaskTerms(): Promise<string[]> {
  const rows = await db.select({ id: engagements.id, code: engagements.code, title: engagements.title }).from(engagements).where(eq(engagements.restricted, true));
  return rows.flatMap((r) => [r.id, r.code, r.title]);
}

/**
 * Finding save path: apply the severity cap from the evidence the finding cites.
 * Returns the band to store and the flag to keep (null when nothing was capped).
 */
export async function capFindingSeverity(band: string, cited: TagSource[], testRunId?: string | null, engagementId?: string | null, rawScore?: number) {
  let qaCleared = false;
  if (testRunId) {
    // QA re-performance only supports a finding when the cleared test belongs to the SAME engagement.
    // The status is stored as "Cleared", so compare case-insensitively. A client-supplied id must not lift the cap.
    const [run] = await db.select({ qa: testRuns.qaStatus, eng: testRuns.engagementId }).from(testRuns).where(eq(testRuns.id, testRunId));
    qaCleared = Boolean(run) && String(run.qa).toLowerCase() === "cleared" && Boolean(engagementId) && run.eng === engagementId;
  }
  const tags = deriveEvidenceTags(cited, { qaCleared });
  const cap = severityCap(band, tags);
  // A capped finding must not keep a Critical-band raw score. Clamp to the High maximum, keep the original in the flag.
  let score = rawScore;
  let flag = cap.flag;
  if (cap.capped && rawScore !== undefined && rawScore > HIGH_BAND_MAX) {
    score = HIGH_BAND_MAX;
    flag = `${cap.flag} (original score ${rawScore} clamped to ${HIGH_BAND_MAX})`;
  }
  return { band: cap.severity, flag, tags, score };
}
