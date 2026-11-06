import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { acPacks, auditPlans, controls, entities, planItems, risks, settings } from "@/db/schema";
import { buildPackSnapshot, snapshotHash } from "@/lib/ac-pack";
import { bundleFor } from "@/lib/data";
import { todayIso, uid } from "@/lib/format";
import { ITEM_STATUSES, QUARTERS, capacityCheck, validWeights, type PlanWeights, DEFAULT_WEIGHTS } from "@/lib/plan-scoring";
import { actorNow, deny, logEvent, type Result } from "@/server/authz";
import { restrictedEngagementIds } from "@/server/access";
import { loadPlan, rankForPerson } from "@/server/plan-data";

export type Who = Awaited<ReturnType<typeof actorNow>>;
const isoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const PLANNERS = ["gcae", "manager"];

/* ---------- ERM: residual assessment ---------- */

export async function assessResidual(who: Who, riskId: string, likelihood: number, impact: number, rationale: string): Promise<Result> {
  const gate = deny(who.authority, ["gcae", "manager", "auditor", "owner", "executive"], "Only the risk owner, an audit manager or the GCAE can assess residual risk.");
  if (gate) return gate;
  const [risk] = await db.select().from(risks).where(eq(risks.id, String(riskId ?? "")));
  if (!risk) return { ok: false, error: "Risk not found." };
  if (!["gcae", "manager"].includes(who.authority) && risk.ownerId !== who.id) return { ok: false, error: "Only the risk owner, an audit manager or the GCAE can assess residual risk." };
  const l = Number(likelihood), i = Number(impact);
  if (![l, i].every((n) => Number.isInteger(n) && n >= 1 && n <= 5)) return { ok: false, error: "Likelihood and impact must each be a whole number from 1 to 5." };
  if (!String(rationale ?? "").trim()) return { ok: false, error: "Write the rationale for the residual score. Name the controls relied on." };
  const before = risk.residualLikelihood == null ? "not assessed" : `L${risk.residualLikelihood} x I${risk.residualImpact}`;
  await db.update(risks).set({ residualLikelihood: l, residualImpact: i, residualRationale: String(rationale).trim(), residualAssessedBy: who.id, residualAssessedAt: todayIso() }).where(eq(risks.id, risk.id));
  await logEvent(who, "Assessed residual risk", "risk", risk.id, `${risk.title}: residual L${l} x I${i} = ${l * i}. ${String(rationale).trim()}`, before, `L${l} x I${i}`);
  return { ok: true, message: "Residual risk recorded as your assessment." };
}

/* ---------- Plan ---------- */

export async function createPlan(who: Who, year: number, capacityDays: number): Promise<Result> {
  const gate = deny(who.authority, PLANNERS, "Only an audit manager or the GCAE can draft the plan.");
  if (gate) return gate;
  const y = Number(year), c = Number(capacityDays);
  if (!Number.isInteger(y) || y < 2000 || y > 2100) return { ok: false, error: "Enter a four-digit year." };
  if (!Number.isInteger(c) || c <= 0) return { ok: false, error: "Capacity must be a whole number of days above zero. It is a figure you supply; the app does not estimate it." };
  const existing = await db.select().from(auditPlans).where(eq(auditPlans.year, y));
  if (existing.length) return { ok: false, error: `A plan for ${y} already exists. Open it and revise it instead.` };
  const id = uid("plan");
  await db.insert(auditPlans).values({ id, year: y, status: "Draft", capacityDays: c, weights: { ...DEFAULT_WEIGHTS }, version: 1, createdBy: who.id, createdAt: todayIso() });
  await logEvent(who, "Drafted audit plan", "plan", id, `Plan ${y}, capacity ${c} days, version 1. Weights are proposed defaults awaiting GCAE approval.`);
  return { ok: true, id, message: `Draft plan ${y} created. The weights are proposed and not yet approved.` };
}

/**
 * Edits on a Draft happen in place. An approved or noted plan is never edited: the edit is applied to a NEW Draft copy (version + 1,
 * supersedes the old one). Returns the plan id and a map from old item id to the item id in the plan being edited.
 */
