// Spawns the built server, lists its tools, and asserts no forbidden tool exists. No Meridian server is needed.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Optional first argument: path to the server file to test (default dist/index.js). Used for the bundled plugin copy.
const SERVER = process.argv[2] || "dist/index.js";

const EXPECTED = ["list_engagements", "get_engagement", "list_findings", "get_finding", "list_actions", "list_evidence", "get_evidence", "list_risks", "list_test_runs", "get_briefing", "list_lessons", "draft_finding", "draft_report_text", "propose_lesson"];
const FORBIDDEN = /issue|approve|rating|threshold|delete|overwrite|close|conclude|waive|clear|qa\b|decide|accept|reopen|update|set_|remove/i;

const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER], env: { ...process.env, MERIDIAN_URL: "https://127.0.0.1:1", MERIDIAN_TOKEN: "mt_smoke_not_a_real_token_0000000000" } });
const client = new Client({ name: "smoke", version: "1.0.0" });
let failed = false;
const fail = (msg) => { console.error("FAIL:", msg); failed = true; };
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  for (const n of EXPECTED) if (!names.includes(n)) fail(`missing tool ${n}`);
  for (const n of names) {
    if (!EXPECTED.includes(n)) fail(`unexpected tool ${n}`);
    if (FORBIDDEN.test(n)) fail(`forbidden tool name ${n}`);
  }
  for (const t of tools) if (!/read only|DRAFT|SUGGESTION|proposed/i.test(t.description || "") || !/Iron rules/.test(t.description || "")) fail(`${t.name} description lacks iron rules`);
  const res = await client.callTool({ name: "list_engagements", arguments: {} });
  if (!res.isError) fail("unreachable server should return a clean tool error");
  const evList = tools.find((t) => t.name === "list_evidence");
  if (JSON.stringify(evList?.inputSchema).includes("includeBody")) fail("list_evidence must not offer includeBody");
  console.log(`tools=${names.length}`, names.join(","));
  console.log("error result is clean:", JSON.stringify(res.content?.[0]?.text).slice(0, 120));
} catch (e) {
  fail(String(e));
} finally {
  await client.close().catch(() => {});
}
// http:// to a non-local host must be refused before any request is made.
const t2 = new StdioClientTransport({ command: process.execPath, args: [SERVER], env: { ...process.env, MERIDIAN_URL: "http://172.30.0.10", MERIDIAN_TOKEN: "mt_smoke_not_a_real_token_0000000000" } });
const c2 = new Client({ name: "smoke2", version: "1.0.0" });
try {
  await c2.connect(t2);
  const r = await c2.callTool({ name: "list_engagements", arguments: {} });
  const msg = String(r.content?.[0]?.text || "");
  if (!r.isError || !/must be https/.test(msg)) fail("http:// to a non-local host was not refused");
  else console.log("http refusal ok:", msg.slice(0, 60));
} catch (e) { fail(String(e)); } finally { await c2.close().catch(() => {}); }
console.log(failed ? "SMOKE FAILED" : "SMOKE OK");
process.exit(failed ? 1 : 0);
