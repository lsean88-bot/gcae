import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  unique,
} from "drizzle-orm/pg-core";

export type ImpactCell = {
  score: number;
  note: string;
  relevant: boolean;
};

export type ImpactMap = Record<string, ImpactCell>;

export type RowResult = {
  key: string;
  outcome: "Pass" | "Fail / Exception" | "Unable to conclude" | "Not applicable";
  reason: string;
  amount: number | null;
  fields: Record<string, string>;
};

export type TestWorkpaper = {
  procedureName: string;
  criterion: string;
  steps: string[];
  rowResults: RowResult[];
  passed: number;
  failed: number;
  unable: number;
  notApplicable: number;
  exposure: number | null;
  currency: string;
  narrative: string;
  limitations: string[];
  fraudNote: string;
};

export type AgentStep = {
  n: number;
  title: string;
  detail: string;
  kind: "read" | "rule" | "calc" | "limit" | "handoff" | "propose" | "guard" | "decide";
};

export const people = pgTable("people", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  team: text("team").notNull(),
  email: text("email").notNull(),
  authority: text("authority").notNull(),
  passwordHash: text("password_hash"),
  mustChange: boolean("must_change").notNull().default(false),
});

export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  personId: text("person_id").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  lastSeen: bigint("last_seen", { mode: "number" }).notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
});

export const loginAttempts = pgTable("login_attempts", {
  id: serial("id").primaryKey(),
  scope: text("scope").notNull(),
  at: bigint("at", { mode: "number" }).notNull(),
  ok: boolean("ok").notNull(),
});

export const entities = pgTable("entities", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  jurisdiction: text("jurisdiction").notNull(),
  businessUnit: text("business_unit").notNull(),
  process: text("process").notNull(),
  inherentRisk: integer("inherent_risk").notNull(),
  residualRisk: integer("residual_risk").notNull(),
  riskRationale: text("risk_rationale").notNull(),
  lastAudit: text("last_audit"),
  coverage: text("coverage").notNull(),
  ownerId: text("owner_id").notNull(),
  strategicObjective: text("strategic_objective").notNull(),
  suggestedScore: integer("suggested_score"),
  suggestedRationale: text("suggested_rationale"),
  scoreStatus: text("score_status").notNull().default("accepted"),
});

export const engagements = pgTable("engagements", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  title: text("title").notNull(),
  entityId: text("entity_id").notNull(),
  period: text("period").notNull(),
  objective: text("objective").notNull(),
  scope: text("scope").notNull(),
  status: text("status").notNull(),
  stage: integer("stage").notNull(),
  overallRating: text("overall_rating"),
  opinion: text("opinion"),
  ratingOverrideReason: text("rating_override_reason"),
  materialityAmount: integer("materiality_amount"),
  materialityCurrency: text("materiality_currency").notNull().default("MYR"),
  thresholdJson: jsonb("threshold_json").$type<Record<string, number>>(),
  materialityApproved: boolean("materiality_approved").notNull().default(false),
  materialityApprovedBy: text("materiality_approved_by"),
  gcaeApproved: boolean("gcae_approved").notNull().default(false),
  issuedAt: text("issued_at"),
  qaStatus: text("qa_status").notNull(),
  audience: text("audience").notNull(),
  businessContext: text("business_context").notNull(),
  limitations: text("limitations"),
  leadId: text("lead_id").notNull(),
  startDate: text("start_date").notNull(),
  reportDate: text("report_date"),
  riskAppetite: text("risk_appetite"),
  restricted: boolean("restricted").notNull().default(false),
  allowExternalModel: boolean("allow_external_model").notNull().default(false),
});

