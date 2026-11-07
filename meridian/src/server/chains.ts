import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { auditPlans, controls, engagements, entities, evidence, planItems, risks, testRuns } from "@/db/schema";
import { completeWithModel } from "@/lib/ai";
import { CHAIN_STAGES, STAGE_KIND, WORK_TYPE_LABEL, reasonAuditPlan, reasonErm, reasonFindingDraft, type ChainStageName, type WorkType } from "@/lib/chain";
import { todayIso, uid } from "@/lib/format";
import { claudeConstitution, FORBIDDEN } from "@/lib/specialists";
import { externalModelRefused, hiddenEngagementIds, restrictedEngagementIds } from "@/server/access";
import { loadAiStatus, loadProviderKey } from "@/server/ai-config";
import { restrictedMaskTerms, stageRun, type Who } from "@/server/guardrail";
import { executeHarness, type HarnessStep } from "@/server/harness";

export type ChainType = WorkType;
export type ChainStep = { stage: ChainStageName; agent: string; title: string; detail: string; status: "done" | "blocked" | "suggested" };
export type ChainResult = { ok: true; id: string; steps: ChainStep[]; message: string } | { ok: false; error: string };

const refuse = (error: string): ChainResult => ({ ok: false, error });

/** Optional model interpretation of the packet. Skipped with a stated reason when no key is connected or the engagement forbids it. */
async function interpret(label: string, packet: string, external: boolean): Promise<{ text: string | null; note: string }> {
  if (external) return { text: null, note: "External model skipped: this engagement is restricted and the GCAE has not allowed external models for it." };
  const status = await loadAiStatus();
  const provider = status.active === "openai" || status.active === "claude" || status.active === "gemini" ? status.active : null;
  if (!provider) return { text: null, note: "No model is connected. The deterministic engine produced the whole chain." };
  const model = provider === "openai" ? status.openaiModel : provider === "gemini" ? status.geminiModel : status.claudeModel;
  const key = await loadProviderKey(provider);
  const result = await completeWithModel(
    provider,
    model,
    `${claudeConstitution()}\n\nYou are the ${label} specialist. In no more than 6 short sentences, restate what the packet shows and what is still missing. Use only the packet. Do not add a figure, a name or a conclusion.\n\nPACKET:\n${packet.slice(0, 12000)}`,
    key,
  );
  return result.ok ? { text: result.text, note: `${provider} (${model}) interpreted the packet. This is not an opinion.` } : { text: null, note: `Model call failed: ${result.error}. The deterministic engine still ran.` };
}

type Gathered = { engagementId: string | null; touched?: string[]; perceive: string; retrieve: string; reasoning: string[]; proposal: string; severity?: string; evidenceTags?: string[]; inputs: Record<string, string> };

