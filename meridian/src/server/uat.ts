import { securityChecks } from "@/server/security-checks";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { engagements, findings, settings, testRuns } from "@/db/schema";
import { figuresNotInSource } from "@/lib/ai";
import { parseCsv, runProcedure } from "@/lib/engine";
import { canAdvance } from "@/lib/gates";
import { POPULATIONS } from "@/lib/populations";
import { buildBriefing, qualityChecks } from "@/lib/reports";
import { emptyImpacts, scoreImpacts } from "@/lib/scoring";
import { ensureSeed } from "@/lib/seed";
import { executeHarness } from "@/server/harness";

export type UatCase = { id: string; name: string; pass: boolean; evidence: string };

export async function runUat(actorName = "UAT") {
  await ensureSeed();
  const cases: UatCase[] = [];
  const check = (id: string, name: string, pass: boolean, evidence: string) => cases.push({ id, name, pass, evidence });

  const dual = runProcedure("dual_approval", POPULATIONS.invoices, { amount: 50000 });
  check("T-01", "Invoice dual approval finds seven exceptions", dual.failed === 7 && dual.result === "FAIL_EXCEPTION", `failed=${dual.failed} result=${dual.result}`);
  check("T-02", "Exception amount is MYR 639000", dual.exposure === 639000, `exposure=${dual.exposure}`);
  check("T-03", "Missing amount is unable to conclude, not a failure", dual.unable === 1 && dual.notApplicable === 2, `unable=${dual.unable} na=${dual.notApplicable}`);

  const inventory = runProcedure("inventory_recon", POPULATIONS.inventory, { pct: 2, value: 10000 });
  check("T-04", "Alloy count finds three exceptions worth 107895", inventory.failed === 3 && inventory.exposure === 107895, `failed=${inventory.failed} exposure=${inventory.exposure}`);

  const access = runProcedure("access_review", POPULATIONS.access, {});
  check("T-05", "Access review finds three exceptions and one gap", access.failed === 3 && access.unable === 1, `failed=${access.failed} unable=${access.unable}`);

  const duplicates = runProcedure("duplicate_payment", POPULATIONS.duplicates, { nearDays: 3 });
  check("T-06", "Duplicate candidate is counted once", duplicates.exposure === 42000 && duplicates.failed === 2, `exposure=${duplicates.exposure}`);

  const journals = runProcedure("journal_entry", POPULATIONS.journals, { roundAmount: 10000, weekendAmount: 25000 });
  check("T-07", "Journals flag segregation, weekend, and round amount", journals.failed === 3 && journals.passed === 2, `failed=${journals.failed} passed=${journals.passed}`);

  const match = runProcedure("three_way_match", POPULATIONS.match, { pricePct: 2 });
  check("T-08", "Three-way match separates fail, unable, and pass", match.failed === 2 && match.unable === 1 && match.passed === 2, `failed=${match.failed} unable=${match.unable} passed=${match.passed}`);

  const gap = runProcedure("dual_approval", "invoice_id,vendor\nX,Y", { amount: 50000 });
  check("T-09", "Missing columns are unable to conclude, not a pass", gap.result === "UNABLE_TO_CONCLUDE" && gap.recordsTested === 0, gap.result);

  const impacts = emptyImpacts();
  impacts.technology = { score: 5, note: "Domain admin enabled without approval.", relevant: true };
  const critical = scoreImpacts(4, impacts);
  check("T-10", "Priority is likelihood times highest impact", critical.score === 20 && critical.band === "Critical", `${critical.score} ${critical.band}`);
  check("T-11", "No relevant dimension means unscored", scoreImpacts(4, emptyImpacts()).band === "Unscored", scoreImpacts(4, emptyImpacts()).band);

  check("T-12", "Unapproved materiality blocks the testing gate", canAdvance({ stage: 3, objective: "x", scope: "y", period: "z", evidenceCount: 1, materialityApproved: false, testCount: 0, openExceptionTests: 0, linkedExceptionFindings: 0, materialTestsWithoutQa: 0 }) === false, "blocked");
  check("T-13", "Stage 7 does not issue by itself", canAdvance({ stage: 7, objective: "x", scope: "y", period: "z", evidenceCount: 1, materialityApproved: true, testCount: 1, openExceptionTests: 0, linkedExceptionFindings: 0, materialTestsWithoutQa: 0 }) === false, "blocked");
  check("T-14", "A new figure in a model draft is detected", figuresNotInSource("Exposure MYR 639000.", "The loss is MYR 999999.").includes("999999"), "999999");

  const [before] = await db.select().from(engagements).where(eq(engagements.id, "eng-p2p"));
  const harness = await executeHarness("eng-p2p", actorName);
  const [after] = await db.select().from(engagements).where(eq(engagements.id, "eng-p2p"));
  check("T-15", "Harness runs and does not issue", harness.ok && after?.gcaeApproved === false && after?.status !== "Issued", after?.status || "missing");
  check("T-16", "Harness refuses testing without materiality", harness.ok && harness.steps.some((step) => step.skill === "run_approved_test" && step.status === "blocked"), "blocked");
  check("T-17", "Harness does not approve materiality", before?.materialityApproved === after?.materialityApproved, String(after?.materialityApproved));

  const fileFindings = await db.select().from(findings);
  const ap = fileFindings.find((item) => item.code === "F-AP-01");
  check("T-18", "Stored finding score matches the scale", ap?.priorityScore === 16 && ap.priorityBand === "High", `${ap?.priorityScore} ${ap?.priorityBand}`);
  const runs = await db.select().from(testRuns);
  check("T-19", "Seeded workpapers are on file", ["tr-ap-dual", "tr-ap-dup", "tr-dc-inv", "tr-it-access"].every((id) => runs.some((run) => run.id === id)), String(runs.length));

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
  check("T-20", "Briefing states the report is not issued", brief.some((section) => section.paragraphs.join(" ").includes("not approved")), "built");
  const emptyChecks = qualityChecks({
    title: "x", code: "x", period: "x", entityName: "x", objective: "x", scope: "x", businessContext: "Payments matter.",
    limitations: null, overallRating: null, opinion: null, ratingOverrideReason: null, audience: "Audit committee",
    materialityAmount: 1, materialityCurrency: "MYR", materialityApproved: true, gcaeApproved: false, findings: [], actions: [], tests: [],
  });
  check("T-21", "Quality check fails a report with no findings", emptyChecks.some((item) => item.id === "complete" && !item.pass), "failed as required");
  check("T-22", "Invoice extract parses 18 records", parseCsv(POPULATIONS.invoices).rows.length === 18, "18");

  for (const item of await securityChecks()) check(item.id, item.name, item.pass, item.evidence);

  const summary = { at: new Date().toISOString(), passed: cases.filter((item) => item.pass).length, failed: cases.filter((item) => !item.pass).length, total: cases.length, cases };
  await db.insert(settings).values({ key: "uat_latest", value: JSON.stringify(summary) }).onConflictDoUpdate({
    target: settings.key,
    set: { value: JSON.stringify(summary) },
  });
  return summary;
}
