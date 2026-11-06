import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agentRuns, engagements, evidence, findings, lessons, testRuns, type ImpactMap } from "@/db/schema";
import { figuresNotInSource } from "@/lib/ai";
import { todayIso, uid } from "@/lib/format";
import { weakensIronRule } from "@/lib/lessons";
import { buildPrompt } from "@/lib/reports";
import { emptyImpacts, scoreImpacts } from "@/lib/scoring";
import { auditApi, type ApiActor } from "@/server/api-tokens";
import { briefFor } from "@/server/brief";

export type DraftResult = { status: number; body: Record<string, unknown> };
const refuse = (status: number, error: string): DraftResult => ({ status, body: { ok: false, error } });

/** Fraud indicators are red flags. A draft may not state that fraud is proven or name a perpetrator. */
export const FRAUD_CONCLUSION = /fraud (was|has been|is) (committed|confirmed|proven|established)|confirmed fraud|proven fraud|committed (a )?fraud|perpetrat|is guilty|are guilty|embezzled by|stole[n]? by/i;

const STR_CAP = 8000;
const str = (v: unknown, cap = STR_CAP) => (typeof v === "string" ? v.trim().slice(0, cap) : "");

async function engagementOpen(engagementId: string) {
  const [engagement] = await db.select().from(engagements).where(eq(engagements.id, engagementId));
  if (!engagement) return { error: refuse(404, "Engagement not found.") };
  if (engagement.status === "Issued" || engagement.gcaeApproved) {
    return { error: refuse(409, "This report is issued and locked. The GCAE must reopen it before the file can change.") };
  }
  return { engagement };
}

export async function draftFinding(actor: ApiActor, body: Record<string, unknown>): Promise<DraftResult> {
  const engagementId = str(body.engagementId, 80);
  const gate = await engagementOpen(engagementId);
  if (gate.error) return gate.error;
  const engagement = gate.engagement!;

  const title = str(body.title, 300);
  const condition = str(body.condition);
  const rootCause = str(body.rootCause);
  const evidenceIds = (Array.isArray(body.evidenceIds) ? body.evidenceIds : str(body.evidenceIds).split(",")).map((x) => str(x, 80)).filter(Boolean);
  if (!title || !condition || evidenceIds.length === 0) return refuse(422, "A finding needs a title, a condition, and at least one evidence id. No evidence, no finding.");
  if (!rootCause) return refuse(422, "Root cause is empty. Use a labelled placeholder such as [ROOT CAUSE TO BE CONFIRMED WITH MANAGEMENT]. Do not invent one.");

  const evidenceRows = await db.select().from(evidence);
  const cited = evidenceIds.map((id) => evidenceRows.find((row) => row.id === id));
  const missing = evidenceIds.filter((_, i) => !cited[i]);
  if (missing.length) return refuse(422, `These evidence ids are not on the ledger: ${missing.join(", ")}. Register the file before you cite it.`);
  const foreign = cited.filter((row) => row && row.engagementId !== engagementId).map((row) => row!.id);
  if (foreign.length) return refuse(422, `These evidence ids belong to another engagement: ${foreign.join(", ")}.`);

  const testRunId = str(body.testRunId, 80);
  const runs = await db.select().from(testRuns).where(eq(testRuns.engagementId, engagementId));
  if (testRunId && !runs.some((run) => run.id === testRunId)) return refuse(422, "That test run is not on this engagement.");

  const likelihood = Number(body.likelihood);
  if (!Number.isInteger(likelihood) || likelihood < 1 || likelihood > 5) return refuse(422, "Likelihood must be a whole number from 1 to 5.");
  const impacts: ImpactMap = emptyImpacts();
  const given = body.impacts && typeof body.impacts === "object" ? (body.impacts as Record<string, Record<string, unknown>>) : {};
  for (const [dim, cell] of Object.entries(given)) {
    if (!(dim in impacts)) return refuse(422, `Unknown impact dimension "${dim}". Use: ${Object.keys(impacts).join(", ")}.`);
    const score = Number(cell?.score);
    if (!Number.isInteger(score) || score < 0 || score > 5) return refuse(422, `Impact score for ${dim} must be 0 to 5.`);
    impacts[dim] = { score, note: str(cell?.note, 1000), relevant: cell?.relevant !== false && score > 0 };
  }
  // Priority is computed here from likelihood and impact. A caller-supplied rating or score is ignored.
  const scored = scoreImpacts(likelihood, impacts);
  if (scored.band === "Unscored") return refuse(422, "Mark at least one impact dimension as relevant and score it. An unscored rating is not a rating.");
  const likelihoodRationale = str(body.likelihoodRationale, 1000);
  if (!likelihoodRationale || scored.missingRationale.length) return refuse(422, "Every relevant score needs a rationale, including likelihood.");

  const fields = {
    criteria: str(body.criteria) || "[CRITERIA NOT STATED]",
    symptom: str(body.symptom) || condition,
    immediateCause: str(body.immediateCause) || "[IMMEDIATE CAUSE NOT STATED]",
    residualRisk: str(body.residualRisk) || "[RESIDUAL RISK NOT STATED]",
    businessValue: str(body.businessValue) || "[VALUE NOT STATED]",
    recommendation: str(body.recommendation) || "[RECOMMENDATION NOT STATED]",
    expectedOutcome: str(body.expectedOutcome) || "[EXPECTED OUTCOME NOT STATED]",
    quantifiedImpact: str(body.quantifiedImpact) || null,
    rootCauseClass: str(body.rootCauseClass, 120) || "Not yet assessed",
    rootCauseTheme: str(body.rootCauseTheme, 120) || "Not yet assessed",
    isolatedOrRecurring: str(body.isolatedOrRecurring, 120) || "Not yet assessed",
  };
  const fiveWhys = (Array.isArray(body.fiveWhys) ? body.fiveWhys : []).map((x) => str(x, 1000)).filter(Boolean).slice(0, 5);
  const text = [title, condition, rootCause, likelihoodRationale, ...Object.values(fields), ...fiveWhys, ...Object.values(impacts).map((c) => c.note)].filter(Boolean).join("\n");

  if (FRAUD_CONCLUSION.test(text)) return refuse(422, "A fraud indicator is a red flag, not a finding of fraud. Remove any statement that fraud is confirmed or that a person did it.");
  // Figure guard: every figure must appear in the cited evidence, the engagement file or its test workpapers.
  const source = JSON.stringify([engagement, cited, runs]);
  const novel = figuresNotInSource(source, text);
  if (novel.length) return refuse(422, `The draft contains figures that are not in the source file: ${novel.join(", ")}. Remove them or cite evidence that holds them.`);

  const id = uid("f");
  await db.insert(findings).values({
    id,
    code: `F-${uid("n").slice(-4).toUpperCase()}`,
    engagementId,
    controlId: null,
    title,
    condition,
    rootCause,
    fiveWhys,
    riskRating: scored.band,
    likelihood,
    likelihoodRationale,
    impacts,
    priorityScore: scored.score,
    priorityBand: scored.band,
    highestImpact: scored.highest,
    highestDimension: scored.highestDimension,
    valueLevel: scored.band,
    managementPosition: "Pending",
    evidenceIds: evidenceIds.join(", "),
    testRunId: testRunId || null,
    status: "Draft",
    ...fields,
  });
  await auditApi(actor.actorLabel, "Drafted finding (Claude token)", "finding", id, `${title} drafted as Draft, computed ${scored.score} ${scored.band}. A person must review it.`, "Draft");
  return { status: 201, body: { ok: true, id, status: "Draft", priorityScore: scored.score, priorityBand: scored.band, message: "Draft saved. The priority was computed by Meridian. A person must review it; it is not issued." } };
}

