#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { z } from "zod";
import { configFromEnv, request } from "./client.js";

const cfg = configFromEnv();
const server = new McpServer({ name: "meridian", version: "1.1.0" });

const RULES =
  "Iron rules: read and draft only. Only the GCAE issues reports, approves materiality or ratings, changes thresholds, closes actions, clears QA or concludes on fraud; no tool here can. " +
  "Never invent a figure: every number must come from the Meridian file. A fraud indicator is a red flag, not a finding of fraud, and no person is named as a perpetrator.";

type Result = { content: { type: "text"; text: string }[]; isError?: boolean };
async function run(fn: () => Promise<unknown>): Promise<Result> {
  try {
    return { content: [{ type: "text", text: JSON.stringify(await fn(), null, 2) }] };
  } catch (error) {
    return { content: [{ type: "text", text: error instanceof Error ? error.message : "The request failed." }], isError: true };
  }
}
const get = (path: string, query?: Record<string, string | undefined>) => run(() => request(cfg, "GET", path, query));
const post = (path: string, body: unknown) => run(() => request(cfg, "POST", path, undefined, body));
const idPart = (id: string) => encodeURIComponent(id);

// Read tools
server.registerTool("list_engagements", { description: `List audit engagements with stage, status, rating and QA status. Read only. ${RULES}`, inputSchema: {} }, () => get("engagements"));
server.registerTool("get_engagement", { description: `Get one engagement: objective, scope, approved materiality, stage and gate status with blockers. Read only. ${RULES}`, inputSchema: { engagementId: z.string().describe("Engagement id, for example eng-ap") } }, ({ engagementId }) => get(`engagements/${idPart(engagementId)}`));
server.registerTool("list_findings", { description: `List findings, optionally for one engagement. Read only. ${RULES}`, inputSchema: { engagementId: z.string().optional() } }, ({ engagementId }) => get("findings", { engagementId }));
server.registerTool("get_finding", { description: `Get one finding in full (condition, cause, rating, evidence ids). Read only. ${RULES}`, inputSchema: { findingId: z.string() } }, ({ findingId }) => get(`findings/${idPart(findingId)}`));
server.registerTool("list_actions", { description: `List agreed actions, optionally filtered by engagement, finding or status. Read only; actions are closed only by people. ${RULES}`, inputSchema: { engagementId: z.string().optional(), findingId: z.string().optional(), status: z.string().optional() } }, ({ engagementId, findingId, status }) => get("actions", { engagementId, findingId, status }));
server.registerTool("list_evidence", { description: `List registered evidence metadata only (hash, reliability grade, completeness, limitations). Read only. Evidence can never be edited or deleted here. ${RULES}`, inputSchema: { engagementId: z.string().optional() } }, ({ engagementId }) => get("evidence", { engagementId }));
server.registerTool("get_evidence", { description: `Get one evidence record. Raw content is returned only if includeBody is true, is capped, and is refused unless the token owner is the GCAE, the audit manager, or the auditor leading the engagement. Read only. ${RULES}`, inputSchema: { evidenceId: z.string(), includeBody: z.boolean().optional().describe("Return the raw evidence text. Leave off unless needed.") } }, ({ evidenceId, includeBody }) => get(`evidence/${idPart(evidenceId)}`, { include: includeBody ? "body" : undefined }));
server.registerTool("list_risks", { description: `List the risk register. Read only. ${RULES}`, inputSchema: {} }, () => get("risks"));
server.registerTool("list_test_runs", { description: `List test runs: result, exceptions count, exposure, QA status. A test is cleared only by a QA reviewer. Read only. ${RULES}`, inputSchema: { engagementId: z.string().optional() } }, ({ engagementId }) => get("test-runs", { engagementId }));
server.registerTool("get_briefing", { description: `Get Meridian's generated briefing and quality checks for an engagement. It is not an issued report. Read only. ${RULES}`, inputSchema: { engagementId: z.string(), audience: z.string().optional().describe("For example Audit committee") } }, ({ engagementId, audience }) => get(`engagements/${idPart(engagementId)}/briefing`, { audience }));
server.registerTool("list_lessons", { description: `List kaizen lessons and their status. Read only. ${RULES}`, inputSchema: {} }, () => get("lessons"));

