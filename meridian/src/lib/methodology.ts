export const PRODUCT = {
  name: "Meridian",
  line: "Assurance workbench",
  org: "MK Tron Group Internal Audit",
  stance:
    "Original evidence-to-assurance system. Informed by publicly described reviewer-first agentic audit practice. Not affiliated with Optro or AuditBoard, and not a reconstruction of any vendor system.",
};

export const IMPACT_DIMENSIONS = [
  {
    id: "financial",
    label: "Financial exposure",
    consider: "Potential loss, recovery cost, write-off, penalty, leakage, or misstatement.",
  },
  {
    id: "operational",
    label: "Operational disruption",
    consider: "Process delay, rework, service interruption, capacity, or failed handoff.",
  },
  {
    id: "compliance",
    label: "Compliance and legal",
    consider: "Regulatory, contractual, licence, or reporting exposure.",
  },
  {
    id: "fraud",
    label: "Fraud and misconduct",
    consider: "Opportunity for fraud, misappropriation, or collusion. This is not proof of fraud.",
  },
  {
    id: "technology",
    label: "Data, technology, and cyber",
    consider: "Data loss, unauthorised access, outage, integrity, or system bypass.",
  },
  {
    id: "customer",
    label: "Customer and reputation",
    consider: "Customer harm, complaints, loss of trust, or negative publicity.",
  },
  {
    id: "strategic",
    label: "Strategic and decision-making",
    consider: "Poor decisions, missed opportunities, or unreliable management information.",
  },
] as const;

export const IMPACT_SCALE = [
  { score: 5, label: "Severe", text: "Material financial, regulatory, operational, customer, or reputational exposure." },
  { score: 4, label: "Major", text: "Significant exposure likely to affect objectives, performance, or compliance." },
  { score: 3, label: "Moderate", text: "Meaningful exposure requiring timely remediation." },
  { score: 2, label: "Minor", text: "Limited exposure, but remediation would improve control or efficiency." },
  { score: 1, label: "Low", text: "Isolated or low-consequence issue." },
] as const;

export const LIKELIHOOD_SCALE = [
  { score: 5, label: "Almost certain" },
  { score: 4, label: "Likely" },
  { score: 3, label: "Possible" },
  { score: 2, label: "Unlikely" },
  { score: 1, label: "Rare" },
] as const;

export const PRIORITY_BANDS = [
  { min: 20, max: 25, band: "Critical" },
  { min: 12, max: 19, band: "High" },
  { min: 6, max: 11, band: "Medium" },
  { min: 1, max: 5, band: "Low" },
] as const;

export const ROOT_CLASSES = [
  "Design gap",
  "Implementation gap",
  "Operating gap",
  "Monitoring gap",
  "Accountability gap",
  "Capability or resource gap",
] as const;

export const ROOT_THEMES = [
  "People and capability",
  "Process and procedure",
  "Policy and standards",
  "Systems and data",
  "Governance and oversight",
  "Culture, incentives, and communication",
  "Third parties and outsourcing",
] as const;

export const ACTION_STATUSES = [
  "Not started",
  "In progress",
  "Partially implemented",
  "Implemented",
  "Closed",
  "Deferred",
  "Disputed",
] as const;

export const TEST_OUTCOMES = [
  "Pass",
  "Fail / Exception",
  "Unable to conclude",
  "Not applicable",
] as const;

export const RELIABILITY = [
  { id: "R1", label: "R1 — Independent source", text: "System-generated, complete enough to test, hash recorded, custodian known." },
  { id: "R2", label: "R2 — Corroborated extract", text: "System report or export, custodian confirmed, with a stated limitation." },
  { id: "R3", label: "R3 — Management-prepared", text: "Prepared by management and corroborated in part. Not sufficient alone for a clean opinion." },
  { id: "R4", label: "R4 — Inquiry", text: "Interview or uncorroborated explanation. Cannot support a pass." },
  { id: "R5", label: "R5 — Unverified", text: "Missing, contradictory, or not yet examined. Must be disclosed." },
] as const;

export const STAGES = [
  {
    n: 1,
    name: "Assignment understanding",
    gate: "Entity, period, objective, scope, and criteria are recorded.",
  },
  {
    n: 2,
    name: "Evidence intelligence",
    gate: "At least one evidence item is registered, hashed, and linked.",
  },
  {
    n: 3,
    name: "Data understanding",
    gate: "Population, completeness, and reliability are assessed. Materiality is approved.",
  },
  {
    n: 4,
    name: "Audit execution",
    gate: "An approved procedure has been run and the result is documented.",
  },
  {
    n: 5,
    name: "Exception investigation",
    gate: "Exceptions are traced. False positives are separated from deviations.",
  },
  {
    n: 6,
    name: "Independent QA",
    gate: "Material calculations are re-performed without relying on the first narrative.",
  },
  {
    n: 7,
    name: "Reporting and approval",
    gate: "The GCAE approves issuance. Agents do not issue the report.",
  },
] as const;

