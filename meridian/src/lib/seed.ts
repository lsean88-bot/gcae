import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  actions,
  agentRuns,
  aiSystems,
  auditEvents,
  controls,
  engagements,
  entities,
  evidence,
  findings,
  frameworks,
  pbcRequests,
  people,
  requirements,
  risks,
  settings,
  testRuns,
  vendors,
  type ImpactMap,
} from "@/db/schema";
import { runProcedure } from "@/lib/engine";
import { isoOffset } from "@/lib/format";
import { shortHash, sha256 } from "@/lib/hash";
import { POPULATIONS } from "@/lib/populations";
import { emptyImpacts, scoreImpacts } from "@/lib/scoring";

const year = new Date().getFullYear();

function impacts(partial: Record<string, { score: number; note: string }>): ImpactMap {
  const map = emptyImpacts();
  Object.entries(partial).forEach(([id, cell]) => {
    map[id] = { score: cell.score, note: cell.note, relevant: true };
  });
  return map;
}

function scored(likelihood: number, map: ImpactMap) {
  const result = scoreImpacts(likelihood, map);
  return {
    impacts: map,
    likelihood,
    priorityScore: result.score,
    priorityBand: result.band,
    highestImpact: result.highest,
    highestDimension: result.highestDimension,
    riskRating: result.band,
  };
}

export async function ensureSeed() {
  await seedWorkspace();
  const { ensureLessons } = await import("@/lib/lessons");
  await ensureLessons();
}