async function workingCopy(planId: string, who: { id: string; name: string }) {
  const loaded = await loadPlan(planId);
  if (!loaded) return { error: "Plan not found." as const };
  const { plan, items } = loaded;
  if (plan.status === "Superseded") return { error: "This version has been superseded. Edit the latest version." as const };
  if (plan.status === "Draft") return { planId: plan.id, map: new Map(items.map((i) => [i.id, i.id])), versioned: false };
  const [successor] = await db.select().from(auditPlans).where(and(eq(auditPlans.supersedesId, plan.id), eq(auditPlans.status, "Draft")));
  if (successor) return { error: `A newer draft (version ${successor.version}) already exists for this plan. Edit that one.` as const };
  const newId = uid("plan");
  const map = new Map<string, string>();
  await db.transaction(async (tx) => {
    await tx.insert(auditPlans).values({ id: newId, year: plan.year, status: "Draft", capacityDays: plan.capacityDays, weights: plan.weights, version: plan.version + 1, supersedesId: plan.id, createdBy: who.id, createdAt: todayIso() });
    for (const item of items) {
      const id = uid("pi");
      map.set(item.id, id);
      await tx.insert(planItems).values({ ...item, id, planId: newId });
    }
  });
  await logEvent(who, "New plan version", "plan", newId, `Plan ${plan.year} version ${plan.version + 1} created as a Draft copy of "${plan.status}" version ${plan.version}. The earlier version is unchanged.`, `v${plan.version} ${plan.status}`, `v${plan.version + 1} Draft`);
  return { planId: newId, map, versioned: true };
}

type ItemInput = { entityId: string; title: string; quarter: string; budgetDays: number; rationale: string; mandatory: boolean; mandatoryReason?: string; engagementId?: string | null };

function checkItem(input: ItemInput): string | null {
  if (!String(input.title ?? "").trim() || !String(input.rationale ?? "").trim()) return "An item needs a title and a rationale.";
  if (!(QUARTERS as readonly string[]).includes(input.quarter)) return "Quarter must be Q1 to Q4.";
  if (!Number.isInteger(Number(input.budgetDays)) || Number(input.budgetDays) <= 0) return "Budget days must be a whole number above zero.";
  if (input.mandatory && !String(input.mandatoryReason ?? "").trim()) return "A mandatory item needs the reason it is mandatory (law, regulator, Board instruction).";
  return null;
}

async function scoreFor(who: { id: string; authority: string }, weights: PlanWeights, planItemsNow: { entityId: string; mandatory: boolean }[], entityId: string, mandatory: boolean) {
  const set = new Set(planItemsNow.filter((i) => i.mandatory).map((i) => i.entityId));
  if (mandatory) set.add(entityId);
  const { ranked, sources } = await rankForPerson(who, weights, set);
  const row = ranked.find((r) => r.entityId === entityId);
  return { riskScore: row?.riskScore ?? null, lastAuditDate: sources[entityId]?.lastAuditDate ?? null };
}

async function linkCheck(who: { id: string; authority: string }, engagementId?: string | null) {
  if (!engagementId) return null;
  const data = await bundleFor(who);
  return data.engagementRows.some((e) => e.id === engagementId) ? null : "Engagement not found.";
}

