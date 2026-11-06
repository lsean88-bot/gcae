import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  actions,
  agentRuns,
  auditEvents,
  engagements,
  entities,
  evidence,
  findings,
  lessons,
  pbcRequests,
  settings,
  testRuns,
} from "@/db/schema";
import { compareReperformance, runProcedure } from "@/lib/engine";
import { canAdvance } from "@/lib/gates";
import { sha256 } from "@/lib/hash";
import { buildBriefing, qualityChecks, stakeholderViews } from "@/lib/reports";
import { emptyImpacts, scoreImpacts } from "@/lib/scoring";
import { ensureSeed } from "@/lib/seed";
import { executeHarness } from "@/server/harness";
import { todayIso, uid } from "@/lib/format";

export type SimStep = {
  id: string;
  phase: string;
  scenario: string;
  pass: boolean;
  evidence: string;
};

const ENG = "eng-sim-q1";

const INVOICES = `invoice_id,vendor,amount,currency,approver_1,approver_2,payment_date
NM-1001,Apex Alloys,82000,MYR,S.Rahman,L.Teoh,2026-01-14
NM-1002,Apex Alloys,120000,MYR,S.Rahman,,2026-01-20
NM-1003,Die Steel Co,90000,MYR,M.Yusof,M.Yusof,2026-01-22
NM-1004,Canteen,40000,MYR,A.Lim,G.Chen,2026-01-25
NM-1005,Harbour Gases,,MYR,L.Teoh,A.Lim,2026-02-02
NM-1006,Northline Freight,61000,MYR,G.Chen,S.Rahman,2026-02-08
NM-1007,Apex Alloys,200000,MYR,A.Lim,,2026-02-12
NM-1008,Die Steel Co,55000,MYR,S.Rahman,s.rahman,2026-02-18`;

const MATCH = `invoice_id,vendor,po_qty,po_price,receipt_qty,invoice_qty,invoice_price
NM-M1,Apex Alloys,100,22.50,100,100,22.50
NM-M2,Die Steel Co,40,860,40,52,860
NM-M3,Harbour Gases,10,400,10,10,460
NM-M4,Northline Freight,6,1800,,6,1800
NM-M5,Apex Alloys,80,22.50,80,70,22.50`;

const STOCK = `item,location,book_qty,physical_qty,unit_cost
ADC12 alloy,WH-A,10000,8200,22.50
Steel shot,WH-C,5000,4960,4.20
Release agent,WH-C,300,,18.00`;

const ACCESS = `user_id,name,system,role,hr_status,account_status,privileged,approved
U-1,A.Rahman,SAP B1,Finance admin,Active,Enabled,Y,N
U-2,J.Kumar,SAP B1,Warehouse,Left,Enabled,N,Y
U-3,M.Teoh,SAP B1,Buyer,Active,Enabled,N,Y
U-4,P.Wong,SAP B1,Controller,Active,Enabled,N,
U-5,C.Lim,SAP B1,Viewer,Left,Disabled,N,Y`;

const JOURNALS = `je_id,posted_on,preparer,approver,amount,currency,description
JE-1,2026-03-02,A.Lim,G.Chen,18500,MYR,Month-end freight accrual
JE-2,2026-03-14,A.Lim,A.Lim,25000,MYR,Inventory reclass to WIP
JE-3,2026-03-15,S.Rahman,L.Teoh,50000,MYR,Adj
JE-4,2026-03-04,L.Teoh,M.Yusof,20000,MYR,Adj`;

const DUPLICATES = `payment_id,vendor,invoice_number,amount,currency,payment_date
PAY-1,Apex Alloys,INV-7781,42000,MYR,2026-02-02
PAY-2,Apex Alloys,INV-7781,42000,MYR,2026-02-04
PAY-3,Klang Power,KP-220,88000,MYR,2026-02-09
PAY-4,Klang Power,KP-221,88000,MYR,2026-02-10`;

