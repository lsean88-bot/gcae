import "dotenv/config"; // loads .env without overriding variables already set (CI)
import { securityChecks } from "../src/server/security-checks";
import { eq, like } from "drizzle-orm";
import { db } from "../src/db";
import { agentRuns, auditEvents, engagements, evidence, findings, lessons, people, testRuns } from "../src/db/schema";
import { figuresNotInSource } from "../src/lib/ai";
import { parseCsv, runProcedure } from "../src/lib/engine";
import { canAdvance } from "../src/lib/gates";
import { POPULATIONS } from "../src/lib/populations";
import { buildBriefing, qualityChecks } from "../src/lib/reports";
import { scoreImpacts } from "../src/lib/scoring";
import { emptyImpacts } from "../src/lib/scoring";
import { ensureSeed } from "../src/lib/seed";
import { executeHarness } from "../src/server/harness";
import { readFileSync } from "fs";
import { join } from "path";
import { todayIso } from "../src/lib/format";
import { deriveEvidenceTags, severityCap } from "../src/lib/iron-rules";
import { recurringLessons } from "../src/lib/lessons";
import { draftFinding } from "../src/server/api-drafts";
import type { ApiActor } from "../src/server/api-tokens";
import { decideAgentRunAs } from "../src/server/decisions";
import { capFindingSeverity, overrideGuardrailAs, readGuardrail, stageRun } from "../src/server/guardrail";

type Case = { id: string; name: string; pass: boolean; evidence: string };

const cases: Case[] = [];

function check(id: string, name: string, pass: boolean, evidence: string) {
  cases.push({ id, name, pass, evidence });
}

