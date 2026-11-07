import type { AgentStep } from "@/db/schema";
import { severityCap, deriveEvidenceTags, type TagSource } from "@/lib/iron-rules";
import { AGE_CAP_YEARS, capacityCheck, yearsSince } from "@/lib/plan-scoring";
import { risksWithoutControl, residualLabel, viewScore, type ErmRisk } from "@/lib/erm";
import { bandFor } from "@/lib/methodology";

/**
 * Stage chains for the v1 work types. Pure reasoning only: no database, no model, no network.
 * The deterministic engine below is the whole chain when no API key is connected.
 * Retrieval, guardrails and persistence are in src/server/chains.ts and src/server/guardrail.ts.
 */
export const CHAIN_STAGES = ["perceive", "retrieve", "reason", "propose", "guardrail", "decision"] as const;
export type ChainStageName = (typeof CHAIN_STAGES)[number];

export const STAGE_KIND: Record<ChainStageName, AgentStep["kind"]> = {
  perceive: "read",
  retrieve: "read",
  reason: "calc",
  propose: "propose",
  guardrail: "guard",
  decision: "decide",
};

export const WORK_TYPES = ["audit_plan", "engagement_fieldwork", "finding_drafting", "erm_risk_assessment"] as const;
export type WorkType = (typeof WORK_TYPES)[number];

export const WORK_TYPE_LABEL: Record<WorkType, string> = {
  audit_plan: "Audit plan",
  engagement_fieldwork: "Engagement fieldwork",
  finding_drafting: "Finding drafting",
  erm_risk_assessment: "ERM risk assessment",
};

export type Reasoned = { reasoning: string[]; proposal: string; severity?: string; evidenceTags?: string[] };

const money = (n: number, cur: string) => `${cur} ${n.toLocaleString("en-US")}`;

// ---------------------------------------------------------------------------------------------
// Audit plan
// ---------------------------------------------------------------------------------------------

export type PlanItemFact = {
  id: string;
  title: string;
  entityName: string;
  quarter: string;
  budgetDays: number;
  status: string;
  riskScore: number | null;
  lastAuditDate: string | null;
  mandatory: boolean;
};

export function reasonAuditPlan(input: { year: number; status: string; capacityDays: number; weightsApproved: boolean; items: PlanItemFact[]; asOf: string }): Reasoned {
  const cap = capacityCheck(input.items, input.capacityDays);
  const unscored = input.items.filter((i) => i.riskScore == null);
  const stale = input.items.filter((i) => {
    const y = yearsSince(i.lastAuditDate, input.asOf);
    return i.lastAuditDate == null || (y != null && y >= AGE_CAP_YEARS);
  });
  const reasoning = [
    `[Fact] ${input.items.length} plan item(s) linked to plan ${input.year} (status: ${input.status}).`,
    `[Fact] Allocated ${cap.allocated} of ${cap.capacity} days (${cap.over ? `over by ${cap.delta}` : `${Math.abs(cap.delta)} spare`}). Deferred and cancelled items are excluded.`,
    `[Fact] ${unscored.length} item(s) have no risk score${unscored.length ? `: ${unscored.map((i) => i.title).join("; ")}` : ""}.`,
    `[Fact] ${stale.length} item(s) were never audited or last audited ${AGE_CAP_YEARS} or more years ago.`,
    input.weightsApproved ? "[Fact] Planning weights are approved by the GCAE." : "[Risk] Planning weights are proposed, not approved. Any ranking is provisional.",
  ];
  const ordered = [...input.items].filter((i) => i.status !== "Cancelled").sort((a, b) => (b.riskScore ?? -1) - (a.riskScore ?? -1) || Number(b.mandatory) - Number(a.mandatory) || a.id.localeCompare(b.id));
  const lines = ordered.map((i, n) => `${n + 1}. ${i.title} (${i.entityName}), ${i.quarter}, ${i.budgetDays} days, risk ${i.riskScore == null ? "not scored" : `${i.riskScore} ${bandFor(i.riskScore)}`}${i.mandatory ? ", mandatory" : ""}.`);
  const proposal = [
    `Proposed review of audit plan ${input.year}. Staged for the GCAE. Nothing in the plan has been changed.`,
    cap.over ? `[Risk] The plan exceeds capacity by ${cap.delta} days. The GCAE decides what moves or is deferred. No item is chosen here.` : `[Fact] The plan is within capacity.`,
    unscored.length ? `[Risk] Score these items before relying on their order: ${unscored.map((i) => i.title).join("; ")}.` : "[Fact] Every item has a risk score.",
    "[Opinion] Order by risk score, mandatory first on ties:",
    ...lines,
  ].join("\n");
  return { reasoning, proposal };
}

// ---------------------------------------------------------------------------------------------
// Finding drafting
// ---------------------------------------------------------------------------------------------

export type FindingDraftInput = {
  engagementCode: string;
  materialityApproved: boolean;
  materialityAmount: number | null;
  materialityCurrency: string;
  test: {
    id: string;
    procedure: string;
    objective: string;
    result: string;
    exceptionsCount: number;
    recordsTested: number;
    populationCount: number;
    exposureAmount: number | null;
    currency: string | null;
    qaStatus: string;
    limitations: string | null;
  };
  evidence: (TagSource & { id: string })[];
};

