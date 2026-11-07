import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { actions, agentRuns, analyticsRuns, engagementAccess, engagements, evidence, findings, lessons, pbcRequests, testRuns } from "@/db/schema";

/**
 * ONE place that decides whether a person may see an engagement and everything under it.
 * A restricted engagement is visible only to the GCAE and to people the GCAE has granted.
 * Everyone else must not learn it exists: lists omit it, direct ids behave as "not found".
 */
type Who = { id: string; authority: string };

export async function restrictedEngagementIds(): Promise<Set<string>> {
  const rows = await db.select({ id: engagements.id }).from(engagements).where(eq(engagements.restricted, true));
  return new Set(rows.map((r) => r.id));
}

/** Restricted engagements this person may NOT see. The GCAE sees all. */
export async function hiddenEngagementIds(person: Who): Promise<Set<string>> {
  const all = await restrictedEngagementIds();
  if (all.size === 0 || person.authority === "gcae") return new Set();
  const grants = await db.select().from(engagementAccess).where(eq(engagementAccess.personId, person.id));
  for (const g of grants) all.delete(g.engagementId);
  return all;
}

export async function engagementHidden(person: Who, engagementId: string | null | undefined) {
  if (!engagementId) return false;
  return (await hiddenEngagementIds(person)).has(engagementId);
}

export type RecordRef = { engagementId?: string | null; testId?: string; runId?: string; pbcId?: string; lessonId?: string; findingId?: string; actionId?: string };

async function engagementOfRecord(ref: RecordRef): Promise<(string | null)[]> {
  const out: (string | null)[] = [];
  if (ref.engagementId) out.push(ref.engagementId);
  const pick = async (rows: Promise<{ engagementId: string | null }[]>) => out.push((await rows)[0]?.engagementId ?? null);
  if (ref.testId) await pick(db.select({ engagementId: testRuns.engagementId }).from(testRuns).where(eq(testRuns.id, ref.testId)));
  if (ref.runId) await pick(db.select({ engagementId: agentRuns.engagementId }).from(agentRuns).where(eq(agentRuns.id, ref.runId)));
  if (ref.pbcId) await pick(db.select({ engagementId: pbcRequests.engagementId }).from(pbcRequests).where(eq(pbcRequests.id, ref.pbcId)));
  if (ref.lessonId) await pick(db.select({ engagementId: lessons.engagementId }).from(lessons).where(eq(lessons.id, ref.lessonId)));
  if (ref.findingId) await pick(db.select({ engagementId: findings.engagementId }).from(findings).where(eq(findings.id, ref.findingId)));
  if (ref.actionId) await pick(db.select({ engagementId: actions.engagementId }).from(actions).where(eq(actions.id, ref.actionId)));
  return out;
}

/** For server actions. Returns a refusal that looks like "not found" when any referenced record belongs to an engagement the person cannot see. */
export async function guardRecord(person: Who, ref: RecordRef): Promise<{ ok: false; error: string } | null> {
  const hidden = await hiddenEngagementIds(person);
  if (hidden.size === 0) return null;
  for (const id of await engagementOfRecord(ref)) if (id && hidden.has(id)) return { ok: false, error: "Not found." };
  return null;
}

/** External model calls send data out. A restricted engagement needs the GCAE's explicit per-engagement flag. */
export async function externalModelRefused(engagementId: string): Promise<boolean> {
  const [row] = await db.select({ r: engagements.restricted, a: engagements.allowExternalModel }).from(engagements).where(eq(engagements.id, engagementId));
  return Boolean(row?.r && !row.a);
}

/** Which engagement an audited object belongs to, by object type. Used to stamp audit_events.engagement_id on insert. */
export async function engagementForObject(objectType: string, objectId: string): Promise<string | null> {
  const first = async (rows: Promise<{ e: string | null }[]>) => (await rows)[0]?.e ?? null;
  switch (objectType) {
    case "engagement": return objectId;
    case "finding": return first(db.select({ e: findings.engagementId }).from(findings).where(eq(findings.id, objectId)));
    case "action": return first(db.select({ e: actions.engagementId }).from(actions).where(eq(actions.id, objectId)));
    case "evidence": return first(db.select({ e: evidence.engagementId }).from(evidence).where(eq(evidence.id, objectId)));
    case "test": return first(db.select({ e: testRuns.engagementId }).from(testRuns).where(eq(testRuns.id, objectId)));
    case "pbc": return first(db.select({ e: pbcRequests.engagementId }).from(pbcRequests).where(eq(pbcRequests.id, objectId)));
    case "agent": return first(db.select({ e: agentRuns.engagementId }).from(agentRuns).where(eq(agentRuns.id, objectId)));
    case "analytics": return first(db.select({ e: analyticsRuns.engagementId }).from(analyticsRuns).where(eq(analyticsRuns.id, objectId)));
    case "lesson": return first(db.select({ e: lessons.engagementId }).from(lessons).where(eq(lessons.id, objectId)));
    default: return null;
  }
}

/** Ids of every record under the given engagements, for hiding audit-log rows. */
export async function childRecordIds(engagementIds: Set<string>): Promise<Set<string>> {
  const ids = [...engagementIds];
  const out = new Set<string>(ids);
  if (!ids.length) return out;
  const [f, a, e, t, p, r, l, an] = await Promise.all([
    db.select({ id: findings.id }).from(findings).where(inArray(findings.engagementId, ids)),
    db.select({ id: actions.id }).from(actions).where(inArray(actions.engagementId, ids)),
    db.select({ id: evidence.id }).from(evidence).where(inArray(evidence.engagementId, ids)),
    db.select({ id: testRuns.id }).from(testRuns).where(inArray(testRuns.engagementId, ids)),
    db.select({ id: pbcRequests.id }).from(pbcRequests).where(inArray(pbcRequests.engagementId, ids)),
    db.select({ id: agentRuns.id }).from(agentRuns).where(inArray(agentRuns.engagementId, ids)),
    db.select({ id: lessons.id }).from(lessons).where(inArray(lessons.engagementId, ids)),
    db.select({ id: analyticsRuns.id }).from(analyticsRuns).where(inArray(analyticsRuns.engagementId, ids)),
  ]);
  for (const rows of [f, a, e, t, p, r, l, an]) for (const row of rows) out.add(row.id);
  return out;
}
