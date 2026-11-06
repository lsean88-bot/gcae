import { and, eq, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { actions, engagements, entities, evidence, findings, lessons, risks, testRuns } from "@/db/schema";
import { canAdvance, gateBlockers } from "@/lib/gates";
import { STAGES } from "@/lib/methodology";
import { buildBriefing, qualityChecks, recommendedRating } from "@/lib/reports";
import { briefFor } from "@/server/brief";

const EVIDENCE_BODY_CAP = 20000;

export async function listEngagements() {
  const rows = await db.select().from(engagements);
  return rows.map((e) => ({ id: e.id, code: e.code, title: e.title, entityId: e.entityId, period: e.period, status: e.status, stage: e.stage, overallRating: e.overallRating, materialityApproved: e.materialityApproved, gcaeApproved: e.gcaeApproved, qaStatus: e.qaStatus }));
}

export async function getEngagement(id: string) {
  const [e] = await db.select().from(engagements).where(eq(engagements.id, id));
  if (!e) return null;
  const [entity] = await db.select().from(entities).where(eq(entities.id, e.entityId));
  const ev = await db.select({ id: evidence.id }).from(evidence).where(eq(evidence.engagementId, id));
  const tests = await db.select().from(testRuns).where(eq(testRuns.engagementId, id));
  const fs = await db.select().from(findings).where(eq(findings.engagementId, id));
  const exceptionTests = tests.filter((t) => t.exceptionsCount > 0 || t.result === "FAIL_EXCEPTION");
  const linked = new Set(fs.filter((f) => f.testRunId).map((f) => f.testRunId));
  const gateInput = {
    stage: e.stage, objective: e.objective, scope: e.scope, period: e.period, evidenceCount: ev.length,
    materialityApproved: e.materialityApproved, testCount: tests.length, openExceptionTests: exceptionTests.length,
    linkedExceptionFindings: exceptionTests.filter((t) => linked.has(t.id)).length, materialTestsWithoutQa: tests.filter((t) => t.qaStatus !== "cleared").length,
  };
  return {
    id: e.id, code: e.code, title: e.title, entity: entity?.name || null, period: e.period, objective: e.objective, scope: e.scope,
    businessContext: e.businessContext, limitations: e.limitations, status: e.status, stage: e.stage,
    stageName: STAGES.find((s) => s.n === e.stage)?.name || "Unknown",
    materiality: { amount: e.materialityAmount, currency: e.materialityCurrency, approved: e.materialityApproved, approvedBy: e.materialityApprovedBy, thresholds: e.thresholdJson },
    overallRating: e.overallRating, opinion: e.opinion, qaStatus: e.qaStatus, issuedByGcae: e.gcaeApproved, issuedAt: e.issuedAt,
    gates: { canAdvance: canAdvance(gateInput), blockers: gateBlockers(gateInput), evidenceCount: ev.length, testCount: tests.length, openExceptionTests: exceptionTests.length, testsWithoutQaClearance: gateInput.materialTestsWithoutQa },
    findingCount: fs.length,
  };
}

export async function listFindings(engagementId?: string) {
  const rows = engagementId ? await db.select().from(findings).where(eq(findings.engagementId, engagementId)) : await db.select().from(findings);
  return rows.map((f) => ({ id: f.id, code: f.code, engagementId: f.engagementId, title: f.title, priorityScore: f.priorityScore, priorityBand: f.priorityBand, status: f.status, evidenceIds: f.evidenceIds, testRunId: f.testRunId, managementPosition: f.managementPosition }));
}

export async function getFinding(id: string) {
  const [f] = await db.select().from(findings).where(eq(findings.id, id));
  return f || null;
}

export async function listActions(q: { engagementId?: string; findingId?: string; status?: string }) {
  const where: SQL[] = [];
  if (q.engagementId) where.push(eq(actions.engagementId, q.engagementId));
  if (q.findingId) where.push(eq(actions.findingId, q.findingId));
  if (q.status) where.push(eq(actions.status, q.status));
  return where.length ? db.select().from(actions).where(and(...where)) : db.select().from(actions);
}

/** Metadata only. Bodies are returned only by getEvidence with include=body (capped, Internal Audit roles only). */
export async function listEvidence(engagementId?: string) {
  const rows = engagementId ? await db.select().from(evidence).where(eq(evidence.engagementId, engagementId)) : await db.select().from(evidence);
  return rows.map((r) => shapeEvidence(r, false));
}

export async function getEvidence(id: string, includeBody: boolean) {
  const [r] = await db.select().from(evidence).where(eq(evidence.id, id));
  return r ? shapeEvidence(r, includeBody) : null;
}

function shapeEvidence(r: typeof evidence.$inferSelect, includeBody: boolean) {
  const { body, ...meta } = r;
  return includeBody ? { ...meta, body: (body || "").slice(0, EVIDENCE_BODY_CAP), bodyTruncated: (body || "").length > EVIDENCE_BODY_CAP } : { ...meta, bodyIncluded: false };
}

export async function listRisks() {
  return db.select().from(risks);
}

export async function listTestRuns(engagementId?: string) {
  const rows = engagementId ? await db.select().from(testRuns).where(eq(testRuns.engagementId, engagementId)) : await db.select().from(testRuns);
  return rows.map((t) => ({
    id: t.id, engagementId: t.engagementId, procedure: t.procedure, objective: t.objective, populationCount: t.populationCount,
    recordsTested: t.recordsTested, result: t.result, exceptionsCount: t.exceptionsCount, exposureAmount: t.exposureAmount, currency: t.currency,
    evidenceId: t.evidenceId, executedAt: t.executedAt, qaStatus: t.qaStatus, qaResult: t.qaResult, approvalStatus: t.approvalStatus, limitations: t.limitations,
  }));
}

export async function listLessons() {
  return db.select().from(lessons);
}

export async function getBriefing(engagementId: string, audience: string) {
  const brief = await briefFor(engagementId, audience);
  if (!brief) return null;
  return {
    engagementId,
    notIssued: !brief.gcaeApproved,
    recommendedRating: recommendedRating(brief.findings),
    sections: buildBriefing(brief),
    qualityChecks: qualityChecks(brief),
    note: "Generated from the file. A briefing is not an issued report. Only the GCAE issues.",
  };
}