export const evidence = pgTable("evidence", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id"),
  sourceSystem: text("source_system").notNull(),
  originalFilename: text("original_filename").notNull(),
  documentType: text("document_type").notNull(),
  businessProcess: text("business_process").notNull(),
  reportingPeriod: text("reporting_period").notNull(),
  version: integer("version").notNull().default(1),
  supersedesId: text("supersedes_id"),
  fileHash: text("file_hash").notNull(),
  receivedAt: text("received_at").notNull(),
  custodian: text("custodian").notNull(),
  obtainedBy: text("obtained_by").notNull(),
  recordCount: integer("record_count"),
  completeness: text("completeness").notNull(),
  reliability: text("reliability").notNull(),
  limitations: text("limitations"),
  status: text("status").notNull(),
  sheetOrSection: text("sheet_or_section"),
  body: text("body"),
  populationNote: text("population_note"),
  // Independent evidence class (CON or PHY). Set only by GCAE via setEvidenceClass; never derived from documentType.
  evidenceClass: text("evidence_class"),
});

export const controls = pgTable("controls", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  objective: text("objective").notNull(),
  process: text("process").notNull(),
  controlType: text("control_type").notNull(),
  frequency: text("frequency").notNull(),
  nature: text("nature").notNull(),
  ownerId: text("owner_id").notNull(),
  entityId: text("entity_id"),
  designEffectiveness: text("design_effectiveness").notNull(),
  operatingEffectiveness: text("operating_effectiveness").notNull(),
  lastTested: text("last_tested"),
  frameworkTags: text("framework_tags").notNull(),
});

export const risks = pgTable("risks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  statement: text("statement").notNull(),
  entityId: text("entity_id"),
  inherentLikelihood: integer("inherent_likelihood").notNull(),
  inherentImpact: integer("inherent_impact").notNull(),
  // Nullable: null means "residual not assessed". The app never guesses a residual score.
  residualLikelihood: integer("residual_likelihood"),
  residualImpact: integer("residual_impact"),
  residualRationale: text("residual_rationale"),
  residualAssessedBy: text("residual_assessed_by"),
  residualAssessedAt: text("residual_assessed_at"),
  appetite: text("appetite").notNull(),
  treatment: text("treatment").notNull(),
  ownerId: text("owner_id").notNull(),
  velocity: text("velocity").notNull(),
  linkedControlIds: text("linked_control_ids").notNull(),
});

export const frameworks = pgTable("frameworks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  version: text("version").notNull(),
  description: text("description").notNull(),
});

export const requirements = pgTable("requirements", {
  id: text("id").primaryKey(),
  frameworkId: text("framework_id").notNull(),
  code: text("code").notNull(),
  title: text("title").notNull(),
  statement: text("statement").notNull(),
  mappedControlIds: text("mapped_control_ids").notNull(),
});

export const findings = pgTable("findings", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  engagementId: text("engagement_id").notNull(),
  controlId: text("control_id"),
  title: text("title").notNull(),
  criteria: text("criteria").notNull(),
  condition: text("condition").notNull(),
  symptom: text("symptom").notNull(),
  immediateCause: text("immediate_cause").notNull(),
  rootCause: text("root_cause").notNull(),
  fiveWhys: jsonb("five_whys").$type<string[]>().notNull(),
  rootCauseClass: text("root_cause_class").notNull(),
  rootCauseTheme: text("root_cause_theme").notNull(),
  riskRating: text("risk_rating").notNull(),
  likelihood: integer("likelihood").notNull(),
  likelihoodRationale: text("likelihood_rationale").notNull(),
  impacts: jsonb("impacts").$type<ImpactMap>().notNull(),
  priorityScore: integer("priority_score").notNull(),
  priorityBand: text("priority_band").notNull(),
  highestImpact: integer("highest_impact").notNull(),
  highestDimension: text("highest_dimension").notNull(),
  residualRisk: text("residual_risk").notNull(),
  businessValue: text("business_value").notNull(),
  valueLevel: text("value_level").notNull(),
  recommendation: text("recommendation").notNull(),
  expectedOutcome: text("expected_outcome").notNull(),
  managementPosition: text("management_position").notNull(),
  quantifiedImpact: text("quantified_impact"),
  evidenceIds: text("evidence_ids").notNull(),
  testRunId: text("test_run_id"),
  status: text("status").notNull(),
  isolatedOrRecurring: text("isolated_or_recurring").notNull(),
  // Set when severityCap() lowered Critical to High because the evidence is only REP/ANA. Null otherwise.
  severityFlag: text("severity_flag"),
});

