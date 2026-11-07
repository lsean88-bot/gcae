import "dotenv/config"; // loads .env without overriding variables already set (CI)
import { securityChecks } from "../src/server/security-checks";
import { eq, like } from "drizzle-orm";
import { db } from "../src/db";
import { sessions, reportVersions, agentRuns, auditEvents, auditPlans, engagements, evidence, findings, lessons, people, planItems, testRuns } from "../src/db/schema";
import { runChainFor } from "../src/server/chains";
import { hiddenEngagementIds } from "../src/server/access";
import { runAnalyticsFromApi } from "../src/server/api-modules";
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
import { createHash } from "crypto";
import ExcelJS from "exceljs";
import { analyticsRuns } from "../src/db/schema";
import { getRunAs, inspectUploadAs, linkRunAs, listRunsAs, runAnalyticsAs } from "../src/server/analytics";
import { join } from "path";
import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { desc } from "drizzle-orm";
import { createSessionRow, hashToken } from "../src/server/session-store";
import { createReportVersion, setReportStatus } from "../src/server/report13-data";
import { todayIso } from "../src/lib/format";
import { deriveEvidenceTags, severityCap } from "../src/lib/iron-rules";
import { recurringLessons } from "../src/lib/lessons";
import { draftFinding } from "../src/server/api-drafts";
import type { ApiActor } from "../src/server/api-tokens";
import { decideAgentRunAs } from "../src/server/decisions";
import { externalModelRefused } from "../src/server/access";
import { restrictedMaskTerms, capFindingSeverity, overrideGuardrailAs, readGuardrail, stageRun } from "../src/server/guardrail";

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
  check("T-62", "A Critical finding that cites only REP/ANA evidence is saved as High with the flag 'pending fieldwork corroboration' (server-side, whatever the client sends)", Boolean(repOnly) && crit.status === 201 && critRow?.priorityScore === 19 && critRow.priorityBand === "High" && critRow.riskRating === "High" && String(critRow.severityFlag).startsWith("pending fieldwork corroboration") && String(critRow.severityFlag).includes("original score 20"), `evidence=${repOnly?.id} (${repOnly?.documentType}) http=${crit.status} score=${critRow?.priorityScore} band=${critRow?.priorityBand} flag=${critRow?.severityFlag}${crit.status === 201 ? "" : ` error=${String(crit.body.error)}`}`);

  const sameEng = (await db.select().from(testRuns)).find((t) => String(t.qaStatus).toLowerCase() === "cleared" && t.engagementId === "eng-ap");
  const bypass = sameEng && repOnly ? await capFindingSeverity("Critical", [{ documentType: repOnly.documentType, reliability: repOnly.reliability }], sameEng.id, "eng-dc") : null;
  const own = sameEng && repOnly ? await capFindingSeverity("Critical", [{ documentType: repOnly.documentType, reliability: repOnly.reliability }], sameEng.id, "eng-ap") : null;
  check("T-63", "A cleared test run cited from a different engagement cannot lift the cap; a cleared test run of the same engagement can (known negative)", Boolean(bypass) && bypass?.band === "High" && Boolean(own) && own?.band === "Critical", `cleared test ${sameEng?.id} cited from engagement eng-dc band=${bypass?.band}; same-engagement test=${sameEng?.id} band=${own?.band}`);

  // ---- Analytics module (T-64..T-67)
  const anTag = `an${Date.now().toString(36)}`;
  const csvBytes = new TextEncoder().encode(`invoice,amount\n00123,100\n123,100\nZ9,5\n`);
  const expectedSha = createHash("sha256").update(csvBytes).digest("hex");
  const anRun = await runAnalyticsAs(gcaeWho, { test: "duplicates", fileA: { name: `${anTag}-inv.csv`, bytes: csvBytes }, params: { keyCols: ["invoice"] } });
  const anRow = anRun.ok ? (await db.select().from(analyticsRuns).where(eq(analyticsRuns.id, anRun.id)))[0] : undefined;
  const anLog = anRun.ok ? (await db.select().from(auditEvents).where(eq(auditEvents.objectId, anRun.id))).filter((e) => e.action === "Ran analytics") : [];
  const anRes = anRow?.resultJson as { normalisedOnly?: { groupCount: number }; label?: string } | undefined;
  check("T-64", "Uploading a CSV and running duplicates saves a run with the file's SHA-256, row count, [ANA] label, finds '00123' vs '123' only after normalising, and writes one audit_events row", anRun.ok && anRow?.inputSha256 === expectedSha && anRow.rowCount === 3 && anRow.testType === "duplicates" && anRes?.normalisedOnly?.groupCount === 1 && String(anRes.label).startsWith("[ANA] auditor analysis") && anLog.length === 1 && anLog[0].actor === gcaeWho.name, `ok=${anRun.ok} sha match=${anRow?.inputSha256 === expectedSha} rows=${anRow?.rowCount} normalisedOnly=${anRes?.normalisedOnly?.groupCount} audit rows=${anLog.length}`);

  const restrictedId = `eng-${anTag}`;
  await db.insert(engagements).values({ id: restrictedId, code: `UAT-${anTag}`, title: "UAT restricted analytics", entityId: "none", period: "UAT", objective: "UAT", scope: "UAT", status: "Fieldwork", stage: 3, qaStatus: "pending", audience: "UAT", businessContext: "UAT", leadId: "p-gcae", startDate: todayIso(), restricted: true });
  const secretName = `${anTag}-restricted-payroll.csv`;
  const rRun = await runAnalyticsAs(gcaeWho, { engagementId: restrictedId, test: "duplicates", fileA: { name: secretName, bytes: csvBytes }, params: { keyCols: ["invoice"] } });
  const audList = await listRunsAs(audWho);
  const audGet = rRun.ok ? await getRunAs(audWho, rRun.id) : "no-run";
  const audRun = await runAnalyticsAs(audWho, { engagementId: restrictedId, test: "profile", fileA: { name: `${anTag}-x.csv`, bytes: csvBytes }, params: {} });
  const audLink = anRun.ok ? await linkRunAs(audWho, anRun.id, restrictedId) : null;
  const gcaeGet = rRun.ok ? await getRunAs(gcaeWho, rRun.id) : null;
  const leaked = JSON.stringify(audList).includes(secretName) || (rRun.ok && JSON.stringify(audList).includes(rRun.id));
  check("T-65", "A person without a grant cannot list, read, run against or link to a restricted-engagement analytics run (looks like not found); the GCAE can read it (known negative and positive)", rRun.ok && !leaked && audGet === null && !audRun.ok && audRun.error === "Not found." && Boolean(audLink && !audLink.ok) && Boolean(gcaeGet), `gcae run ok=${rRun.ok} leaked in auditor list=${leaked} auditor get=${audGet === null ? "null" : "VISIBLE"} auditor run=${audRun.ok ? "ALLOWED" : audRun.error} auditor link=${audLink && !audLink.ok ? audLink.error : "ALLOWED"} gcae read=${Boolean(gcaeGet)}`);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Data");
  ws.addRow(["Ref", "Amount"]);
  ws.addRow(["A1", { formula: "1+1", result: 2 }]);
  ws.addRow(["A2", { error: "#REF!" }]);
  ws.addRow(["A3", 40]);
  const xlsxBytes = new Uint8Array(await wb.xlsx.writeBuffer());
  const xInspect = await inspectUploadAs(gcaeWho, { name: "t.xlsx", bytes: xlsxBytes });
  const xRun = await runAnalyticsAs(gcaeWho, { test: "profile", fileA: { name: `${anTag}-t.xlsx`, bytes: xlsxBytes }, params: {} });
  const xRes = xRun.ok ? (xRun.run.result as { totalErrorStrings: number; columns: { name: string; sum: number | null }[] }) : null;
  const big = await runAnalyticsAs(gcaeWho, { test: "profile", fileA: { name: "big.csv", bytes: new Uint8Array(20 * 1024 * 1024 + 1) }, params: {} });
  const owner = await runAnalyticsAs({ id: "p-own1", name: "Farid Abdullah", authority: "owner" }, { test: "profile", fileA: { name: "o.csv", bytes: csvBytes }, params: {} });
  check("T-66", "XLSX is read data-only (cached formula result, literal #REF! kept), a file over 20 MB is refused, and an owner-role user cannot run analytics", xInspect.ok && xInspect.headers.join() === "ref,amount" && Boolean(xRes) && xRes?.totalErrorStrings === 1 && xRes?.columns.find((c) => c.name === "amount")?.sum === 42 && !big.ok && big.error.includes("20 MB") && !owner.ok, `xlsx errors=${xRes?.totalErrorStrings} amount sum=${xRes?.columns.find((c) => c.name === "amount")?.sum} big=${big.ok ? "ACCEPTED" : big.error} owner=${owner.ok ? "ALLOWED" : owner.error}`);

  const beforeLink = anRow ? JSON.stringify([anRow.paramsJson, anRow.inputSha256, anRow.resultJson, anRow.rowCount]) : "";
  const unlinked = await runAnalyticsAs(gcaeWho, { test: "profile", fileA: { name: `${anTag}-link.csv`, bytes: csvBytes }, params: {} });
  const link1 = unlinked.ok ? await linkRunAs(gcaeWho, unlinked.id, "eng-ap") : null;
  const link2 = unlinked.ok ? await linkRunAs(gcaeWho, unlinked.id, "eng-dc") : null;
  const afterRow = unlinked.ok ? (await db.select().from(analyticsRuns).where(eq(analyticsRuns.id, unlinked.id)))[0] : undefined;
  const linkLog = unlinked.ok ? (await db.select().from(auditEvents).where(eq(auditEvents.objectId, unlinked.id))).filter((e) => e.action === "Linked analytics run") : [];
  check("T-67", "An unlinked run can be linked to an engagement once, with an audit row; a second link is refused and the saved result, hash and parameters never change", unlinked.ok && Boolean(link1?.ok) && Boolean(link2 && !link2.ok) && afterRow?.engagementId === "eng-ap" && linkLog.length === 1 && linkLog[0].engagementId === "eng-ap" && beforeLink.length > 0 && afterRow?.inputSha256 === expectedSha, `link1=${link1?.ok} link2=${link2 && !link2.ok ? link2.error : "ALLOWED"} engagement=${afterRow?.engagementId} audit rows=${linkLog.length}`);
  await db.delete(analyticsRuns).where(like(analyticsRuns.inputFilename, `${anTag}%`));
  await db.delete(engagements).where(eq(engagements.id, restrictedId));

  // ---- Restricted-engagement leak through the audit_plan chain (T-68) and non-csv/xlsx API upload (T-69)
  const lkTag = `lk${Date.now().toString(36)}`;
  const lkEng = `eng-${lkTag}`;
  const lkPlan = `plan-${lkTag}`;
  const lkTitle = `Zq${lkTag} confidential payroll review`;
  await db.insert(engagements).values({ id: lkEng, code: `UAT-${lkTag}`, title: `UAT restricted ${lkTag}`, entityId: "none", period: "UAT", objective: "UAT", scope: "UAT", status: "Fieldwork", stage: 3, qaStatus: "pending", audience: "UAT", businessContext: "UAT", leadId: "p-gcae", startDate: todayIso(), restricted: true });
  await db.insert(auditPlans).values({ id: lkPlan, year: 2099, status: "Draft", capacityDays: 100, weights: { risk: 40, age: 30, mandatory: 30, approved: false }, createdBy: "p-gcae", createdAt: todayIso() });
  await db.insert(planItems).values({ id: `pi-${lkTag}`, planId: lkPlan, entityId: "none", title: lkTitle, quarter: "Q1", budgetDays: 10, rationale: "UAT", engagementId: lkEng });
  const chain = await runChainFor(gcaeWho, "audit_plan", lkPlan);
  const chainId = chain.ok ? chain.id : "";
  const hiddenAud = await hiddenEngagementIds(audWho);
  const visRuns = (await db.select().from(agentRuns)).filter((r) => !r.engagementId || !hiddenAud.has(r.engagementId));
  const visEvents = (await db.select().from(auditEvents)).filter((e) => !e.engagementId || !hiddenAud.has(e.engagementId));
  const [chainRun] = chainId ? await db.select().from(agentRuns).where(eq(agentRuns.id, chainId)) : [];
  const runLeak = visRuns.some((r) => JSON.stringify(r).includes(lkTitle));
  const evLeak = visEvents.some((e) => JSON.stringify(e).includes(lkTitle));
  check("T-68", "A plan item of a restricted engagement, run through the audit_plan chain as GCAE, is attributed to that engagement and its title is absent from every agent run and log row an unrestricted user can see (known positive: the run exists and is attributed)", chain.ok && chainRun?.engagementId === lkEng && hiddenAud.has(lkEng) && !runLeak && !evLeak, `chain ok=${chain.ok} run engagement=${chainRun?.engagementId} auditor-visible runs leaking=${runLeak} auditor-visible log rows leaking=${evLeak}`);
  const txt = await runAnalyticsFromApi(apiActor, { test: "profile", fileA: { name: `${lkTag}.txt`, contentBase64: Buffer.from("a,b\n1,2\n").toString("base64") } });
  const txtRows = await db.select().from(analyticsRuns).where(like(analyticsRuns.inputFilename, `${lkTag}%`));
  check("T-69", "An MCP-style API upload named .txt is rejected and nothing is saved (known negative)", txt.status >= 400 && txtRows.length === 0, `http=${txt.status} saved rows=${txtRows.length}`);
  if (chainId) await db.delete(agentRuns).where(eq(agentRuns.id, chainId));
  await db.delete(agentRuns).where(eq(agentRuns.engagementId, lkEng));
  await db.delete(planItems).where(eq(planItems.planId, lkPlan));
  await db.delete(auditPlans).where(eq(auditPlans.id, lkPlan));
  await db.delete(engagements).where(eq(engagements.id, lkEng));


  // ---- 13-section report versions and DOCX route (T-70 to T-75). report_versions rows cannot be deleted: assert on the latest version only.
  const BASE = process.env.UAT_BASE_URL || "http://127.0.0.1:3000";
  const latestOf = async (eid: string) => (await db.select().from(reportVersions).where(eq(reportVersions.engagementId, eid)).orderBy(desc(reportVersions.versionNo)).limit(1))[0];
  const gTok = await createSessionRow("p-gcae", Date.now());
  const aTok = await createSessionRow("p-aud1", Date.now());
  const getDocx = (id: string, tok: string, kind = "report") => fetch(`${BASE}/reports/v/${id}/docx?kind=${kind}`, { headers: { cookie: `meridian_session=${tok}` }, redirect: "manual" });
  const docxText = (buf: Buffer) => {
    const dir = mkdtempSync(join(tmpdir(), "uat-docx-"));
    try { writeFileSync(join(dir, "r.docx"), buf); return execFileSync("unzip", ["-p", join(dir, "r.docx"), "word/document.xml"], { maxBuffer: 64 * 1024 * 1024 }).toString("utf8"); } finally { rmSync(dir, { recursive: true, force: true }); }
  };
  const vApNo = (await latestOf("eng-ap"))?.versionNo ?? 0;
  const vAp = await createReportVersion(gcaeWho, "eng-ap");
  const apRow = await latestOf("eng-ap");
  const secs = (apRow?.contentJson as { report?: { sections?: { number: number }[] } })?.report?.sections ?? [];
  check("T-70", "Generating a version for a seeded engagement stores a new Draft with 13 sections numbered 1 to 13", vAp.ok && apRow.versionNo === vApNo + 1 && apRow.status === "Draft" && secs.length === 13 && secs.every((s, i) => s.number === i + 1), `ok=${vAp.ok} version=${apRow?.versionNo} sections=${secs.length}`);

  const blockedRes = vAp.ok ? await setReportStatus(gcaeWho, vAp.id, "Final") : null;
  const afterBlocked = await latestOf("eng-ap");
  const blockingNow = apRow?.gateJson.blocking.length ?? 0;
  check("T-71", "Final is refused by the server while gate_json.blocking is non-empty, and the status stays Draft (known positive: blocking is non-empty)", blockingNow > 0 && blockedRes?.ok === false && afterBlocked.status === "Draft" && afterBlocked.signedOffBy === null, `blocking=${blockingNow} final ok=${blockedRes?.ok} status=${afterBlocked?.status}`);

  const gRes = vAp.ok ? await getDocx(vAp.id, gTok) : null;
  const gBuf = gRes ? Buffer.from(await gRes.arrayBuffer()) : Buffer.alloc(0);
  const bRes = vAp.ok ? await getDocx(vAp.id, gTok, "brief") : null;
  const bBuf = bRes ? Buffer.from(await bRes.arrayBuffer()) : Buffer.alloc(0);
  const cd = gRes?.headers.get("content-disposition") || "";
  check("T-72", "The DOCX route returns the Word content type, an attachment with a safe filename, and a body starting with PK for GCAE (report and brief)", gRes?.status === 200 && gRes.headers.get("content-type") === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" && /^attachment; filename="[A-Za-z0-9_.-]+\.docx"$/.test(cd) && gBuf.subarray(0, 2).toString() === "PK" && bRes?.status === 200 && bBuf.subarray(0, 2).toString() === "PK", `status=${gRes?.status} type=${gRes?.headers.get("content-type")} disposition=${cd} magic=${gBuf.subarray(0, 2).toString()} brief=${bRes?.status}`);

  // Restricted engagement with its own stored version: the auditor has no access.
  const rsTag = `rs${Date.now().toString(36)}`;
  const rsEng = `eng-${rsTag}`;
  const rsTitle = `Zq${rsTag} sealed treasury review`;
  await db.insert(engagements).values({ id: rsEng, code: `UAT-${rsTag}`, title: rsTitle, entityId: "none", period: "UAT", objective: `Objective: ${rsTitle}`, scope: "UAT", status: "Fieldwork", stage: 3, qaStatus: "pending", audience: "UAT", businessContext: "UAT", leadId: "p-gcae", startDate: todayIso(), restricted: true });
  const rsVer = await createReportVersion(gcaeWho, rsEng);
  const rsGcae = rsVer.ok ? await getDocx(rsVer.id, gTok) : null;
  const rsAud = rsVer.ok ? await getDocx(rsVer.id, aTok) : null;
  const rsNone = rsVer.ok ? await fetch(`${BASE}/reports/v/${rsVer.id}/docx`, { redirect: "manual" }) : null;
  const rsAudCreate = await createReportVersion(audWho, rsEng);
  check("T-73", "A user without access to a restricted engagement gets 404 from the DOCX route and cannot generate a version; GCAE gets 200 (positive control); no session gets 404 or 401", rsGcae?.status === 200 && rsAud?.status === 404 && [401, 404].includes(rsNone?.status ?? 0) && rsAudCreate.ok === false, `gcae=${rsGcae?.status} auditor=${rsAud?.status} no session=${rsNone?.status} auditor create ok=${rsAudCreate.ok}`);

  const maskTerms = await restrictedMaskTerms();
  const apXml = docxText(gBuf);
  const rsXml = rsGcae ? docxText(Buffer.from(await rsGcae.arrayBuffer())) : "";
  const briefXml = docxText(bBuf);
  check("T-74", "A restricted engagement's own report, opened as GCAE, CONTAINS its title (positive control: own terms are not masked in its own DOCX); another engagement's report and brief do NOT contain it (the global set still masks every other restricted engagement); the XML is real, non-empty text", [...maskTerms].some((t) => t.includes(rsTag)) && rsXml.length > 1000 && rsXml.includes(rsTag) && rsXml.includes("sealed treasury review") && !apXml.includes(rsTag) && !briefXml.includes(rsTag) && apXml.length > 1000, `in mask set=${[...maskTerms].some((t) => t.includes(rsTag))} own docx contains title=${rsXml.includes(rsTag)} other report leaks=${apXml.includes(rsTag)} other brief leaks=${briefXml.includes(rsTag)} xml bytes=${apXml.length}`);
  const refDefault = await externalModelRefused(rsEng);
  const refLocal = await externalModelRefused(rsEng, { localOnly: true });
  check("T-76", "A restricted engagement refuses a remote model (default) and allows a local-only provider; a non-restricted engagement allows both", refDefault === true && refLocal === false && (await externalModelRefused("eng-ap")) === false, `restricted default refused=${refDefault} restricted local refused=${refLocal}`);

  const audSet = vAp.ok ? await setReportStatus(audWho, vAp.id, "Reviewed") : null;
  const audFinal = vAp.ok ? await setReportStatus(audWho, vAp.id, "Final") : null;
  const afterAud = await latestOf("eng-ap");
  const gcaeRev = vAp.ok ? await setReportStatus(gcaeWho, vAp.id, "Reviewed") : null;
  check("T-75", "A non-GCAE user cannot set a report status (Reviewed or Final) and the row is unchanged; GCAE can mark Reviewed (positive control)", audSet?.ok === false && audFinal?.ok === false && afterAud.status === "Draft" && gcaeRev?.ok === true, `auditor reviewed ok=${audSet?.ok} final ok=${audFinal?.ok} status after auditor=${afterAud?.status} gcae reviewed ok=${gcaeRev?.ok}`);

  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(gTok)));
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(aTok)));
  await db.delete(engagements).where(eq(engagements.id, rsEng));

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