export const IRON_RULES = [
  "No audit finding without traceable source evidence.",
  "Register evidence before substantive testing. Do not overwrite an original; version it.",
  "Perform the procedure before judging the result.",
  "QA re-performs material work. It does not merely review the first narrative.",
  "The GCAE retains professional judgment, finding approval, and report issuance.",
  "Agents execute approved procedures. They do not invent criteria, thresholds, or scope.",
  "The only test outcomes are Pass, Fail / Exception, Unable to conclude, and Not applicable.",
  "An evidence gap is not a confirmed failure and it is not reassurance.",
  "Do not invent facts, figures, root causes, management responses, or dates.",
  "A fraud indicator is not a finding of fraud. Motive is not inferred.",
  "Do not silently change evidence, population, criteria, thresholds, or scope.",
  "Unresolved limitations stay visible in the workpaper and the report.",
  "A skipped or unrun test is not a pass. A fixture is not a clean population.",
  "Do not claim production readiness without a current test and a human acceptance.",
  "Nothing is approved, routed, or issued without a person. Every action is logged.",
] as const;

export const PRINCIPLES = [
  {
    title: "Evidence before conclusions",
    text: "A conclusion cites the evidence identity, version, and hash. If the source is missing, the outcome is Unable to conclude.",
  },
  {
    title: "Execution before interpretation",
    text: "The procedure runs and is validated before anyone assesses what the result means for the business.",
  },
  {
    title: "Independent verification",
    text: "QA recalculates from the original evidence and the approved parameters. It does not start from the first agent's conclusion.",
  },
  {
    title: "Human accountability",
    text: "The Group Chief Audit Executive approves scope, materiality, findings, risk ratings, and issuance.",
  },
  {
    title: "Controlled authority",
    text: "The orchestrator sequences work. It does not decide a finding, a rating, or a report.",
  },
] as const;

export const AUTHORITY_MATRIX = [
  { responsibility: "Assign specialist work", orchestrator: "Yes", specialist: "No", gcae: "Oversight" },
  { responsibility: "Enforce execution sequence", orchestrator: "Yes", specialist: "Follow", gcae: "Oversight" },
  { responsibility: "Maintain stage status", orchestrator: "Propose", specialist: "Update assigned task", gcae: "Review" },
  { responsibility: "Maintain evidence ledger", orchestrator: "Coordinate", specialist: "Register assigned evidence", gcae: "Review" },
  { responsibility: "Execute audit tests", orchestrator: "Delegate", specialist: "Yes", gcae: "Oversight" },
  { responsibility: "Consolidate test results", orchestrator: "Yes", specialist: "Submit", gcae: "Review" },
  { responsibility: "Decide a final finding", orchestrator: "No", specialist: "Recommend only", gcae: "Yes" },
  { responsibility: "Approve risk rating", orchestrator: "No", specialist: "Recommend only", gcae: "Yes" },
  { responsibility: "Approve scope or materiality", orchestrator: "No", specialist: "No", gcae: "Yes" },
  { responsibility: "Approve and issue the report", orchestrator: "No", specialist: "No", gcae: "Yes" },
] as const;