export const actions = pgTable("actions", {
  id: text("id").primaryKey(),
  findingId: text("finding_id").notNull(),
  engagementId: text("engagement_id").notNull(),
  agreedAction: text("agreed_action").notNull(),
  ownerId: text("owner_id").notNull(),
  supportingOwners: text("supporting_owners"),
  originalDue: text("original_due").notNull(),
  revisedDue: text("revised_due"),
  status: text("status").notNull(),
  percentComplete: integer("percent_complete").notNull().default(0),
  interimControl: text("interim_control"),
  dependencies: text("dependencies"),
  evidenceRequired: text("evidence_required").notNull(),
  evidenceReceived: text("evidence_received"),
  validationStatus: text("validation_status").notNull(),
  comments: text("comments"),
  escalation: boolean("escalation").notNull().default(false),
  nextFollowUp: text("next_follow_up"),
});

export const testRuns = pgTable("test_runs", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id").notNull(),
  controlId: text("control_id"),
  procedure: text("procedure").notNull(),
  objective: text("objective").notNull(),
  populationDefinition: text("population_definition").notNull(),
  populationCount: integer("population_count").notNull(),
  recordsTested: integer("records_tested").notNull(),
  method: text("method").notNull(),
  thresholdJson: jsonb("threshold_json").$type<Record<string, number>>().notNull(),
  exceptionsCount: integer("exceptions_count").notNull(),
  result: text("result").notNull(),
  exposureAmount: integer("exposure_amount"),
  currency: text("currency"),
  evidenceId: text("evidence_id"),
  scriptName: text("script_name").notNull(),
  scriptVersion: text("script_version").notNull(),
  parameterHash: text("parameter_hash").notNull(),
  executedAt: text("executed_at").notNull(),
  qaStatus: text("qa_status").notNull(),
  qaResult: text("qa_result"),
  qaNotes: text("qa_notes"),
  limitations: text("limitations"),
  approvalStatus: text("approval_status").notNull(),
  approvedBy: text("approved_by"),
  deviation: boolean("deviation").notNull().default(false),
  workpaper: jsonb("workpaper").$type<TestWorkpaper>().notNull(),
});

export const vendors = pgTable("vendors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  service: text("service").notNull(),
  tier: text("tier").notNull(),
  suggestedTier: text("suggested_tier"),
  tierRationale: text("tier_rationale"),
  tierStatus: text("tier_status").notNull().default("accepted"),
  dataAccess: text("data_access").notNull(),
  criticality: text("criticality").notNull(),
  inherentRisk: integer("inherent_risk").notNull(),
  status: text("status").notNull(),
  lastAssessment: text("last_assessment"),
  socReport: text("soc_report"),
  ownerId: text("owner_id").notNull(),
  notes: text("notes"),
  nextReview: text("next_review").notNull(),
});

export const aiSystems = pgTable("ai_systems", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  purpose: text("purpose").notNull(),
  ownerId: text("owner_id").notNull(),
  modelType: text("model_type").notNull(),
  dataClass: text("data_class").notNull(),
  riskLevel: text("risk_level").notNull(),
  status: text("status").notNull(),
  humanOversight: text("human_oversight").notNull(),
  lastReview: text("last_review"),
  frameworks: text("frameworks").notNull(),
  reviewNote: text("review_note"),
});

export const agentRuns = pgTable("agent_runs", {
  id: text("id").primaryKey(),
  agent: text("agent").notNull(),
  skill: text("skill").notNull(),
  engagementId: text("engagement_id"),
  trigger: text("trigger").notNull(),
  status: text("status").notNull(),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
  summary: text("summary").notNull(),
  reasoning: jsonb("reasoning").$type<AgentStep[]>().notNull(),
  inputs: jsonb("inputs").$type<Record<string, string>>().notNull(),
  output: jsonb("output").$type<Record<string, string>>().notNull(),
  limitations: text("limitations"),
  decidedBy: text("decided_by"),
  decisionNote: text("decision_note"),
});

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  at: text("at").notNull(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  objectType: text("object_type").notNull(),
  objectId: text("object_id").notNull(),
  beforeState: text("before_state"),
  afterState: text("after_state"),
  detail: text("detail").notNull(),
  engagementId: text("engagement_id"),
});