async function seedWorkspace() {
  const invoice = runProcedure("dual_approval", POPULATIONS.invoices, { amount: 50000 });
  const inventory = runProcedure("inventory_recon", POPULATIONS.inventory, { pct: 2, value: 10000 });
  const access = runProcedure("access_review", POPULATIONS.access, {});
  const duplicates = runProcedure("duplicate_payment", POPULATIONS.duplicates, { nearDays: 3 });

  const apExposure = invoice.exposure ?? 0;
  const invExposure = inventory.exposure ?? 0;
  const dupExposure = duplicates.exposure ?? 0;

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(44121)`);
    const existing = await tx.select().from(settings).where(eq(settings.key, "seeded"));
    if (existing.length) return;

    await tx.insert(people).values([
      { id: "p-gcae", name: "Amira Hassan", role: "Group Chief Audit Executive", team: "Group Internal Audit", email: "amira.hassan@mktron.example", authority: "gcae" },
      { id: "p-mgr", name: "Daniel Okonkwo", role: "Audit manager", team: "Group Internal Audit", email: "daniel.okonkwo@mktron.example", authority: "manager" },
      { id: "p-aud1", name: "Priya Nair", role: "Senior auditor, manufacturing", team: "Group Internal Audit", email: "priya.nair@mktron.example", authority: "auditor" },
      { id: "p-aud2", name: "Luis Ortega", role: "IT auditor", team: "Group Internal Audit", email: "luis.ortega@mktron.example", authority: "auditor" },
      { id: "p-frd", name: "Mei Lin Tan", role: "Forensics specialist", team: "Group Internal Audit", email: "meilin.tan@mktron.example", authority: "auditor" },
      { id: "p-qa", name: "Hannah Berg", role: "Independent QA reviewer", team: "Group Internal Audit", email: "hannah.berg@mktron.example", authority: "qa" },
      { id: "p-own1", name: "Farid Abdullah", role: "Plant controller, MKAPL", team: "MKAPL Die Casting", email: "farid.abdullah@mktron.example", authority: "owner" },
      { id: "p-own2", name: "Grace Chen", role: "Group accounts payable manager", team: "Group Finance", email: "grace.chen@mktron.example", authority: "owner" },
      { id: "p-own3", name: "Rohan Iyer", role: "IT access owner", team: "Group IT", email: "rohan.iyer@mktron.example", authority: "owner" },
      { id: "p-own4", name: "Sofia Rahman", role: "Procurement lead", team: "Group Procurement", email: "sofia.rahman@mktron.example", authority: "owner" },
      { id: "p-cfo", name: "Kenji Mori", role: "Group CFO", team: "Executive", email: "kenji.mori@mktron.example", authority: "executive" },
      { id: "p-coo", name: "Lila Mensah", role: "Group COO", team: "Executive", email: "lila.mensah@mktron.example", authority: "executive" },
    ]);

    await tx.insert(entities).values([
      { id: "ent-mkapl", name: "MKAPL Die Casting", code: "MKAPL", jurisdiction: "Malaysia", businessUnit: "Manufacturing", process: "Die casting, yield, scrap and inventory", inherentRisk: 5, residualRisk: 4, riskRationale: "High-value alloys, manual receipt posting, and a weighbridge that does not feed the book.", lastAudit: `${year - 1}-11-12`, coverage: "In progress", ownerId: "p-own1", strategicObjective: "Reliable metal cost and on-time automotive shipments.", suggestedScore: 4, suggestedRationale: "Accepted. Open inventory findings and an overdue action keep residual risk at 4.", scoreStatus: "accepted" },
      { id: "ent-stamp", name: "MK Tron Metal Stamping", code: "MKST", jurisdiction: "Malaysia", businessUnit: "Manufacturing", process: "Stamping, tooling and yield", inherentRisk: 4, residualRisk: 3, riskRationale: "Similar metal-flow risks to die casting, but cycle counts have an independent reviewer.", lastAudit: `${year - 1}-06-20`, coverage: "Planned", ownerId: "p-coo", strategicObjective: "Stable yield on transferred tooling.", suggestedScore: 3, suggestedRationale: "Accepted for planning. Not a tested result.", scoreStatus: "accepted" },
      { id: "ent-ap", name: "Group Accounts Payable", code: "AP", jurisdiction: "Malaysia", businessUnit: "Finance", process: "Invoice approval and payment release", inherentRisk: 4, residualRisk: 4, riskRationale: "Threshold payments can be released on one approval. The bypass is described by management as the usual workaround.", lastAudit: isoOffset(-30), coverage: "In progress", ownerId: "p-own2", strategicObjective: "Pay the right supplier the right amount, once.", suggestedScore: 4, suggestedRationale: "Accepted. Exception amount in the tested extract is above materiality.", scoreStatus: "accepted" },
      { id: "ent-it", name: "Group IT and OT", code: "ITOT", jurisdiction: "Malaysia", businessUnit: "Technology", process: "Access, SAP B1 and plant systems", inherentRisk: 5, residualRisk: 5, riskRationale: "Privileged accounts without a current approval, including a domain admin.", lastAudit: isoOffset(-20), coverage: "In progress", ownerId: "p-own3", strategicObjective: "Access matches the job, and leavers are removed on time.", suggestedScore: 5, suggestedRationale: "Accepted pending GCAE rating of the access finding.", scoreStatus: "accepted" },
      { id: "ent-p2p", name: "Group Procurement", code: "P2P", jurisdiction: "Malaysia", businessUnit: "Supply chain", process: "Purchase to receipt to invoice", inherentRisk: 4, residualRisk: 3, riskRationale: "Three-way match is designed. It has not been tested this period because materiality is not approved.", lastAudit: `${year - 1}-09-01`, coverage: "Partial", ownerId: "p-own4", strategicObjective: "No payment without a receipt and an agreed price.", suggestedScore: 4, suggestedRationale: "Suggested uplift from 3 to 4 because the match has not been tested and supplier concentration is high. Awaiting acceptance.", scoreStatus: "pending" },
      { id: "ent-pay", name: "Group Payroll", code: "PAY", jurisdiction: "Malaysia", businessUnit: "Finance", process: "Payroll master data and payments", inherentRisk: 3, residualRisk: 3, riskRationale: "Master-data changes are in scope. Evidence is not yet sufficient to test.", lastAudit: `${year - 1}-04-18`, coverage: "Partial", ownerId: "p-own2", strategicObjective: "Pay only current employees, at the approved rate.", suggestedScore: 3, suggestedRationale: "Held at 3 until the master-data extract is registered.", scoreStatus: "accepted" },
      { id: "ent-mx", name: "MK Tron Mexico Machining", code: "MKMX", jurisdiction: "Mexico", businessUnit: "Manufacturing", process: "Machining and inventory", inherentRisk: 4, residualRisk: 4, riskRationale: "No audit in the last two cycles. Local inventory system is not the group SAP B1 instance.", lastAudit: null, coverage: "Gap", ownerId: "p-coo", strategicObjective: "Bring Mexico onto the group control baseline.", suggestedScore: 5, suggestedRationale: "Coverage gap for two cycles, different system, and no evidence register. Suggested inherent planning score 5. This is a planning suggestion, not an audit opinion.", scoreStatus: "pending" },
      { id: "ent-hc", name: "MK Healthcare Dialysis", code: "MKHC", jurisdiction: "India", businessUnit: "Healthcare", process: "Clinical inventory and patient billing", inherentRisk: 4, residualRisk: 4, riskRationale: "Regulated inventory and billing. Not in the current pilot. Do not treat manufacturing results as coverage.", lastAudit: null, coverage: "Gap", ownerId: "p-cfo", strategicObjective: "Safe stock of treatment supplies and accurate billing.", suggestedScore: 4, suggestedRationale: "Accepted as a planning score only. No evidence has been registered.", scoreStatus: "accepted" },
    ]);

    await tx.insert(engagements).values([
      {
        id: "eng-dc",
        code: "MKAPL-DC-2026",
        title: "Inventory and material balancing",
        entityId: "ent-mkapl",
        period: `Jan–Jun ${year}`,
        objective: "Determine whether die-casting inventory quantities and metal movements are recorded completely and supported by a count.",
        scope: "High-value alloys at MKAPL, scrap tickets, and the receipt-to-book path. Finished-goods standard cost is out of scope.",
        status: "Reporting",
        stage: 6,
        overallRating: "High",
        opinion: "The count extract does not support the book on three alloys. The wider inventory balance has not been re-performed. The working rating is High. It is not an issued opinion.",
        ratingOverrideReason: null,
        materialityAmount: 250000,
        materialityCurrency: "MYR",
        thresholdJson: { pct: 2, value: 10000 },
        materialityApproved: true,
        materialityApprovedBy: "p-gcae",
        gcaeApproved: false,
        qaStatus: "In review",
        audience: "Audit committee, with a process-owner pack for the plant controller.",
        businessContext: "MKAPL Die Casting buys and melts high-value alloys for automotive parts. If the book overstates metal on hand, production planning and the inventory balance are both wrong. The plant is the pilot for the evidence-to-assurance method.",
        limitations: "The item master was not tied out to the count extract. The observed variance is not a full-population misstatement.",
        leadId: "p-aud1",
        startDate: isoOffset(-70),
        reportDate: null,
        riskAppetite: "Inventory misstatement above MYR 250,000 is outside appetite.",
      },
      {
        id: "eng-ap",
        code: "GRP-AP-2026",
        title: "Invoice approval above threshold",
        entityId: "ent-ap",
        period: `Jan–Mar ${year}`,
        objective: "Determine whether invoices at or above MYR 50,000 were paid only after two different approvals.",
        scope: "Group accounts payable payments recorded as at or above the threshold. Payroll and treasury transfers are out of scope.",
        status: "Reporting",
        stage: 7,
        overallRating: "High",
        opinion: "Seven tested invoices were paid without two different approvals. The exception amount in the extract is above materiality. Twenty-two invoices in the management count were not in the extract and are not concluded.",
        ratingOverrideReason: null,
        materialityAmount: 250000,
        materialityCurrency: "MYR",
        thresholdJson: { amount: 50000 },
        materialityApproved: true,
        materialityApprovedBy: "p-gcae",
        gcaeApproved: false,
        qaStatus: "Cleared",
        audience: "Audit committee and the CFO.",
        businessContext: "Accounts payable is the last check before cash leaves the group. A second approval is the control that is supposed to stop an unsupported or misdirected high-value payment.",
        limitations: "Management stated 40 in-scope invoices. The extract contains 18. The difference was not re-performed.",
        leadId: "p-mgr",
        startDate: isoOffset(-55),
        reportDate: null,
        riskAppetite: "Any unapproved payment path above the threshold is outside appetite, even if no loss has been identified.",
      },
      {
        id: "eng-it",
        code: "GRP-IT-2026",
        title: "Privileged access and leavers",
        entityId: "ent-it",
        period: `As at ${isoOffset(-15)}`,
        objective: "Determine whether enabled privileged access is approved, and whether leavers are disabled.",
        scope: "SAP B1 and Active Directory. A judgmental sample of privileged, mover, and leaver accounts. Not the full directory.",
        status: "Fieldwork",
        stage: 5,
        overallRating: null,
        opinion: null,
        materialityAmount: 0,
        materialityCurrency: "MYR",
        thresholdJson: {},
        materialityApproved: true,
        materialityApprovedBy: "p-gcae",
        gcaeApproved: false,
        qaStatus: "Not started",
        audience: "IT steering group and the audit committee.",
        businessContext: "SAP B1 is the book of record for the Malaysian plants. A privileged account without a current approval can change that book. The test looks for the control gap. It does not investigate misuse.",
        limitations: "The sample is judgmental. A pass on the other rows would not mean the directory is clean.",
        leadId: "p-aud2",
        startDate: isoOffset(-28),
        reportDate: null,
        riskAppetite: "No unapproved privileged access.",
      },
      {
        id: "eng-p2p",
        code: "GRP-P2P-2026",
        title: "Three-way match",
        entityId: "ent-p2p",
        period: `Jan–Jun ${year}`,
        objective: "Determine whether invoices are supported by a purchase order and a goods receipt, within the approved price tolerance.",
        scope: "Purchase invoices for direct materials. Services invoices are out of scope.",
        status: "Planning",
        stage: 3,
        overallRating: null,
        opinion: null,
        materialityAmount: 150000,
        materialityCurrency: "MYR",
        thresholdJson: { pricePct: 2 },
        materialityApproved: false,
        materialityApprovedBy: null,
        gcaeApproved: false,
        qaStatus: "Not started",
        audience: "Procurement lead and the CFO.",
        businessContext: "Direct materials are the largest cash outflow after payroll. The match is the control that stops a payment for goods that were not received, or a price that was not agreed.",
        limitations: "Proposed materiality is on file and not approved. No test has been run.",
        leadId: "p-aud1",
        startDate: isoOffset(-12),
        reportDate: null,
        riskAppetite: "Price variances above 2 percent on direct materials require review.",
      },
      {
        id: "eng-pay",
        code: "GRP-PAY-2026",
        title: "Payroll master-data changes",
        entityId: "ent-pay",
        period: `Q1 ${year}`,
        objective: "Determine whether changes to pay rate, bank account, and new joiner records were approved by someone other than the preparer.",
        scope: "Payroll master file changes. Not a full payroll recalculation.",
        status: "Evidence",
        stage: 2,
        overallRating: null,
        opinion: null,
        materialityAmount: 100000,
        materialityCurrency: "MYR",
        thresholdJson: {},
        materialityApproved: false,
        gcaeApproved: false,
        qaStatus: "Not started",
        audience: "HR director and the CFO.",
        businessContext: "A master-data change can divert pay or set the wrong rate. The engagement is waiting on an extract that can be tested.",
        limitations: "No population has been registered.",
        leadId: "p-frd",
        startDate: isoOffset(-8),
        reportDate: null,
        riskAppetite: "Unapproved bank-account changes are outside appetite.",
      },
      {
        id: "eng-fa",
        code: "GRP-FA-2025",
        title: "Fixed asset additions",
        entityId: "ent-ap",
        period: `${year - 1}`,
        objective: "Determine whether capital additions above MYR 25,000 were approved before the asset was placed in service.",
        scope: "Additions register for the prior year. Disposals were out of scope.",
        status: "Issued",
        stage: 7,
        overallRating: "Low",
        opinion: "One addition lacked the capital-request reference. The amount was below materiality. Management has closed the action and Internal Audit has validated the evidence.",
        materialityAmount: 250000,
        materialityCurrency: "MYR",
        thresholdJson: { amount: 25000 },
        materialityApproved: true,
        materialityApprovedBy: "p-gcae",
        gcaeApproved: true,
        issuedAt: isoOffset(-200),
        qaStatus: "Cleared",
        audience: "Audit committee.",
        businessContext: "Capital additions affect the balance sheet and depreciation. The prior-year review is closed and is kept here so the follow-up record has a validated closure.",
        limitations: null,
        leadId: "p-mgr",
        startDate: isoOffset(-400),
        reportDate: isoOffset(-200),
        riskAppetite: "Unapproved additions above materiality are outside appetite.",
      },
    ]);

    const evidenceRows = [
      evidenceRow("ev-ap-inv", "eng-ap", "SAP B1", "ap-invoices-above-threshold.csv", "System extract", "Invoice approval", `Jan–Mar ${year}`, POPULATIONS.invoices, "Partial", "R2", "Management stated 40 documents. This file has 18. Custodian confirmed the export path. The missing 22 were not re-extracted.", "p-own2", "p-mgr", "Payment run extract, sheet AP_OPEN"),
      evidenceRow("ev-ap-dup", "eng-ap", "SAP B1", "payment-lines.csv", "System extract", "Duplicate payments", `Jan–Mar ${year}`, POPULATIONS.duplicates, "Partial", "R2", "Payment lines for the vendors in the invoice sample. Not the full payment population.", "p-own2", "p-frd", "Payment register"),
      evidenceRow("ev-dc-count", "eng-dc", "Count team workbook", "mkapl-alloy-count.csv", "Count sheet", "Inventory", `Jan–Jun ${year}`, POPULATIONS.inventory, "Partial", "R3", "Physical count transcribed by the plant. Internal Audit observed the count on the three alloy lines. Consumable lines were not re-counted.", "p-own1", "p-aud1", "Count sheet, alloys tab"),
      evidenceRow("ev-dc-notes", "eng-dc", "Walkthrough", "receipt-walkthrough.txt", "Walkthrough notes", "Inventory receipts", `Jan–Jun ${year}`, "Process: warehouse clerk posts the receipt from the supplier delivery note.\nSystem: SAP B1 receipt screen does not require a weighbridge ticket number.\nReview: the same clerk reviews the cycle-count difference.\nOwner confirmed: Farid Abdullah, plant controller.\nNot observed: a second person approving a quantity adjustment above MYR 10,000.", "Partial", "R3", "Inquiry corroborated by observation of the receipt screen. Not a system-enforced configuration export.", "p-own1", "p-aud1", "Walkthrough 14 March"),
      evidenceRow("ev-it-access", "eng-it", "SAP B1 and Active Directory", "privileged-and-leaver-sample.csv", "Access extract", "User access", isoOffset(-15), POPULATIONS.access, "Partial", "R2", "Judgmental sample. HR status was matched by the IT auditor to the HR leaver list for the nine rows. The full directory was not extracted.", "p-own3", "p-aud2", "Access sample"),
      evidenceRow("ev-p2p", "eng-p2p", "SAP B1", "three-way-sample.csv", "System extract", "Three-way match", `Jan–Jun ${year}`, POPULATIONS.match, "Partial", "R2", "Five-line sample prepared for a test that must not run until materiality is approved.", "p-own4", "p-aud1", "PO match sample"),
      evidenceRow("ev-je", "eng-ap", "SAP B1", "manual-journals.csv", "System extract", "Journal entries", `Mar ${year}`, POPULATIONS.journals, "Partial", "R2", "Manual journals for one month. Not selected for the current AP opinion. Available for a procedure run.", "p-own2", "p-mgr", "JE register"),
      evidenceRow("ev-fa", "eng-fa", "Fixed asset register", "additions-retest.csv", "Re-test schedule", "Fixed assets", `${year - 1}`, "asset_id,amount,request_ref,outcome\nFA-188,28400,CR-188,Pass\nFA-190,41000,CR-190,Pass\nFA-191,26500,CR-191,Pass", "Complete", "R2", "Prior-year re-test. Kept so the closed action has a trace. Not part of the current AP population.", "p-cfo", "p-mgr", "Additions re-test"),
    ];
    await tx.insert(evidence).values(evidenceRows);

    await tx.insert(controls).values([
      { id: "c-ap-01", title: "Two approvals above the payment threshold", objective: "Stop a high-value invoice being paid on one person's authority.", process: "Accounts payable", controlType: "Preventive", frequency: "Each payment", nature: "IT-dependent", ownerId: "p-own2", entityId: "ent-ap", designEffectiveness: "Ineffective", operatingEffectiveness: "Exception", lastTested: isoOffset(-12), frameworkTags: "ICFR, ISO A.5.15" },
      { id: "c-ap-02", title: "Duplicate payment review", objective: "Detect a second payment of the same invoice before the weekly run is released.", process: "Accounts payable", controlType: "Detective", frequency: "Weekly", nature: "Manual", ownerId: "p-own2", entityId: "ent-ap", designEffectiveness: "Gap", operatingEffectiveness: "Not tested fully", lastTested: isoOffset(-12), frameworkTags: "ICFR" },
      { id: "c-inv-01", title: "Independent cycle count of high-value alloys", objective: "Detect a book-to-physical difference before the books are closed.", process: "Inventory", controlType: "Detective", frequency: "Monthly", nature: "Manual", ownerId: "p-own1", entityId: "ent-mkapl", designEffectiveness: "Gap", operatingEffectiveness: "Exception", lastTested: isoOffset(-18), frameworkTags: "ICFR" },
      { id: "c-inv-02", title: "Scrap matched to the production order", objective: "Show metal loss against the job that consumed it.", process: "Inventory", controlType: "Preventive", frequency: "Each scrap ticket", nature: "Manual", ownerId: "p-own1", entityId: "ent-mkapl", designEffectiveness: "Gap", operatingEffectiveness: "Not operating", lastTested: isoOffset(-18), frameworkTags: "ICFR" },
      { id: "c-it-01", title: "Joiner, mover, and leaver access", objective: "Remove or change access when employment changes.", process: "Access", controlType: "Preventive", frequency: "Each change", nature: "IT-dependent", ownerId: "p-own3", entityId: "ent-it", designEffectiveness: "Designed", operatingEffectiveness: "Exception", lastTested: isoOffset(-10), frameworkTags: "ISO A.5.16, NIST PR.AA" },
      { id: "c-it-02", title: "Privileged access review", objective: "Keep privileged access limited to a current, approved need.", process: "Access", controlType: "Detective", frequency: "Quarterly", nature: "Manual", ownerId: "p-own3", entityId: "ent-it", designEffectiveness: "Designed", operatingEffectiveness: "Exception", lastTested: isoOffset(-10), frameworkTags: "ISO A.8.2, NIST PR.AA" },
      { id: "c-p2p-01", title: "Three-way match", objective: "Pay only for received goods at the agreed price.", process: "Procurement", controlType: "Preventive", frequency: "Each invoice", nature: "IT-dependent", ownerId: "p-own4", entityId: "ent-p2p", designEffectiveness: "Designed", operatingEffectiveness: "Not tested", lastTested: null, frameworkTags: "ICFR" },
      { id: "c-pay-01", title: "Payroll master change approval", objective: "Stop an unapproved change to rate or bank account.", process: "Payroll", controlType: "Preventive", frequency: "Each change", nature: "Manual", ownerId: "p-own2", entityId: "ent-pay", designEffectiveness: "Designed", operatingEffectiveness: "Not tested", lastTested: null, frameworkTags: "ICFR" },
      { id: "c-fa-01", title: "Capital addition approval", objective: "Approve capital spend before the asset is placed in service.", process: "Fixed assets", controlType: "Preventive", frequency: "Each addition", nature: "Manual", ownerId: "p-cfo", entityId: "ent-ap", designEffectiveness: "Effective", operatingEffectiveness: "Effective", lastTested: isoOffset(-200), frameworkTags: "ICFR" },
      { id: "c-ot-01", title: "Weighbridge ticket required on receipt", objective: "Stop a metal receipt being booked without a measured weight.", process: "Inventory", controlType: "Preventive", frequency: "Each receipt", nature: "IT-dependent", ownerId: "p-own1", entityId: "ent-mkapl", designEffectiveness: "Gap", operatingEffectiveness: "Not operating", lastTested: isoOffset(-18), frameworkTags: "ICFR, OT" },
    ]);

    await tx.insert(risks).values([
      { id: "r-inv", title: "Inventory quantity misstatement", category: "Financial", statement: "Alloy quantities in the book may not match metal on hand, so margin and production plans are wrong.", entityId: "ent-mkapl", inherentLikelihood: 4, inherentImpact: 4, residualLikelihood: 4, residualImpact: 4, appetite: "Outside", treatment: "Mitigate", ownerId: "p-own1", velocity: "Fast", linkedControlIds: "c-inv-01,c-ot-01" },
      { id: "r-pay", title: "Unsupported high-value payment", category: "Financial", statement: "A payment above the threshold may leave the group without a second review.", entityId: "ent-ap", inherentLikelihood: 4, inherentImpact: 4, residualLikelihood: 4, residualImpact: 4, appetite: "Outside", treatment: "Mitigate", ownerId: "p-own2", velocity: "Fast", linkedControlIds: "c-ap-01" },
      { id: "r-dup", title: "Duplicate payment", category: "Financial", statement: "The same invoice may be paid twice if the weekly review does not run.", entityId: "ent-ap", inherentLikelihood: 3, inherentImpact: 3, residualLikelihood: 3, residualImpact: 3, appetite: "Approaching", treatment: "Mitigate", ownerId: "p-own2", velocity: "Moderate", linkedControlIds: "c-ap-02" },
      { id: "r-access", title: "Unapproved privileged access", category: "Technology", statement: "A privileged account without a current approval can change the book of record or the domain.", entityId: "ent-it", inherentLikelihood: 4, inherentImpact: 5, residualLikelihood: 4, residualImpact: 5, appetite: "Outside", treatment: "Mitigate", ownerId: "p-own3", velocity: "Fast", linkedControlIds: "c-it-02,c-it-01" },
      { id: "r-match", title: "Payment without a receipt or at the wrong price", category: "Operational", statement: "Direct-material invoices may be paid without a three-way match.", entityId: "ent-p2p", inherentLikelihood: 3, inherentImpact: 4, residualLikelihood: 3, residualImpact: 3, appetite: "Approaching", treatment: "Mitigate", ownerId: "p-own4", velocity: "Moderate", linkedControlIds: "c-p2p-01" },
      { id: "r-supplier", title: "Alloy supplier concentration", category: "Strategic", statement: "Apex Alloys supplies a large share of ADC12. A failure at that supplier stops the press. This is a planning risk, not a tested finding.", entityId: "ent-mkapl", inherentLikelihood: 3, inherentImpact: 4, residualLikelihood: 3, residualImpact: 4, appetite: "Approaching", treatment: "Monitor", ownerId: "p-own4", velocity: "Moderate", linkedControlIds: "" },
      { id: "r-mx", title: "Mexico control coverage gap", category: "Governance", statement: "Machining inventory in Mexico has not been audited in two cycles and does not sit on group SAP B1.", entityId: "ent-mx", inherentLikelihood: 4, inherentImpact: 3, residualLikelihood: 4, residualImpact: 4, appetite: "Outside", treatment: "Mitigate", ownerId: "p-coo", velocity: "Slow", linkedControlIds: "" },
      { id: "r-ai", title: "Ungoverned use of AI in the plants", category: "Technology", statement: "A plant vision tool and a finance drafting assistant are in use. Internal classification is not a legal determination. Oversight is incomplete on the vision tool.", entityId: "ent-it", inherentLikelihood: 3, inherentImpact: 3, residualLikelihood: 3, residualImpact: 3, appetite: "Approaching", treatment: "Mitigate", ownerId: "p-aud2", velocity: "Moderate", linkedControlIds: "" },
    ]);

    await tx.insert(frameworks).values([
      { id: "fw-icfr", name: "Internal control over financial reporting", shortName: "ICFR", version: "Group baseline", description: "The group's own financial-control baseline for inventory, payments, payroll, and assets. Not a reproduction of any statute." },
      { id: "fw-iso", name: "Information security control themes", shortName: "ISO 27001 themes", version: "2022 themes", description: "Selected control themes used for access and operations. Statements are the group's words, not the text of the standard." },
      { id: "fw-nist", name: "Cybersecurity function map", shortName: "NIST CSF themes", version: "2.0 themes", description: "A short map to Govern, Identify, Protect, Detect, Respond, and Recover. Used for coverage, not for a certification claim." },
      { id: "fw-iia", name: "Meridian reporting method", shortName: "Finding method", version: "1.0", description: "Criteria, condition, cause, effect, recommendation, and management action. Every finding must cite evidence." },
    ]);

    await tx.insert(requirements).values([
      { id: "rq-1", frameworkId: "fw-icfr", code: "ICFR-INV-1", title: "Inventory existence", statement: "Recorded quantities of material inventory are supported by a count or a reconciled movement.", mappedControlIds: "c-inv-01,c-ot-01" },
      { id: "rq-2", frameworkId: "fw-icfr", code: "ICFR-AP-1", title: "Payment authority", statement: "Payments above the threshold require two different approvers before release.", mappedControlIds: "c-ap-01" },
      { id: "rq-3", frameworkId: "fw-icfr", code: "ICFR-AP-2", title: "Duplicate payments", statement: "The same supplier invoice is not paid twice.", mappedControlIds: "c-ap-02" },
      { id: "rq-4", frameworkId: "fw-icfr", code: "ICFR-P2P-1", title: "Receipt before payment", statement: "A direct-material invoice is matched to an order and a receipt.", mappedControlIds: "c-p2p-01" },
      { id: "rq-5", frameworkId: "fw-iso", code: "AC-1", title: "Access on a current need", statement: "Access is approved, changed when the job changes, and removed when the person leaves.", mappedControlIds: "c-it-01" },
      { id: "rq-6", frameworkId: "fw-iso", code: "AC-2", title: "Privileged access", statement: "Privileged access is limited, approved, and reviewed.", mappedControlIds: "c-it-02" },
      { id: "rq-7", frameworkId: "fw-nist", code: "PR.AA", title: "Identity and access", statement: "Identities and credentials are managed for the systems that keep the book.", mappedControlIds: "c-it-01,c-it-02" },
      { id: "rq-8", frameworkId: "fw-nist", code: "DE.CM", title: "Control monitoring", statement: "Exceptions in payments and inventory are detected before the period closes.", mappedControlIds: "c-ap-02,c-inv-01" },
      { id: "rq-9", frameworkId: "fw-iia", code: "F-1", title: "Criteria and condition", statement: "A finding states what should have happened and what was found, with the evidence identity.", mappedControlIds: "c-ap-01,c-inv-01,c-it-02" },
      { id: "rq-10", frameworkId: "fw-iia", code: "F-2", title: "Cause, effect, and action", statement: "A finding separates symptom, immediate cause, and root cause, and records an owner and a date.", mappedControlIds: "c-ap-01,c-inv-01" },
      { id: "rq-11", frameworkId: "fw-icfr", code: "ICFR-FA-1", title: "Asset additions", statement: "Capital additions above the local threshold are approved before use.", mappedControlIds: "c-fa-01" },
      { id: "rq-12", frameworkId: "fw-iso", code: "AC-3", title: "Evidence of the access review", statement: "The review is retained, including the population and the exceptions.", mappedControlIds: "c-it-02" },
    ]);

    const apLimits = [
      ...invoice.limitations,
      "Management stated a population of 40 invoices at or above MYR 50,000. The extract contains 18. The difference of 22 was not re-performed. Those 22 are unable to conclude, not a pass.",
    ].join(" ");
    const invLimits = [
      ...inventory.limitations,
      "Item-master tie-out was not performed. The exception amount is the counted lines only.",
    ].join(" ");

    await tx.insert(testRuns).values([
      runRow("tr-ap-dual", "eng-ap", "c-ap-01", "dual_approval", "ev-ap-inv", { amount: 50000 }, invoice, {
        populationDefinition: "Management stated 40 invoices at or above MYR 50,000. Extract registered as ev-ap-inv contains 18. Stated count not re-performed.",
        populationCount: 40,
        method: "Full test of the registered extract. Not a full test of the stated population.",
        executedAt: isoOffset(-12),
        qaStatus: "cleared",
        qaResult: "PASS",
        qaNotes: "Hannah Berg re-performed the threshold test from ev-ap-inv and the stored threshold of 50,000. Exception count and exposure matched. The first conclusion was compared only after the recalculation.",
        approvalStatus: "approved",
        approvedBy: "p-mgr",
        limitations: apLimits,
      }),
      runRow("tr-ap-dup", "eng-ap", "c-ap-02", "duplicate_payment", "ev-ap-dup", { nearDays: 3 }, duplicates, {
        populationDefinition: "Payment lines for vendors in the invoice sample. Not the full payment population.",
        populationCount: duplicates.populationCount,
        method: "Exact match on vendor, invoice number, and amount. Near matches disclosed, not failed.",
        executedAt: isoOffset(-11),
        qaStatus: "cleared",
        qaResult: "PASS",
        qaNotes: "Re-performance matched the candidate amount. The candidate is not a confirmed loss.",
        approvalStatus: "approved",
        approvedBy: "p-mgr",
        limitations: duplicates.limitations.join(" "),
      }),
      runRow("tr-dc-inv", "eng-dc", "c-inv-01", "inventory_recon", "ev-dc-count", { pct: 2, value: 10000 }, inventory, {
        populationDefinition: "Count lines in ev-dc-count. Not tied to the item master.",
        populationCount: inventory.populationCount,
        method: "Full test of the registered count lines against the approved percentage and value thresholds.",
        executedAt: isoOffset(-9),
        qaStatus: "pending",
        qaResult: null,
        qaNotes: null,
        approvalStatus: "pending",
        approvedBy: null,
        limitations: invLimits,
      }),
      runRow("tr-it-access", "eng-it", "c-it-02", "access_review", "ev-it-access", {}, access, {
        populationDefinition: "Judgmental sample of nine privileged, mover, and leaver accounts. Not the full directory.",
        populationCount: access.populationCount,
        method: "Attribute test of the registered sample. A clean row is not assurance over untested accounts.",
        executedAt: isoOffset(-6),
        qaStatus: "pending",
        qaResult: null,
        qaNotes: null,
        approvalStatus: "pending",
        approvedBy: null,
        limitations: access.limitations.join(" "),
      }),
    ]);

    const apMap = impacts({
      financial: { score: 4, note: `Exception amount in the tested extract is MYR ${apExposure.toLocaleString("en-MY")}, above the MYR 250,000 materiality. No confirmed loss is on file.` },
      fraud: { score: 3, note: "A missing second approval increases the opportunity for an improper payment. This test did not identify an improper payee, a split, or intent." },
      operational: { score: 2, note: "Approvers described delay when the second approver is away. The disruption is limited to the payment run." },
      compliance: { score: 3, note: "The payments breach the internal dual-approval rule. No external penalty has been identified." },
      technology: { score: 3, note: "The workflow has no delegate and no block, so the second approval can be skipped." },
      customer: { score: 2, note: "No supplier dispute is on file. A missed or double payment could create one." },
    });
    const dupMap = impacts({
      financial: { score: 3, note: `One repeated payment line of MYR ${dupExposure.toLocaleString("en-MY")} is a candidate overpayment. It is not a confirmed loss.` },
      fraud: { score: 2, note: "A repeated invoice is an indicator for investigation. It is not evidence of fraud." },
      operational: { score: 2, note: "The weekly duplicate review did not catch the pair before this test." },
    });
    const invMap = impacts({
      financial: { score: 3, note: `Observed book-to-physical difference on the counted lines is MYR ${invExposure.toLocaleString("en-MY")}, below the MYR 250,000 materiality. The full balance was not measured.` },
      operational: { score: 4, note: "ADC12, zinc alloy, and copper inserts were short. The book would send the planner to stock that is not there." },
      fraud: { score: 2, note: "Weak custody creates an opportunity for metal loss. The count is not evidence of theft or of a named person's conduct." },
      technology: { score: 3, note: "The receipt screen does not require a weighbridge ticket, so the book can move without a measured weight." },
    });
    const scrapMap = impacts({
      operational: { score: 3, note: "Scrap tickets are not matched to a production order, so yield by job is not visible to the plant controller." },
      financial: { score: 2, note: "Metal loss is not quantified in this finding. Do not insert a figure." },
    });
    const privMap = impacts({
      technology: { score: 5, note: "U-14 has SAP B1 finance admin and U-44 has domain admin, both enabled, neither with an approval flag of yes." },
      financial: { score: 4, note: "Finance admin can change the book of record. No misuse has been investigated or identified in this test." },
      compliance: { score: 3, note: "The access standard requires a current approval for privileged access. That approval is not on these two accounts." },
      fraud: { score: 3, note: "The access creates an opportunity. The test did not examine transactions posted by these accounts." },
    });
    const leaverMap = impacts({
      technology: { score: 3, note: "U-22 is recorded as left and the SAP B1 account is still enabled. The role is warehouse clerk, not privileged." },
      operational: { score: 2, note: "A leaver account can still post warehouse movements until it is disabled." },
    });

    const fAp = scored(4, apMap);
    const fDup = scored(3, dupMap);
    const fInv = scored(4, invMap);
    const fScrap = scored(3, scrapMap);
    const fPriv = scored(4, privMap);
    const fLeave = scored(3, leaverMap);

    await tx.insert(findings).values([
      {
        id: "f-ap-01",
        code: "F-AP-01",
        engagementId: "eng-ap",
        controlId: "c-ap-01",
        title: "Invoices above the approval threshold can be paid without a second review",
        criteria: "Group policy requires two different approvers before an invoice at or above MYR 50,000 is paid.",
        condition: `The registered extract ev-ap-inv contains 18 invoices. Management stated a population of 40. That count was not re-performed. In the extract, ${invoice.failed} invoices were paid with one approval or with the same person in both fields. ${invoice.unable} invoice had no amount and could not be tested. ${invoice.notApplicable} were below the threshold. Supportable exception amount in the extract: MYR ${apExposure.toLocaleString("en-MY")}. No confirmed loss is on file.`,
        symptom: "In-scope invoices were paid without two different approvals.",
        immediateCause: "Payment was released after the first approval when the second approver was unavailable.",
        rootCause: "The workflow requires a sequential second approval and has no controlled delegate or escalation, so the delay is cleared by skipping the review.",
        fiveWhys: [
          "Why were invoices paid with one approval? Staff released them after the first approval.",
          "Why did staff do that? The second approver was unavailable and the payment was delayed.",
          "Why was there no other route? The workflow has no delegation path.",
          "Why was delegation absent? The approval process was designed as a single sequence.",
          "Why has that design remained? Delay is treated as a local workaround, not escalated as a control gap. Supported by management's comment on the walkthrough, not by a system configuration export.",
        ],
        rootCauseClass: "Design gap",
        rootCauseTheme: "Systems and data",
        ...fAp,
        likelihoodRationale: "Seven exceptions in the 18 records tested, and management described the workaround as the usual response to approver absence. Likely. Not almost certain, because 22 stated invoices were not tested.",
        residualRisk: "The design still asks for two approvals, and some invoices had them. The bypass remains open. A weekly manual review by Finance is proposed and is not yet evidenced.",
        businessValue: "High. Restores a second review on high-value payments and removes the unapproved workaround.",
        valueLevel: "High",
        recommendation: "Redesign the invoice workflow so an in-scope invoice cannot be released without two different approvals. Include a documented delegate, a system block, and a time-bound escalation. Review the exception lines and the 22 invoices that were not in the extract.",
        expectedOutcome: "In-scope invoices are released only through the controlled path, and the untested population is either tested or disclosed as unable to conclude.",
        managementPosition: "Agree",
        quantifiedImpact: `Potential exposure MYR ${apExposure.toLocaleString("en-MY")} in the tested extract. No confirmed loss identified. 22 of the stated 40 invoices were not tested.`,
        evidenceIds: "ev-ap-inv",
        testRunId: "tr-ap-dual",
        status: "Agreed",
        isolatedOrRecurring: "Recurring in this extract. Not yet tested in other entities.",
      },
      {
        id: "f-ap-02",
        code: "F-AP-02",
        engagementId: "eng-ap",
        controlId: "c-ap-02",
        title: "A repeated supplier invoice was paid twice in the extract and has not been investigated",
        criteria: "The same vendor, invoice number, and amount should not be paid more than once.",
        condition: `PAY-100 and PAY-101 both pay Apex Alloys invoice INV-7781 for MYR ${dupExposure.toLocaleString("en-MY")}. A near match on Klang Power, same amount and different invoice numbers, is disclosed in the workpaper and was not failed. The pair is a candidate for investigation. It is not a confirmed overpayment and it is not a fraud finding.`,
        symptom: "Two payment lines carry the same vendor, invoice number, and amount.",
        immediateCause: "The weekly duplicate review did not flag the pair before release.",
        rootCause: "The duplicate review is not a required, evidenced step in the payment run, so a repeat line can pass with the first approval path.",
        fiveWhys: [
          "Why is there a repeated line? Two payment documents share vendor, invoice, and amount.",
          "Why was the second line released? The run does not block a repeated invoice number.",
          "Why is there no block? The detective review sits outside the workflow.",
          "Why has that remained? The review depends on a person remembering to run it.",
          "Why was that accepted? [ROOT CAUSE BEYOND THIS POINT TO BE CONFIRMED WITH MANAGEMENT.]",
        ],
        rootCauseClass: "Monitoring gap",
        rootCauseTheme: "Process and procedure",
        ...fDup,
        likelihoodRationale: "One exact pair in a partial extract. Possible, not likely across the full payment population, which was not tested.",
        residualRisk: "Until the pair is investigated, the candidate amount remains open. The rest of the payment population was not tested.",
        businessValue: "Medium. A required duplicate check stops repeat payments and gives Finance a list to clear.",
        valueLevel: "Medium",
        recommendation: "Investigate PAY-100 and PAY-101 against the bank reference and the supplier statement. Make the duplicate check a required step before payment release, and keep the exception log.",
        expectedOutcome: "The candidate is confirmed, recovered, or cleared with evidence, and the next payment run cannot skip the check.",
        managementPosition: "Agree",
        quantifiedImpact: `Candidate amount MYR ${dupExposure.toLocaleString("en-MY")}. Not a confirmed loss.`,
        evidenceIds: "ev-ap-dup",
        testRunId: "tr-ap-dup",
        status: "Agreed",
        isolatedOrRecurring: "Isolated in this extract. Full population not tested.",
      },
      {
        id: "f-dc-01",
        code: "F-DC-01",
        engagementId: "eng-dc",
        controlId: "c-inv-01",
        title: "Alloy stock records do not match the physical count, so the book can send production to metal that is not there",
        criteria: "A book-to-physical difference is an exception when quantity variance exceeds 2 percent or the value exceeds MYR 10,000.",
        condition: `The count extract has ${inventory.populationCount} lines. ${inventory.failed} lines failed the approved threshold. Observed difference on those lines: MYR ${invExposure.toLocaleString("en-MY")}. ADC12, zinc alloy ZL3, and copper inserts were short. Consumable lines were within the limit. The item master was not tied out.`,
        symptom: "Three high-value alloys are short against the book.",
        immediateCause: "Receipts can be posted from the supplier delivery note without a weighbridge ticket, and the count difference is reviewed by the clerk who posted the receipt.",
        rootCause: "The receipt process was put in place without a required weighbridge reference, and the count review is not independent of the person who records the receipt.",
        fiveWhys: [
          "Why do the records not match the count? The book was not brought to the physical quantity, and some receipts have no weighbridge ticket.",
          "Why can a receipt be posted without a ticket? The SAP B1 receipt screen does not require one.",
          "Why does the screen not require one? The plant went live before the weighbridge interface was in scope.",
          "Why was the difference not escalated? The same clerk reviews the cycle count.",
          "Why is that review accepted? The count procedure does not name a second reviewer. Confirmed in the walkthrough notes, not by a configuration export.",
        ],
        rootCauseClass: "Design gap",
        rootCauseTheme: "Systems and data",
        ...fInv,
        likelihoodRationale: "The difference was observed on this count, on three alloys, not on a single line. Likely to recur while the screen and the review stay as they are.",
        residualRisk: "The book still accepts a receipt without a measured weight. The observed amount is below materiality. The untested item master could move that conclusion. That uncertainty is disclosed, not closed.",
        businessValue: "High for operations. The planner stops calling for metal the cage does not hold. Financial value is the observed difference plus whatever the untied population later shows.",
        valueLevel: "High",
        recommendation: "Require a weighbridge reference before a metal receipt can be posted. Give the cycle-count difference to someone who did not post the receipt. Tie the count extract to the item master before the opinion is issued.",
        expectedOutcome: "Metal receipts without a measured weight cannot be posted, and the next count is reviewed independently.",
        managementPosition: "Agree",
        quantifiedImpact: `Observed difference MYR ${invExposure.toLocaleString("en-MY")} on the counted lines. Full-balance effect not quantified.`,
        evidenceIds: "ev-dc-count,ev-dc-notes",
        testRunId: "tr-dc-inv",
        status: "Agreed",
        isolatedOrRecurring: "Observed on three alloys this count. Other plants not tested.",
      },
      {
        id: "f-dc-02",
        code: "F-DC-02",
        engagementId: "eng-dc",
        controlId: "c-inv-02",
        title: "Scrap is not matched to the production order, so yield and metal loss stay invisible",
        criteria: "Scrap should be recorded against the production order that consumed the metal.",
        condition: "Walkthrough notes record scrap tickets filed by cage, not by production order. No scrap-to-order population was extracted. This finding is limited to that condition. No scrap tonnage is stated because none was tested.",
        symptom: "Scrap tickets do not carry a production order.",
        immediateCause: "The ticket book has no order field, and the clerk files tickets by date.",
        rootCause: "The scrap process was not designed to meet the costing need. There is no system link from the ticket to the production order.",
        fiveWhys: [
          "Why is yield by job unknown? Scrap is not on the order.",
          "Why is scrap not on the order? The ticket has no order field.",
          "Why is there no field? The ticket book predates the costing report.",
          "Why was it not changed? [TO BE CONFIRMED WITH THE PLANT CONTROLLER.]",
          "Fifth why not taken. The evidence does not support a further cause.",
        ],
        rootCauseClass: "Design gap",
        rootCauseTheme: "Process and procedure",
        ...fScrap,
        likelihoodRationale: "The ticket design was observed. It will keep failing the criterion until the ticket changes. Possible to major on a single month, because tonnage was not tested.",
        residualRisk: "Yield reports cannot be relied on for metal loss. The financial effect is not quantified.",
        businessValue: "Medium. A matched ticket lets the controller see loss by job without a separate spreadsheet.",
        valueLevel: "Medium",
        recommendation: "Add a mandatory production-order field to the scrap ticket and reject a ticket that does not match an open order. Do not estimate a loss figure until a population is tested.",
        expectedOutcome: "Scrap in the next month is traceable to an order, or the gap is disclosed as unable to conclude.",
        managementPosition: "Partially agree",
        quantifiedImpact: "Not quantified. No scrap population was tested.",
        evidenceIds: "ev-dc-notes",
        testRunId: null,
        status: "Agreed",
        isolatedOrRecurring: "Design condition. Frequency not measured.",
      },
      {
        id: "f-it-01",
        code: "F-IT-01",
        engagementId: "eng-it",
        controlId: "c-it-02",
        title: "Privileged access is enabled without a current approval, including a domain admin account",
        criteria: "Privileged access must be explicitly approved. An enabled privileged account with no approval is an exception.",
        condition: "In the nine-row sample, U-14 (SAP B1 finance admin) and U-44 (domain admin) are enabled and not approved. U-09, a superuser, is approved. The sample is not the full directory. No transaction posted by U-14 or U-44 was examined.",
        symptom: "Two privileged accounts have no approval flag.",
        immediateCause: "The quarterly review list did not include these two accounts, so the missing approval was not raised.",
        rootCause: "The review population is drawn from a manually maintained list, not from the live privileged flag, so an account can be privileged and absent from the review.",
        fiveWhys: [
          "Why are the accounts unapproved? No approval record is on the extract.",
          "Why did the review not catch them? They were not on the review list.",
          "Why were they absent? The list is maintained by hand.",
          "Why is the list manual? The privileged flag is not the source of the review population.",
          "Why has that continued? [TO BE CONFIRMED WITH THE ACCESS OWNER.]",
        ],
        rootCauseClass: "Design gap",
        rootCauseTheme: "Governance and oversight",
        ...fPriv,
        likelihoodRationale: "Both unapproved privileged accounts were observed in a small sample. Likely that the list-based review misses others. The full directory was not tested, so the rate is not stated.",
        residualRisk: "The two accounts remain enabled. Misuse was not tested and is not asserted. The residual risk is the open authority, not a discovered incident.",
        businessValue: "High. Removing or approving the access cuts the chance that the book or the domain is changed without a current need.",
        valueLevel: "High",
        recommendation: "Disable U-14 and U-44 until an owner approves the need, or record the approval and the expiry. Rebuild the review population from the live privileged flag, not from a side list.",
        expectedOutcome: "No enabled privileged account without a current approval in the next full extract.",
        managementPosition: "Pending",
        quantifiedImpact: "Not a financial loss. Two privileged accounts, one of them domain admin, are the exposure.",
        evidenceIds: "ev-it-access",
        testRunId: "tr-it-access",
        status: "In review",
        isolatedOrRecurring: "Two accounts in a judgmental sample. Directory not tested.",
      },
      {
        id: "f-it-02",
        code: "F-IT-02",
        engagementId: "eng-it",
        controlId: "c-it-01",
        title: "A leaver's warehouse account is still enabled",
        criteria: "A person recorded as having left must not have an enabled account.",
        condition: "U-22, J. Kumar, is Left in HR and Enabled in SAP B1. The role is warehouse clerk. U-60, also left, is disabled and passed. The sample is not the full leaver population.",
        symptom: "One leaver account is still enabled.",
        immediateCause: "The leaver notice was not matched to the SAP account before the extract date.",
        rootCause: "Leaver removal depends on a mailed notice rather than a required match between the HR leave date and enabled accounts.",
        fiveWhys: [
          "Why is the account enabled? It was not disabled after the leave date.",
          "Why was it not disabled? The access owner did not receive a matched list.",
          "Why is the match manual? HR and SAP B1 are not compared on a schedule.",
          "Why is there no schedule? The leaver procedure names an email, not a report.",
          "Fifth why not taken. Further cause is not evidenced.",
        ],
        rootCauseClass: "Operating gap",
        rootCauseTheme: "Process and procedure",
        ...fLeave,
        likelihoodRationale: "One exception in the leaver rows of a small sample. Possible. Do not state a rate for the directory.",
        residualRisk: "The account can still be used until it is disabled. No use after the leave date was tested.",
        businessValue: "Medium. A matched leaver report closes accounts without waiting for an email.",
        valueLevel: "Medium",
        recommendation: "Disable U-22. Run a full HR-to-account match for leavers in the last 90 days and keep the unmatched list as evidence.",
        expectedOutcome: "Leavers in the 90-day population are disabled, or the unmatched accounts are disclosed.",
        managementPosition: "Agree",
        quantifiedImpact: "Not quantified. One enabled leaver account in the sample.",
        evidenceIds: "ev-it-access",
        testRunId: "tr-it-access",
        status: "Agreed",
        isolatedOrRecurring: "One account in the sample.",
      },
    ]);

    await tx.insert(findings).values({
      id: "f-fa-01",
      code: "F-FA-01",
      engagementId: "eng-fa",
      controlId: "c-fa-01",
      title: "One capital addition was recorded without the request reference",
      criteria: "Additions above MYR 25,000 need an approved capital request before the asset is placed in service.",
      condition: "One addition of MYR 28,400 had the approval in email and not on the register. The amount was below materiality. The subsequent 12-line re-test had no exception.",
      symptom: "The register field was blank.",
      immediateCause: "The clerk filed the email and did not copy the reference.",
      rootCause: "The register did not require the reference, so a complete approval could still leave a blank field.",
      fiveWhys: ["Why was the field blank? It was not mandatory.", "Further cause was not required once the field was made mandatory and the re-test passed."],
      rootCauseClass: "Design gap",
      rootCauseTheme: "Systems and data",
      ...scored(2, impacts({ financial: { score: 2, note: "MYR 28,400, below materiality. Approval existed in email." } })),
      likelihoodRationale: "One miss in the prior-year population, then a clean re-test. Unlikely to recur after the field was made mandatory.",
      residualRisk: "Closed. The re-test is the residual position, not a forecast.",
      businessValue: "Low. The register now shows the approval without a hunt through email.",
      valueLevel: "Low",
      recommendation: "Keep the reference mandatory. Already done.",
      expectedOutcome: "Later additions carry the reference.",
      managementPosition: "Agree",
      quantifiedImpact: "MYR 28,400 addition, approval later evidenced. Below materiality.",
      evidenceIds: "ev-fa",
      testRunId: null,
      status: "Closed",
      isolatedOrRecurring: "Isolated. Closed.",
    });

    await tx.insert(actions).values([
      { id: "a-ap-01", findingId: "f-ap-01", engagementId: "eng-ap", agreedAction: "Redesign the invoice workflow with a delegate, a system block, and an escalation path. Review the seven exception lines and obtain the 22 missing invoices.", ownerId: "p-own2", supportingOwners: "Kenji Mori, CFO, for the design decision", originalDue: isoOffset(-8), revisedDue: null, status: "In progress", percentComplete: 30, interimControl: "Finance reviews every invoice at or above MYR 50,000 each Friday before release.", dependencies: "SAP B1 partner slot for the workflow change.", evidenceRequired: "Updated workflow configuration, delegation matrix, and a re-test of the next payment run.", evidenceReceived: "Friday review checklist for one week.", validationStatus: "Pending", comments: "Design options are with the partner. The Friday review has started. Evidence of the review is one checklist, not a population.", escalation: true, nextFollowUp: isoOffset(7) },
      { id: "a-ap-02", findingId: "f-ap-02", engagementId: "eng-ap", agreedAction: "Investigate PAY-100 and PAY-101 against the bank reference and supplier statement. Add a required duplicate check before release.", ownerId: "p-own2", supportingOwners: null, originalDue: isoOffset(18), revisedDue: null, status: "Not started", percentComplete: 0, interimControl: "AP supervisor scans the weekly run for repeated invoice numbers.", dependencies: "Supplier statement from Apex Alloys.", evidenceRequired: "Bank reference, supplier statement, and the investigation note.", evidenceReceived: null, validationStatus: "Pending", comments: null, escalation: false, nextFollowUp: isoOffset(18) },
      { id: "a-dc-01", findingId: "f-dc-01", engagementId: "eng-dc", agreedAction: "Make the weighbridge ticket mandatory on metal receipts and assign count review to someone who did not post the receipt.", ownerId: "p-own1", supportingOwners: "Priya Nair to re-test after the change", originalDue: isoOffset(-16), revisedDue: isoOffset(20), status: "In progress", percentComplete: 40, interimControl: "Controller signs quantity adjustments above MYR 10,000 before they are posted.", dependencies: "Weighbridge vendor to confirm the ticket export.", evidenceRequired: "Screen configuration, a sample of blocked receipts, and the next independent count.", evidenceReceived: "Draft procedure only.", validationStatus: "Pending", comments: "Due date revised because the weighbridge vendor has not confirmed the export. Revision is recorded. The action is still open.", escalation: true, nextFollowUp: isoOffset(7) },
      { id: "a-dc-02", findingId: "f-dc-02", engagementId: "eng-dc", agreedAction: "Add a mandatory production-order field to the scrap ticket and reject tickets without an open order.", ownerId: "p-own1", supportingOwners: null, originalDue: isoOffset(35), revisedDue: null, status: "Not started", percentComplete: 0, interimControl: "Supervisor annotates the order number on tickets by hand until the book is reprinted.", dependencies: "Reprint of the ticket book.", evidenceRequired: "New ticket template and one week of tickets with order numbers.", evidenceReceived: null, validationStatus: "Pending", comments: "Management partially agrees and wants the hand annotation trial first.", escalation: false, nextFollowUp: isoOffset(35) },
      { id: "a-it-01", findingId: "f-it-01", engagementId: "eng-it", agreedAction: "Disable or approve U-14 and U-44, and rebuild the privileged review from the live flag.", ownerId: "p-own3", supportingOwners: "Luis Ortega to re-extract after the change", originalDue: isoOffset(-6), revisedDue: null, status: "Disputed", percentComplete: 10, interimControl: "Password reset on both accounts and a daily sign-in alert to the access owner.", dependencies: "Business owner to confirm whether U-44 is still required.", evidenceRequired: "Disabled-account screenshot or a dated approval with an expiry, plus the new review population.", evidenceReceived: null, validationStatus: "Pending", comments: "IT disputes the domain-admin rating and says U-44 is a break-glass account. No break-glass procedure is on file. Escalated.", escalation: true, nextFollowUp: isoOffset(3) },
      { id: "a-it-02", findingId: "f-it-02", engagementId: "eng-it", agreedAction: "Disable U-22 and match HR leavers for the last 90 days to enabled accounts.", ownerId: "p-own3", supportingOwners: null, originalDue: isoOffset(12), revisedDue: null, status: "In progress", percentComplete: 50, interimControl: "Account disabled pending the full match. Disablement evidence not yet filed.", dependencies: "HR leaver report.", evidenceRequired: "Screenshot of U-22 disabled and the 90-day unmatched list.", evidenceReceived: null, validationStatus: "Pending", comments: "Owner says the account was disabled yesterday. Evidence not in the ledger yet, so the action stays open.", escalation: false, nextFollowUp: isoOffset(12) },
      { id: "a-fa-01", findingId: "f-fa-01", engagementId: "eng-fa", agreedAction: "Attach the capital-request reference to the one addition that lacked it, and add the reference as a required field.", ownerId: "p-cfo", supportingOwners: null, originalDue: isoOffset(-220), revisedDue: null, status: "Closed", percentComplete: 100, interimControl: null, dependencies: null, evidenceRequired: "Approved capital request and a re-test of subsequent additions.", evidenceReceived: "Capital request CR-188 and a 12-line additions re-test with no exception.", validationStatus: "Validated", comments: "Closed after Internal Audit validated the request and the re-test. A management statement alone would not have closed it.", escalation: false, nextFollowUp: null },
    ]);

    await tx.insert(pbcRequests).values([
      { id: "pbc-1", engagementId: "eng-dc", item: "Weighbridge calibration certificate for the count week", ownerId: "p-own1", due: isoOffset(-5), status: "Received", sufficiencyNote: "Received and linked. Reliability is R3 until the certificate number is on the count sheet.", evidenceId: "ev-dc-notes" },
      { id: "pbc-2", engagementId: "eng-dc", item: "Scrap tickets for March, with production order if any", ownerId: "p-own1", due: isoOffset(-2), status: "Insufficient", sufficiencyNote: "A photograph of the ticket book was offered. It is not a population. Status set to insufficient.", evidenceId: null },
      { id: "pbc-3", engagementId: "eng-ap", item: "SAP document count of invoices at or above MYR 50,000, with the selection parameters visible", ownerId: "p-own2", due: isoOffset(4), status: "Requested", sufficiencyNote: "Needed before the 22 missing invoices can move off unable to conclude.", evidenceId: null },
      { id: "pbc-4", engagementId: "eng-it", item: "HR leaver list for the 90 days before the extract", ownerId: "p-own3", due: isoOffset(-1), status: "Received", sufficiencyNote: "List received. Not yet matched by a second person. Sufficient to start the match, not sufficient to close the action.", evidenceId: "ev-it-access" },
      { id: "pbc-5", engagementId: "eng-p2p", item: "Open purchase-order extract with receipt and invoice quantities", ownerId: "p-own4", due: isoOffset(9), status: "Clarified", sufficiencyNote: "A five-line sample is registered. It is not a population. Testing is blocked until materiality is approved anyway.", evidenceId: "ev-p2p" },
      { id: "pbc-6", engagementId: "eng-pay", item: "Payroll master-data changes for Q1, with preparer and approver", ownerId: "p-own2", due: isoOffset(6), status: "Requested", sufficiencyNote: null, evidenceId: null },
    ]);

    await tx.insert(vendors).values([
      { id: "v-apex", name: "Apex Alloys", service: "ADC12 and zinc supply", tier: "1", suggestedTier: "1", tierRationale: "Single-source metal for the pilot plant. Production stops if supply stops. No system access.", tierStatus: "accepted", dataAccess: "None", criticality: "High", inherentRisk: 4, status: "Active", lastAssessment: isoOffset(-40), socReport: "Not applicable — materials supplier", ownerId: "p-own4", notes: "Concentration is a monitored risk, not a control finding.", nextReview: isoOffset(50) },
      { id: "v-weigh", name: "Northline Weigh Systems", service: "Plant weighbridge and ticket export", tier: "2", suggestedTier: "1", tierRationale: "The ticket export is in the receipt path for high-value metal. Failure or a silent change affects the book. Policy rule: production-critical operations technology is tier 1. Current file says tier 2. Recommendation only.", tierStatus: "pending", dataAccess: "Plant OT, no personal data", criticality: "High", inherentRisk: 4, status: "Active", lastAssessment: isoOffset(-80), socReport: "No SOC report. A SOC report is not a substitute for the ticket-control test.", ownerId: "p-own1", notes: "Interface not yet mandatory in SAP B1.", nextReview: isoOffset(20) },
      { id: "v-sap", name: "Harbour SAP partner", service: "SAP B1 support", tier: "1", suggestedTier: "1", tierRationale: "Support partner can change workflow configuration. Tier 1 accepted.", tierStatus: "accepted", dataAccess: "Configuration access, supervised", criticality: "High", inherentRisk: 4, status: "Active", lastAssessment: isoOffset(-25), socReport: "SOC 2 type II requested, not yet filed", ownerId: "p-own3", notes: "Workflow change for dual approval depends on this partner.", nextReview: isoOffset(40) },
      { id: "v-pay", name: "Cendana Payroll Bureau", service: "Payroll processing", tier: "1", suggestedTier: "1", tierRationale: "Processes pay and holds bank-account data. Tier 1.", tierStatus: "accepted", dataAccess: "Payroll and bank account", criticality: "High", inherentRisk: 4, status: "Active", lastAssessment: isoOffset(-60), socReport: "SOC 2 type II on file, period ended last year", ownerId: "p-own2", notes: "Report period is stale relative to this quarter. Do not treat it as current assurance.", nextReview: isoOffset(15) },
      { id: "v-scrap", name: "Jaya Metals", service: "Scrap purchase", tier: "2", suggestedTier: "2", tierRationale: "Buys scrap. No system access. Price and weight disputes are commercial. Tier 2.", tierStatus: "accepted", dataAccess: "None", criticality: "Medium", inherentRisk: 3, status: "Active", lastAssessment: isoOffset(-100), socReport: "Not applicable", ownerId: "p-own4", notes: "Weight disputes link to the scrap-ticket finding. Not a related-party assertion.", nextReview: isoOffset(80) },
      { id: "v-freight", name: "Northline Freight", service: "Inbound metal freight", tier: "3", suggestedTier: "3", tierRationale: "Replaceable freight lane. No system access. Tier 3.", tierStatus: "accepted", dataAccess: "None", criticality: "Low", inherentRisk: 2, status: "Active", lastAssessment: isoOffset(-30), socReport: "Not requested", ownerId: "p-own4", notes: null, nextReview: isoOffset(120) },
    ]);

    await tx.insert(aiSystems).values([
      { id: "ai-test", name: "Meridian test executor", purpose: "Runs approved attribute tests on registered extracts and writes a cited workpaper.", ownerId: "p-gcae", modelType: "Deterministic procedure, version 1.0.0. No external language model.", dataClass: "Audit evidence, restricted", riskLevel: "Limited", status: "Approved for use", humanOversight: "QA re-performs material tests. A person approves the result.", lastReview: isoOffset(-3), frameworks: "NIST AI RMF themes, internal iron rules", reviewNote: "Calculations are reproducible from the evidence hash and the parameter hash." },
      { id: "ai-report", name: "Meridian report assembler", purpose: "Arranges recorded facts into an executive briefing and stakeholder views.", ownerId: "p-gcae", modelType: "Template. Does not generate new facts.", dataClass: "Audit findings, restricted", riskLevel: "Limited", status: "Approved for use", humanOversight: "The GCAE issues the report. The assembler cannot.", lastReview: isoOffset(-3), frameworks: "Internal reporting method", reviewNote: "Missing facts stay in square brackets." },
      { id: "ai-vision", name: "Plant vision scrap counter", purpose: "Counts scrap bins from a camera at MKAPL. Output is not used as audit evidence.", ownerId: "p-own1", modelType: "Vendor vision model, on premise", dataClass: "Plant operations, no personal data intended", riskLevel: "High", status: "Review open", humanOversight: "No named reviewer. Counts are not tied to the production order.", lastReview: null, frameworks: "Internal AI register", reviewNote: "Not legal advice and not an EU AI Act classification. High internal rating because it could be mistaken for a book of record." },
      { id: "ai-draft", name: "Finance drafting assistant", purpose: "Drafts accrual narratives from a clerk's bullets. Not connected to Meridian.", ownerId: "p-own2", modelType: "Enterprise chat tool, approved tenant", dataClass: "Finance working papers", riskLevel: "Limited", status: "Approved with conditions", humanOversight: "The clerk signs the narrative. The tool is not an approver.", lastReview: isoOffset(-45), frameworks: "Internal AI register", reviewNote: "Condition: no supplier bank details in the prompt." },
      { id: "ai-screen", name: "HR screening scorer", purpose: "Ranks warehouse applicants. Out of audit scope. Recorded so the register is not only the tools we like.", ownerId: "p-coo", modelType: "Vendor SaaS", dataClass: "Applicant personal data", riskLevel: "High", status: "Not approved", humanOversight: "Use is paused. No audit test has been performed.", lastReview: null, frameworks: "Internal AI register", reviewNote: "Paused by HR. Internal Audit has not concluded on fairness or legality." },
    ]);

    await tx.insert(agentRuns).values([
      {
        id: "ar-ap-test",
        agent: "Test executor",
        skill: "dual_approval",
        engagementId: "eng-ap",
        trigger: "Auditor ran the approved invoice procedure on ev-ap-inv.",
        status: "approved",
        startedAt: isoOffset(-12),
        completedAt: isoOffset(-12),
        summary: `Fail / Exception. ${invoice.failed} exceptions. Exposure MYR ${apExposure.toLocaleString("en-MY")} in the extract. 22 stated invoices not tested.`,
        reasoning: [
          { n: 1, title: "Read the gate", detail: "Materiality MYR 250,000 is approved. Threshold MYR 50,000 is the approved matrix.", kind: "rule" },
          { n: 2, title: "Read the evidence", detail: "ev-ap-inv hash recorded. Body not modified.", kind: "read" },
          { n: 3, title: "Apply the criterion", detail: "Each row at or above 50,000 needs two different approvers.", kind: "calc" },
          { n: 4, title: "Separate the gap", detail: "The stated population of 40 was not in the file. The missing 22 are unable to conclude, not a pass and not an extra failure.", kind: "limit" },
          { n: 5, title: "Hand off", detail: "Workpaper submitted. QA later re-performed it. The manager approved the test. Issuance is still with the GCAE.", kind: "handoff" },
        ],
        inputs: { evidence: "ev-ap-inv", threshold: "50000", procedure: "dual_approval" },
        output: { result: "FAIL_EXCEPTION", exceptions: String(invoice.failed), exposure: String(apExposure) },
        limitations: apLimits,
        decidedBy: "p-mgr",
        decisionNote: "Test result approved. This is not report issuance.",
      },
      {
        id: "ar-dc-qa",
        agent: "Independent re-performer",
        skill: "blind_recalculation",
        engagementId: "eng-dc",
        trigger: "Inventory test tr-dc-inv has exceptions and has not been re-performed.",
        status: "suggested",
        startedAt: isoOffset(-1),
        completedAt: null,
        summary: "QA should re-perform the count test before the finding is relied on in an issued report.",
        reasoning: [
          { n: 1, title: "See the queue, not the conclusion", detail: "The re-performer is pointed at ev-dc-count and the stored thresholds. It is not given the first result as an input.", kind: "rule" },
          { n: 2, title: "Why it is material", detail: "Three lines failed and the operational impact is rated major. That is enough to require re-performance.", kind: "rule" },
          { n: 3, title: "Stop", detail: "No recalculation has been run yet. This card is the handoff, not a clearance.", kind: "handoff" },
        ],
        inputs: { test: "tr-dc-inv", evidence: "ev-dc-count" },
        output: { recommendation: "Re-perform before reliance" },
        limitations: "Clearance does not exist until the recalculation is stored.",
        decidedBy: null,
        decisionNote: null,
      },
      {
        id: "ar-p2p",
        agent: "Screener",
        skill: "gate_check",
        engagementId: "eng-p2p",
        trigger: "Engagement reached data understanding with a proposed threshold and an extract on file.",
        status: "suggested",
        startedAt: isoOffset(-1),
        completedAt: null,
        summary: "Do not test. Materiality is not approved. The five-line file is a sample, not a population.",
        reasoning: [
          { n: 1, title: "Classify", detail: "Request is an attribute test of the three-way match.", kind: "read" },
          { n: 2, title: "Authority", detail: "Thresholds must be approved by the GCAE before a test is in scope.", kind: "rule" },
          { n: 3, title: "Evidence", detail: "ev-p2p is registered, which is necessary and not sufficient.", kind: "limit" },
          { n: 4, title: "Stop", detail: "Specialist test executor was not called.", kind: "handoff" },
        ],
        inputs: { engagement: "eng-p2p", materialityApproved: "false" },
        output: { next: "GCAE approves or rejects the proposed MYR 150,000 materiality and 2 percent price tolerance." },
        limitations: "A draft test run would be a deviation. The screener will not start one.",
        decidedBy: null,
        decisionNote: null,
      },
      {
        id: "ar-mx",
        agent: "Risk scorer",
        skill: "planning_score",
        engagementId: null,
        trigger: "Annual plan coverage review for entities with no audit in two cycles.",
        status: "suggested",
        startedAt: isoOffset(-2),
        completedAt: null,
        summary: "Suggest a planning score of 5 for MK Tron Mexico Machining. This is not an audit opinion.",
        reasoning: [
          { n: 1, title: "Read coverage", detail: "No last-audit date. Coverage status is Gap. System is not group SAP B1.", kind: "read" },
          { n: 2, title: "Apply the planning rule", detail: "Two missed cycles and a different system suggest a planning score of 5 so the entity is visible. The rule does not create a finding.", kind: "calc" },
          { n: 3, title: "Hand off", detail: "The COO and the GCAE accept or keep the current residual of 4.", kind: "handoff" },
        ],
        inputs: { entity: "ent-mx" },
        output: { suggestedScore: "5", currentResidual: "4" },
        limitations: "No evidence has been registered for Mexico. The score cannot support a report.",
        decidedBy: null,
        decisionNote: null,
      },
      {
        id: "ar-vendor",
        agent: "Vendor tier recommender",
        skill: "tier_rule",
        engagementId: null,
        trigger: "Policy rule re-applied after the weighbridge was named in the inventory root cause.",
        status: "suggested",
        startedAt: isoOffset(-2),
        completedAt: null,
        summary: "Recommend tier 1 for Northline Weigh Systems. The file currently says tier 2.",
        reasoning: [
          { n: 1, title: "Read the rule", detail: "Production-critical operations technology is tier 1, whether or not it holds personal data.", kind: "rule" },
          { n: 2, title: "Read the vendor", detail: "Weighbridge ticket export sits on the metal receipt path. Criticality high. No SOC report.", kind: "read" },
          { n: 3, title: "Recommend", detail: "Tier 1. A missing SOC report is disclosed. It is not treated as a clean assessment, and it is not treated as a finding of control failure at the vendor.", kind: "handoff" },
        ],
        inputs: { vendor: "v-weigh" },
        output: { suggestedTier: "1", currentTier: "2" },
        limitations: "No new vendor evidence was collected for this recommendation. It applies the written rule to facts already on the file.",
        decidedBy: null,
        decisionNote: null,
      },
    ]);

    await tx.insert(auditEvents).values([
      { id: "log-1", at: isoOffset(-70), actor: "Priya Nair", action: "Opened engagement", objectType: "engagement", objectId: "eng-dc", beforeState: null, afterState: "Stage 1", detail: "Pilot engagement opened for MKAPL die casting. Scope limited to alloys, scrap, and the receipt path." },
      { id: "log-2", at: isoOffset(-40), actor: "Amira Hassan", action: "Approved materiality", objectType: "engagement", objectId: "eng-dc", beforeState: "Not approved", afterState: "MYR 250,000 approved", detail: "GCAE approved materiality and the count thresholds of 2 percent or MYR 10,000." },
      { id: "log-3", at: isoOffset(-18), actor: "Priya Nair", action: "Registered evidence", objectType: "evidence", objectId: "ev-dc-count", beforeState: null, afterState: "Registered, R3", detail: "Count sheet hashed and registered. Original body is read-only." },
      { id: "log-4", at: isoOffset(-12), actor: "Daniel Okonkwo", action: "Approved test result", objectType: "test", objectId: "tr-ap-dual", beforeState: "Pending", afterState: "Approved", detail: "Approved the invoice test after QA clearance. Did not issue the report." },
      { id: "log-5", at: isoOffset(-9), actor: "Test executor", action: "Completed procedure", objectType: "test", objectId: "tr-dc-inv", beforeState: null, afterState: "Fail / Exception, QA pending", detail: "Inventory procedure finished. Agent cannot approve its own result." },
      { id: "log-6", at: isoOffset(-6), actor: "Luis Ortega", action: "Drafted finding", objectType: "finding", objectId: "f-it-01", beforeState: null, afterState: "In review", detail: "Privileged-access finding linked to ev-it-access. Misuse not asserted." },
      { id: "log-7", at: isoOffset(-2), actor: "Vendor tier recommender", action: "Suggested tier change", objectType: "vendor", objectId: "v-weigh", beforeState: "Tier 2", afterState: "Tier 1 suggested", detail: "Recommendation waiting on a person. Tier on the file was not changed." },
      { id: "log-8", at: isoOffset(-1), actor: "Screener", action: "Blocked test", objectType: "engagement", objectId: "eng-p2p", beforeState: "Extract registered", afterState: "Test not started", detail: "Three-way match was not run because materiality is unapproved." },
    ]);

    await tx.insert(settings).values({ key: "seeded", value: "2026.4" });
  });
}

function evidenceRow(
  id: string,
  engagementId: string,
  sourceSystem: string,
  filename: string,
  documentType: string,
  process: string,
  period: string,
  body: string,
  completeness: string,
  reliability: string,
  limitations: string,
  custodian: string,
  obtainedBy: string,
  sheet: string,
) {
  const lines = body.split(/\r?\n/).filter((line) => line.trim()).length - 1;
  return {
    id,
    engagementId,
    sourceSystem,
    originalFilename: filename,
    documentType,
    businessProcess: process,
    reportingPeriod: period,
    version: 1,
    supersedesId: null,
    fileHash: sha256(body),
    receivedAt: isoOffset(-21),
    custodian,
    obtainedBy,
    recordCount: Math.max(lines, 1),
    completeness,
    reliability,
    limitations,
    status: "Registered",
    sheetOrSection: sheet,
    body,
    populationNote: limitations,
  };
}

function runRow(
  id: string,
  engagementId: string,
  controlId: string,
  procedure: string,
  evidenceId: string,
  thresholds: Record<string, number>,
  execution: ReturnType<typeof runProcedure>,
  extra: {
    populationDefinition: string;
    populationCount: number;
    method: string;
    executedAt: string;
    qaStatus: string;
    qaResult: string | null;
    qaNotes: string | null;
    approvalStatus: string;
    approvedBy: string | null;
    limitations: string;
  },
) {
  return {
    id,
    engagementId,
    controlId,
    procedure,
    objective: execution.workpaper.procedureName,
    populationDefinition: extra.populationDefinition,
    populationCount: extra.populationCount,
    recordsTested: execution.recordsTested,
    method: extra.method,
    thresholdJson: thresholds,
    exceptionsCount: execution.failed,
    result: execution.result,
    exposureAmount: execution.exposure,
    currency: execution.currency,
    evidenceId,
    scriptName: `meridian/procedures/${procedure}.ts`,
    scriptVersion: "1.0.0",
    parameterHash: shortHash(JSON.stringify(thresholds)),
    executedAt: extra.executedAt,
    qaStatus: extra.qaStatus,
    qaResult: extra.qaResult,
    qaNotes: extra.qaNotes,
    limitations: extra.limitations,
    approvalStatus: extra.approvalStatus,
    approvedBy: extra.approvedBy,
    deviation: false,
    workpaper: execution.workpaper,
  };
}
