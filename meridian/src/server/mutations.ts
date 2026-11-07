"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  actions,
  agentRuns,
  aiSystems,
  auditEvents,
  engagementAccess,
  engagements,
  entities,
  evidence,
  findings,
  lessons,
  pbcRequests,
  people,
  risks,
  testRuns,
  vendors,
  type ImpactMap,
} from "@/db/schema";
import { completeWithModel, figuresNotInSource, type AiProvider } from "@/lib/ai";
import { compareReperformance, procedureById, runProcedure } from "@/lib/engine";
import { isoOffset, todayIso, uid } from "@/lib/format";
import { canAdvance, gateBlockers } from "@/lib/gates";
import { AUDIT_ROLES, denyAuthority, effectiveAuthority } from "@/lib/guard";
import { sha256, shortHash } from "@/lib/hash";
import { weakensIronRule } from "@/lib/lessons";
import { cadenceDays } from "@/lib/methodology";
import { buildPrompt, type BriefInput } from "@/lib/reports";
import { ensureSeed } from "@/lib/seed";
import { loadAiStatus, loadProviderKey, preferProvider, removeProviderKey, saveProviderKey } from "@/server/ai-config";
import { engagementForObject, externalModelRefused, guardRecord, hiddenEngagementIds } from "@/server/access";
import { briefFor } from "@/server/brief";
import { executeHarness } from "@/server/harness";
import { WORK_TYPES } from "@/lib/chain";
import { runChainFor, type ChainType } from "@/server/chains";
import { acceptModelDraftAs, decideAgentRunAs } from "@/server/decisions";
import { capFindingSeverity, overrideGuardrailAs, stageRun } from "@/server/guardrail";
import { runSimulation } from "@/server/simulation";
import { runUat } from "@/server/uat";
import { scoreImpacts } from "@/lib/scoring";

export type ActionResult = { ok: true; id?: string; message: string } | { ok: false; error: string };

function refresh() {
  revalidatePath("/", "layout");
}

const SIGNED_OUT = { id: "", name: "Signed out", role: "", team: "", email: "", authority: "none", passwordHash: null, mustChange: false };

// Identity comes only from the server-side session. Nothing the browser sends is trusted as an actor.
async function sessionPerson() {
  const { getSessionActor } = await import("@/server/session");
  return (await getSessionActor()) ?? SIGNED_OUT;
}

// A person who still holds a one-time password has no authority until the password is changed.
async function actor() {
  const person = await sessionPerson();
  return { ...person, authority: effectiveAuthority(person) };
}