export async function addPlanItem(who: Who, planId: string, input: ItemInput): Promise<Result> {
  const gate = deny(who.authority, PLANNERS, "Only an audit manager or the GCAE can draft plan items.");
  if (gate) return gate;
  const bad = checkItem(input);
  if (bad) return { ok: false, error: bad };
  const [entity] = await db.select().from(entities).where(eq(entities.id, String(input.entityId ?? "")));
  if (!entity) return { ok: false, error: "Entity not found." };
  const linkBad = await linkCheck(who, input.engagementId);
  if (linkBad) return { ok: false, error: linkBad };
  const wc = await workingCopy(planId, who);
  if ("error" in wc) return { ok: false, error: String(wc.error) };
  const [plan] = await db.select().from(auditPlans).where(eq(auditPlans.id, wc.planId));
  const current = await db.select().from(planItems).where(eq(planItems.planId, wc.planId));
  const score = await scoreFor(who, plan.weights, current, entity.id, Boolean(input.mandatory));
  const id = uid("pi");
  await db.insert(planItems).values({ id, planId: wc.planId, entityId: entity.id, title: input.title.trim(), quarter: input.quarter, budgetDays: Number(input.budgetDays), rationale: input.rationale.trim(), riskScore: score.riskScore, lastAuditDate: score.lastAuditDate, mandatory: Boolean(input.mandatory), mandatoryReason: input.mandatory ? String(input.mandatoryReason).trim() : null, engagementId: input.engagementId || null, status: "Planned" });
  await logEvent(who, "Added plan item", "plan", wc.planId, `${entity.name}: ${input.title.trim()} (${input.quarter}, ${input.budgetDays} days).`, undefined, undefined, input.engagementId || null);
  return { ok: true, id: wc.planId, message: wc.versioned ? "The plan was approved, so a new Draft version was created and the item added to it." : "Item added." };
}

export async function updatePlanItem(who: Who, planId: string, itemId: string, patch: Partial<Pick<ItemInput, "title" | "quarter" | "budgetDays" | "rationale" | "mandatory" | "mandatoryReason">>): Promise<Result> {
  const gate = deny(who.authority, PLANNERS, "Only an audit manager or the GCAE can edit plan items.");
  if (gate) return gate;
  const loaded = await loadPlan(planId);
  const item = loaded?.items.find((i) => i.id === itemId);
  if (!loaded || !item) return { ok: false, error: "Plan item not found." };
  const merged: ItemInput = { entityId: item.entityId, title: patch.title ?? item.title, quarter: patch.quarter ?? item.quarter, budgetDays: patch.budgetDays ?? item.budgetDays, rationale: patch.rationale ?? item.rationale, mandatory: patch.mandatory ?? item.mandatory, mandatoryReason: patch.mandatoryReason ?? item.mandatoryReason ?? "" };
  const bad = checkItem(merged);
  if (bad) return { ok: false, error: bad };
  const wc = await workingCopy(planId, who);
  if ("error" in wc) return { ok: false, error: String(wc.error) };
  const target = wc.map.get(itemId) as string;
  const [plan] = await db.select().from(auditPlans).where(eq(auditPlans.id, wc.planId));
  const current = await db.select().from(planItems).where(eq(planItems.planId, wc.planId));
  const score = await scoreFor(who, plan.weights, current.filter((i) => i.id !== target), item.entityId, merged.mandatory);
  await db.update(planItems).set({ title: merged.title.trim(), quarter: merged.quarter, budgetDays: Number(merged.budgetDays), rationale: merged.rationale.trim(), mandatory: merged.mandatory, mandatoryReason: merged.mandatory ? String(merged.mandatoryReason).trim() : null, riskScore: score.riskScore, lastAuditDate: score.lastAuditDate }).where(eq(planItems.id, target));
  await logEvent(who, "Edited plan item", "plan", wc.planId, `${item.title}: ${JSON.stringify(patch)}`, `${item.quarter} ${item.budgetDays}d`, `${merged.quarter} ${merged.budgetDays}d`);
  return { ok: true, id: wc.planId, message: wc.versioned ? `The plan was approved, so version ${(await db.select().from(auditPlans).where(eq(auditPlans.id, wc.planId)))[0].version} was created as a Draft with your edit. The approved version is unchanged.` : "Item updated." };
}

export async function removePlanItem(who: Who, planId: string, itemId: string): Promise<Result> {
  const gate = deny(who.authority, PLANNERS, "Only an audit manager or the GCAE can remove plan items.");
  if (gate) return gate;
  const loaded = await loadPlan(planId);
  const item = loaded?.items.find((i) => i.id === itemId);
  if (!loaded || !item) return { ok: false, error: "Plan item not found." };
  const wc = await workingCopy(planId, who);
  if ("error" in wc) return { ok: false, error: String(wc.error) };
  await db.delete(planItems).where(eq(planItems.id, wc.map.get(itemId) as string));
  await logEvent(who, "Removed plan item", "plan", wc.planId, `${item.title} removed.`);
  return { ok: true, id: wc.planId, message: wc.versioned ? "A new Draft version was created without that item." : "Item removed." };
}

