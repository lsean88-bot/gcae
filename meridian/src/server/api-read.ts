import { and, eq, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { actions, engagements, entities, evidence, findings, lessons, risks, testRuns } from "@/db/schema";
import { canAdvance, gateBlockers } from "@/lib/gates";
import { STAGES } from "@/lib/methodology";
import { buildBriefing, qualityChecks, recommendedRating } from "@/lib/reports";
import { restrictedEngagementIds } from "@/server/access";
import { auditApi, type ApiActor } from "@/server/api-tokens";
import { briefFor } from "@/server/brief";

/** Restricted engagements and everything under them never reach a Claude token, not even the GCAE's. */
const notRestricted = <T extends { engagementId?: string | null }>(rows: T[], hidden: Set<string>) => (hidden.size ? rows.filter((r) => !r.engagementId || !hidden.has(r.engagementId)) : rows);

async function refuseRestricted(actor: ApiActor, objectType: string, objectId: string, engagementId: string | null | undefined) {
  if (!engagementId || !(await restrictedEngagementIds()).has(engagementId)) return false;
  await auditApi(actor.actorLabel, "Claude token use denied", objectType, objectId, "Restricted engagement. Tokens never see restricted engagements.", "denied");
  return true;
}

const EVIDENCE_BODY_CAP = 20000;

export async function listEngagements() {
  const hidden = await restrictedEngagementIds();
  const rows = (await db.select().from(engagements)).filter((e) => !hidden.has(e.id));
  return rows.map((e) => ({ id: e.id, code: e.code, title: e.title, entityId: e.entityId, period: e.period, status: e.status, stage: e.stage, overallRating: e.overallRating, materialityApproved: e.materialityApproved, gcaeApproved: e.gcaeApproved, qaStatus: e.qaStatus }));
}

export async function getEngagement(id: string, actor: ApiActor) {
  const [e] = await db.select().from(engagements).where(eq(engagements.id, id));
  if (!e) return null;
  if (await refuseRestricted(actor, "engagement", id, id)) return null;
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
  const rows = notRestricted(engagementId ? await db.select().from(findings).where(eq(findings.engagementId, engagementId)) : await db.select().from(findings), await restrictedEngagementIds());
  return rows.map((f) => ({ id: f.id, code: f.code, engagementId: f.engagementId, title: f.title, priorityScore: f.priorityScore, priorityBand: f.priorityBand, status: f.status, evidenceIds: f.evidenceIds, testRunId: f.testRunId, managementPosition: f.managementPosition }));
}

export async function getFinding(id: string, actor: ApiActor) {
  const [f] = await db.select().from(findings).where(eq(findings.id, id));
  if (f && (await refuseRestricted(actor, "finding", id, f.engagementId))) return null;
  return f || null;
}

export async function listActions(q: { engagementId?: string; findingId?: string; status?: string }) {
  const where: SQL[] = [];
  if (q.engagementId) where.push(eq(actions.engagementId, q.engagementId));
  if (q.findingId) where.push(eq(actions.findingId, q.findingId));
  if (q.status) where.push(eq(actions.status, q.status));
  const rows = where.length ? await db.select().from(actions).where(and(...where)) : await db.select().from(actions);
  return notRestricted(rows, await restrictedEngagementIds());
}

/** Metadata only. Bodies are returned only by getEvidence with include=body. */
export async function listEvidence(engagementId?: string) {
  const rows = notRestricted(engagementId ? await db.select().from(evidence).where(eq(evidence.engagementId, engagementId)) : await db.select().from(evidence), await restrictedEngagementIds());
  return rows.map((r) => shapeEvidence(r, false));
}

export type EvidenceOutcome = { kind: "ok"; evidence: unknown } | { kind: "notfound" } | { kind: "forbidden" };

/**
 * include=body is allowed only for the GCAE, the audit manager, or an auditor who leads that engagement.
 * Meridian has one engagement-assignment field (engagements.lead_id); it is used as the "assigned" list.
 */
export async function getEvidence(id: string, includeBody: boolean, actor: ApiActor): Promise<EvidenceOutcome> {
  const [r] = await db.select().from(evidence).where(eq(evidence.id, id));
  if (!r) return { kind: "notfound" };
  if (await refuseRestricted(actor, "evidence", id, r.engagementId)) return { kind: "notfound" };
  if (includeBody) {
    let allowed = ["gcae", "manager"].includes(actor.authority);
    if (!allowed && actor.authority === "auditor" && r.engagementId) {
      const [e] = await db.select({ lead: engagements.leadId }).from(engagements).where(eq(engagements.id, r.engagementId));
      allowed = e?.lead === actor.person.id;
    }
    if (!allowed) {
      await auditApi(actor.actorLabel, "Claude token use denied", "evidence", id, "Evidence body requested without authority (GCAE, manager, or the auditor leading the engagement).", "denied");
      return { kind: "forbidden" };
    }
  }
  return { kind: "ok", evidence: shapeEvidence(r, includeBody) };
}

function shapeEvidence(r: typeof evidence.$inferSelect, includeBody: boolean) {
  const { body, ...meta } = r;
  return includeBody ? { ...meta, body: (body || "").slice(0, EVIDENCE_BODY_CAP), bodyTruncated: (body || "").length > EVIDENCE_BODY_CAP } : { ...meta, bodyIncluded: false };
}

export async function listRisks() {
  return db.select().from(risks);
}

export async function listTestRuns(engagementId?: string) {
  const rows = notRestricted(engagementId ? await db.select().from(testRuns).where(eq(testRuns.engagementId, engagementId)) : await db.select().from(testRuns), await restrictedEngagementIds());
  return rows.map((t) => ({
    id: t.id, engagementId: t.engagementId, procedure: t.procedure, objective: t.objective, populationCount: t.populationCount,
    recordsTested: t.recordsTested, result: t.result, exceptionsCount: t.exceptionsCount, exposureAmount: t.exposureAmount, currency: t.currency,
    evidenceId: t.evidenceId, executedAt: t.executedAt, qaStatus: t.qaStatus, qaResult: t.qaResult, approvalStatus: t.approvalStatus, limitations: t.limitations,
  }));
}

export async function listLessons() {
  return notRestricted(await db.select().from(lessons), await restrictedEngagementIds());
}

export async function getBriefing(engagementId: string, audience: string, actor: ApiActor) {
  if (await refuseRestricted(actor, "engagement", engagementId, engagementId)) return null;
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