// Draft tools
const impact = z.object({ score: z.number().int().min(0).max(5), note: z.string(), relevant: z.boolean().optional() });
server.registerTool(
  "draft_finding",
  {
    description: `Create a DRAFT finding for human review. Status is forced to Draft. Meridian computes the priority from likelihood and impact; do not state a rating. It must cite registered evidence ids of the same engagement. Meridian refuses any figure not in the cited evidence or file, and any statement that fraud is proven. If the cause is not known, use the placeholder [ROOT CAUSE TO BE CONFIRMED WITH MANAGEMENT]. The GCAE issues; this tool cannot. ${RULES}`,
    inputSchema: {
      engagementId: z.string(),
      title: z.string(),
      condition: z.string().describe("What was observed, from evidence only"),
      criteria: z.string().optional(),
      rootCause: z.string(),
      recommendation: z.string().optional(),
      evidenceIds: z.array(z.string()).min(1),
      testRunId: z.string().optional(),
      likelihood: z.number().int().min(1).max(5),
      likelihoodRationale: z.string(),
      impacts: z.record(z.string(), impact).describe("Keys: financial, operational, compliance, fraud, technology, customer, strategic. Each relevant score needs a note."),
      quantifiedImpact: z.string().optional().describe("Only a figure that appears in the evidence or test workpaper"),
    },
  },
  (args) => post("findings", args),
);
server.registerTool(
  "draft_report_text",
  {
    description: `File draft report or opinion text for an engagement as a SUGGESTION that the audit manager or GCAE must read and accept. It does not change the opinion field, the rating, or issue anything. Meridian refuses text containing a figure that is not in the engagement file, or a statement that fraud is proven. ${RULES}`,
    inputSchema: { engagementId: z.string(), text: z.string().min(40) },
  },
  ({ engagementId, text }) => post(`engagements/${idPart(engagementId)}/report-draft`, { text }),
);
server.registerTool(
  "propose_lesson",
  {
    description: `Propose a kaizen lesson (status proposed). The audit manager or GCAE decides. Meridian rejects any lesson that would weaken an iron rule (waive, skip, bypass, auto-issue). ${RULES}`,
    inputSchema: { title: z.string(), observation: z.string(), change: z.string(), ironRule: z.string().describe("The iron rule this lesson keeps"), area: z.string().optional(), engagementId: z.string().optional() },
  },
  (args) => post("lessons", args),
);

// Analytics, guardrails, plan and ERM
const MAX_FILE = 20 * 1024 * 1024;
function readLocal(path: string, sheet?: string) {
  const st = statSync(path);
  if (!st.isFile()) throw new Error(`Not a file: ${basename(path)}`);
  if (st.size > MAX_FILE) throw new Error(`${basename(path)} is larger than 20 MB.`);
  return { name: basename(path), contentBase64: readFileSync(path).toString("base64"), ...(sheet ? { sheet } : {}) };
}
server.registerTool("list_analytics_runs", { description: `List saved analytics runs (test type, input file hash, row count, who ran it). Read only. Restricted engagements are never returned. ${RULES}`, inputSchema: {} }, () => get("analytics/runs"));
server.registerTool("get_analytics_run", { description: `Get one saved analytics run with its full result. Read only. ${RULES}`, inputSchema: { runId: z.string() } }, ({ runId }) => get(`analytics/runs/${idPart(runId)}`));
server.registerTool(
  "run_analytics",
  {
    description: `Run a deterministic analytics test (profile, benford, duplicates, reconcile) on a LOCAL file (csv or xlsx). This server reads the file on your PC and sends it to Meridian, which saves a read-only run. It is a staged DRAFT result: it approves, rates and issues nothing, and a person interprets it in the app. Column names must exist in the file. ${RULES}`,
    inputSchema: {
      filePath: z.string().describe("Absolute path of the file on this computer"),
      test: z.enum(["profile", "benford", "duplicates", "reconcile"]),
      params: z.object({ column: z.string().optional(), keyCols: z.array(z.string()).optional(), keyCol: z.string().optional(), amountCol: z.string().optional(), keyColB: z.string().optional(), amountColB: z.string().optional(), tolerance: z.number().optional() }).optional().describe("benford: column. duplicates: keyCols. reconcile: keyCol, amountCol, keyColB, amountColB, tolerance"),
      sheet: z.string().optional().describe("Sheet name for xlsx"),
      filePathB: z.string().optional().describe("Second file, for reconcile"),
      sheetB: z.string().optional(),
      engagementId: z.string().optional().describe("Link the run to an engagement"),
    },
  },
  ({ filePath, test, params, sheet, filePathB, sheetB, engagementId }) =>
    run(() => {
      const body = { test, params: params || {}, engagementId, fileA: readLocal(filePath, sheet), ...(filePathB ? { fileB: readLocal(filePathB, sheetB) } : {}) };
      return request(cfg, "POST", "analytics/runs", undefined, body);
    }),
);
server.registerTool("lint_text", { description: `Check draft text against Meridian's iron rules (for example a numeric confidence claim or a statement that fraud is proven). Read only: returns violations and stores nothing. Run it on every draft before filing. ${RULES}`, inputSchema: { text: z.string().min(1), evidenceState: z.string().optional().describe("Where the draft sits on the fraud ladder; leave off for the lowest rung") } }, ({ text, evidenceState }) => post("guardrails/lint", { text, evidenceState }));
server.registerTool("get_audit_plan", { description: `Get the annual risk-based audit plan and its items (latest plan by default). Read only; plans are approved only by the GCAE in the app. Items on restricted engagements are withheld. ${RULES}`, inputSchema: { year: z.number().int().optional(), planId: z.string().optional() } }, ({ year, planId }) => get("plan", { year: year === undefined ? undefined : String(year), planId }));
server.registerTool("get_risk_register", { description: `Get the ERM risk register with inherent and residual scores, the top risks and a 5x5 heat map. A residual that was never assessed is reported as not assessed, never guessed. Read only. ${RULES}`, inputSchema: { view: z.enum(["inherent", "residual"]).optional(), top: z.number().int().min(1).max(50).optional() } }, ({ view, top }) => get("risk-register", { view, top: top === undefined ? undefined : String(top) }));

await server.connect(new StdioServerTransport());