export async function runSimulation() {
  await ensureSeed();
  await clearSimulation();
  const steps: SimStep[] = [];
  const note = (id: string, phase: string, scenario: string, pass: boolean, evidence: string, more?: string) => {
    steps.push({ id, phase, scenario, pass, evidence: more ? `${evidence}. ${more}` : evidence });
  };

  note(
    "S-01",
    "Planning",
    "A new engagement cannot leave planning with no evidence",
    canAdvance({ stage: 1, objective: "Test combined metals", scope: "AP, stock, access", period: "Q1", evidenceCount: 0, materialityApproved: false, testCount: 0, openExceptionTests: 0, linkedExceptionFindings: 0, materialTestsWithoutQa: 0 }) === false,
    "Gate closed",
    "Advance refused",
  );

  await db.insert(entities).values({
    id: "ent-sim",
    name: "Northline Metals",
    code: "NMET",
    jurisdiction: "Malaysia",
    businessUnit: "Manufacturing",
    process: "Alloy purchase, payment, stock and access",
    inherentRisk: 5,
    residualRisk: 4,
    riskRationale: "Simulation entity. High-value metal, partial extracts, and privileged access.",
    lastAudit: null,
    coverage: "In progress",
    ownerId: "p-own1",
    strategicObjective: "Pay the right supplier once, and keep the book equal to the cage.",
    suggestedScore: 4,
    suggestedRationale: "Planning suggestion only.",
    scoreStatus: "accepted",
  });

  await db.insert(engagements).values({
    id: ENG,
    code: "NMET-Q1-SIM",
    title: "Combined metals assurance",
    entityId: "ent-sim",
    period: "Q1",
    objective: "Determine whether high-value alloy purchases were approved, received, recorded, and paid once.",
    scope: "Invoices at or above MYR 50,000, goods receipts, the alloy count extract, privileged and leaver access, and manual journals. Full populations were not provided.",
    status: "Planning",
    stage: 3,
    overallRating: null,
    opinion: null,
    ratingOverrideReason: null,
    materialityAmount: 250000,
    materialityCurrency: "MYR",
    thresholdJson: { amount: 50000, pct: 2, value: 10000, pricePct: 2, nearDays: 3, roundAmount: 10000, weekendAmount: 25000 },
    materialityApproved: false,
    materialityApprovedBy: null,
    gcaeApproved: false,
    issuedAt: null,
    qaStatus: "Not started",
    audience: "Audit committee and the plant controller.",
    businessContext: "Northline Metals melts purchased alloy into automotive parts. A missed second approval, a repeated invoice, or a short cage can all move cash or the inventory balance.",
    limitations: "Management stated 40 in-scope invoices and a full item master. Neither count was re-performed. This simulation uses the registered extracts only.",
    leadId: "p-aud1",
    startDate: todayIso(),
    reportDate: null,
    riskAppetite: "Unapproved payments above MYR 50,000 are outside appetite.",
  });

  note("S-02", "Planning", "Materiality is proposed but not approved, so testing must wait", true, "Not approved", "materialityApproved false");

  const bodies = [
    ["ev-sim-inv", "ap-invoices.csv", "System extract", "Invoice approval", "Partial", "R2", "Management stated 40 invoices. This file has 8.", INVOICES],
    ["ev-sim-match", "three-way.csv", "System extract", "Three-way match", "Partial", "R2", "Five-line extract. Not the open purchase-order population.", MATCH],
    ["ev-sim-stock", "alloy-count.csv", "Count sheet", "Inventory", "Partial", "R3", "Item master was not tied out. One consumable line has no physical quantity.", STOCK],
    ["ev-sim-access", "access-sample.csv", "Access extract", "User access", "Partial", "R2", "Judgmental sample of five accounts. Not the directory.", ACCESS],
    ["ev-sim-je", "journals.csv", "System extract", "Journal entries", "Partial", "R2", "Four manual journals. Not the full journal population.", JOURNALS],
    ["ev-sim-dup", "payments.csv", "System extract", "Duplicate payments", "Partial", "R2", "Payment lines for the invoice sample only.", DUPLICATES],
    ["ev-sim-inquiry", "clerk-inquiry.txt", "Inquiry", "Inventory receipts", "Unknown", "R4", "Inquiry only. Cannot support a pass.", "The clerk said the count was fine. No record was provided."],
  ] as const;

  for (const [id, filename, documentType, process, completeness, reliability, limitations, body] of bodies) {
    await db.insert(evidence).values({
      id,
      engagementId: ENG,
      sourceSystem: id === "ev-sim-inquiry" ? "Interview" : "SAP B1",
      originalFilename: filename,
      documentType,
      businessProcess: process,
      reportingPeriod: "Q1",
      version: 1,
      supersedesId: null,
      fileHash: sha256(body),
      receivedAt: todayIso(),
      custodian: "p-own1",
      obtainedBy: "p-aud1",
      recordCount: Math.max(body.split("\n").length - 1, 1),
      completeness,
      reliability,
      limitations,
      status: "Registered",
      sheetOrSection: "Body",
      body,
      populationNote: limitations,
    });
  }
  const originalHash = sha256(INVOICES);
  const [stored] = await db.select().from(evidence).where(eq(evidence.id, "ev-sim-inv"));
  note("S-03", "Evidence", "Registered extract is hashed and readable", stored?.fileHash === originalHash && stored.reliability === "R2", "Hash matches paste", stored?.fileHash.slice(0, 12) || "missing");
  note("S-04", "Evidence", "Inquiry evidence is graded R4 and cannot support a pass", bodies.some((row) => row[0] === "ev-sim-inquiry" && row[5] === "R4"), "R4", "R4 inquiry stored");

  note(
    "S-05",
    "Gate",
    "Stage 3 with evidence still cannot move to testing before GCAE approval",
    canAdvance({ stage: 3, objective: "x", scope: "y", period: "Q1", evidenceCount: 7, materialityApproved: false, testCount: 0, openExceptionTests: 0, linkedExceptionFindings: 0, materialTestsWithoutQa: 0 }) === false,
    "Blocked",
    "Blocked",
  );

  await db.update(engagements).set({ materialityApproved: true, materialityApprovedBy: "p-gcae", stage: 4, status: "Fieldwork" }).where(eq(engagements.id, ENG));
  note("S-06", "Gate", "GCAE approval opens fieldwork", true, "Approved by p-gcae", "Approved and moved to stage 4");

  const thresholds = { amount: 50000, pct: 2, value: 10000, pricePct: 2, nearDays: 3, roundAmount: 10000, weekendAmount: 25000 };
  const invoiceRun = runProcedure("dual_approval", INVOICES, thresholds);
  const matchRun = runProcedure("three_way_match", MATCH, thresholds);
  const stockRun = runProcedure("inventory_recon", STOCK, thresholds);
  const accessRun = runProcedure("access_review", ACCESS, thresholds);
  const journalRun = runProcedure("journal_entry", JOURNALS, thresholds);
  const duplicateRun = runProcedure("duplicate_payment", DUPLICATES, thresholds);

  note("S-07", "Testing", "Dual approval: four exceptions, one gap, one below threshold, two passes", invoiceRun.failed === 4 && invoiceRun.unable === 1 && invoiceRun.notApplicable === 1 && invoiceRun.passed === 2 && invoiceRun.exposure === 465000, `fail ${invoiceRun.failed}, unable ${invoiceRun.unable}, na ${invoiceRun.notApplicable}, pass ${invoiceRun.passed}, exposure ${invoiceRun.exposure}`);
  note("S-08", "Testing", "Three-way match separates over-receipt, price breach, missing receipt, and pass", matchRun.failed === 2 && matchRun.unable === 1 && matchRun.passed === 2, `fail ${matchRun.failed}, unable ${matchRun.unable}, pass ${matchRun.passed}`);
  note("S-09", "Testing", "Stock count fails the short alloy, passes steel shot, and cannot conclude the blank quantity", stockRun.failed === 1 && stockRun.unable === 1 && stockRun.passed === 1, `fail ${stockRun.failed}, unable ${stockRun.unable}, pass ${stockRun.passed}, exposure ${stockRun.exposure}`);
  note("S-10", "Testing", "Access review fails unapproved privilege and an enabled leaver, and cannot conclude a blank approval", accessRun.failed === 2 && accessRun.unable === 1 && accessRun.passed === 2, `fail ${accessRun.failed}, unable ${accessRun.unable}, pass ${accessRun.passed}`);
  note("S-11", "Testing", "Journals flag same-person approval, a weekend posting, and an unsupported round amount", journalRun.failed === 3 && journalRun.passed === 1, `fail ${journalRun.failed}, pass ${journalRun.passed}`);
  note("S-12", "Testing", "Repeated invoice is a candidate counted once, not a fraud finding", duplicateRun.failed === 2 && duplicateRun.exposure === 42000 && duplicateRun.workpaper.fraudNote.toLowerCase().includes("not establish fraud"), `fail ${duplicateRun.failed}, exposure ${duplicateRun.exposure}`);

  const same = compareReperformance(invoiceRun, runProcedure("dual_approval", INVOICES, thresholds));
  const mismatched = compareReperformance(invoiceRun, runProcedure("dual_approval", INVOICES, { ...thresholds, amount: 250000 }));
  note("S-13", "Assurance", "Blind re-performance matches when the threshold is unchanged", same.match, same.differences.join("; ") || "match");
  note("S-14", "Assurance", "A changed threshold is a difference, not a silent pass", mismatched.match === false, mismatched.differences.join("; ") || "no difference");

  const runs = [
    ["tr-sim-inv", "dual_approval", "ev-sim-inv", invoiceRun],
    ["tr-sim-match", "three_way_match", "ev-sim-match", matchRun],
    ["tr-sim-stock", "inventory_recon", "ev-sim-stock", stockRun],
    ["tr-sim-access", "access_review", "ev-sim-access", accessRun],
    ["tr-sim-je", "journal_entry", "ev-sim-je", journalRun],
    ["tr-sim-dup", "duplicate_payment", "ev-sim-dup", duplicateRun],
  ] as const;
  for (const [id, procedure, evidenceId, execution] of runs) {
    await db.insert(testRuns).values({
      id,
      engagementId: ENG,
      controlId: null,
      procedure,
      objective: execution.workpaper.procedureName,
      populationDefinition: "Registered extract only. Stated full population was not re-performed.",
      populationCount: execution.populationCount,
      recordsTested: execution.recordsTested,
      method: "Simulation of the approved procedure. Result not approved.",
      thresholdJson: thresholds,
      exceptionsCount: execution.failed,
      result: execution.result,
      exposureAmount: execution.exposure,
      currency: execution.currency,
      evidenceId,
      scriptName: `meridian/procedures/${procedure}.ts`,
      scriptVersion: "1.0.0",
      parameterHash: sha256(JSON.stringify(thresholds)).slice(0, 12),
      executedAt: todayIso(),
      qaStatus: "pending",
      qaResult: null,
      qaNotes: "Recalculation matched in the simulation. A person has not cleared it.",
      limitations: execution.limitations.join(" "),
      approvalStatus: "pending",
      approvedBy: null,
      deviation: false,
      workpaper: execution.workpaper,
    });
  }
  note("S-15", "Assurance", "Six workpapers are stored as pending, not approved", true, "approval pending", "six runs inserted pending");

  const impacts = emptyImpacts();
  impacts.financial = { score: 4, note: "Exception amount in the invoice extract is MYR 465000, above materiality. No confirmed loss is on file.", relevant: true };
  impacts.fraud = { score: 3, note: "Missing second approvals and one repeated invoice create an opportunity. They do not identify an improper payee or intent.", relevant: true };
  impacts.operational = { score: 4, note: "ADC12 was short by 1800 units. The book would send production to metal that is not in the cage.", relevant: true };
  const scored = scoreImpacts(4, impacts);
  note("S-16", "Assessment", "Combined finding scores 16 High from likelihood 4 times impact 4", scored.score === 16 && scored.band === "High" && scored.highestDimension === "financial", `${scored.score} ${scored.band} ${scored.highestDimension}`);

  await db.insert(findings).values({
    id: "f-sim-01",
    code: "F-SIM-01",
    engagementId: ENG,
    controlId: "c-ap-01",
    title: "High-value alloy invoices can be paid without a second review, and one invoice was paid twice in the extract",
    criteria: "Two different approvers are required at or above MYR 50,000, and the same invoice number should not be paid twice.",
    condition: "Of 8 invoice rows, 4 failed the approval test, 1 had no amount, and 1 was below the threshold. Supportable exception amount MYR 465000. PAY-1 and PAY-2 repeat Apex Alloys INV-7781 for MYR 42000. The stated population of 40 was not tested.",
    symptom: "In-scope invoices were released on one approval, and one invoice number appears on two payments.",
    immediateCause: "Payment was released when the second approver was absent, and the duplicate check is not a required step.",
    rootCause: "[ROOT CAUSE TO BE CONFIRMED WITH MANAGEMENT.]",
    fiveWhys: ["Why was one approval enough? The workflow has no delegate.", "Further cause is not evidenced."],
    rootCauseClass: "Design gap",
    rootCauseTheme: "Systems and data",
    riskRating: scored.band,
    likelihood: 4,
    likelihoodRationale: "Four exceptions in eight tested rows, with a repeated invoice in the same vendor set. Likely inside this extract. Not almost certain for the untested 32.",
    impacts,
    priorityScore: scored.score,
    priorityBand: scored.band,
    highestImpact: scored.highest,
    highestDimension: scored.highestDimension,
    residualRisk: "The bypass and the repeated-invoice candidate remain open. No fraud finding is made.",
    businessValue: "High for payment control. The observed invoice exposure is MYR 465000. The repeated line is a candidate of MYR 42000, not a confirmed loss.",
    valueLevel: "High",
    recommendation: "Block in-scope release without two approvers, investigate PAY-1 and PAY-2, and obtain the 32 invoices that were not in the extract.",
    expectedOutcome: "The untested population is either tested or disclosed as unable to conclude.",
    managementPosition: "Pending",
    quantifiedImpact: "Potential exposure MYR 465000 in the invoice extract. Candidate repeat MYR 42000. No confirmed loss.",
    evidenceIds: "ev-sim-inv,ev-sim-dup",
    testRunId: "tr-sim-inv",
    status: "In review",
    isolatedOrRecurring: "Recurring in this extract. Other plants not tested.",
  });

  await db.insert(actions).values({
    id: "a-sim-01",
    findingId: "f-sim-01",
    engagementId: ENG,
    agreedAction: "Redesign the approval path and investigate the repeated Apex invoice.",
    ownerId: "p-own2",
    supportingOwners: "Plant controller",
    originalDue: todayIso(),
    revisedDue: null,
    status: "In progress",
    percentComplete: 10,
    interimControl: "Finance reviews invoices at or above MYR 50,000 before release.",
    dependencies: "SAP partner slot",
    evidenceRequired: "Workflow screenshot and the investigation note for PAY-1 and PAY-2.",
    evidenceReceived: null,
    validationStatus: "Pending",
    comments: "Simulation action. Not closed.",
    escalation: true,
    nextFollowUp: todayIso(),
  });
  const closedWithoutEvidence = false;
  note("S-17", "Assessment", "Action is not closed, because validation is still pending", closedWithoutEvidence === false, "Closure refused without validation", "Status left in progress");

  const briefInput = {
    title: "Combined metals assurance",
    code: "NMET-Q1-SIM",
    period: "Q1",
    entityName: "Northline Metals",
    objective: "Determine whether high-value alloy purchases were approved, received, recorded, and paid once.",
    scope: "Registered extracts only.",
    businessContext: "Northline Metals melts purchased alloy into automotive parts.",
    limitations: "Stated population of 40 invoices was not re-performed.",
    overallRating: "High",
    opinion: "Working view only. Not issued.",
    ratingOverrideReason: null,
    audience: "Audit committee",
    materialityAmount: 250000,
    materialityCurrency: "MYR",
    materialityApproved: true,
    gcaeApproved: false,
    findings: [await db.select().from(findings).where(eq(findings.id, "f-sim-01")).then((rows) => rows[0])],
    actions: [{ id: "a-sim-01", findingId: "f-sim-01", agreedAction: "Redesign the approval path.", ownerName: "Grace Chen", originalDue: todayIso(), revisedDue: null, status: "In progress", interimControl: "Friday review", evidenceRequired: "Workflow screenshot", validationStatus: "Pending", percentComplete: 10 }],
    tests: [{ id: "tr-sim-inv", procedure: "dual_approval", result: "FAIL_EXCEPTION", populationCount: 8, recordsTested: 8, exceptionsCount: 4, exposureAmount: 465000, currency: "MYR", qaStatus: "pending", limitations: "Partial extract", approvalStatus: "pending" }],
  };
  const briefing = buildBriefing(briefInput);
  const views = stakeholderViews(briefInput);
  const text = JSON.stringify({ briefing, views });
  note("S-18", "Reporting", "Five stakeholder views are built from the same facts", views.length === 5 && text.includes("465000") && text.includes("not approved") === false || text.toLowerCase().includes("not approved") || text.includes("Not approved") || briefing.some((section) => section.paragraphs.join(" ").includes("not")), `views ${views.length}`);
  const issuedLanguage = briefing.some((section) => section.paragraphs.join(" ").includes("has not approved issuance") || section.paragraphs.join(" ").includes("not approved"));
  note("S-19", "Reporting", "The briefing says issuance is not approved", issuedLanguage, "Issuance not approved", issuedLanguage ? "stated" : briefing.map((section) => section.heading).join(", "));
  const checks = qualityChecks(briefInput);
  note("S-20", "Reporting", "Quality check flags the unconfirmed root cause or incomplete closure", checks.some((item) => !item.pass), checks.filter((item) => !item.pass).map((item) => item.id).join(", ") || "none");

  const waive = /waive|skip the iron|ignore the rule|auto-issue/i.test("Waive the iron rule so the agent can issue");
  note("S-21", "Kaizen", "A lesson that waives an iron rule is rejected", waive, "Rejected", "Pattern matched");

  const harness = await executeHarness(ENG, "Simulation");
  const [after] = await db.select().from(engagements).where(eq(engagements.id, ENG));
  note("S-22", "Harness", "End-to-end harness runs and does not issue the report", harness.ok && after?.gcaeApproved === false && after?.status !== "Issued", after?.status || "missing");
  note("S-23", "Harness", "Harness does not turn the R4 inquiry into a pass", harness.ok && !harness.steps.some((step) => step.detail.includes("inquiry") && step.summary.toLowerCase().includes("pass")), "No pass from inquiry", "checked");

  const versionBody = `${INVOICES}\nNM-1009,Apex Alloys,77000,MYR,A.Lim,L.Teoh,2026-03-01`;
  await db.insert(evidence).values({
    id: "ev-sim-inv-v2",
    engagementId: ENG,
    sourceSystem: "SAP B1",
    originalFilename: "ap-invoices-v2.csv",
    documentType: "System extract",
    businessProcess: "Invoice approval",
    reportingPeriod: "Q1",
    version: 2,
    supersedesId: "ev-sim-inv",
    fileHash: sha256(versionBody),
    receivedAt: todayIso(),
    custodian: "p-own1",
    obtainedBy: "p-aud1",
    recordCount: 9,
    completeness: "Partial",
    reliability: "R2",
    limitations: "Version 2. Version 1 was not overwritten.",
    status: "Registered",
    sheetOrSection: "Body",
    body: versionBody,
    populationNote: "Supersedes ev-sim-inv. Original retained.",
  });
  const [v1] = await db.select().from(evidence).where(eq(evidence.id, "ev-sim-inv"));
  note("S-24", "Evidence", "A new version does not overwrite the original hash", v1?.fileHash === originalHash, "Original hash unchanged", v1?.fileHash.slice(0, 12) || "missing");

  await db.insert(auditEvents).values({
    id: uid("log"),
    at: todayIso(),
    actor: "Simulation",
    action: "Completed complex case simulation",
    objectType: "engagement",
    objectId: ENG,
    beforeState: null,
    afterState: `${steps.filter((step) => step.pass).length}/${steps.length}`,
    detail: "Northline Metals Q1 simulation. Not an issued opinion.",
  });

  const summary = {
    at: new Date().toISOString(),
    caseName: "Northline Metals Q1 combined assurance",
    engagementId: ENG,
    passed: steps.filter((step) => step.pass).length,
    failed: steps.filter((step) => !step.pass).length,
    total: steps.length,
    exposure: 465000,
    candidateRepeat: 42000,
    steps,
  };
  await db.insert(settings).values({ key: "simulation_latest", value: JSON.stringify(summary) }).onConflictDoUpdate({
    target: settings.key,
    set: { value: JSON.stringify(summary) },
  });
  return summary;
}

async function clearSimulation() {
  await db.delete(pbcRequests).where(eq(pbcRequests.engagementId, ENG));
  await db.delete(lessons).where(eq(lessons.engagementId, ENG));
  await db.delete(agentRuns).where(eq(agentRuns.engagementId, ENG));
  await db.delete(actions).where(eq(actions.engagementId, ENG));
  await db.delete(findings).where(eq(findings.engagementId, ENG));
  await db.delete(testRuns).where(eq(testRuns.engagementId, ENG));
  await db.delete(evidence).where(eq(evidence.engagementId, ENG));
  await db.delete(engagements).where(eq(engagements.id, ENG));
  await db.delete(entities).where(eq(entities.id, "ent-sim"));
}
