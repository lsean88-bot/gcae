import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { acPacks, auditPlans, planItems } from "@/db/schema";
import { bundle, getActor } from "@/lib/data";
import { todayIso } from "@/lib/format";
import { capacityCheck, progressByQuarter } from "@/lib/plan-scoring";
import { snapshotHash, type PackSnapshot } from "@/lib/ac-pack";
import { rankForPerson } from "@/server/plan-data";

const AUDIT = ["gcae", "manager", "auditor", "qa"];

export async function getErm() {
  const data = await bundle();
  const actor = await getActor();
  return {
    actor,
    entities: data.entityRows.map((e) => ({ id: e.id, name: e.name })),
    controlIds: data.controlRows.map((c) => c.id),
    risks: data.riskRows.map((r) => ({
      id: r.id, title: r.title, category: r.category, statement: r.statement, entityId: r.entityId, ownerId: r.ownerId,
      inherentLikelihood: r.inherentLikelihood, inherentImpact: r.inherentImpact,
      residualLikelihood: r.residualLikelihood, residualImpact: r.residualImpact, residualRationale: r.residualRationale,
      linkedControlIds: r.linkedControlIds, appetite: r.appetite,
      owner: data.nameOf(r.ownerId),
      entity: data.entityRows.find((e) => e.id === r.entityId)?.name || "Group",
      canAssess: ["gcae", "manager"].includes(actor.authority) || (!actor.mustChangePassword && r.ownerId === actor.id && ["auditor", "owner", "executive"].includes(actor.authority)),
    })),
  };
}

export async function getPlanPage(planId?: string) {
  const data = await bundle();
  const actor = await getActor();
  if (!AUDIT.includes(actor.authority)) return { denied: true as const, actor };
  const plans = await db.select().from(auditPlans).orderBy(desc(auditPlans.year), desc(auditPlans.version));
  const selected = plans.find((p) => p.id === planId) ?? plans.find((p) => p.status !== "Draft" && p.status !== "Superseded") ?? plans[0] ?? null;
  const visibleEng = new Set(data.engagementRows.map((e) => e.id));
  const rawItems = selected ? await db.select().from(planItems).where(eq(planItems.planId, selected.id)) : [];
  // An item linked to a restricted engagement this person cannot see is shown masked.
  const items = rawItems.map((i) => {
    const masked = Boolean(i.engagementId && !visibleEng.has(i.engagementId));
    return { ...i, masked, title: masked ? "Restricted engagement" : i.title, rationale: masked ? "" : i.rationale, changeReason: masked ? null : i.changeReason, engagementId: masked ? null : i.engagementId, engagementCode: data.engagementRows.find((e) => e.id === i.engagementId)?.code || null, entity: masked ? "" : data.entityRows.find((e) => e.id === i.entityId)?.name || i.entityId };
  });
  const ranking = selected ? (await rankForPerson(actor, selected.weights, new Set(rawItems.filter((i) => i.mandatory).map((i) => i.entityId)))).ranked : [];
  return {
    denied: false as const,
    actor,
    plans: plans.map((p) => ({ id: p.id, year: p.year, version: p.version, status: p.status })),
    plan: selected,
    items,
    ranking,
    capacity: selected ? capacityCheck(rawItems, selected.capacityDays) : null,
    progress: progressByQuarter(items),
    entities: data.entityRows.map((e) => ({ id: e.id, name: e.name })),
    engagements: data.engagementRows.map((e) => ({ id: e.id, code: e.code, title: e.title })),
    today: todayIso(),
  };
}

export async function getPacks() {
  await bundle();
  const actor = await getActor();
  const canSee = [...AUDIT, "executive"].includes(actor.authority);
  if (!canSee) return { denied: true as const, actor, packs: [] };
  const rows = await db.select().from(acPacks).orderBy(desc(acPacks.generatedAt));
  const draftsAllowed = ["gcae", "manager"].includes(actor.authority);
  return { denied: false as const, actor, packs: rows.filter((p) => p.status === "Released" || draftsAllowed).map((p) => ({ id: p.id, periodFrom: p.periodFrom, periodTo: p.periodTo, status: p.status, generatedAt: p.generatedAt, releasedAt: p.releasedAt, snapshotHash: p.snapshotHash, generatedByAuthority: p.generatedByAuthority })) };
}

export async function getPack(id: string) {
  await bundle();
  const actor = await getActor();
  const canSee = [...AUDIT, "executive"].includes(actor.authority);
  const [pack] = canSee ? await db.select().from(acPacks).where(eq(acPacks.id, id)) : [];
  if (!pack) return null;
  if (pack.status !== "Released" && !["gcae", "manager"].includes(actor.authority)) return null;
  const snapshot = { ...(pack.snapshot as unknown as PackSnapshot) };
  // A draft states that restricted engagements exist only to the GCAE. A released pack carries what the GCAE chose to release.
  if (pack.status !== "Released" && actor.authority !== "gcae") snapshot.restricted = null;
  return {
    actor,
    pack: { id: pack.id, status: pack.status, periodFrom: pack.periodFrom, periodTo: pack.periodTo, generatedAt: pack.generatedAt, generatedByAuthority: pack.generatedByAuthority, releasedAt: pack.releasedAt, snapshotHash: pack.snapshotHash, hashVerified: snapshotHash(pack.snapshot) === pack.snapshotHash },
    snapshot,
  };
}
