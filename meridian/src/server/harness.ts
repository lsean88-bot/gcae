import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  actions,
  auditEvents,
  controls,
  engagements,
  entities,
  evidence,
  findings,
  lessons,
  people,
  risks,
  testRuns,
} from "@/db/schema";
import { completeWithModel } from "@/lib/ai";
import { loadAiStatus, loadProviderKey } from "@/server/ai-config";
import { compareReperformance, parseCsv, PROCEDURES, runProcedure } from "@/lib/engine";
import { isOverdue, effectiveDue, todayIso, uid } from "@/lib/format";
import { shortHash } from "@/lib/hash";
import { ensureLessons, weakensIronRule } from "@/lib/lessons";
import { claudeConstitution, FORBIDDEN } from "@/lib/specialists";
import { buildBriefing, qualityChecks, type BriefInput } from "@/lib/reports";
import { STAGE_KIND, type ChainStageName } from "@/lib/chain";
import { stageRun } from "@/server/guardrail";

export type HarnessStep = {
  agent: string;
  skill: string;
  summary: string;
  detail: string;
  status: "done" | "blocked" | "suggested";
  stage?: ChainStageName;
};

/** The fieldwork harness is a chain: perceive, retrieve linked records only, reason, propose (staged), guardrail, human decision. */
const STAGE_OF: Record<string, ChainStageName> = {
  screen_gates: "perceive",
  read_knowledge: "perceive",
  read_process: "retrieve",
  grade_evidence: "retrieve",
  run_approved_test: "reason",
  reperform_calculation: "reason",
  quality_check: "propose",
  propose_lesson: "propose",
  interpret: "propose",
};
/** Skills whose text is agent-authored and must pass the guardrails. The rest quote the file. */
const DRAFT_SKILLS = ["quality_check", "propose_lesson", "interpret"];

