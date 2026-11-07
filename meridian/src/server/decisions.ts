import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentRuns, engagements, entities, vendors } from "@/db/schema";
import { todayIso } from "@/lib/format";
import { captureLesson } from "@/lib/lessons";
import { approvalGate, auditAs, rulesForRejection, type Who } from "@/server/guardrail";

/**
 * Decision logic for agent runs, shared by the server actions in mutations.ts and by the UAT.
 * This file is NOT a "use server" file on purpose: functions here take `who` as a parameter and
 * must never be callable from a browser. The server actions resolve `who` from the session first.
 */
export type DecisionResult = { ok: true; message: string } | { ok: false; error: string };

export const DECIDABLE_AGENTS = ["Risk scorer", "Vendor tier recommender", "Test executor", "Independent re-performer", "Sufficiency reviewer", "Report assembler", "Harness", "Harness chain"];

export async function decideAgentRunAs(who: Who, runId: string, decision: "approved" | "rejected", note: string): Promise<DecisionResult> {
  if (decision !== "approved" && decision !== "rejected") return { ok: false, error: "Decision must be approved or rejected." };
  note = String(note ?? "");
  const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, runId));
  if (!run) return { ok: false, error: "Agent run not found." };
  if (run.status !== "suggested") return { ok: false, error: "This suggestion has already been decided." };
  if (run.agent !== "Screener" && !DECIDABLE_AGENTS.includes(run.agent)) return { ok: false, error: "This agent type cannot be decided here." };
  if (!note.trim()) return { ok: false, error: "Write why you accept or reject the suggestion." };
  if (run.agent === "Risk scorer" && !["gcae", "manager"].includes(who.authority)) {
    return { ok: false, error: "A planning score is accepted by the audit manager or the GCAE." };
  }
  if (run.agent === "Vendor tier recommender" && !["gcae", "manager", "auditor", "qa"].includes(who.authority)) {
    return { ok: false, error: "Internal Audit accepts a tier. The recommender does not." };
  }
  if (run.agent === "Screener") {
    return { ok: false, error: "This card is a stop, not a decision. Approve materiality on the engagement if testing should proceed. Accepting the card would not open the gate." };
  }
  if (decision === "approved") {
    const gate = approvalGate(run);
    if (gate.blocked) return { ok: false, error: gate.message };
  }
  // Claim the run first, only while it is still "suggested", so two decisions cannot both apply side effects.
  const claimed = await db.update(agentRuns).set({ status: decision, decidedBy: who.id, decisionNote: note, completedAt: todayIso() }).where(and(eq(agentRuns.id, runId), eq(agentRuns.status, "suggested"))).returning({ id: agentRuns.id });
  if (!claimed.length) return { ok: false, error: "This suggestion has already been decided." };
  if (decision === "approved" && run.agent === "Risk scorer" && run.output.suggestedScore) {
    const entityId = run.inputs.entity;
    if (entityId) {
      await db.update(entities).set({
        suggestedScore: Number(run.output.suggestedScore),
        residualRisk: Number(run.output.suggestedScore),
        scoreStatus: "accepted",
        suggestedRationale: note,
      }).where(eq(entities.id, entityId));
    }
  }
  if (decision === "approved" && run.agent === "Vendor tier recommender" && run.inputs.vendor) {
    await db.update(vendors).set({
      tier: run.output.suggestedTier || "1",
      tierStatus: "accepted",
      tierRationale: note,
    }).where(eq(vendors.id, run.inputs.vendor));
  }
  if (decision === "rejected" && run.agent === "Risk scorer" && run.inputs.entity) {
    await db.update(entities).set({ scoreStatus: "rejected", suggestedRationale: note }).where(eq(entities.id, run.inputs.entity));
  }
  if (decision === "rejected" && run.agent === "Vendor tier recommender" && run.inputs.vendor) {
    await db.update(vendors).set({ tierStatus: "rejected", tierRationale: note }).where(eq(vendors.id, run.inputs.vendor));
  }
  await auditAs(who, decision === "approved" ? "Accepted agent suggestion" : "Rejected agent suggestion", "agent", runId, note, "suggested", decision);
  if (decision === "rejected") {
    for (const rule of rulesForRejection(run)) {
      await captureLesson({ kind: "rejection", agent: run.agent, rule, reason: note, engagementId: run.engagementId, decidedBy: who.name });
    }
  }
  return { ok: true, message: decision === "approved" ? "Suggestion accepted and logged." : "Suggestion rejected. The previous record stands. The reason was captured as a lesson." };
}

export async function acceptModelDraftAs(who: Who, runId: string): Promise<DecisionResult> {
  const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, runId));
  if (!run || run.skill !== "model_draft" || !run.engagementId) return { ok: false, error: "That draft is not on file." };
  if (run.status !== "suggested") return { ok: false, error: "This draft has already been decided." };
  const draft = run.output.draft || "";
  if (!draft.trim()) return { ok: false, error: "The draft is empty." };
  if (run.limitations?.includes("figures that are not in the file")) {
    return { ok: false, error: run.limitations };
  }
  const gate = approvalGate(run);
  if (gate.blocked) return { ok: false, error: gate.message };
  const [engagement] = await db.select().from(engagements).where(eq(engagements.id, run.engagementId));
  if (!engagement) return { ok: false, error: "Engagement not found." };
  const claimed = await db.update(agentRuns).set({
    status: "approved",
    decidedBy: who.id,
    decisionNote: "Saved into the opinion draft. Ratings, findings, and issuance were not changed.",
    completedAt: todayIso(),
  }).where(and(eq(agentRuns.id, runId), eq(agentRuns.status, "suggested"))).returning({ id: agentRuns.id });
  if (!claimed.length) return { ok: false, error: "This draft has already been decided." };
  await db.update(engagements).set({ opinion: draft }).where(eq(engagements.id, engagement.id));
  await auditAs(who, "Accepted model draft", "engagement", engagement.id, "Opinion text replaced with the reviewed draft. The report was not issued.", engagement.opinion || "", "Model draft");
  return { ok: true, message: "Saved into the opinion draft. Scores were not changed, and the report was not issued." };
}