async function gather(who: Who, type: Exclude<WorkType, "engagement_fieldwork">, targetId: string): Promise<{ error: string } | Gathered> {
  if (type === "audit_plan") {
    const [plan] = await db.select().from(auditPlans).where(eq(auditPlans.id, targetId));
    if (!plan) return { error: "Plan not found." };
    const hidden = await hiddenEngagementIds(who);
    const items = (await db.select().from(planItems).where(eq(planItems.planId, targetId))).filter((i) => !i.engagementId || !hidden.has(i.engagementId));
    // Attribute the run to a restricted engagement it touches (global set, not the viewer's filtered set).
    const restricted = await restrictedEngagementIds();
    const touched = [...new Set(items.flatMap((i) => (i.engagementId && restricted.has(i.engagementId) ? [i.engagementId] : [])))];
    const ents = items.length ? await db.select().from(entities).where(inArray(entities.id, [...new Set(items.map((i) => i.entityId))])) : [];
    const reasoned = reasonAuditPlan({
      year: plan.year,
      status: plan.status,
      capacityDays: plan.capacityDays,
      weightsApproved: plan.weights.approved,
      asOf: todayIso(),
      items: items.map((i) => ({ id: i.id, title: i.title, entityName: ents.find((e) => e.id === i.entityId)?.name || i.entityId, quarter: i.quarter, budgetDays: i.budgetDays, status: i.status, riskScore: i.riskScore, lastAuditDate: i.lastAuditDate, mandatory: i.mandatory })),
    });
    return {
      engagementId: touched[0] ?? null,
      touched,
      perceive: `Work type: audit plan. Plan ${plan.id}, year ${plan.year}, status ${plan.status}, capacity ${plan.capacityDays} days.`,
      retrieve: `Linked records only: ${items.length} plan item(s) of this plan and ${ents.length} entity record(s) they point to. Nothing else was read.`,
      ...reasoned,
      inputs: { plan: plan.id },
    };
  }
  if (type === "finding_drafting") {
    const [test] = await db.select().from(testRuns).where(eq(testRuns.id, targetId));
    if (!test) return { error: "Test run not found." };
    const hidden = await hiddenEngagementIds(who);
    if (hidden.has(test.engagementId)) return { error: "Not found." };
    const [eng] = await db.select().from(engagements).where(eq(engagements.id, test.engagementId));
    if (!eng) return { error: "Engagement not found." };
    const ev = test.evidenceId ? await db.select().from(evidence).where(eq(evidence.id, test.evidenceId)) : [];
    const reasoned = reasonFindingDraft({
      engagementCode: eng.code,
      materialityApproved: eng.materialityApproved,
      materialityAmount: eng.materialityAmount,
      materialityCurrency: eng.materialityCurrency,
      test: { id: test.id, procedure: test.procedure, objective: test.objective, result: test.result, exceptionsCount: test.exceptionsCount, recordsTested: test.recordsTested, populationCount: test.populationCount, exposureAmount: test.exposureAmount, currency: test.currency, qaStatus: test.qaStatus, limitations: test.limitations },
      evidence: ev.map((e) => ({ id: e.id, documentType: e.documentType, reliability: e.reliability })),
    });
    return {
      engagementId: eng.id,
      perceive: `Work type: finding drafting. Test run ${test.id} on ${eng.code}.`,
      retrieve: `Linked records only: test run ${test.id}, its evidence (${ev.map((e) => e.id).join(", ") || "none"}), and the engagement's approved materiality.`,
      ...reasoned,
      inputs: { test: test.id, engagement: eng.id },
    };
  }
  // erm_risk_assessment: target is an entity id
  const [entity] = await db.select().from(entities).where(eq(entities.id, targetId));
  if (!entity) return { error: "Entity not found." };
  const riskRows = await db.select().from(risks).where(eq(risks.entityId, targetId));
  const controlIds = [...new Set(riskRows.flatMap((r) => r.linkedControlIds.split(",").map((x) => x.trim()).filter(Boolean)))];
  const controlRows = controlIds.length ? await db.select().from(controls).where(inArray(controls.id, controlIds)) : [];
  const reasoned = reasonErm({
    scope: entity.name,
    risks: riskRows.map((r) => ({ id: r.id, title: r.title, category: r.category, entityId: r.entityId, ownerId: r.ownerId, inherentLikelihood: r.inherentLikelihood, inherentImpact: r.inherentImpact, residualLikelihood: r.residualLikelihood, residualImpact: r.residualImpact, linkedControlIds: r.linkedControlIds })),
    controls: controlRows.map((c) => ({ id: c.id, title: c.title, operatingEffectiveness: c.operatingEffectiveness, designEffectiveness: c.designEffectiveness })),
  });
  return {
    engagementId: null,
    perceive: `Work type: ERM risk assessment. Entity ${entity.name} (${entity.id}).`,
    retrieve: `Linked records only: ${riskRows.length} risk(s) of this entity and the ${controlRows.length} control(s) those risks list. Nothing else was read.`,
    ...reasoned,
    inputs: { entity: entity.id },
  };
}

const toStep = (s: ChainStep, n: number) => ({ n, title: `${s.stage}: ${s.title}`, detail: s.detail, kind: s.status === "blocked" ? ("limit" as const) : STAGE_KIND[s.stage] });