async function main() {
  await ensureSeed();

  const dual = runProcedure("dual_approval", POPULATIONS.invoices, { amount: 50000 });
  check("T-01", "Invoice dual approval finds seven exceptions", dual.failed === 7 && dual.result === "FAIL_EXCEPTION", `failed=${dual.failed} result=${dual.result}`);
  check("T-02", "Exception amount is MYR 639000 and is not invented", dual.exposure === 639000, `exposure=${dual.exposure}`);
  check("T-03", "Missing amount is unable to conclude, not a failure", dual.unable === 1 && dual.notApplicable === 2, `unable=${dual.unable} na=${dual.notApplicable}`);

  const inventory = runProcedure("inventory_recon", POPULATIONS.inventory, { pct: 2, value: 10000 });
  check("T-04", "Alloy count finds three exceptions worth 107895", inventory.failed === 3 && inventory.exposure === 107895, `failed=${inventory.failed} exposure=${inventory.exposure}`);

  const access = runProcedure("access_review", POPULATIONS.access, {});
  check("T-05", "Access review finds three exceptions and one gap", access.failed === 3 && access.unable === 1 && access.result === "FAIL_EXCEPTION", `failed=${access.failed} unable=${access.unable} result=${access.result}`);

  const duplicates = runProcedure("duplicate_payment", POPULATIONS.duplicates, { nearDays: 3 });
  check("T-06", "Duplicate candidate is counted once, not twice", duplicates.exposure === 42000 && duplicates.failed === 2, `failed=${duplicates.failed} exposure=${duplicates.exposure}`);

  const journals = runProcedure("journal_entry", POPULATIONS.journals, { roundAmount: 10000, weekendAmount: 25000 });
  check("T-07", "Journal test flags segregation, weekend, and unsupported round amount", journals.failed === 3 && journals.passed === 2, `failed=${journals.failed} passed=${journals.passed}`);

  const match = runProcedure("three_way_match", POPULATIONS.match, { pricePct: 2 });
  check("T-08", "Three-way match separates fail, unable, and pass", match.failed === 2 && match.unable === 1 && match.passed === 2, `failed=${match.failed} unable=${match.unable} passed=${match.passed}`);

  const gap = runProcedure("dual_approval", "invoice_id,vendor\nX,Y", { amount: 50000 });
  check("T-09", "Missing columns are unable to conclude, not a pass", gap.result === "UNABLE_TO_CONCLUDE" && gap.recordsTested === 0, `result=${gap.result} tested=${gap.recordsTested}`);

  const impacts = emptyImpacts();
  impacts.technology = { score: 5, note: "Domain admin enabled without approval.", relevant: true };
  const critical = scoreImpacts(4, impacts);
  check("T-10", "Priority is likelihood times highest impact", critical.score === 20 && critical.band === "Critical", `score=${critical.score} band=${critical.band}`);
  const unscored = scoreImpacts(4, emptyImpacts());
  check("T-11", "A rating without a relevant dimension is unscored", unscored.band === "Unscored", `band=${unscored.band}`);

  check(
    "T-12",
    "Testing cannot advance when materiality is not approved",
    canAdvance({ stage: 3, objective: "x", scope: "y", period: "z", evidenceCount: 1, materialityApproved: false, testCount: 0, openExceptionTests: 0, linkedExceptionFindings: 0, materialTestsWithoutQa: 0 }) === false,
    "stage 3, materiality false",
  );
  check(
    "T-13",
    "Stage 7 does not auto-advance into issuance",
    canAdvance({ stage: 7, objective: "x", scope: "y", period: "z", evidenceCount: 1, materialityApproved: true, testCount: 1, openExceptionTests: 0, linkedExceptionFindings: 0, materialTestsWithoutQa: 0 }) === false,
    "stage 7 blocked",
  );

  const invented = figuresNotInSource("Exposure MYR 639000.", "The loss is MYR 999999.");
  check("T-14", "A new figure in a model draft is detected", invented.includes("999999"), `novel=${invented.join(",")}`);

  const [before] = await db.select().from(engagements).where(eq(engagements.id, "eng-p2p"));
  const harness = await executeHarness("eng-p2p", "UAT");
  const [after] = await db.select().from(engagements).where(eq(engagements.id, "eng-p2p"));
  check("T-15", "Harness runs and does not issue the report", harness.ok && after?.gcaeApproved === false && after?.status !== "Issued", `ok=${harness.ok} issued=${after?.status} gcae=${after?.gcaeApproved}`);
  const testingStep = harness.ok ? harness.steps.find((step) => step.skill === "run_approved_test") : undefined;
  check("T-16", "Harness refuses testing when materiality is unapproved", testingStep?.status === "blocked", testingStep?.summary || "no step");
  check("T-17", "Harness does not approve materiality by itself", before?.materialityApproved === after?.materialityApproved, `before=${before?.materialityApproved} after=${after?.materialityApproved}`);

  const fileFindings = await db.select().from(findings);
  const ap = fileFindings.find((item) => item.code === "F-AP-01");
  check("T-18", "Stored finding score matches the scale", ap?.priorityScore === 16 && ap.priorityBand === "High", `${ap?.code} ${ap?.priorityScore} ${ap?.priorityBand}`);

  const runs = await db.select().from(testRuns);
  check("T-19", "Workpapers exist for the four seeded procedures", ["tr-ap-dual", "tr-ap-dup", "tr-dc-inv", "tr-it-access"].every((id) => runs.some((run) => run.id === id)), `count=${runs.length}`);

  const brief = buildBriefing({
    title: "Invoice approval",
    code: "GRP-AP-2026",
    period: "Jan–Mar 2026",
    entityName: "Group Accounts Payable",
    objective: "Test dual approval.",
    scope: "Invoices at or above MYR 50000.",
    businessContext: "Payments leave the group from this process.",
    limitations: "22 invoices were not in the extract.",
    overallRating: "High",
    opinion: null,
    ratingOverrideReason: null,
    audience: "Audit committee",
    materialityAmount: 250000,
    materialityCurrency: "MYR",
    materialityApproved: true,
    gcaeApproved: false,
    findings: ap ? [ap] : [],
    actions: [],
    tests: [],
  });
  check("T-20", "Briefing is built from the file and states issuance is not approved", brief.some((section) => section.paragraphs.join(" ").includes("not approved")), brief.map((section) => section.heading).join(", "));

  const checks = qualityChecks({
    title: "x",
    code: "x",
    period: "x",
    entityName: "x",
    objective: "x",
    scope: "x",
    businessContext: "Payments matter.",
    limitations: null,
    overallRating: null,
    opinion: null,
    ratingOverrideReason: null,
    audience: "Audit committee",
    materialityAmount: 1,
    materialityCurrency: "MYR",
    materialityApproved: true,
    gcaeApproved: false,
    findings: [],
    actions: [],
    tests: [],
  });
  check("T-21", "Quality check fails a report with no findings", checks.some((item) => item.id === "complete" && item.pass === false), checks.find((item) => item.id === "complete")?.detail || "");

  const parsed = parseCsv(POPULATIONS.invoices);
  check("T-22", "Invoice extract parses 18 records", parsed.rows.length === 18 && parsed.headers.includes("approver_2"), `rows=${parsed.rows.length}`);

  for (const item of await securityChecks()) check(item.id, item.name, item.pass, item.evidence);

  // T-56 to T-62: iron-rule guardrails on agent drafts (severity cap, fraud ladder, confidence wording, GCAE override, Kaizen).
  const tag = `uat-gr-${Date.now()}`;
  const [gcaeRow] = await db.select().from(people).where(eq(people.id, "p-gcae"));
  const [audRow] = await db.select().from(people).where(eq(people.id, "p-aud1"));
  const gcaeWho = { id: gcaeRow.id, name: gcaeRow.name, authority: "gcae" };
  const audWho = { id: audRow.id, name: audRow.name, authority: "auditor" };
  const stage = (id: string, draft: string) =>
    stageRun({ id, agent: "Report assembler", skill: "model_draft", engagementId: "eng-ap", trigger: "UAT guardrail", status: "suggested", startedAt: todayIso(), completedAt: todayIso(), summary: "UAT staged draft", reasoning: [], inputs: {}, output: { draft }, limitations: null, decidedBy: null, decisionNote: null });
  const idConf = `ar-${tag}-conf`;
  const idFraud = `ar-${tag}-fraud`;
  const idClean = `ar-${tag}-clean`;
  await stage(idConf, "Controls were tested with 99% confidence that approvals operate.");
  await stage(idFraud, "The clerk committed fraud on the sampled invoices.");
  await stage(idClean, "Draft for review only. The file records the objective and the limitations as written.");
  const readRun = async (id: string) => (await db.select().from(agentRuns).where(eq(agentRuns.id, id)))[0];
  const confRun = await readRun(idConf);
  const fraudRun = await readRun(idFraud);
  const cleanRun = await readRun(idClean);
  const confGuard = readGuardrail(confRun?.output);
  const fraudGuard = readGuardrail(fraudRun?.output);
  const approveConf = await decideAgentRunAs(gcaeWho, idConf, "approved", "UAT: trying to approve a blocked draft.");
  const approveFraud = await decideAgentRunAs(gcaeWho, idFraud, "approved", "UAT: trying to approve a blocked draft.");
  check("T-56", "A draft with '99% confidence' or 'committed fraud' is stored as blocked and cannot be approved, even by the GCAE", confGuard?.status === "blocked" && confGuard.violations.some((v) => v.rule === "confidence-percent") && fraudGuard?.status === "blocked" && fraudGuard.violations.some((v) => v.rule === "fraud-ladder") && !approveConf.ok && !approveFraud.ok && (await readRun(idConf))?.status === "suggested" && (await readRun(idFraud))?.status === "suggested", `confidence stored=${confGuard?.status} fraud stored=${fraudGuard?.status} approve confidence ok=${approveConf.ok} approve fraud ok=${approveFraud.ok}`);

  const cleanApprove = await decideAgentRunAs(gcaeWho, idClean, "approved", "UAT: clean draft accepted.");
  check("T-57", "A clean draft is stored clear and can be approved (known negative)", cleanRun && readGuardrail(cleanRun.output)?.status === "clear" && cleanApprove.ok, `clean stored=${readGuardrail(cleanRun?.output)?.status} approve ok=${cleanApprove.ok}`);

  const noReason = await overrideGuardrailAs(gcaeWho, idConf, "");
  const blankReason = await overrideGuardrailAs(gcaeWho, idConf, "   ");
  const audBefore = (await db.select().from(auditEvents).where(eq(auditEvents.objectId, idConf))).filter((e) => e.action === "Overrode guardrail").length;
  check("T-58", "A guardrail override without a reason is rejected, and nothing is logged", !noReason.ok && !blankReason.ok && audBefore === 0 && readGuardrail((await readRun(idConf))?.output)?.status === "blocked", `empty ok=${noReason.ok} blank ok=${blankReason.ok} override events=${audBefore}`);

  const asAuditor = await overrideGuardrailAs(audWho, idConf, `UAT ${tag}: auditor tries to override a guardrail.`);
  const asManager = await overrideGuardrailAs({ ...audWho, authority: "manager" }, idConf, `UAT ${tag}: manager tries to override a guardrail.`);
  const mutSrc = readFileSync(join(process.cwd(), "src", "server", "mutations.ts"), "utf8");
  const ovStart = mutSrc.indexOf("export async function overrideGuardrail(");
  const wrapperGuarded = ovStart > 0 && mutSrc.slice(ovStart, ovStart + 600).includes('deny(who.authority, ["gcae"]');
  const auditorApprove = await decideAgentRunAs(audWho, idConf, "approved", "UAT: auditor approval of a blocked draft.");
  check("T-59", "A non-GCAE user cannot override (server function and server action both check the role), and cannot approve a blocked draft", !asAuditor.ok && !asManager.ok && wrapperGuarded && !auditorApprove.ok && readGuardrail((await readRun(idConf))?.output)?.status === "blocked", `auditor ok=${asAuditor.ok} manager ok=${asManager.ok} action role check present=${wrapperGuarded} auditor approve ok=${auditorApprove.ok}`);

  const reason = `UAT ${tag}: wording reviewed against the workpaper, the figure is quoted from management, not asserted.`;
  const overridden = await overrideGuardrailAs(gcaeWho, idConf, reason);
  const ovEvents = (await db.select().from(auditEvents).where(eq(auditEvents.objectId, idConf))).filter((e) => e.action === "Overrode guardrail");
  const afterOverride = await readRun(idConf);
  const approveAfter = await decideAgentRunAs(gcaeWho, idConf, "approved", "UAT: accepted after a recorded override.");
  check("T-60", "A GCAE override with a reason succeeds, writes one audit_events row (actor, reason, blocked to overridden), and only then can the draft be approved", overridden.ok && ovEvents.length === 1 && ovEvents[0].actor === gcaeWho.name && ovEvents[0].detail.includes(reason) && ovEvents[0].beforeState === "blocked" && ovEvents[0].afterState === "overridden" && readGuardrail(afterOverride?.output)?.override?.reason === reason && approveAfter.ok, `override ok=${overridden.ok} audit rows=${ovEvents.length} actor=${ovEvents[0]?.actor} approve after ok=${approveAfter.ok}`);

  const rejectFraud = await decideAgentRunAs(audWho, idFraud, "rejected", `UAT ${tag}: reviewer rejected, the draft states a conclusion the evidence does not support.`);
  const captured = await db.select().from(lessons).where(like(lessons.observation, `%${tag}%`));
  const ovLesson = captured.find((l) => l.area === "agent-override");
  const rejLesson = captured.find((l) => l.area === "agent-rejection");
  const recurring = recurringLessons(captured, 5);
  check("T-61", "A lesson is captured after a GCAE override and after a rejection (agent, rule, reason), and recurringLessons groups them", rejectFraud.ok && Boolean(ovLesson) && ovLesson?.status === "proposed" && ovLesson.title.startsWith("Report assembler") && ovLesson.observation.includes(reason) && Boolean(rejLesson) && recurring.length === 2 && recurring.every((r) => r.count === 1), `override lesson=${ovLesson?.title} rejection lesson=${rejLesson?.title} groups=${recurring.length}`);

  const evAp = await db.select().from(evidence).where(eq(evidence.engagementId, "eng-ap"));
  const repOnly = evAp.find((e) => severityCap("Critical", deriveEvidenceTags([{ documentType: e.documentType, reliability: e.reliability }])).capped);
  const apiActor: ApiActor = { person: gcaeRow, authority: "gcae", tokenId: "tok-uat", tokenName: "uat-token", scopes: ["read", "draft"], actorLabel: "UAT via Claude token uat-token" };
  const critBody = { engagementId: "eng-ap", title: "UAT critical cap", condition: "Approvals were missing on sampled invoices.", rootCause: "[ROOT CAUSE TO BE CONFIRMED WITH MANAGEMENT]", evidenceIds: [repOnly?.id || "none"], likelihood: 4, likelihoodRationale: "Seen in the sample.", impacts: { financial: { score: 5, note: "Payments leave the group.", relevant: true } } };
  const crit = await draftFinding(apiActor, critBody);
  const [critRow] = typeof crit.body.id === "string" ? await db.select().from(findings).where(eq(findings.id, crit.body.id)) : [];
  check("T-62", "A Critical finding that cites only REP/ANA evidence is saved as High with the flag 'pending fieldwork corroboration' (server-side, whatever the client sends)", Boolean(repOnly) && crit.status === 201 && critRow?.priorityScore === 20 && critRow.priorityBand === "High" && critRow.riskRating === "High" && critRow.severityFlag === "pending fieldwork corroboration", `evidence=${repOnly?.id} (${repOnly?.documentType}) http=${crit.status} score=${critRow?.priorityScore} band=${critRow?.priorityBand} flag=${critRow?.severityFlag}${crit.status === 201 ? "" : ` error=${String(crit.body.error)}`}`);

  const sameEng = (await db.select().from(testRuns)).find((t) => String(t.qaStatus).toLowerCase() === "cleared" && t.engagementId === "eng-ap");
  const bypass = sameEng && repOnly ? await capFindingSeverity("Critical", [{ documentType: repOnly.documentType, reliability: repOnly.reliability }], sameEng.id, "eng-dc") : null;
  const own = sameEng && repOnly ? await capFindingSeverity("Critical", [{ documentType: repOnly.documentType, reliability: repOnly.reliability }], sameEng.id, "eng-ap") : null;
  check("T-63", "A cleared test run cited from a different engagement cannot lift the cap; a cleared test run of the same engagement can (known negative)", Boolean(bypass) && bypass?.band === "High" && Boolean(own) && own?.band === "Critical", `cleared test ${sameEng?.id} cited from engagement eng-dc band=${bypass?.band}; same-engagement test=${sameEng?.id} band=${own?.band}`);

  // Cleanup of UAT rows (audit_events stay: the log is append-only).
  await db.delete(agentRuns).where(like(agentRuns.id, `ar-${tag}%`));
  await db.delete(lessons).where(like(lessons.observation, `%${tag}%`));
  if (typeof crit.body.id === "string") await db.delete(findings).where(eq(findings.id, crit.body.id)).catch(() => undefined);

  const failed = cases.filter((item) => !item.pass);
  console.log(JSON.stringify({ passed: cases.length - failed.length, failed: failed.length, total: cases.length, cases }, null, 2));
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