export const pbcRequests = pgTable("pbc_requests", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id").notNull(),
  item: text("item").notNull(),
  ownerId: text("owner_id").notNull(),
  due: text("due").notNull(),
  status: text("status").notNull(),
  sufficiencyNote: text("sufficiency_note"),
  evidenceId: text("evidence_id"),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const lessons = pgTable("lessons", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id"),
  title: text("title").notNull(),
  observation: text("observation").notNull(),
  change: text("change").notNull(),
  area: text("area").notNull(),
  ironRule: text("iron_rule").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  decidedBy: text("decided_by"),
  decisionNote: text("decision_note"),
});

/** Personal access tokens for the local Claude connector. Only the SHA-256 of the token is stored. */
export const apiTokens = pgTable("api_tokens", {
  id: text("id").primaryKey(),
  personId: text("person_id").notNull(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  scopes: jsonb("scopes").$type<string[]>().notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  lastUsedAt: bigint("last_used_at", { mode: "number" }),
  revokedAt: bigint("revoked_at", { mode: "number" }),
});

/** Who may see a restricted engagement. The GCAE always can and is not listed. */
export const engagementAccess = pgTable(
  "engagement_access",
  {
    id: serial("id").primaryKey(),
    engagementId: text("engagement_id").notNull(),
    personId: text("person_id").notNull(),
    grantedBy: text("granted_by").notNull(),
    grantedAt: text("granted_at").notNull(),
  },
  (t) => [unique("engagement_access_pair").on(t.engagementId, t.personId)],
);


/** Annual risk-based audit plan. An approved plan is never edited in place: a change creates a new Draft version. */
export const auditPlans = pgTable("audit_plans", {
  id: text("id").primaryKey(),
  year: integer("year").notNull(),
  status: text("status").notNull(), // Draft | Approved by GCAE | Noted by Audit Committee
  capacityDays: integer("capacity_days").notNull(),
  weights: jsonb("weights").$type<{ risk: number; age: number; mandatory: number; approved: boolean }>().notNull(),
  approvedBy: text("approved_by"),
  approvedAt: text("approved_at"),
  acMeetingDate: text("ac_meeting_date"),
  acMinuteRef: text("ac_minute_ref"),
  version: integer("version").notNull().default(1),
  supersedesId: text("supersedes_id"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
});

export const planItems = pgTable("plan_items", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull(),
  entityId: text("entity_id").notNull(),
  title: text("title").notNull(),
  quarter: text("quarter").notNull(), // Q1..Q4
  budgetDays: integer("budget_days").notNull(),
  rationale: text("rationale").notNull(),
  riskScore: integer("risk_score"),
  lastAuditDate: text("last_audit_date"),
  mandatory: boolean("mandatory").notNull().default(false),
  mandatoryReason: text("mandatory_reason"),
  engagementId: text("engagement_id"),
  status: text("status").notNull().default("Planned"), // Planned | In progress | Completed | Deferred | Cancelled
  changeReason: text("change_reason"),
});

/** Audit Committee pack. The snapshot is frozen at generation; Release stamps the hash. */
export const acPacks = pgTable("ac_packs", {
  id: text("id").primaryKey(),
  periodFrom: text("period_from").notNull(),
  periodTo: text("period_to").notNull(),
  status: text("status").notNull(), // Draft | Released
  generatedBy: text("generated_by").notNull(),
  generatedByAuthority: text("generated_by_authority").notNull(),
  generatedAt: text("generated_at").notNull(),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
  snapshotHash: text("snapshot_hash").notNull(),
  releasedBy: text("released_by"),
  releasedAt: text("released_at"),
});