export async function executeHarness(engagementId: string, actorName: string, opts: { noExternal?: boolean } = {}) {
  await ensureLessons();
  const [engagement] = await db.select().from(engagements).where(eq(engagements.id, engagementId));
  if (!engagement) return { ok: false as const, error: "Engagement not found." };
  const [entity] = await db.select().from(entities).where(eq(entities.id, engagement.entityId));
  const evidenceRows = await db.select().from(evidence).where(eq(evidence.engagementId, engagementId));
  const testRows = await db.select().from(testRuns).where(eq(testRuns.engagementId, engagementId));
  const findingRows = await db.select().from(findings).where(eq(findings.engagementId, engagementId));
  const actionRows = await db.select().from(actions).where(eq(actions.engagementId, engagementId));
  const riskRows = await db.select().from(risks).where(eq(risks.entityId, engagement.entityId));
  const controlRows = await db.select().from(controls).where(eq(controls.entityId, engagement.entityId));
  const peopleRows = await db.select().from(people);
  const nameOf = (id?: string | null) => peopleRows.find((person) => person.id === id)?.name || "Unassigned";

  const harnessId = uid("harness");
  const steps: HarnessStep[] = [];

  const missing: string[] = [];
  if (!engagement.objective.trim() || !engagement.scope.trim() || !engagement.period.trim()) missing.push("Objective, scope, or period is missing.");
  if (!evidenceRows.length) missing.push("No evidence is registered.");
  if (!engagement.materialityApproved) missing.push("Materiality is not approved. Testing is blocked.");
  steps.push({
    agent: "Harness",
    skill: "screen_gates",
    status: missing.length ? "blocked" : "done",
    summary: missing.length ? "Stopped at a gate." : "Gates for the recorded stage are readable.",
    detail: missing.join(" ") || "Assignment fields and evidence are present. Materiality is approved.",
  });

  const knowledge = [
    `${engagement.code} · ${engagement.title}`,
    `Entity: ${entity?.name || "Unknown"} · ${entity?.jurisdiction || ""} · ${entity?.process || ""}`,
    `Objective: ${engagement.objective}`,
    `Scope: ${engagement.scope}`,
    `Period: ${engagement.period}`,
    `Appetite: ${engagement.riskAppetite || "[NOT STATED]"}`,
    `Risks on file: ${riskRows.map((risk) => `${risk.title} (${risk.appetite})`).join("; ") || "None linked."}`,
    `Controls: ${controlRows.map((control) => `${control.title} — operating ${control.operatingEffectiveness}`).join("; ") || "None linked."}`,
    "This is the file. It is not an opinion.",
  ].join("\n");
  steps.push({
    agent: "Knowledge agent",
    skill: "read_knowledge",
    status: "done",
    summary: "Assignment read from the file.",
    detail: knowledge,
  });

  const notes = evidenceRows.filter((item) => /walkthrough|note|inquiry/i.test(`${item.documentType} ${item.originalFilename}`));
  const processDetail = notes.length
    ? notes.map((item) => `${item.id} (${item.reliability}, ${item.completeness}):\n${(item.body || "").slice(0, 1200)}`).join("\n\n")
    : "No walkthrough note is registered. The process agent will not invent a flow.";
  const missingProcess = ["Process:", "System:", "Owner", "Exception"].filter((label) => !processDetail.includes(label));
  steps.push({
    agent: "Process agent",
    skill: "read_process",
    status: notes.length ? "done" : "blocked",
    summary: notes.length ? "Process notes read. Unobserved steps stay unobserved." : "No process note on file.",
    detail: `${processDetail}\n\nNot found in the notes: ${missingProcess.join(", ") || "none of the labelled checks"}.`,
  });

  const evidenceDetail = evidenceRows.map((item) => `${item.id} ${item.reliability} ${item.completeness} hash ${item.fileHash.slice(0, 12)} — ${item.limitations || "no limitation stated"}`).join("\n");
  steps.push({
    agent: "Evidence agent",
    skill: "grade_evidence",
    status: evidenceRows.some((item) => item.reliability === "R4" || item.reliability === "R5") ? "blocked" : "done",
    summary: `${evidenceRows.length} item(s) on the ledger. Originals were not edited.`,
    detail: evidenceDetail || "Empty register.",
  });

  if (engagement.materialityApproved) {
    for (const item of evidenceRows) {
      if (!item.body) continue;
      const procedure = PROCEDURES.find((candidate) => {
        const parsed = parseCsv(item.body || "");
        return candidate.columns.every((column) => parsed.headers.includes(column));
      });
      if (!procedure) continue;
      const already = testRows.some((test) => test.evidenceId === item.id && test.procedure === procedure.id);
      if (already) continue;
      const thresholds = engagement.thresholdJson || {};
      const execution = runProcedure(procedure.id, item.body, thresholds);
      const id = uid("tr");
      await db.insert(testRuns).values({
        id,
        engagementId,
        controlId: null,
        procedure: procedure.id,
        objective: procedure.objective,
        populationDefinition: item.populationNote || item.limitations || "Population note not stated.",
        populationCount: execution.populationCount,
        recordsTested: execution.recordsTested,
        method: "Harness testing agent. Approved procedure on the registered extract. Not approved by a person.",
        thresholdJson: thresholds,
        exceptionsCount: execution.failed,
        result: execution.result,
        exposureAmount: execution.exposure,
        currency: execution.currency,
        evidenceId: item.id,
        scriptName: `meridian/procedures/${procedure.id}.ts`,
        scriptVersion: "1.0.0",
        parameterHash: shortHash(JSON.stringify(thresholds)),
        executedAt: todayIso(),
        qaStatus: "pending",
        qaResult: null,
        qaNotes: null,
        limitations: execution.limitations.join(" "),
        approvalStatus: "pending",
        approvedBy: null,
        deviation: false,
        workpaper: execution.workpaper,
      });
      testRows.push({
        id,
        engagementId,
        controlId: null,
        procedure: procedure.id,
        objective: procedure.objective,
        populationDefinition: item.populationNote || "",
        populationCount: execution.populationCount,
        recordsTested: execution.recordsTested,
        method: "Harness",
        thresholdJson: thresholds,
        exceptionsCount: execution.failed,
        result: execution.result,
        exposureAmount: execution.exposure,
        currency: execution.currency,
        evidenceId: item.id,
        scriptName: procedure.id,
        scriptVersion: "1.0.0",
        parameterHash: "",
        executedAt: todayIso(),
        qaStatus: "pending",
        qaResult: null,
        qaNotes: null,
        limitations: execution.limitations.join(" "),
        approvalStatus: "pending",
        approvedBy: null,
        deviation: false,
        workpaper: execution.workpaper,
      });
      steps.push({
        agent: "Testing agent",
        skill: "run_approved_test",
        status: "suggested",
        summary: `${procedure.name} on ${item.id}: ${execution.result}. Not approved.`,
        detail: execution.workpaper.narrative,
      });
    }
  } else {
    steps.push({
      agent: "Testing agent",
      skill: "run_approved_test",
      status: "blocked",
      summary: "Refused to test.",
      detail: "Materiality is not approved. The harness will not invent a threshold or run a quiet draft.",
    });
  }

  const openQa = testRows.filter((test) => (test.exceptionsCount > 0 || test.result === "FAIL_EXCEPTION") && test.qaStatus !== "cleared");
  for (const test of openQa) {
    const source = evidenceRows.find((item) => item.id === test.evidenceId);
    if (!source?.body) {
      steps.push({
        agent: "Assurance agent",
        skill: "reperform_calculation",
        status: "blocked",
        summary: `${test.id} cannot be re-performed.`,
        detail: "The original extract is missing. This is Unable to conclude, not a clearance.",
      });
      continue;
    }
    const second = runProcedure(test.procedure, source.body, test.thresholdJson || {});
    const compared = compareReperformance(
      { result: test.result, failed: test.exceptionsCount, unable: test.workpaper?.unable || 0, exposure: test.exposureAmount },
      second,
    );
    steps.push({
      agent: "Assurance agent",
      skill: "reperform_calculation",
      status: "suggested",
      summary: compared.match ? `${test.id} recalculation matched. A person must still clear it.` : `${test.id} recalculation differed. Approval is blocked.`,
      detail: `${compared.note} ${compared.differences.join(" ") || "Counts and exposure matched."} QA status was not changed by the harness.`,
    });
  }
  if (!openQa.length) {
    steps.push({
      agent: "Assurance agent",
      skill: "reperform_calculation",
      status: "done",
      summary: "No uncleared exception test was waiting.",
      detail: "A pass is not assumed for tests that were not run.",
    });
  }

  const brief: BriefInput = {
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
    audience: engagement.audience,
    materialityAmount: engagement.materialityAmount,
    materialityCurrency: engagement.materialityCurrency,
    materialityApproved: engagement.materialityApproved,
    gcaeApproved: engagement.gcaeApproved,
    findings: findingRows,
    actions: actionRows.map((action) => ({ ...action, ownerName: nameOf(action.ownerId) })),
    tests: testRows,
  };
  const checks = qualityChecks(brief);
  const failedChecks = checks.filter((check) => !check.pass);
  const briefing = buildBriefing(brief).map((section) => `${section.heading}: ${section.paragraphs.join(" ")}`).join("\n");
  steps.push({
    agent: "Reporting agent",
    skill: "quality_check",
    status: failedChecks.length ? "suggested" : "done",
    summary: `${checks.length - failedChecks.length}/${checks.length} quality checks passed. Report not issued.`,
    detail: `${failedChecks.map((check) => check.detail).join(" ")}\n\n${briefing.slice(0, 1500)}`,
  });

  const overdue = actionRows.filter((action) => isOverdue(action.status, effectiveDue(action.originalDue, action.revisedDue)));
  const proposals = [
    !engagement.materialityApproved
      ? {
          title: "Do not let fieldwork start before the threshold is approved",
          observation: `${engagement.code} reached the harness with materiality unapproved.`,
          change: "Keep the testing agent refused until the GCAE approves the matrix.",
          area: "testing",
          ironRule: "Agents execute approved procedures. They do not invent criteria or thresholds.",
        }
      : null,
    overdue.length
      ? {
          title: "Escalate overdue actions before the next committee pack",
          observation: `${overdue.length} action(s) are past the agreed date and not closed.`,
          change: "The owner updates progress. Internal Audit does not close the action without validated evidence.",
          area: "reporting",
          ironRule: "Nothing is approved or closed without a person.",
        }
      : null,
    evidenceRows.some((item) => item.completeness !== "Complete")
      ? {
          title: "Name the untested remainder in the opinion",
          observation: "At least one extract is partial. A clean sentence can hide that.",
          change: "The reporting agent must repeat the completeness limit in the briefing.",
          area: "reporting",
          ironRule: "Unresolved limitations stay visible.",
        }
      : null,
  ].filter(Boolean) as { title: string; observation: string; change: string; area: string; ironRule: string }[];

  for (const proposal of proposals) {
    if (weakensIronRule(proposal.change) || weakensIronRule(proposal.title)) {
      steps.push({
        agent: "Kaizen agent",
        skill: "propose_lesson",
        status: "blocked",
        summary: "Rejected a lesson that would weaken an iron rule.",
        detail: proposal.title,
      });
      continue;
    }
    const id = uid("lsn");
    await db.insert(lessons).values({
      id,
      engagementId,
      title: proposal.title,
      observation: proposal.observation,
      change: proposal.change,
      area: proposal.area,
      ironRule: proposal.ironRule,
      status: "proposed",
      createdAt: todayIso(),
      decidedBy: null,
      decisionNote: null,
    });
    steps.push({
      agent: "Kaizen agent",
      skill: "propose_lesson",
      status: "suggested",
      summary: proposal.title,
      detail: `${proposal.observation} Change: ${proposal.change}`,
    });
  }

  const status = await loadAiStatus();
  const provider = opts.noExternal ? null : status.active === "openai" || status.active === "claude" || status.active === "gemini" ? status.active : null;
  const modelName = provider === "openai" ? status.openaiModel : provider === "gemini" ? status.geminiModel : status.claudeModel;
  const modelNote = provider
    ? await interpretWithModel(engagement.code, steps, provider, modelName)
    : { notes: [opts.noExternal ? "External model skipped: this engagement is restricted and the GCAE has not allowed external models for it. The specialists above still ran in code." : "No model is connected. Open Connect AI and connect Claude, Gemini, or ChatGPT. The specialists above still ran in code."], model: "", label: "Model" };
  if (modelNote.notes.length) {
    steps.push({
      agent: modelNote.label,
      skill: "interpret",
      status: status.active === "none" ? "blocked" : "suggested",
      summary: status.active === "none" ? "No model is connected." : `${modelNote.label} interpreted the tool results. This is not an opinion.`,
      detail: modelNote.notes.join("\n\n"),
    });
  }

  for (const step of steps) step.stage = STAGE_OF[step.skill] ?? "propose";
  const proposalText = steps.filter((step) => DRAFT_SKILLS.includes(step.skill)).map((step) => `${step.summary}\n${step.detail}`);
  const guardrail = await stageRun(
    {
      id: harnessId,
      agent: "Harness",
      skill: "end_to_end",
      engagementId,
      trigger: `${actorName} started the end-to-end harness.`,
      status: "suggested",
      startedAt: todayIso(),
      completedAt: todayIso(),
      summary: steps[0]?.status === "blocked" ? "Harness stopped at a gate. No report was issued." : "Harness finished the specialist sequence. A person must still decide.",
      reasoning: steps.map((step, index) => ({
        n: index + 1,
        title: `${step.stage}: ${step.agent} · ${step.skill}`,
        detail: step.summary,
        kind: step.status === "blocked" ? ("limit" as const) : STAGE_KIND[step.stage ?? "propose"],
      })),
      inputs: { engagement: engagementId, forbidden: FORBIDDEN.join(","), chain: "engagement_fieldwork" },
      output: { note: "HARNESS NOTE — NOT AN ISSUED OPINION", chain: "engagement_fieldwork", claude: modelNote.notes.join("\n").slice(0, 4000) },
      limitations: "The harness cannot issue, approve materiality, close an action, or waive an iron rule.",
      decidedBy: null,
      decisionNote: null,
    },
    { texts: proposalText, chain: true },
  );
  steps.push({
    agent: "Guardrail",
    skill: "guardrail_check",
    stage: "guardrail",
    status: guardrail.status === "blocked" ? "blocked" : "done",
    summary: guardrail.violations.length ? `${guardrail.violations.length} guardrail finding(s) recorded on the run.` : "No guardrail finding.",
    detail: guardrail.violations.map((v) => `[${v.rule}] ${v.message}`).join(" ") || "Fraud ladder, confidence wording and severity cap checked on every drafted text.",
  });
  steps.push({
    agent: "Human",
    skill: "human_decision",
    stage: "decision",
    status: "suggested",
    summary: guardrail.status === "blocked" ? "Approval is blocked until the GCAE overrides with a reason." : "Waiting for a person to accept or reject.",
    detail: "The harness has not applied, approved or issued anything.",
  });
  await db.insert(auditEvents).values({
    id: uid("log"),
    at: todayIso(),
    actor: actorName,
    action: "Ran harness",
    objectType: "engagement",
    objectId: engagementId,
    beforeState: null,
    afterState: harnessId,
    detail: `Guardrail ${guardrail.status}. ${steps.map((step) => `${step.agent}: ${step.summary}`).join(" | ")}`.slice(0, 500),
    engagementId,
  });

  return { ok: true as const, id: harnessId, steps, message: "Harness complete. Nothing was issued." };
}


