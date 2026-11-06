import { eq } from "drizzle-orm";
import { db } from "@/db";
import { actions, engagements, entities, findings, people, testRuns } from "@/db/schema";
import type { BriefInput } from "@/lib/reports";

export async function briefFor(engagementId: string, audience: string): Promise<BriefInput | null> {
  const [engagement] = await db.select().from(engagements).where(eq(engagements.id, engagementId));
  if (!engagement) return null;
  const [entity] = await db.select().from(entities).where(eq(entities.id, engagement.entityId));
  const findingRows = await db.select().from(findings).where(eq(findings.engagementId, engagementId));
  const actionRows = await db.select().from(actions).where(eq(actions.engagementId, engagementId));
  const peopleRows = await db.select().from(people);
  const tests = await db.select().from(testRuns).where(eq(testRuns.engagementId, engagementId));
  const nameOf = (id: string) => peopleRows.find((person) => person.id === id)?.name || "Unassigned";
  return {
    title: engagement.title,
    code: engagement.code,
    period: engagement.period,
    entityName: entity?.name || "",
    objective: engagement.objective,
    scope: engagement.scope,
    businessContext: engagement.businessContext,
    limitations: engagement.limitations,
    overallRating: engagement.overallRating,
    opinion: engagement.opinion,
    ratingOverrideReason: engagement.ratingOverrideReason,
    audience,
    materialityAmount: engagement.materialityAmount,
    materialityCurrency: engagement.materialityCurrency,
    materialityApproved: engagement.materialityApproved,
    gcaeApproved: engagement.gcaeApproved,
    findings: findingRows,
    actions: actionRows.map((action) => ({ ...action, ownerName: nameOf(action.ownerId) })),
    tests,
  };
}