/** Candidate severity from exposure against APPROVED materiality only. Never invented when there is no amount. */
export function candidateSeverity(i: FindingDraftInput): { severity: string | null; basis: string } {
  const t = i.test;
  if (t.exceptionsCount === 0 && t.result !== "FAIL_EXCEPTION") return { severity: null, basis: "The test recorded no exception." };
  if (t.exposureAmount != null && i.materialityApproved && i.materialityAmount != null) {
    return t.exposureAmount >= i.materialityAmount
      ? { severity: "Critical", basis: `Exposure ${money(t.exposureAmount, t.currency || i.materialityCurrency)} is at or above approved materiality ${money(i.materialityAmount, i.materialityCurrency)}.` }
      : { severity: "High", basis: `Exposure ${money(t.exposureAmount, t.currency || i.materialityCurrency)} is below approved materiality ${money(i.materialityAmount, i.materialityCurrency)}, and the test has exceptions.` };
  }
  return { severity: "Medium", basis: "No approved materiality or no exposure amount, so only a minimum band is offered. The reviewer scores likelihood and impact." };
}

export function reasonFindingDraft(input: FindingDraftInput): Reasoned {
  const t = input.test;
  const cand = candidateSeverity(input);
  const tags = deriveEvidenceTags(input.evidence, { qaCleared: t.qaStatus.toLowerCase() === "cleared" });
  const reasoning = [
    `[Fact] Test ${t.id} (${t.procedure}): ${t.result}, ${t.exceptionsCount} exception(s) in ${t.recordsTested} record(s) tested.`,
    t.populationCount > t.recordsTested ? `[Risk] Population stated ${t.populationCount}, tested ${t.recordsTested}. The remaining ${t.populationCount - t.recordsTested} are Unable to conclude, not a pass.` : "[Fact] Records tested equal the stated population.",
    `[Fact] Evidence tags from the cited evidence: ${tags.join(", ")}. QA re-performance: ${t.qaStatus}.`,
    `[Opinion] Candidate severity: ${cand.severity ?? "none"}. ${cand.basis}`,
  ];
  if (!cand.severity) {
    return { reasoning, proposal: `No finding is proposed from test ${t.id}. ${cand.basis}`, evidenceTags: tags };
  }
  const cap = severityCap(cand.severity, tags);
  const exposure = t.exposureAmount != null ? `Exposure recorded by the test: ${money(t.exposureAmount, t.currency || input.materialityCurrency)}.` : "No exposure amount was recorded. None is stated.";
  const proposal = [
    `Draft finding for ${input.engagementCode}. Staged for review. Not saved as a finding.`,
    `Condition [Fact]: ${t.objective} ${t.exceptionsCount} exception(s) in ${t.recordsTested} record(s) tested. ${exposure}`,
    `Criteria [Assumption]: [CRITERIA TO BE CONFIRMED AGAINST POLICY]`,
    `Cause [Assumption]: [ROOT CAUSE TO BE CONFIRMED WITH MANAGEMENT]`,
    `Effect [Risk]: ${exposure} Likelihood and impact are scored by the reviewer.`,
    `Recommendation: [SMART RECOMMENDATION TO BE AGREED]. Owner: [OWNER TO BE ASSIGNED]. Date: [DATE TO BE AGREED].`,
    `Limitations [Fact]: ${t.limitations || "none recorded"}`,
    `Severity [Opinion]: ${cap.severity}${cap.capped ? ` (candidate Critical, ${cap.flag}; evidence is only REP/ANA)` : ""}.`,
  ].join("\n");
  return { reasoning, proposal, severity: cap.severity, evidenceTags: tags };
}

// ---------------------------------------------------------------------------------------------
// ERM risk assessment
// ---------------------------------------------------------------------------------------------

export type ErmControlFact = { id: string; title: string; operatingEffectiveness: string; designEffectiveness: string };

export function reasonErm(input: { scope: string; risks: ErmRisk[]; controls: ErmControlFact[] }): Reasoned {
  const controlIds = new Set(input.controls.map((c) => c.id));
  const noControl = risksWithoutControl(input.risks, controlIds);
  const unassessed = input.risks.filter((r) => viewScore(r, "residual") == null);
  const above = input.risks.filter((r) => {
    const res = viewScore(r, "residual");
    return res != null && res > (viewScore(r, "inherent") ?? 0);
  });
  const weak = input.controls.filter((c) => c.operatingEffectiveness !== "Effective");
  const reasoning = [
    `[Fact] ${input.risks.length} risk(s) and ${input.controls.length} control(s) linked to ${input.scope}.`,
    `[Fact] ${unassessed.length} risk(s) have no residual assessment. They are not scored here.`,
    `[Fact] ${noControl.length} risk(s) have no linked control that exists on file.`,
    `[Fact] ${weak.length} linked control(s) are not rated Effective in operation.`,
    `[Risk] ${above.length} risk(s) show a residual score above the inherent score. That needs an explanation.`,
  ];
  const rows = input.risks.map((r) => `- ${r.title}: inherent ${r.inherentLikelihood * r.inherentImpact}, residual ${residualLabel(r)}.`);
  const proposal = [
    `Proposed ERM review for ${input.scope}. Staged for the audit manager. No score on the register has been changed.`,
    unassessed.length ? `[Risk] Assess residual before relying on the heat map: ${unassessed.map((r) => r.title).join("; ")}.` : "[Fact] Every risk has a residual assessment.",
    noControl.length ? `[Risk] No linked control on file: ${noControl.map((r) => r.title).join("; ")}.` : "[Fact] Every risk has at least one linked control on file.",
    weak.length ? `[Risk] Controls not rated Effective in operation: ${weak.map((c) => `${c.title} (${c.operatingEffectiveness})`).join("; ")}.` : "[Fact] Every linked control is rated Effective in operation.",
    above.length ? `[Risk] Residual above inherent: ${above.map((r) => r.title).join("; ")}.` : "[Fact] No residual is above its inherent score.",
    "[Fact] Register as recorded:",
    ...rows,
  ].join("\n");
  return { reasoning, proposal };
}