async function interpretWithModel(code: string, steps: HarnessStep[], provider: "claude" | "openai" | "gemini", model: string) {
  const packet = steps.map((step) => `${step.agent} / ${step.skill} / ${step.status}\n${step.summary}\n${step.detail.slice(0, 700)}`).join("\n---\n");
  const key = await loadProviderKey(provider);
  const prompts = [
    { name: "Knowledge", ask: "In 6 short sentences, what does this assignment cover and what is missing? Use only the packet." },
    { name: "Process", ask: "What process condition is supported by the notes, and what was not observed? Do not draw a step that is not written." },
    { name: "Testing", ask: "State the test results in the packet. Do not add a figure. Say which results still need a person." },
    { name: "Reporting", ask: "Write a plain briefing of no more than 150 words from the packet. Start with MODEL DRAFT — NOT AN ISSUED OPINION." },
    { name: "Kaizen", ask: "Propose one improvement that tightens discipline. If you cannot do that without waiving a rule, say so." },
  ];
  const notes: string[] = [];
  for (const prompt of prompts) {
    const result = await completeWithModel(
      provider,
      model,
      `${claudeConstitution()}\n\nEngagement ${code}. You are the ${prompt.name} specialist.\n${prompt.ask}\n\nPACKET:\n${packet.slice(0, 12000)}`,
      key,
    );
    notes.push(result.ok ? `${prompt.name}\n${result.text}` : `${prompt.name} was not completed. ${result.error}`);
  }
  return { notes, model, label: provider === "openai" ? "ChatGPT" : provider === "gemini" ? "Gemini" : "Claude" };
}
