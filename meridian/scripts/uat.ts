import "dotenv/config"; // loads .env without overriding variables already set (CI)
import { securityChecks } from "../src/server/security-checks";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { engagements, findings, testRuns } from "../src/db/schema";
import { figuresNotInSource } from "../src/lib/ai";
import { parseCsv, runProcedure } from "../src/lib/engine";
import { canAdvance } from "../src/lib/gates";
import { POPULATIONS } from "../src/lib/populations";
import { buildBriefing, qualityChecks } from "../src/lib/reports";
import { scoreImpacts } from "../src/lib/scoring";
import { emptyImpacts } from "../src/lib/scoring";
import { ensureSeed } from "../src/lib/seed";
import { executeHarness } from "../src/server/harness";

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

  const failed = cases.filter((item) => !item.pass);
  console.log(JSON.stringify({ passed: cases.length - failed.length, failed: failed.length, total: cases.length, cases }, null, 2));
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