export async function updatePlanSettings(who: Who, planId: string, capacityDays: number, weights: { risk: number; age: number; mandatory: number } | null): Promise<Result> {
  const gate = weights ? deny(who.authority, ["gcae"], "Only the GCAE can set the scoring weights.") : deny(who.authority, PLANNERS, "Only an audit manager or the GCAE can change capacity.");
  if (gate) return gate;
  const c = Number(capacityDays);
  if (!Number.isInteger(c) || c <= 0) return { ok: false, error: "Capacity must be a whole number of days above zero." };
  const loaded = await loadPlan(planId);
  if (!loaded) return { ok: false, error: "Plan not found." };
  const next: PlanWeights = weights ? { risk: Number(weights.risk), age: Number(weights.age), mandatory: Number(weights.mandatory), approved: false } : loaded.plan.weights;
  if (weights) {
    const bad = validWeights(next);
    if (bad) return { ok: false, error: bad };
  }
  const wc = await workingCopy(planId, who);
  if ("error" in wc) return { ok: false, error: String(wc.error) };
  await db.update(auditPlans).set({ capacityDays: c, weights: next }).where(eq(auditPlans.id, wc.planId));
  await logEvent(who, "Changed plan settings", "plan", wc.planId, `Capacity ${c} days. Weights ${weights ? `risk ${next.risk}, age ${next.age}, mandatory ${next.mandatory} (approval applies when the GCAE approves the plan)` : "unchanged"}.`, `${loaded.plan.capacityDays} days`, `${c} days`);
  return { ok: true, id: wc.planId, message: wc.versioned ? "A new Draft version was created with the change." : "Settings saved." };
}

export async function approvePlan(who: Who, planId: string, acknowledgeOverAllocation: boolean): Promise<Result> {
  const gate = deny(who.authority, ["gcae"], "Only the GCAE can approve the audit plan.");
  if (gate) return gate;
  const loaded = await loadPlan(planId);
  if (!loaded) return { ok: false, error: "Plan not found." };
  if (loaded.plan.status !== "Draft") return { ok: false, error: "This plan is already approved. Edit it to create a new version." };
  if (!loaded.items.length) return { ok: false, error: "A plan with no items cannot be approved." };
  const cap = capacityCheck(loaded.items, loaded.plan.capacityDays);
  if (cap.over && !acknowledgeOverAllocation) return { ok: false, error: `Over-allocated by ${cap.delta} days (${cap.allocated} planned against ${cap.capacity}). Reduce the plan, or tick the box to approve knowing it is over capacity.` };
  const now = todayIso();
  await db.update(auditPlans).set({ status: "Approved by GCAE", approvedBy: who.id, approvedAt: now, weights: { ...loaded.plan.weights, approved: true } }).where(eq(auditPlans.id, planId));
  if (loaded.plan.supersedesId) await db.update(auditPlans).set({ status: "Superseded" }).where(and(eq(auditPlans.id, loaded.plan.supersedesId), inArray(auditPlans.status, ["Approved by GCAE", "Noted by Audit Committee"])));
  await logEvent(who, "Approved audit plan", "plan", planId, `Plan ${loaded.plan.year} version ${loaded.plan.version} approved by the GCAE with its weights. ${cap.allocated} of ${cap.capacity} days allocated${cap.over ? " (OVER capacity, acknowledged)" : ""}.`, "Draft", "Approved by GCAE");
  return { ok: true, message: "Plan approved by the GCAE. This does not record Audit Committee approval." };
}