export const AGENTS = [
  {
    id: "orchestrator",
    name: "Orchestrator",
    layer: "Governance",
    effort: "Controller, not a model",
    purpose: "Sequences stages, checks gates, and hands work to a specialist. It does not form an audit opinion.",
    may: ["Read engagement state", "Name the next gate", "Block a step that lacks authority or evidence"],
    mustNot: ["Approve a finding", "Change a threshold", "Issue a report", "Treat a gap as a pass"],
    gate: "A person accepts or rejects the recommended next step.",
  },
  {
    id: "screener",
    name: "Screener",
    layer: "Governance",
    effort: "Low — first pass only",
    purpose: "Classifies the request and stops it if scope, criteria, or authority is missing.",
    may: ["Classify the task", "List missing inputs", "Route to one specialist"],
    mustNot: ["Conclude on a control", "Score a risk without evidence", "Fill a missing fact"],
    gate: "Missing inputs stop the run. No specialist is called.",
  },
  {
    id: "evidence",
    name: "Evidence analyst",
    layer: "Intelligence",
    effort: "Deterministic registration",
    purpose: "Registers source, custodian, hash, version, completeness, and reliability. New versions link to the prior record.",
    may: ["Hash the received body", "Grade reliability from stated attributes", "Flag duplicate hashes"],
    mustNot: ["Edit the original body", "Upgrade reliability without a new fact", "Delete evidence"],
    gate: "The custodian and obtained-by fields must be a person, not an agent.",
  },
  {
    id: "tester",
    name: "Test executor",
    layer: "Execution",
    effort: "Deterministic procedure",
    purpose: "Applies an approved attribute test to the registered population and writes a cited workpaper.",
    may: ["Compare each record to the approved criterion", "Count pass, fail, unable, and not applicable", "Sum supportable exposure"],
    mustNot: ["Invent a threshold", "Drop a row to improve the result", "Call an indicator fraud"],
    gate: "Materiality must be approved. A deviation from the approved matrix is marked and cannot be silently accepted.",
  },
  {
    id: "qa",
    name: "Independent re-performer",
    layer: "Assurance",
    effort: "Blind recalculation",
    purpose: "Re-runs the calculation from the evidence and the parameter hash before reading the first conclusion.",
    may: ["Recalculate", "Compare counts and result", "Record a disagreement"],
    mustNot: ["Edit the first workpaper to force a match", "Clear QA because the narrative sounds reasonable"],
    gate: "A mismatch blocks approval until a person resolves it.",
  },
  {
    id: "scorer",
    name: "Risk scorer",
    layer: "Assurance",
    effort: "Arithmetic plus required rationale",
    purpose: "Computes priority as likelihood times the highest relevant business-impact score, and shows the band.",
    may: ["Apply the published scale", "Name the dimension that drove the score", "Refuse an unscored finding"],
    mustNot: ["Pick a rating without a rationale", "Hide a dimension the auditor marked relevant"],
    gate: "The rating is a recommendation until the GCAE accepts it.",
  },
  {
    id: "reporter",
    name: "Report assembler",
    layer: "Reporting",
    effort: "Template, not a generative model",
    purpose: "Builds the executive briefing and stakeholder views from recorded facts only. Missing facts stay labelled.",
    may: ["Arrange approved findings", "Switch emphasis by audience", "Run the quality checks"],
    mustNot: ["Add a cause, a figure, a date, or a management response that is not on file"],
    gate: "Issuance requires GCAE approval after QA.",
  },
  {
    id: "sufficiency",
    name: "Sufficiency reviewer",
    layer: "Intelligence",
    effort: "Rule check",
    purpose: "Tells the reviewer whether a PBC item is enough to test, and tells the preparer what is still missing.",
    may: ["Read reliability, completeness, and linkage", "Mark insufficient", "Suggest the missing element"],
    mustNot: ["Accept R4 or R5 evidence as enough for a pass", "Chase the business outside the record"],
    gate: "The auditor accepts or rejects the sufficiency note.",
  },
  {
    id: "vendor",
    name: "Vendor tier recommender",
    layer: "Intelligence",
    effort: "Policy rule",
    purpose: "Applies the written tiering rule to data access and criticality. The owner accepts or reclassifies.",
    may: ["Recommend a tier", "Show the rule that fired"],
    mustNot: ["Treat a missing SOC report as a clean assessment", "Auto-accept its own tier"],
    gate: "Tier status stays pending until a person decides.",
  },
] as const;

export const LAYERS = [
  {
    id: "Governance",
    summary: "Constitution, authority, and the screener. This layer can stop work. It cannot form an opinion.",
  },
  {
    id: "Intelligence",
    summary: "Assignment context, evidence identity, population, and source of truth. Testing does not start on an unregistered file.",
  },
  {
    id: "Execution",
    summary: "Approved procedures, sampling or full-population tests, and preserved parameters. Code computes. A person interprets.",
  },
  {
    id: "Assurance",
    summary: "Blind re-performance, contradiction review, and scoring discipline. Disagreement is a result, not a defect to hide.",
  },
  {
    id: "Reporting",
    summary: "Criteria, condition, cause, effect, action, and audience. The same facts, different emphasis. No new facts.",
  },
] as const;

export const BANNED_PHRASES = [
  "delve",
  "landscape",
  "robust",
  "leverage",
  "cutting-edge",
  "holistic",
  "seamless",
  "unlock",
  "elevate",
  "tapestry",
  "pivotal",
  "underscore",
  "it's important to note",
  "in today's",
  "game-changer",
  "nestled",
];

export function bandFor(score: number) {
  if (score >= 20) return "Critical";
  if (score >= 12) return "High";
  if (score >= 6) return "Medium";
  if (score >= 1) return "Low";
  return "Unscored";
}

export function cadenceDays(band: string, overdue: boolean) {
  if (overdue) return 7;
  if (band === "Critical") return 14;
  if (band === "High") return 30;
  if (band === "Medium") return 90;
  return 180;
}

export function cadenceLabel(band: string, overdue: boolean) {
  if (overdue) return "Overdue — escalate now, then weekly";
  if (band === "Critical") return "Fortnightly, weekly if overdue";
  if (band === "High") return "Monthly";
  if (band === "Medium") return "Quarterly";
  return "Before the next audit cycle, or twice a year";
}
