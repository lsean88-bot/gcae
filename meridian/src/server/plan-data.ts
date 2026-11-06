import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditPlans, planItems } from "@/db/schema";
import { bundleFor } from "@/lib/data";
import { rankEntities, type PlanWeights } from "@/lib/plan-scoring";
import { todayIso } from "@/lib/format";

/** Ranks every auditable entity from what this person is allowed to see. Last audit = latest ISSUED engagement, else the entity's recorded last audit. */
export async function rankForPerson(person: { id: string; authority: string }, weights: PlanWeights, mandatoryEntityIds: Set<string>) {
  const data = await bundleFor(person);
  const asOf = todayIso();
  const inputs = data.entityRows.map((entity) => {
    const issued = data.engagementRows.filter((e) => e.entityId === entity.id && e.status === "Issued" && e.issuedAt).map((e) => (e.issuedAt as string).slice(0, 10)).sort();
    const fromEngagement = issued[issued.length - 1] ?? null;
    return {
      entityId: entity.id,
      name: entity.name,
      risks: data.riskRows.filter((r) => r.entityId === entity.id).map((r) => ({ inherent: r.inherentLikelihood * r.inherentImpact, residual: r.residualLikelihood != null && r.residualImpact != null ? r.residualLikelihood * r.residualImpact : null })),
      lastAuditDate: fromEngagement ?? entity.lastAudit,
      lastAuditSource: fromEngagement ? "Issued engagement" : entity.lastAudit ? "Entity record (no issued engagement in app)" : "None on file",
      mandatory: mandatoryEntityIds.has(entity.id),
    };
  });
  const ranked = rankEntities(inputs, weights, asOf);
  return { ranked, sources: Object.fromEntries(inputs.map((i) => [i.entityId, { lastAuditDate: i.lastAuditDate, source: i.lastAuditSource }])), data };
}

export async function loadPlan(planId: string) {
  const [plan] = await db.select().from(auditPlans).where(eq(auditPlans.id, planId));
  if (!plan) return null;
  const items = await db.select().from(planItems).where(eq(planItems.planId, planId));
  return { plan, items };
}