export async function draftReportText(actor: ApiActor, engagementId: string, body: Record<string, unknown>): Promise<DraftResult> {
  const gate = await engagementOpen(engagementId);
  if (gate.error) return gate.error;
  const text = str(body.text, 20000);
  if (text.length < 40) return refuse(422, "The draft is too short to be a draft.");
  if (FRAUD_CONCLUSION.test(text)) return refuse(422, "A fraud indicator is a red flag, not a finding of fraud. Remove any statement that fraud is confirmed or that a person did it.");
  const brief = await briefFor(engagementId, "Audit committee");
  if (!brief) return refuse(404, "Engagement not found.");
  const novel = figuresNotInSource(buildPrompt(brief), text);
  if (novel.length) return refuse(422, `The draft contains figures that are not in the engagement file: ${novel.join(", ")}. Remove them.`);
  const id = uid("ar");
  const note = "Draft text filed through a Claude token. Figures checked against the engagement file. Scores, evidence and issuance were not changed.";
  await db.insert(agentRuns).values({
    id,
    agent: "Report assembler",
    skill: "model_draft",
    engagementId,
    trigger: `Filed by ${actor.actorLabel}`,
    status: "suggested",
    startedAt: todayIso(),
    completedAt: todayIso(),
    summary: "Claude (MCP token). Suggestion only. Not issued.",
    reasoning: [
      { n: 1, title: "Figure check", detail: note, kind: "limit" },
      { n: 2, title: "Handoff", detail: "The audit manager or GCAE must read the draft. Accepting it saves text into the opinion draft. It does not issue the report.", kind: "handoff" },
    ],
    inputs: { provider: "Claude MCP", token: actor.tokenName },
    output: { draft: text, provider: "Claude MCP", model: "via MCP token" },
    limitations: note,
    decidedBy: null,
    decisionNote: null,
  });
  await auditApi(actor.actorLabel, "Filed report draft (Claude token)", "agent", id, `Draft text filed for ${engagementId} as a suggestion. Not issued.`, "suggested");
  return { status: 201, body: { ok: true, id, status: "suggested", message: "Draft filed as a suggestion for human review. It is not an issued opinion and is not in the opinion field until a manager or the GCAE accepts it." } };
}

export async function proposeLesson(actor: ApiActor, body: Record<string, unknown>): Promise<DraftResult> {
  const title = str(body.title, 300);
  const observation = str(body.observation);
  const change = str(body.change);
  const ironRule = str(body.ironRule, 500);
  const engagementId = str(body.engagementId, 80);
  if (!title || !observation || !change || !ironRule) return refuse(422, "A lesson needs a title, an observation, a change, and the iron rule it keeps.");
  if (weakensIronRule(`${title} ${change} ${observation} ${ironRule}`)) return refuse(422, "This lesson would weaken an iron rule. It cannot be proposed.");
  if (FRAUD_CONCLUSION.test(`${title} ${observation} ${change}`)) return refuse(422, "A fraud indicator is a red flag, not a finding of fraud.");
  if (engagementId) {
    const [found] = await db.select().from(engagements).where(eq(engagements.id, engagementId));
    if (!found) return refuse(404, "Engagement not found.");
  }
  const id = uid("lsn");
  await db.insert(lessons).values({ id, engagementId: engagementId || null, title, observation, change, area: str(body.area, 80) || "general", ironRule, status: "proposed", createdAt: todayIso(), decidedBy: null, decisionNote: null });
  await auditApi(actor.actorLabel, "Proposed lesson (Claude token)", "lesson", id, `${title}. Status proposed. Acceptance needs the audit manager or the GCAE.`, "proposed");
  return { status: 201, body: { ok: true, id, status: "proposed", message: "Lesson proposed. The audit manager or the GCAE decides. Acceptance cannot waive an iron rule." } };
}