/** Runs one stage chain. Authority and record-level access are checked by the server action before this is called. */
export async function runChainFor(who: Who, type: WorkType, targetId: string): Promise<ChainResult> {
  if (type === "engagement_fieldwork") {
    const result = await executeHarness(targetId, who.name, { noExternal: await externalModelRefused(targetId) });
    if (!result.ok) return refuse(result.error);
    const steps: ChainStep[] = result.steps.map((s: HarnessStep) => ({ stage: s.stage ?? "propose", agent: s.agent, title: `${s.agent} · ${s.skill}`, detail: s.summary, status: s.status }));
    return { ok: true, id: result.id, steps, message: result.message };
  }
  const raw = await gather(who, type, targetId);
  if ("error" in raw) return refuse(raw.error);
  // Mask every restricted engagement (global set) except the one this run is attributed to.
  const attributed = raw.engagementId ? (await db.select({ id: engagements.id, code: engagements.code, title: engagements.title }).from(engagements).where(eq(engagements.id, raw.engagementId)))[0] : undefined;
  const keep = new Set(attributed ? [attributed.id, attributed.code, attributed.title] : []);
  const terms = (await restrictedMaskTerms()).filter((t) => t && t.length >= 3 && !keep.has(t));
  const mask = (s: string) => terms.reduce((acc, t) => acc.replace(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "[restricted]"), s);
  const got: Gathered = { ...raw, perceive: mask(raw.perceive), retrieve: mask(raw.retrieve), reasoning: raw.reasoning.map(mask), proposal: mask(raw.proposal) };

  const steps: ChainStep[] = [
    { stage: "perceive", agent: "Perceive", title: "Read the request", detail: got.perceive, status: "done" },
    { stage: "retrieve", agent: "Retrieve", title: "Read linked records only", detail: got.retrieve, status: "done" },
    { stage: "reason", agent: "Reason", title: "Deterministic engine", detail: got.reasoning.join("\n"), status: "done" },
  ];
  let external = false;
  for (const id of new Set([...(raw.touched ?? []), ...(raw.engagementId ? [raw.engagementId] : [])])) if (await externalModelRefused(id)) external = true;
  const model = await interpret(WORK_TYPE_LABEL[type], `${got.perceive}\n${got.retrieve}\n${got.reasoning.join("\n")}\n${got.proposal}`, external);
  steps.push({ stage: "propose", agent: "Propose", title: "Staged proposal", detail: got.proposal, status: "suggested" });
  if (model.text) steps.push({ stage: "propose", agent: "Model", title: "Model interpretation", detail: model.text, status: "suggested" });

  const id = uid("ar");
  const guardrail = await stageRun(
    {
      id,
      agent: "Harness chain",
      skill: type,
      engagementId: got.engagementId,
      trigger: `${who.name} started the ${WORK_TYPE_LABEL[type].toLowerCase()} chain.`,
      status: "suggested",
      startedAt: todayIso(),
      completedAt: todayIso(),
      summary: `${WORK_TYPE_LABEL[type]} chain finished. Proposal staged. A person must decide.`,
      reasoning: steps.map((s, i) => toStep(s, i + 1)),
      inputs: { ...got.inputs, chain: type, forbidden: FORBIDDEN.join(",") },
      output: { chain: type, proposal: got.proposal, model: model.text ?? "", modelNote: model.note },
      limitations: "Nothing was applied. The chain cannot issue, approve materiality, close an action, change a score or waive an iron rule.",
      decidedBy: null,
      decisionNote: null,
    },
    { texts: [got.proposal, model.text ?? ""], severity: got.severity, evidenceTags: got.evidenceTags, chain: true },
  );
  steps.push({
    stage: "guardrail",
    agent: "Guardrail",
    title: "Guardrail check",
    detail: guardrail.violations.map((v) => `[${v.rule}] ${v.message}`).join(" ") || "Fraud ladder, confidence wording and severity cap checked. Nothing flagged.",
    status: guardrail.status === "blocked" ? "blocked" : "done",
  });
  steps.push({ stage: "decision", agent: "Human", title: "Human decision", detail: guardrail.status === "blocked" ? "Approval is blocked until the GCAE overrides with a reason." : "Waiting for a person to accept or reject.", status: "suggested" });
  return { ok: true, id, steps, message: guardrail.status === "blocked" ? "Chain finished. A guardrail blocked approval until the GCAE overrides." : "Chain finished. Proposal staged. Nothing was applied." };
}

export { CHAIN_STAGES };