export async function recordAcNoted(who: Who, planId: string, meetingDate: string, minuteRef: string): Promise<Result> {
  const gate = deny(who.authority, ["gcae"], "Only the GCAE can record that the Audit Committee noted the plan.");
  if (gate) return gate;
  const loaded = await loadPlan(planId);
  if (!loaded) return { ok: false, error: "Plan not found." };
  if (loaded.plan.status !== "Approved by GCAE") return { ok: false, error: "Only a plan approved by the GCAE can be recorded as noted by the Audit Committee." };
  if (!isoDate(String(meetingDate ?? ""))) return { ok: false, error: "Enter the Audit Committee meeting date." };
  if (!String(minuteRef ?? "").trim()) return { ok: false, error: "Enter the minute reference from the Audit Committee minutes." };
  await db.update(auditPlans).set({ status: "Noted by Audit Committee", acMeetingDate: meetingDate, acMinuteRef: String(minuteRef).trim() }).where(eq(auditPlans.id, planId));
  await logEvent(who, "Recorded AC noting", "plan", planId, `Typed by the GCAE: Audit Committee meeting ${meetingDate}, minute ${String(minuteRef).trim()}. The app has not verified the minute.`, "Approved by GCAE", "Noted by Audit Committee");
  return { ok: true, message: "Recorded as typed by you. The app has not checked the minute." };
}

/** Progress is execution tracking. It is changed in place but audit-logged with before and after, and Deferred or Cancelled needs a reason. */
export async function updateItemProgress(who: Who, itemId: string, status: string, changeReason: string, engagementId?: string | null): Promise<Result> {
  const gate = deny(who.authority, PLANNERS, "Only an audit manager or the GCAE can update plan progress.");
  if (gate) return gate;
  if (!(ITEM_STATUSES as readonly string[]).includes(status)) return { ok: false, error: "Unknown status." };
  const [item] = await db.select().from(planItems).where(eq(planItems.id, String(itemId ?? "")));
  if (!item) return { ok: false, error: "Plan item not found." };
  const [plan] = await db.select().from(auditPlans).where(eq(auditPlans.id, item.planId));
  if (plan.status === "Superseded") return { ok: false, error: "This version has been superseded. Update progress on the latest version." };
  if (plan.status === "Draft") return { ok: false, error: "Progress is tracked once the plan is approved. Edit the item instead." };
  if ((status === "Deferred" || status === "Cancelled") && !String(changeReason ?? "").trim()) return { ok: false, error: "Write the reason for deferring or cancelling." };
  const linkBad = await linkCheck(who, engagementId);
  if (linkBad) return { ok: false, error: linkBad };
  await db.update(planItems).set({ status, changeReason: String(changeReason ?? "").trim() || null, engagementId: engagementId || item.engagementId }).where(eq(planItems.id, item.id));
  await logEvent(who, "Plan item progress", "plan", plan.id, `${item.title}: ${item.status} to ${status}. ${String(changeReason ?? "").trim()}`, item.status, status, engagementId || item.engagementId);
  return { ok: true, message: "Progress recorded and logged." };
}

/* ---------- Audit Committee pack ---------- */