async function log(action: string, objectType: string, objectId: string, detail: string, before?: string, after?: string) {
  const who = await sessionPerson();
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

function deny(authority: string, allowed: string[], message: string): ActionResult | null {
  const refusal = denyAuthority(authority, allowed, message);
  return refusal ? { ok: false, error: refusal } : null;
}

async function lockIfIssued(engagementId: string): Promise<ActionResult | null> {
  const [engagement] = await db.select().from(engagements).where(eq(engagements.id, engagementId));
  if (!engagement) return { ok: false, error: "Engagement not found." };
  if (engagement.status === "Issued" || engagement.gcaeApproved) {
    return { ok: false, error: "This report is issued and locked. The GCAE must reopen it before the file can change." };
  }
  return null;
}

export async function login(role: string, password: string): Promise<ActionResult> {
  const { startSession } = await import("@/server/session");
  const result = await startSession(String(role ?? ""), String(password ?? ""));
  if (!result.ok) {
    return { ok: false, error: result.locked ? "Too many failed attempts. Sign-in is locked for 15 minutes." : "Sign-in failed. Check the role and password." };
  }
  refresh();
  return { ok: true, message: `Signed in as ${result.person.name}.` };
}

export async function logout(): Promise<ActionResult> {
  const { endSession } = await import("@/server/session");
  await endSession();
  refresh();
  return { ok: true, message: "Signed out." };
}

export async function changePassword(currentPassword: string, nextPassword: string): Promise<ActionResult> {
  const who = await sessionPerson();
  if (who.authority === "none") return { ok: false, error: "Sign in before changing a password." };
  const { verifyPassword, hashPassword, validateNewPassword } = await import("@/lib/password");
  if (!verifyPassword(String(currentPassword ?? ""), who.passwordHash)) {
    await log("Password change refused", "person", who.id, "Current password was wrong.");
    return { ok: false, error: "The current password is wrong." };
  }
  const problem = validateNewPassword(String(nextPassword ?? ""), who, who.passwordHash);
  if (problem) return { ok: false, error: problem };
  await db.update(people).set({ passwordHash: hashPassword(nextPassword), mustChange: false }).where(eq(people.id, who.id));
  const { endOtherSessions } = await import("@/server/session");
  await endOtherSessions(who.id);
  await log("Changed password", "person", who.id, "Password changed. Other sessions ended. The new password is not stored in the log.", undefined, "changed");
  refresh();
  return { ok: true, message: "Password changed. Use it next time you sign in." };
}

export async function createApiToken(name: string, days: number, readOnly: boolean): Promise<{ ok: true; token: string; message: string } | { ok: false; error: string }> {
  const who = await sessionPerson();
  const { createToken } = await import("@/server/api-tokens");
  const result = await createToken(who, String(name ?? ""), Number(days), Boolean(readOnly));
  if (!result.ok) return result;
  refresh();
  return { ok: true, token: result.token, message: "Token created. Copy it now. It is shown once and cannot be recovered." };
}

export async function revokeApiToken(tokenId: string): Promise<ActionResult> {
  const who = await sessionPerson();
  if (who.authority === "none") return { ok: false, error: "Sign in required." };
  const { revokeToken } = await import("@/server/api-tokens");
  const result = await revokeToken(who, String(tokenId ?? ""));
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Token revoked. It stops working immediately." };
}

async function gcaeOnly() {
  const who = await actor();
  const blocked = deny(who.authority, ["gcae"], "Only the GCAE can restrict an engagement or grant access to it.");
  return { who, blocked };
}

export async function setEngagementRestricted(engagementId: string, restricted: boolean, allowExternalModel: boolean): Promise<ActionResult> {
  const { who, blocked } = await gcaeOnly();
  if (blocked) return blocked;
  const [engagement] = await db.select().from(engagements).where(eq(engagements.id, engagementId));
  if (!engagement) return { ok: false, error: "Engagement not found." };
  await db.update(engagements).set({ restricted: Boolean(restricted), allowExternalModel: restricted ? Boolean(allowExternalModel) : false }).where(eq(engagements.id, engagementId));
  await log(restricted ? "Restricted engagement" : "Removed restriction", "engagement", engagementId, `${engagement.code}: restricted=${Boolean(restricted)}, external models allowed=${restricted ? Boolean(allowExternalModel) : false}.`, String(engagement.restricted), String(Boolean(restricted)));
  refresh();
  return { ok: true, message: restricted ? "Engagement restricted. Only you and the people you grant can see it. Claude tokens never see it." : "Restriction removed." };
}

export async function grantEngagementAccess(engagementId: string, personId: string): Promise<ActionResult> {
  const { who, blocked } = await gcaeOnly();
  if (blocked) return blocked;
  const [engagement] = await db.select().from(engagements).where(eq(engagements.id, engagementId));
  const [person] = await db.select().from(people).where(eq(people.id, String(personId ?? "")));
  if (!engagement || !person) return { ok: false, error: "Engagement or person not found." };
  if (!["manager", "auditor", "qa"].includes(person.authority)) return { ok: false, error: "Access can be granted to Internal Audit staff only." };
  await db.insert(engagementAccess).values({ engagementId, personId, grantedBy: who.id, grantedAt: todayIso() }).onConflictDoNothing();
  await log("Granted engagement access", "engagement", engagementId, `${person.name} can see ${engagement.code}.`);
  refresh();
  return { ok: true, message: `${person.name} can now see this engagement.` };
}

export async function revokeEngagementAccess(engagementId: string, personId: string): Promise<ActionResult> {
  const { blocked } = await gcaeOnly();
  if (blocked) return blocked;
  const [person] = await db.select().from(people).where(eq(people.id, String(personId ?? "")));
  await db.delete(engagementAccess).where(and(eq(engagementAccess.engagementId, engagementId), eq(engagementAccess.personId, personId)));
  await log("Revoked engagement access", "engagement", engagementId, `${person?.name || personId} no longer sees this engagement.`);
  refresh();
  return { ok: true, message: "Access removed." };
}

export async function reopenReport(engagementId: string, note: string): Promise<ActionResult> {
  const who = await actor();
  const blocked = deny(who.authority, ["gcae"], "Only the GCAE can reopen an issued report.");
  if (blocked) return blocked;
  {
    const hidden = await guardRecord(who, { engagementId });
    if (hidden) return hidden;
  }
  if (!note.trim()) return { ok: false, error: "Record why the issued report is being reopened." };
  const [engagement] = await db.select().from(engagements).where(eq(engagements.id, engagementId));
  if (!engagement) return { ok: false, error: "Engagement not found." };
  await db.update(engagements).set({ gcaeApproved: false, status: "Reporting", issuedAt: null }).where(eq(engagements.id, engagementId));
  await log("Reopened report", "engagement", engagementId, note, "Issued", "Reporting");
  refresh();
  return { ok: true, message: "Report reopened. It is not issued." };
}

export async function setActor(): Promise<ActionResult> {
  return { ok: false, error: "Role switching is closed. Sign out and sign in as the person. A screen label is not authority." };
}

export async function registerEvidence(input: {
  engagementId: string;
  sourceSystem: string;
  filename: string;
  documentType: string;
  process: string;
  period: string;
  body: string;
  completeness: string;
  reliability: string;
  limitations: string;
  custodianId: string;
  sheet: string;
}): Promise<ActionResult> {
  const who = await actor();
  const blocked = deny(who.authority, ["gcae", "manager", "auditor", "qa"], "Only Internal Audit can register evidence. A business owner submits it; Audit records it.");
  if (blocked) return blocked;
  {
    const hidden = await guardRecord(who, { engagementId: input.engagementId });
    if (hidden) return hidden;
  }
  if (input.engagementId) {
    const locked = await lockIfIssued(input.engagementId);
    if (locked) return locked;
  }
  if (!input.body.trim() || !input.filename.trim() || !input.sourceSystem.trim()) {
    return { ok: false, error: "Source system, filename, and the body of the evidence are required. An empty register entry is not evidence." };
  }
  const id = uid("ev");
  await db.insert(evidence).values({
    id,
    engagementId: input.engagementId || null,
    sourceSystem: input.sourceSystem,
    originalFilename: input.filename,
    documentType: input.documentType || "Extract",
    businessProcess: input.process || "Unspecified",
    reportingPeriod: input.period || "Unspecified",
    version: 1,
    supersedesId: null,
    fileHash: sha256(input.body),
    receivedAt: todayIso(),
    custodian: input.custodianId,
    obtainedBy: who.id,
    recordCount: Math.max(input.body.trim().split(/\r?\n/).length - 1, 1),
    completeness: input.completeness || "Partial",
    reliability: input.reliability || "R3",
    limitations: input.limitations || "Limitation not stated. Treat completeness as unknown.",
    status: "Registered",
    sheetOrSection: input.sheet || "Body",
    body: input.body,
    populationNote: input.limitations || null,
  });
  await log("Registered evidence", "evidence", id, `${input.filename} hashed and registered. Original body is read-only.`, undefined, input.reliability);
  refresh();
  return { ok: true, id, message: "Evidence registered. It can be tested. It cannot be edited in place." };
}

export async function runTest(input: {
  engagementId: string;
  procedure: string;
  evidenceId: string;
  controlId?: string;
  thresholds: Record<string, number>;
}): Promise<ActionResult> {
  const who = await actor();
  const blocked = deny(who.authority, ["gcae", "manager", "auditor"], "The test executor can be started by an auditor. It cannot approve its own result.");
  if (blocked) return blocked;
  {
    const hidden = await guardRecord(who, { engagementId: input.engagementId });
    if (hidden) return hidden;
  }
  const procedure = procedureById(input.procedure);
  if (!procedure) return { ok: false, error: "That procedure is not in the approved library." };
  const [engagement] = await db.select().from(engagements).where(eq(engagements.id, input.engagementId));
  if (!engagement) return { ok: false, error: "Engagement not found." };
  const locked = await lockIfIssued(input.engagementId);
  if (locked) return locked;
  if (!engagement.materialityApproved) {
    return { ok: false, error: "Materiality is not approved. The screener stops the test. Ask the GCAE to approve the threshold, or record a deviation in writing — do not run it quietly." };
  }
  const approved = engagement.thresholdJson || {};
  const keys = new Set([...Object.keys(approved), ...Object.keys(input.thresholds)]);
  const deviation = [...keys].some((key) => Number(approved[key] ?? input.thresholds[key]) !== Number(input.thresholds[key] ?? approved[key]));
  if (deviation && who.authority !== "gcae") {
    return { ok: false, error: "These thresholds differ from the approved matrix. Only the GCAE can authorise a deviation, and it must be logged before the run." };
  }
  const [source] = await db.select().from(evidence).where(eq(evidence.id, input.evidenceId));
  if (!source?.body) return { ok: false, error: "Select a registered extract. Pasted text must be registered before it is tested." };
  const execution = runProcedure(input.procedure, source.body, input.thresholds);
  const id = uid("tr");
  await db.insert(testRuns).values({
    id,
    engagementId: input.engagementId,
    controlId: input.controlId || null,
    procedure: input.procedure,
    objective: procedure.objective,
    populationDefinition: source.populationNote || source.limitations || "Population note not stated on the evidence.",
    populationCount: execution.populationCount,
    recordsTested: execution.recordsTested,
    method: "Approved procedure applied to the registered extract. Completeness is whatever the evidence record says.",
    thresholdJson: input.thresholds,
    exceptionsCount: execution.failed,
    result: execution.result,
    exposureAmount: execution.exposure,
    currency: execution.currency,
    evidenceId: source.id,
    scriptName: `meridian/procedures/${input.procedure}.ts`,
    scriptVersion: "1.0.0",
    parameterHash: shortHash(JSON.stringify(input.thresholds)),
    executedAt: todayIso(),
    qaStatus: "pending",
    qaResult: null,
    qaNotes: null,
    limitations: execution.limitations.join(" "),
    approvalStatus: "pending",
    approvedBy: null,
    deviation,
    workpaper: execution.workpaper,
  });
  await stageRun({
    id: uid("ar"),
    agent: "Test executor",
    skill: input.procedure,
    engagementId: input.engagementId,
    trigger: `${who.name} started ${procedure.name}.`,
    status: "suggested",
    startedAt: todayIso(),
    completedAt: todayIso(),
    summary: `${execution.workpaper.narrative} Approval is still open.`,
    reasoning: [
      { n: 1, title: "Gate", detail: "Materiality is approved. Thresholds match the matrix, or the GCAE authorised a deviation.", kind: "rule" },
      { n: 2, title: "Evidence", detail: `${source.id} was read. The body was not changed. Hash ${source.fileHash.slice(0, 12)}.`, kind: "read" },
      { n: 3, title: "Calculation", detail: execution.workpaper.narrative, kind: "calc" },
      { n: 4, title: "Limit", detail: execution.limitations.join(" ") || "No extra limitation raised by the procedure.", kind: "limit" },
      { n: 5, title: "Handoff", detail: "Result is pending independent re-performance and a human approval.", kind: "handoff" },
    ],
    inputs: { evidence: source.id, procedure: input.procedure, parameters: JSON.stringify(input.thresholds) },
    output: { result: execution.result, exceptions: String(execution.failed), exposure: String(execution.exposure ?? "") },
    limitations: execution.limitations.join(" "),
    decidedBy: null,
    decisionNote: null,
  });
  await log("Ran procedure", "test", id, execution.workpaper.narrative, undefined, execution.result);
  refresh();
  return { ok: true, id, message: "Workpaper written. It is not approved, and it is not a finding, until a person says so." };
}

export async function reperformTest(testId: string): Promise<ActionResult> {
  const who = await actor();
  const blocked = deny(who.authority, ["qa", "gcae"], "Independent QA is Hannah Berg's role, or the GCAE. The person who ran the test cannot clear it.");
  if (blocked) return blocked;
  {
    const hidden = await guardRecord(who, { testId });
    if (hidden) return hidden;
  }
  const [test] = await db.select().from(testRuns).where(eq(testRuns.id, testId));
  if (!test) return { ok: false, error: "Test not found." };
  if (!test.evidenceId) return { ok: false, error: "The test has no evidence link. It cannot be re-performed." };
  const [source] = await db.select().from(evidence).where(eq(evidence.id, test.evidenceId));
  if (!source?.body) return { ok: false, error: "The original extract is missing. Outcome is Unable to conclude, not a clearance." };
  const second = runProcedure(test.procedure, source.body, test.thresholdJson);
  const first = {
    result: test.result as "PASS" | "FAIL_EXCEPTION" | "UNABLE_TO_CONCLUDE" | "NOT_APPLICABLE",
    failed: test.exceptionsCount,
    unable: test.workpaper.unable,
    exposure: test.exposureAmount,
    populationCount: test.populationCount,
    recordsTested: test.recordsTested,
    passed: test.workpaper.passed,
    notApplicable: test.workpaper.notApplicable,
    currency: test.currency || "MYR",
    limitations: test.workpaper.limitations,
    missingColumns: [],
    workpaper: test.workpaper,
  };
  const compared = compareReperformance(first, second);
  await db.update(testRuns).set({
    qaStatus: compared.match ? "cleared" : "deficiency",
    qaResult: compared.match ? "Match" : "Difference",
    qaNotes: `${compared.note} ${compared.differences.join(" ") || "Counts, result, and exposure matched."} Reviewed by ${who.name}.`,
  }).where(eq(testRuns.id, testId));
  await stageRun({
    id: uid("ar"),
    agent: "Independent re-performer",
    skill: "blind_recalculation",
    engagementId: test.engagementId,
    trigger: `${who.name} re-performed ${test.procedure}.`,
    status: compared.match ? "approved" : "suggested",
    startedAt: todayIso(),
    completedAt: todayIso(),
    summary: compared.match ? "Recalculation matched. Clearance recorded." : "Recalculation did not match. Approval is blocked.",
    reasoning: [
      { n: 1, title: "Blind start", detail: "Recalculation used the evidence body and the stored thresholds. The first conclusion was compared afterwards.", kind: "rule" },
      { n: 2, title: "Recalculation", detail: second.workpaper.narrative, kind: "calc" },
      { n: 3, title: "Compare", detail: compared.differences.join(" ") || "No difference.", kind: "calc" },
    ],
    inputs: { test: testId, evidence: source.id },
    output: { match: String(compared.match), independentResult: compared.independentResult },
    limitations: compared.note,
    decidedBy: who.id,
    decisionNote: compared.match ? "Cleared" : "Deficiency open",
  });
  await log("Re-performed test", "test", testId, compared.note, test.qaStatus, compared.match ? "cleared" : "deficiency");
  refresh();
  return { ok: true, id: testId, message: compared.match ? "Re-performance matched. The test can now be approved by a manager or the GCAE." : "Re-performance did not match. Do not approve the first result." };
}

export async function decideTest(testId: string, decision: "approved" | "rejected", note: string): Promise<ActionResult> {
  const who = await actor();
  const blocked = deny(who.authority, ["manager", "gcae"], "A test result is approved by the audit manager or the GCAE, not by the agent and not by the preparer alone.");
  if (blocked) return blocked;
  {
    const hidden = await guardRecord(who, { testId });
    if (hidden) return hidden;
  }
  const [test] = await db.select().from(testRuns).where(eq(testRuns.id, testId));
  if (!test) return { ok: false, error: "Test not found." };
  if (decision === "approved" && test.qaStatus !== "cleared") {
    return { ok: false, error: "QA has not cleared this test. Approval is blocked so the first narrative cannot clear itself." };
  }
  if (decision === "approved" && !note.trim()) {
    return { ok: false, error: "Write the reason for approval. A click without a note is not a review." };
  }
  await db.update(testRuns).set({ approvalStatus: decision, approvedBy: who.id }).where(eq(testRuns.id, testId));
  await log(decision === "approved" ? "Approved test" : "Rejected test", "test", testId, note || "No note.", test.approvalStatus, decision);
  refresh();
  return { ok: true, message: decision === "approved" ? "Test approved. It is still not an issued report." : "Test rejected. The workpaper stays on file." };
}

export async function saveFinding(input: {
  id?: string;
  engagementId: string;
  controlId?: string;
  testRunId?: string;
  title: string;
  criteria: string;
  condition: string;
  symptom: string;
  immediateCause: string;
  rootCause: string;
  fiveWhys: string[];
  rootCauseClass: string;
  rootCauseTheme: string;
  likelihood: number;
  likelihoodRationale: string;
  impacts: ImpactMap;
  residualRisk: string;
  businessValue: string;
  valueLevel: string;
  recommendation: string;
  expectedOutcome: string;
  managementPosition: string;
  quantifiedImpact?: string;
  evidenceIds: string;
  isolatedOrRecurring: string;
}): Promise<ActionResult> {
  const who = await actor();
  const blocked = deny(who.authority, ["gcae", "manager", "auditor"], "Findings are drafted by Internal Audit. The business agrees or disputes. It does not write the finding.");
  if (blocked) return blocked;
  {
    const hidden = await guardRecord(who, { engagementId: input.engagementId, findingId: input.id });
    if (hidden) return hidden;
  }
  const locked = await lockIfIssued(input.engagementId);
  if (locked) return locked;
  if (!input.title.trim() || !input.condition.trim() || !input.evidenceIds.trim()) {
    return { ok: false, error: "A finding needs a title, a condition, and at least one evidence id. No evidence, no finding." };
  }
  const evidenceIds = input.evidenceIds.split(",").map((item) => item.trim()).filter(Boolean);
  const hiddenEngagements = await hiddenEngagementIds(who);
  // Evidence from a hidden engagement is reported exactly like an id that does not exist.
  const known = (await db.select().from(evidence)).filter((item) => !item.engagementId || !hiddenEngagements.has(item.engagementId));
  const missingEvidence = evidenceIds.filter((id) => !known.some((item) => item.id === id));
  if (missingEvidence.length) {
    return { ok: false, error: `These evidence ids are not on the ledger: ${missingEvidence.join(", ")}. Register the file before you cite it.` };
  }
  if (!input.rootCause.trim()) {
    return { ok: false, error: "Root cause is empty. Use a labelled placeholder such as [ROOT CAUSE TO BE CONFIRMED WITH MANAGEMENT] rather than leaving it blank or inventing one." };
  }
  const scored = scoreImpacts(input.likelihood, input.impacts);
  if (scored.band === "Unscored") {
    return { ok: false, error: "Mark at least one impact dimension as relevant and score it. An unscored rating is not a rating." };
  }
  if (!input.likelihoodRationale.trim() || scored.missingRationale.length) {
    return { ok: false, error: "Every relevant score needs a rationale, including likelihood. Do not assign a number without the reason." };
  }
  const codeBase = input.id ? undefined : `F-${uid("n").slice(-4).toUpperCase()}`;
  // Iron rule: Critical needs independent evidence. REP/ANA alone caps it at High, flagged for fieldwork corroboration.
  const capped = await capFindingSeverity(scored.band, known.filter((item) => evidenceIds.includes(item.id)), input.testRunId, input.engagementId);
  const values = {
    engagementId: input.engagementId,
    controlId: input.controlId || null,
    title: input.title,
    criteria: input.criteria || "[CRITERIA NOT STATED]",
    condition: input.condition,
    symptom: input.symptom || input.condition,
    immediateCause: input.immediateCause || "[IMMEDIATE CAUSE NOT STATED]",
    rootCause: input.rootCause,
    fiveWhys: input.fiveWhys.filter(Boolean),
    rootCauseClass: input.rootCauseClass,
    rootCauseTheme: input.rootCauseTheme,
    riskRating: capped.band,
    likelihood: input.likelihood,
    likelihoodRationale: input.likelihoodRationale,
    impacts: input.impacts,
    priorityScore: scored.score,
    priorityBand: capped.band,
    severityFlag: capped.flag,
    highestImpact: scored.highest,
    highestDimension: scored.highestDimension,
    residualRisk: input.residualRisk || "[RESIDUAL RISK NOT STATED]",
    businessValue: input.businessValue || "[VALUE NOT STATED]",
    valueLevel: input.valueLevel || capped.band,
    recommendation: input.recommendation || "[RECOMMENDATION NOT STATED]",
    expectedOutcome: input.expectedOutcome || "[EXPECTED OUTCOME NOT STATED]",
    managementPosition: input.managementPosition || "Pending",
    quantifiedImpact: input.quantifiedImpact || null,
    evidenceIds: input.evidenceIds,
    testRunId: input.testRunId || null,
    status: "In review",
    isolatedOrRecurring: input.isolatedOrRecurring || "Not yet assessed",
  };
  const id = input.id || uid("f");
  if (input.id) {
    await db.update(findings).set(values).where(eq(findings.id, input.id));
  } else {
    await db.insert(findings).values({ id, code: codeBase!, ...values });
  }
  await log(input.id ? "Updated finding" : "Drafted finding", "finding", id, `${input.title} scored ${scored.score} ${scored.band}.${capped.flag ? ` Severity capped at ${capped.band}: ${capped.flag} (evidence tags ${capped.tags.join(", ")}).` : ""}`, undefined, capped.band);
  refresh();
  return { ok: true, id, message: `Finding saved as ${capped.band} (${scored.score}).${capped.flag ? ` Critical was capped at High: ${capped.flag}.` : ""} The rating is a recommendation until the GCAE accepts the report.` };
}

export async function saveAction(input: {
  id?: string;
  findingId: string;
  engagementId: string;
  agreedAction: string;
  ownerId: string;
  originalDue: string;
  revisedDue?: string;
  status: string;
  percentComplete: number;
  interimControl?: string;
  dependencies?: string;
  evidenceRequired: string;
  evidenceReceived?: string;
  validationStatus: string;
  comments?: string;
  escalation: boolean;
  band?: string;
}): Promise<ActionResult> {
  const who = await actor();
  const isAudit = ["gcae", "manager", "auditor", "qa"].includes(who.authority);
  if (input.status === "Closed") {
    const blocked = deny(who.authority, ["gcae", "manager", "auditor", "qa"], "Management cannot close an action. Internal Audit closes it after validating the evidence.");
    if (blocked) return blocked;
  {
    const hidden = await guardRecord(who, { engagementId: input.engagementId, findingId: input.findingId, actionId: input.id });
    if (hidden) return hidden;
  }
    if (input.validationStatus !== "Validated") {
      return { ok: false, error: "Closure requires validation status Validated, and evidence received that addresses the root cause. A status change alone is not closure." };
    }
  } else {
    const blocked = deny(who.authority, ["gcae", "manager", "auditor", "qa", "owner", "executive"], "You cannot update this action.");
    if (blocked) return blocked;
  }
  if (!isAudit) {
    // Management may only update progress fields on an action it owns. Owner, validation and the agreed terms stay as filed.
    const [existing] = input.id ? await db.select().from(actions).where(eq(actions.id, input.id)) : [];
    if (!existing || existing.ownerId !== who.id) {
      return { ok: false, error: "You can only update progress on an action assigned to you. Internal Audit creates and validates actions." };
    }
    input = {
      ...input,
      findingId: existing.findingId,
      engagementId: existing.engagementId,
      agreedAction: existing.agreedAction,
      ownerId: existing.ownerId,
      originalDue: existing.originalDue,
      evidenceRequired: existing.evidenceRequired,
      validationStatus: existing.validationStatus,
    };
  }
  if (!input.agreedAction.trim() || !input.originalDue || !input.evidenceRequired.trim()) {
    return { ok: false, error: "An action needs the agreed step, a date, and the evidence that will prove it." };
  }
  const nextFollowUp = isoOffset(cadenceDays(input.band || "Medium", false));
  const values = {
    findingId: input.findingId,
    engagementId: input.engagementId,
    agreedAction: input.agreedAction,
    ownerId: input.ownerId,
    originalDue: input.originalDue,
    revisedDue: input.revisedDue || null,
    status: input.status,
    percentComplete: input.percentComplete,
    interimControl: input.interimControl || null,
    dependencies: input.dependencies || null,
    evidenceRequired: input.evidenceRequired,
    evidenceReceived: input.evidenceReceived || null,
    validationStatus: input.validationStatus,
    comments: input.comments || null,
    escalation: input.escalation,
    nextFollowUp,
  };
  const id = input.id || uid("a");
  if (input.id) await db.update(actions).set(values).where(eq(actions.id, input.id));
  else await db.insert(actions).values({ id, supportingOwners: null, ...values });
  await log("Updated action", "action", id, `${input.status}. ${input.comments || ""}`.trim(), undefined, input.status);
  refresh();
  return { ok: true, id, message: input.status === "Closed" ? "Closed after validation." : "Action updated. Overdue is calculated from the date, not from the label." };
}

export async function saveRisk(input: {
  title: string;
  category: string;
  statement: string;
  entityId?: string;
  inherentLikelihood: number;
  inherentImpact: number;
  residualLikelihood: number;
  residualImpact: number;
  appetite: string;
  treatment: string;
  ownerId: string;
  velocity: string;
  linkedControlIds: string;
}): Promise<ActionResult> {
  const who = await actor();
  const blocked = deny(who.authority, ["gcae", "manager", "auditor", "owner", "executive"], "A risk can be proposed by the business or by Audit. It stays a proposal until it is on the register.");
  if (blocked) return blocked;
  if (!input.title.trim() || !input.statement.trim()) return { ok: false, error: "A risk needs a title and a statement of what could go wrong." };
  const id = uid("r");
  await db.insert(risks).values({ id, ...input, entityId: input.entityId || null });
  await log("Added risk", "risk", id, input.statement);
  refresh();
  return { ok: true, id, message: "Risk added to the register. The scores are the ones you entered, not an agent invention." };
}

export async function decideAgentRun(runId: string, decision: "approved" | "rejected", note: string): Promise<ActionResult> {
  const who = await actor();
  const blocked = deny(who.authority, AUDIT_ROLES, "Only Internal Audit can decide an agent suggestion.");
  if (blocked) return blocked;
  {
    const hidden = await guardRecord(who, { runId });
    if (hidden) return hidden;
  }
  const result = await decideAgentRunAs(who, runId, decision, note);
  refresh();
  return result;
}

/** GCAE only. Lets a blocked draft be decided, on the record. It does not approve the draft. */
export async function overrideGuardrail(runId: string, reason: string): Promise<ActionResult> {
  const who = await actor();
  const blocked = deny(who.authority, ["gcae"], "Only the GCAE can override a guardrail.");
  if (blocked) return blocked;
  {
    const hidden = await guardRecord(who, { runId });
    if (hidden) return hidden;
  }
  const result = await overrideGuardrailAs(who, runId, reason);
  refresh();
  return result;
}

export async function approveMateriality(engagementId: string, note: string): Promise<ActionResult> {
  const who = await actor();
  const blocked = deny(who.authority, ["gcae"], "Only the Group Chief Audit Executive approves materiality and thresholds.");
  if (blocked) return blocked;
  {
    const hidden = await guardRecord(who, { engagementId });
    if (hidden) return hidden;
  }
  if (!note.trim()) return { ok: false, error: "Record why this materiality is appropriate. A silent approval is not an approval." };
  const [engagement] = await db.select().from(engagements).where(eq(engagements.id, engagementId));
  if (!engagement) return { ok: false, error: "Engagement not found." };
  if (!engagement.materialityAmount && engagement.materialityAmount !== 0) {
    return { ok: false, error: "There is no proposed amount to approve." };
  }
  await db.update(engagements).set({
    materialityApproved: true,
    materialityApprovedBy: who.id,
  }).where(eq(engagements.id, engagementId));
  if (engagementId === "eng-p2p") {
    await db.update(agentRuns).set({ status: "approved", decidedBy: who.id, decisionNote: note, completedAt: todayIso() }).where(eq(agentRuns.id, "ar-p2p"));
  }
  await log("Approved materiality", "engagement", engagementId, note, "Not approved", `${engagement.materialityCurrency} ${engagement.materialityAmount}`);
  refresh();
  return { ok: true, message: "Materiality approved. Testing can now be treated as in scope." };
}

export async function advanceStage(engagementId: string): Promise<ActionResult> {
  const who = await actor();
  const blocked = deny(who.authority, ["gcae", "manager", "auditor"], "Stage moves are proposed by the engagement team. The orchestrator does not move them on its own.");
  if (blocked) return blocked;
  {
    const hidden = await guardRecord(who, { engagementId });
    if (hidden) return hidden;
  }
  const locked = await lockIfIssued(engagementId);
  if (locked) return locked;
  const [engagement] = await db.select().from(engagements).where(eq(engagements.id, engagementId));
  if (!engagement) return { ok: false, error: "Engagement not found." };
  const evidenceRows = await db.select().from(evidence).where(eq(evidence.engagementId, engagementId));
  const tests = await db.select().from(testRuns).where(eq(testRuns.engagementId, engagementId));
  const findingRows = await db.select().from(findings).where(eq(findings.engagementId, engagementId));
  const exceptionTests = tests.filter((test) => test.exceptionsCount > 0 || test.result === "FAIL_EXCEPTION");
  const linked = new Set(findingRows.map((finding) => finding.testRunId).filter(Boolean));
  const input = {
    stage: engagement.stage,
    objective: engagement.objective,
    scope: engagement.scope,
    period: engagement.period,
    evidenceCount: evidenceRows.length,
    materialityApproved: engagement.materialityApproved,
    testCount: tests.length,
    openExceptionTests: exceptionTests.length,
    linkedExceptionFindings: exceptionTests.filter((test) => linked.has(test.id)).length,
    materialTestsWithoutQa: tests.filter((test) => test.qaStatus !== "cleared").length,
  };
  if (!canAdvance(input)) {
    return { ok: false, error: gateBlockers(input)[0] || "The gate is not met." };
  }
  const next = engagement.stage + 1;
  await db.update(engagements).set({ stage: next, status: next >= 6 ? "Reporting" : next >= 4 ? "Fieldwork" : "In progress" }).where(eq(engagements.id, engagementId));
  await log("Advanced stage", "engagement", engagementId, `Moved from stage ${engagement.stage} to ${next} after the gate check passed.`, String(engagement.stage), String(next));
  refresh();
  return { ok: true, message: `Stage ${next} is open. The move is logged.` };
}

export async function saveOpinion(engagementId: string, opinion: string, rating: string, overrideReason: string): Promise<ActionResult> {
  const who = await actor();
  const blocked = deny(who.authority, ["gcae", "manager"], "The opinion draft is written by the manager or the GCAE.");
  if (blocked) return blocked;
  {
    const hidden = await guardRecord(who, { engagementId });
    if (hidden) return hidden;
  }
  const locked = await lockIfIssued(engagementId);
  if (locked) return locked;
  const findingRows = await db.select().from(findings).where(eq(findings.engagementId, engagementId));
  const highest = findingRows.reduce((max, finding) => Math.max(max, finding.priorityScore), 0);
  const recommended = highest >= 20 ? "Critical" : highest >= 12 ? "High" : highest >= 6 ? "Medium" : highest >= 1 ? "Low" : "Not yet rated";
  if (rating && recommended !== "Not yet rated" && rating !== recommended && !overrideReason.trim()) {
    return { ok: false, error: `The highest finding band is ${recommended}. If you rate the engagement ${rating}, record the reason.` };
  }
  await db.update(engagements).set({
    opinion,
    overallRating: rating || null,
    ratingOverrideReason: overrideReason || null,
  }).where(eq(engagements.id, engagementId));
  await log("Saved opinion draft", "engagement", engagementId, opinion.slice(0, 240), undefined, rating);
  refresh();
  return { ok: true, message: "Opinion draft saved. It is not issued." };
}

export async function issueReport(engagementId: string, acknowledge: boolean, note: string): Promise<ActionResult> {
  const who = await actor();
  const blocked = deny(who.authority, ["gcae"], "Only the GCAE issues a report. The report assembler cannot.");
  if (blocked) return blocked;
  {
    const hidden = await guardRecord(who, { engagementId });
    if (hidden) return hidden;
  }
  if (!acknowledge || !note.trim()) {
    return { ok: false, error: "Issuance needs an acknowledgement that you have read the limitations, and a note. Both are stored." };
  }
  const [engagement] = await db.select().from(engagements).where(eq(engagements.id, engagementId));
  if (!engagement) return { ok: false, error: "Engagement not found." };
  if (engagement.stage < 7) return { ok: false, error: "The engagement is not at reporting and approval." };
  if (!engagement.opinion?.trim()) return { ok: false, error: "Save an opinion draft before issuance. A blank opinion cannot be issued." };
  const tests = await db.select().from(testRuns).where(eq(testRuns.engagementId, engagementId));
  if (tests.length === 0) return { ok: false, error: "No test is on file. Issuance is blocked." };
  if (tests.some((test) => test.qaStatus !== "cleared")) {
    return { ok: false, error: "A test on this engagement has no QA clearance. Issuance is blocked." };
  }
  const findingRows = await db.select().from(findings).where(eq(findings.engagementId, engagementId));
  if (findingRows.some((finding) => !finding.evidenceIds.trim())) {
    return { ok: false, error: "A finding has no evidence id. It cannot go into an issued report." };
  }
  const linked = new Set(findingRows.map((finding) => finding.testRunId).filter(Boolean));
  const unlinked = tests.filter((test) => (test.exceptionsCount > 0 || test.result === "FAIL_EXCEPTION") && !linked.has(test.id));
  if (unlinked.length) {
    return { ok: false, error: "An exception test has no linked finding. Issuance is blocked." };
  }
  await db.update(engagements).set({
    gcaeApproved: true,
    status: "Issued",
    issuedAt: todayIso(),
    reportDate: todayIso(),
    qaStatus: "Cleared",
  }).where(eq(engagements.id, engagementId));
  await log("Issued report", "engagement", engagementId, note, "Not issued", "Issued");
  refresh();
  return { ok: true, message: "Report issued under your name. The agent log records that a person, not a model, issued it." };
}

export async function updatePbc(id: string, status: string, note: string): Promise<ActionResult> {
  const who = await actor();
  const blocked = deny(who.authority, ["gcae", "manager", "auditor", "qa", "owner"], "You cannot update this request.");
  if (blocked) return blocked;
  {
    const hidden = await guardRecord(who, { pbcId: id });
    if (hidden) return hidden;
  }
  const isAudit = ["gcae", "manager", "auditor", "qa"].includes(who.authority);
  if (!["Requested", "Received", "Clarified", "Insufficient", "Sufficient"].includes(status)) return { ok: false, error: "Unknown request status." };
  const [item] = await db.select().from(pbcRequests).where(eq(pbcRequests.id, id));
  if (!item) return { ok: false, error: "Request not found." };
  if (!isAudit) {
    if (item.ownerId !== who.id) return { ok: false, error: "You can only update requests assigned to you." };
    if (!["Received", "Clarified"].includes(status)) return { ok: false, error: "Management can mark a request Received or Clarified. Sufficiency is an Internal Audit judgement." };
  }
  const locked = await lockIfIssued(item.engagementId);
  if (locked) return locked;
  await db.update(pbcRequests).set({ status, sufficiencyNote: note || null }).where(eq(pbcRequests.id, id));
  await log("Updated evidence request", "pbc", id, note || status, undefined, status);
  refresh();
  return { ok: true, message: "Request updated." };
}

export async function checkSufficiency(pbcId: string): Promise<ActionResult> {
  const who = await actor();
  const blocked = deny(who.authority, ["gcae", "manager", "auditor", "qa"], "Sufficiency is an audit judgement. The agent only applies the written rule.");
  if (blocked) return blocked;
  {
    const hidden = await guardRecord(who, { pbcId });
    if (hidden) return hidden;
  }
  const [item] = await db.select().from(pbcRequests).where(eq(pbcRequests.id, pbcId));
  if (!item) return { ok: false, error: "Request not found." };
  let status = item.status;
  let note = "No evidence is linked. The request is not sufficient to test.";
  if (item.evidenceId) {
    const [source] = await db.select().from(evidence).where(eq(evidence.id, item.evidenceId));
    if (!source) note = "The linked evidence id does not exist.";
    else if (source.reliability === "R4" || source.reliability === "R5") {
      status = "Insufficient";
      note = `${source.reliability} evidence cannot support a pass. Ask for a corroborated extract.`;
    } else if (source.completeness === "Partial" || source.completeness === "Unknown") {
      status = "Insufficient";
      note = `Linked ${source.id} is ${source.reliability} but completeness is ${source.completeness}. It can start a test of the extract. It cannot support a conclusion on the untested population.`;
    } else {
      status = "Accepted";
      note = `Linked ${source.id} is ${source.reliability} and marked complete. A person still decides whether the criterion can be tested.`;
    }
  } else {
    status = "Insufficient";
  }
  await db.update(pbcRequests).set({ status, sufficiencyNote: note }).where(eq(pbcRequests.id, pbcId));
  await stageRun({
    id: uid("ar"),
    agent: "Sufficiency reviewer",
    skill: "pbc_check",
    engagementId: item.engagementId,
    trigger: `${who.name} asked whether the request is enough to test.`,
    status: "approved",
    startedAt: todayIso(),
    completedAt: todayIso(),
    summary: note,
    reasoning: [
      { n: 1, title: "Read the request", detail: item.item, kind: "read" },
      { n: 2, title: "Apply the rule", detail: note, kind: "rule" },
    ],
    inputs: { pbc: pbcId, evidence: item.evidenceId || "" },
    output: { status },
    limitations: "The rule does not judge authenticity beyond the reliability grade already on the evidence.",
    decidedBy: who.id,
    decisionNote: "Rule applied and stored.",
  });
  await log("Checked sufficiency", "pbc", pbcId, note, item.status, status);
  refresh();
  return { ok: true, message: note };
}

export async function runScreener(engagementId: string): Promise<ActionResult> {
  const who = await actor();
  const blocked = deny(who.authority, AUDIT_ROLES, "Only Internal Audit can run the screener.");
  if (blocked) return blocked;
  {
    const hidden = await guardRecord(who, { engagementId });
    if (hidden) return hidden;
  }
  const [engagement] = await db.select().from(engagements).where(eq(engagements.id, engagementId));
  if (!engagement) return { ok: false, error: "Engagement not found." };
  const evidenceRows = await db.select().from(evidence).where(eq(evidence.engagementId, engagementId));
  const tests = await db.select().from(testRuns).where(eq(testRuns.engagementId, engagementId));
  const findingRows = await db.select().from(findings).where(eq(findings.engagementId, engagementId));
  const steps = [
    { n: 1, title: "Assignment", detail: engagement.objective && engagement.scope ? "Objective and scope are recorded." : "Objective or scope is missing.", kind: "read" as const },
    { n: 2, title: "Evidence", detail: evidenceRows.length ? `${evidenceRows.length} item(s) registered.` : "No evidence registered. Stop before testing.", kind: "read" as const },
    { n: 3, title: "Materiality", detail: engagement.materialityApproved ? "Approved." : "Not approved. Do not treat a test as in scope.", kind: "rule" as const },
    { n: 4, title: "Tests", detail: tests.length ? tests.map((test) => `${test.procedure}: ${test.result}, QA ${test.qaStatus}`).join("; ") : "No procedure has been run.", kind: "calc" as const },
    { n: 5, title: "Findings", detail: findingRows.length ? `${findingRows.length} on file. ${findingRows.filter((finding) => !finding.evidenceIds).length} without evidence.` : "No finding. That is not a satisfactory opinion.", kind: "limit" as const },
  ];
  const summary = !evidenceRows.length
    ? "Stop. Register evidence before testing."
    : !engagement.materialityApproved
      ? "Stop. Materiality is not approved."
      : tests.some((test) => test.qaStatus !== "cleared")
        ? "Do not issue. A test is waiting on independent re-performance."
        : engagement.gcaeApproved
          ? "Issued. No further agent action."
          : "Ready for a human decision on the opinion. The screener does not write it.";
  const id = uid("ar");
  await stageRun({
    id,
    agent: "Screener",
    skill: "gate_check",
    engagementId,
    trigger: `${who.name} asked the screener to read ${engagement.code}.`,
    status: "suggested",
    startedAt: todayIso(),
    completedAt: todayIso(),
    summary,
    reasoning: [...steps, { n: 6, title: "Handoff", detail: summary, kind: "handoff" }],
    inputs: { engagement: engagementId },
    output: { summary },
    limitations: "The screener reads the file. It does not create facts.",
    decidedBy: null,
    decisionNote: null,
  });
  await log("Ran screener", "agent", id, summary);
  refresh();
  return { ok: true, id, message: summary };
}

export async function createEngagement(input: {
  title: string;
  entityId: string;
  period: string;
  objective: string;
  scope: string;
  leadId: string;
  audience: string;
  businessContext: string;
}): Promise<ActionResult> {
  const who = await actor();
  const blocked = deny(who.authority, ["gcae", "manager", "auditor"], "Engagements are opened by Internal Audit.");
  if (blocked) return blocked;
  if (!input.title.trim() || !input.objective.trim() || !input.scope.trim() || !input.entityId) {
    return { ok: false, error: "Title, entity, objective, and scope are required before an engagement exists." };
  }
  const id = uid("eng");
  const code = `GIA-${todayIso().slice(2, 4)}-${id.slice(-4).toUpperCase()}`;
  await db.insert(engagements).values({
    id,
    code,
    title: input.title,
    entityId: input.entityId,
    period: input.period || todayIso().slice(0, 4),
    objective: input.objective,
    scope: input.scope,
    status: "Planning",
    stage: 1,
    overallRating: null,
    opinion: null,
    ratingOverrideReason: null,
    materialityAmount: null,
    materialityCurrency: "MYR",
    thresholdJson: {},
    materialityApproved: false,
    materialityApprovedBy: null,
    gcaeApproved: false,
    issuedAt: null,
    qaStatus: "Not started",
    audience: input.audience || "Audit committee",
    businessContext: input.businessContext || "[BUSINESS CONTEXT NOT STATED]",
    limitations: "Opened without evidence. Testing is not available until evidence is registered and materiality is approved.",
    leadId: input.leadId || who.id,
    startDate: todayIso(),
    reportDate: null,
    riskAppetite: null,
  });
  await log("Opened engagement", "engagement", id, input.objective, undefined, "Stage 1");
  refresh();
  return { ok: true, id, message: `${code} is open at stage 1. Nothing has been tested.` };
}

export async function updateAiSystem(id: string, status: string, note: string): Promise<ActionResult> {
  const who = await actor();
  const blocked = deny(who.authority, ["gcae", "manager", "auditor"], "AI system status is an Internal Audit or GCAE decision in this register.");
  if (blocked) return blocked;
  if (!note.trim()) return { ok: false, error: "Record the reason for the status change." };
  await db.update(aiSystems).set({ status, reviewNote: note, lastReview: todayIso() }).where(eq(aiSystems.id, id));
  await log("Updated AI system", "ai", id, note, undefined, status);
  refresh();
  return { ok: true, message: "Register updated. This is an internal classification, not a legal determination." };
}

export async function saveVendorAction(input: {
  name: string;
  service: string;
  dataAccess: string;
  criticality: string;
  ownerId: string;
}): Promise<ActionResult> {
  const who = await actor();
  const blocked = deny(who.authority, ["gcae", "manager", "auditor", "owner"], "You cannot add a vendor.");
  if (blocked) return blocked;
  if (!input.name.trim() || !input.service.trim()) return { ok: false, error: "Name and service are required." };
  const access = input.dataAccess.toLowerCase();
  const critical = input.criticality === "High";
  const production = /ot|plant|production|weigh|sap|payroll|bank/.test(access);
  const personal = /personal|payroll|bank|hr/.test(access);
  const tier = critical && (production || personal) ? "1" : critical || personal ? "2" : "3";
  const rationale = `Rule: high criticality with production, finance, or personal-data access is tier 1. Otherwise high or personal data is tier 2. This suggestion is ${tier}. A person must accept it. A missing assurance report is not treated as clean.`;
  const id = uid("v");
  await db.insert(vendors).values({
    id,
    name: input.name,
    service: input.service,
    tier,
    suggestedTier: tier,
    tierRationale: rationale,
    tierStatus: "pending",
    dataAccess: input.dataAccess,
    criticality: input.criticality,
    inherentRisk: tier === "1" ? 4 : tier === "2" ? 3 : 2,
    status: "Active",
    lastAssessment: null,
    socReport: "Not yet requested",
    ownerId: input.ownerId,
    notes: "Added from the workbench. Tier is pending acceptance.",
    nextReview: isoOffset(90),
  });
  await stageRun({
    id: uid("ar"),
    agent: "Vendor tier recommender",
    skill: "tier_rule",
    engagementId: null,
    trigger: `${who.name} added ${input.name}.`,
    status: "suggested",
    startedAt: todayIso(),
    completedAt: null,
    summary: `Suggested tier ${tier} for ${input.name}.`,
    reasoning: [
      { n: 1, title: "Read the rule", detail: rationale, kind: "rule" },
      { n: 2, title: "Read the vendor", detail: `${input.service}. Access: ${input.dataAccess}. Criticality ${input.criticality}.`, kind: "read" },
    ],
    inputs: { vendor: id },
    output: { suggestedTier: tier, currentTier: tier },
    limitations: "No independent evidence has been collected yet.",
    decidedBy: null,
    decisionNote: null,
  });
  await log("Suggested vendor tier", "vendor", id, rationale, undefined, `Tier ${tier} pending`);
  refresh();
  return { ok: true, id, message: `Suggested tier ${tier}. It stays pending until a person accepts it on the agent queue.` };
}

export async function proposeMateriality(engagementId: string, amount: number, currency: string, thresholds: Record<string, number>): Promise<ActionResult> {
  const who = await actor();
  const blocked = deny(who.authority, ["gcae", "manager", "auditor"], "The team can propose materiality. Only the GCAE approves it.");
  if (blocked) return blocked;
  {
    const hidden = await guardRecord(who, { engagementId });
    if (hidden) return hidden;
  }
  if (!amount || amount < 0) return { ok: false, error: "Enter a materiality amount. Zero is not a proposal." };
  await db.update(engagements).set({
    materialityAmount: amount,
    materialityCurrency: currency || "MYR",
    thresholdJson: thresholds,
    materialityApproved: false,
    materialityApprovedBy: null,
  }).where(eq(engagements.id, engagementId));
  await log("Proposed materiality", "engagement", engagementId, `${currency} ${amount}. Not approved by this action.`, undefined, "Proposed");
  refresh();
  return { ok: true, message: "Proposal stored. It is not approved until the GCAE signs it." };
}

export async function draftWithModel(input: {
  engagementId: string;
  provider: AiProvider;
  model?: string;
  audience: string;
}): Promise<ActionResult> {
  const who = await actor();
  const blocked = deny(who.authority, ["gcae", "manager", "auditor"], "Only Internal Audit can ask a model to draft. The draft is not an opinion.");
  if (blocked) return blocked;
  {
    const hidden = await guardRecord(who, { engagementId: input.engagementId });
    if (hidden) return hidden;
  }
  if (await externalModelRefused(input.engagementId)) {
    return { ok: false, error: "This engagement is restricted. Sending its data to an external model needs the GCAE to allow external models for this engagement first." };
  }
  const brief = await briefFor(input.engagementId, input.audience);
  if (!brief) return { ok: false, error: "Engagement not found." };
  const prompt = buildPrompt(brief);
  let result: Awaited<ReturnType<typeof completeWithModel>>;
  try {
    const key = await loadProviderKey(input.provider);
    result = await completeWithModel(input.provider, input.model || "", prompt, key);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The model call failed.";
    return { ok: false, error: message };
  }
  if (!result.ok) return result;
  return storeDraft(who.name, input.engagementId, input.provider, result.model, result.text, prompt, "Asked the connected model to rewrite tone from the file.");
}

export async function fileModelReply(engagementId: string, providerLabel: string, text: string): Promise<ActionResult> {
  const who = await actor();
  const blocked = deny(who.authority, ["gcae", "manager", "auditor"], "Only Internal Audit can file a model reply.");
  if (blocked) return blocked;
  {
    const hidden = await guardRecord(who, { engagementId });
    if (hidden) return hidden;
  }
  if (text.trim().length < 40) return { ok: false, error: "Paste the full reply. A short fragment is not a draft." };
  const brief = await briefFor(engagementId, "Audit committee");
  if (!brief) return { ok: false, error: "Engagement not found." };
  return storeDraft(who.name, engagementId, providerLabel || "pasted", "external chat", text.trim(), buildPrompt(brief), "Filed a reply pasted from an external chat. The workbench did not call a model.");
}

async function storeDraft(actorName: string, engagementId: string, provider: string, model: string, text: string, source: string, trigger: string): Promise<ActionResult> {
  const novel = figuresNotInSource(source, text);
  const limitation = novel.length
    ? `The draft contains figures that are not in the file: ${novel.join(", ")}. Do not accept it until those figures are removed.`
    : "Tone draft only. Scores, evidence, and issuance were not changed.";
  const id = uid("ar");
  await stageRun({
    id,
    agent: "Report assembler",
    skill: "model_draft",
    engagementId,
    trigger,
    status: "suggested",
    startedAt: todayIso(),
    completedAt: todayIso(),
    summary: `${provider} · ${model}. Suggestion only. Not issued.`,
    reasoning: [
      { n: 1, title: "Source", detail: "The prompt was built from the engagement file. The model was told not to add facts.", kind: "read" },
      { n: 2, title: "Figure check", detail: limitation, kind: "limit" },
      { n: 3, title: "Handoff", detail: `${actorName} must read the draft. Accepting it saves tone into the opinion draft. It does not issue the report.`, kind: "handoff" },
    ],
    inputs: { provider, model },
    output: { draft: text, provider, model },
    limitations: limitation,
    decidedBy: null,
    decisionNote: null,
  }, { texts: [text] });
  await log("Filed model draft", "agent", id, limitation, undefined, "suggested");
  refresh();
  return {
    ok: true,
    id,
    message: novel.length
      ? limitation
      : "Draft filed as a suggestion. It is not an issued opinion. Read it, then save it only if the facts are unchanged.",
  };
}

export async function connectAi(provider: "claude" | "openai" | "gemini", key: string): Promise<ActionResult> {
  const who = await actor();
  const blocked = deny(who.authority, ["gcae"], "Only the Group Chief Audit Executive can connect a model. Sign in as Group Chief Audit Executive, then try again.");
  if (blocked) return blocked;
  const trimmed = key.trim();
  if (trimmed.length < 20) return { ok: false, error: "That does not look like a full key. Paste the whole key, with no spaces before or after." };
  const model = provider === "claude"
    ? process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5"
    : provider === "gemini"
      ? process.env.GEMINI_MODEL || "gemini-2.5-flash"
      : process.env.OPENAI_MODEL || "gpt-4.1";
  const probe = await completeWithModel(provider, model, "Reply with the single word connected.", trimmed);
  if (!probe.ok) {
    return { ok: false, error: `The key was not accepted. ${probe.error} A chat subscription is not an API key. Create a key on the provider website, then paste that key.` };
  }
  await saveProviderKey(provider, trimmed);
  await log("Connected model", "settings", provider, `${provider} key stored on the server. The key is not shown again.`, undefined, "connected");
  refresh();
  const label = provider === "claude" ? "Claude" : provider === "gemini" ? "Gemini" : "ChatGPT";
  return { ok: true, message: `${label} is connected. Go to Agent harness and click Run harness.` };
}

export async function disconnectAi(provider: "claude" | "openai" | "gemini"): Promise<ActionResult> {
  const who = await actor();
  const blocked = deny(who.authority, ["gcae"], "Only the Group Chief Audit Executive can disconnect a model.");
  if (blocked) return blocked;
  await removeProviderKey(provider);
  await log("Disconnected model", "settings", provider, "Saved key removed.", "connected", "disconnected");
  refresh();
  const label = provider === "claude" ? "Claude" : provider === "gemini" ? "Gemini" : "ChatGPT";
  return { ok: true, message: `${label} disconnected.` };
}

export async function chooseAi(provider: "claude" | "openai" | "gemini"): Promise<ActionResult> {
  const who = await actor();
  const blocked = deny(who.authority, ["gcae", "manager"], "Only the GCAE or the audit manager can choose which model the harness uses.");
  if (blocked) return blocked;
  const status = await loadAiStatus();
  if (provider === "claude" && !status.claude) return { ok: false, error: "Connect Claude first." };
  if (provider === "openai" && !status.openai) return { ok: false, error: "Connect ChatGPT first." };
  if (provider === "gemini" && !status.gemini) return { ok: false, error: "Connect Gemini first." };
  await preferProvider(provider);
  refresh();
  const label = provider === "claude" ? "Claude" : provider === "gemini" ? "Gemini" : "ChatGPT";
  return { ok: true, message: `The harness will use ${label}.` };
}

export async function rerunSimulation(): Promise<ActionResult> {
  const who = await actor();
  const blocked = deny(who.authority, ["gcae", "manager", "auditor", "qa"], "The simulation is run by Internal Audit.");
  if (blocked) return blocked;
  const summary = await runSimulation();
  refresh();
  return { ok: true, message: `${summary.passed} of ${summary.total} scenarios passed. The report was not issued.` };
}

export async function rerunUat(): Promise<ActionResult> {
  const who = await actor();
  const blocked = deny(who.authority, ["gcae", "manager", "qa"], "UAT is run by the GCAE, the audit manager, or QA.");
  if (blocked) return blocked;
  const summary = await runUat(who.name);
  refresh();
  return { ok: true, message: `${summary.passed} of ${summary.total} checks passed.` };
}

export async function runHarness(engagementId: string): Promise<ActionResult> {
  const who = await actor();
  const blocked = deny(who.authority, ["gcae", "manager", "auditor"], "Only Internal Audit can start the harness. It still cannot issue a report.");
  if (blocked) return blocked;
  {
    const hidden = await guardRecord(who, { engagementId });
    if (hidden) return hidden;
  }
  const locked = await lockIfIssued(engagementId);
  if (locked) return locked;
  const result = await executeHarness(engagementId, who.name, { noExternal: await externalModelRefused(engagementId) });
  refresh();
  if (!result.ok) return result;
  return { ok: true, id: result.id, message: result.message };
}

/** One of the four v1 stage chains. Stages a proposal. Applies nothing. */
export async function runChain(type: ChainType, targetId: string): Promise<ActionResult> {
  const who = await actor();
  const blocked = deny(who.authority, ["gcae", "manager", "auditor"], "Only Internal Audit can start a chain. It still cannot issue, approve or change a record.");
  if (blocked) return blocked;
  {
    const hidden = await guardRecord(who, type === "engagement_fieldwork" ? { engagementId: targetId } : type === "finding_drafting" ? { testId: targetId } : {});
    if (hidden) return hidden;
  }
  if (!WORK_TYPES.includes(type)) return { ok: false, error: "Unknown work type." };
  if (type === "engagement_fieldwork") {
    const locked = await lockIfIssued(targetId);
    if (locked) return locked;
  }
  const result = await runChainFor(who, type, String(targetId ?? ""));
  refresh();
  if (!result.ok) return result;
  return { ok: true, id: result.id, message: result.message };
}

export async function decideLesson(id: string, decision: "accepted" | "rejected", note: string): Promise<ActionResult> {
  const who = await actor();
  const blocked = deny(who.authority, ["gcae", "manager"], "A lesson is accepted by the audit manager or the GCAE. Acceptance cannot waive an iron rule.");
  if (blocked) return blocked;
  {
    const hidden = await guardRecord(who, { lessonId: id });
    if (hidden) return hidden;
  }
  if (!note.trim()) return { ok: false, error: "Write why you accept or reject the lesson." };
  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, id));
  if (!lesson) return { ok: false, error: "Lesson not found." };
  if (decision === "accepted" && weakensIronRule(`${lesson.change} ${note}`)) {
    return { ok: false, error: "This lesson would weaken an iron rule. It cannot be accepted." };
  }
  await db.update(lessons).set({ status: decision, decidedBy: who.id, decisionNote: note }).where(eq(lessons.id, id));
  await log(decision === "accepted" ? "Accepted lesson" : "Rejected lesson", "lesson", id, note, lesson.status, decision);
  refresh();
  return { ok: true, message: decision === "accepted" ? "Lesson accepted. The iron rule it cites still stands." : "Lesson rejected." };
}

export async function acceptModelDraft(runId: string): Promise<ActionResult> {
  const who = await actor();
  const blocked = deny(who.authority, ["gcae", "manager"], "Only the audit manager or the GCAE can place a model draft into the opinion. It still is not issued.");
  if (blocked) return blocked;
  {
    const hidden = await guardRecord(who, { runId });
    if (hidden) return hidden;
  }
  const result = await acceptModelDraftAs(who, runId);
  refresh();
  return result;
}