export async function generatePack(who: Who, from: string, to: string): Promise<Result> {
  const gate = deny(who.authority, PLANNERS, "Only an audit manager or the GCAE can generate the Audit Committee pack.");
  if (gate) return gate;
  if (!isoDate(String(from ?? "")) || !isoDate(String(to ?? "")) || from > to) return { ok: false, error: "Enter a period: a valid from date that is not after the to date." };
  const data = await bundleFor(who);
  const restricted = await restrictedEngagementIds();
  const [setting] = await db.select().from(settings).where(eq(settings.key, "seeded"));
  const demoPresent = Boolean(setting) && data.engagementRows.some((e) => ["eng-ap", "eng-dc", "eng-it", "eng-p2p", "eng-pay", "eng-fa"].includes(e.id));
  const year = Number(to.slice(0, 4));
  const plans = (await db.select().from(auditPlans).where(eq(auditPlans.year, year))).filter((p) => p.status !== "Draft" && p.status !== "Superseded").sort((a, b) => b.version - a.version);
  const plan = plans[0] ?? null;
  const items = plan ? await db.select().from(planItems).where(eq(planItems.planId, plan.id)) : [];
  const controlRows = await db.select({ id: controls.id }).from(controls);
  const asOf = todayIso();
  const snapshot = buildPackSnapshot({
    from, to, asOf, generatedBy: who.name, generatedByAuthority: who.authority,
    engagements: data.engagementRows.map((e) => ({ id: e.id, code: e.code, title: e.title, status: e.status, opinion: e.opinion, issuedAt: e.issuedAt, startDate: e.startDate, restricted: restricted.has(e.id) })),
    findings: data.findingRows.map((f) => ({ engagementId: f.engagementId, code: f.code, title: f.title, status: f.status, priorityBand: f.priorityBand })),
    actions: data.actionRows.map((a) => ({ engagementId: a.engagementId, findingId: a.findingId, agreedAction: a.agreedAction, ownerId: a.ownerId, status: a.status, originalDue: a.originalDue, revisedDue: a.revisedDue })),
    findingIdToBand: Object.fromEntries(data.findingRows.map((f) => [f.id, { code: f.code, band: f.priorityBand }])),
    people: data.peopleRows.map((p) => ({ id: p.id, name: p.name, role: p.role })),
    risks: data.riskRows.map((r) => ({ ...r, entity: data.entityRows.find((e) => e.id === r.entityId)?.name || "Group" })),
    controlIds: controlRows.map((c) => c.id),
    lessons: data.lessonRows.map((l) => ({ engagementId: l.engagementId, title: l.title, area: l.area, status: l.status, createdAt: l.createdAt })),
    plan: plan ? { year: plan.year, version: plan.version, status: plan.status, capacityDays: plan.capacityDays, weightsApproved: plan.weights.approved, items: items.map((i) => ({ title: i.title, quarter: i.quarter, status: i.status, budgetDays: i.budgetDays, changeReason: i.changeReason, engagementId: i.engagementId })) } : null,
    demoPresent,
    restrictedIds: [...restricted],
  });
  const hash = snapshotHash(snapshot);
  const id = uid("pack");
  await db.insert(acPacks).values({ id, periodFrom: from, periodTo: to, status: "Draft", generatedBy: who.id, generatedByAuthority: who.authority, generatedAt: new Date().toISOString(), snapshot: snapshot as unknown as Record<string, unknown>, snapshotHash: hash });
  await logEvent(who, "Generated AC pack", "ac_pack", id, `Draft pack ${from} to ${to}, snapshot hash ${hash}. No model used.`);
  return { ok: true, id, hash, message: who.authority === "gcae" ? "Draft pack generated. It is marked DRAFT — not issued until you release it." : "Draft pack generated from your view. The GCAE must regenerate it before release." };
}

export async function releasePack(who: Who, packId: string): Promise<Result> {
  const gate = deny(who.authority, ["gcae"], "Only the GCAE can release an Audit Committee pack.");
  if (gate) return gate;
  const [pack] = await db.select().from(acPacks).where(eq(acPacks.id, String(packId ?? "")));
  if (!pack) return { ok: false, error: "Pack not found." };
  if (pack.status === "Released") return { ok: false, error: "This pack is already released." };
  if (pack.generatedByAuthority !== "gcae") return { ok: false, error: "This draft was generated by a manager from a limited view. Generate it again as the GCAE, then release." };
  if (snapshotHash(pack.snapshot) !== pack.snapshotHash) return { ok: false, error: "The stored snapshot no longer matches its hash. Do not release. Generate a new pack." };
  await db.update(acPacks).set({ status: "Released", releasedBy: who.id, releasedAt: new Date().toISOString() }).where(eq(acPacks.id, pack.id));
  await logEvent(who, "Released AC pack", "ac_pack", pack.id, `Pack ${pack.periodFrom} to ${pack.periodTo} released. Frozen snapshot sha256 ${pack.snapshotHash}.`, "Draft", "Released");
  return { ok: true, id: pack.id, hash: pack.snapshotHash, message: "Pack released. The snapshot is frozen; later data changes will not alter it." };
}

