import assert from "node:assert/strict";
import { NOT_PROVIDED, SECTION_TITLES, boardBrief, buildReport13, releaseGate, type Report13Input, type R13Finding } from "../src/lib/report13";
import { MASK } from "../src/lib/iron-rules";

let pass = 0;
function t(name: string, fn: () => void) {
  fn();
  pass++;
  console.log(`ok - ${name}`);
}

const finding = (n: number, over: Partial<R13Finding> = {}): R13Finding => ({
  id: `f${n}`,
  code: `F${n}`,
  title: `Finding ${n} title`,
  priorityBand: "High",
  priorityScore: 10 + n,
  condition: `Condition text ${n}.`,
  criteria: `Policy section ${n} requires a second approver.`,
  cause: `Approval step was not built into the workflow ${n}.`,
  effect: `Unapproved payments may pass unnoticed ${n}.`,
  recommendation: `Implement a second approver on all payments above 5,000 ${n}.`,
  owner: "Finance Manager",
  dueDate: "2027-03-31",
  evidenceTags: ["INS", "REC"],
  workpaperRef: `WP-${n}`,
  rootCauseClass: "Process design",
  managementResponse: `Management agrees with finding ${n}.`,
  ...over,
});
const base = (findings: R13Finding[]): Report13Input => ({
  title: "Payments audit", code: "GIA-2026-TEST-PAY-01", period: "Jan to Jun 2026", entityName: "Test Sdn Bhd",
  objective: "Confirm that payments are approved.", scope: "Payments in the period.", businessContext: "The entity pays suppliers monthly.",
  limitations: "Bank confirmations were not requested.", audience: "Audit Committee", materialityApproved: true, gcaeApproved: false,
  findings,
  actions: findings.map((f) => ({
    id: `a-${f.id}`, findingId: f.id, agreedAction: `Add approver step for ${f.code}`, ownerName: "Finance Manager", originalDue: "2027-03-31",
    status: "Open", evidenceRequired: "Screenshot", validationStatus: "Pending", percentComplete: 0,
  })),
  tests: [{ id: "T1", procedure: "Re-performed approval check", result: "2 exceptions", populationCount: 400, recordsTested: 40, exceptionsCount: 2, limitations: null, evidenceTags: ["REC"] }],
  risks: findings.map((f) => ({ id: `r${f.id}`, findingCode: f.code, name: "Payment error risk", rating: "High" })),
  controls: findings.map((f) => ({ id: `c${f.id}`, findingCode: f.code, name: "Payment approval", design: "Effective", operating: "Ineffective" })),
});

const good = base([
  finding(1, { priorityBand: "Critical", amounts: [{ expected: 100, actual: 150 }, { expected: 200, actual: 170 }], currency: "MYR" }),
  finding(2, { priorityBand: "Medium" }),
]);

t("good: 13 titles in order, no gaps, gate passes", () => {
  const r = buildReport13(good);
  assert.deepEqual(r.sections.map((s) => s.title), [...SECTION_TITLES]);
  assert.deepEqual(r.sections.map((s) => s.number), [1,2,3,4,5,6,7,8,9,10,11,12,13]);
  assert.equal(r.gaps.length, 0);
  assert.equal(r.rating, "Critical");
  const g = releaseGate(r, good);
  assert.deepEqual(g.blocking, []);
});
t("good: no placeholder text anywhere", () => {
  const r = buildReport13(good);
  assert.ok(!JSON.stringify(r).includes("[Not provided"));
  assert.ok(!boardBrief(good).text.includes("[Not provided"));
});
t("good: net and gross variance shown, root cause grouped, limitation wording", () => {
  const r = buildReport13(good);
  const s5 = r.sections[4].paragraphs.join(" ");
  assert.match(s5, /net MYR 20, gross absolute MYR 80/);
  assert.match(r.sections[6].paragraphs[0], /^Process design:/);
  assert.match(r.sections[12].paragraphs.join(" "), /not expressed as a percentage/);
});
t("board brief: rating, top findings, asks, limitations", () => {
  const b = boardBrief(good);
  assert.equal(b.rating, "Critical");
  assert.ok(b.topFindings.length >= 1 && b.topFindings.length <= 5);
  assert.ok(b.topFindings[0].startsWith("F1"));
  assert.ok(b.asks.length > 0 && b.limitations.length > 0);
});

const bad = base([
  finding(1, { priorityBand: "Critical", evidenceTags: ["REP"], effect: "This is a Critical weakness with 99% confidence." }),
  finding(2, { owner: "", recommendation: "Do better." }),
]);
bad.summaryCounts = { Critical: 1, High: 0, Medium: 1, Low: 0, Unscored: 0 };

t("bad: severity cap applied and flagged", () => {
  const r = buildReport13(bad);
  assert.deepEqual(r.cappedCodes, ["F1"]);
  assert.match(JSON.stringify(r.sections[4]), /High \(pending fieldwork corroboration\)/);
  assert.equal(r.rating, "High");
});
t("bad: each issue caught by name", () => {
  const r = buildReport13(bad);
  const g = releaseGate(r, bad);
  const has = (re: RegExp) => assert.ok(g.blocking.some((b) => re.test(b)), `missing ${re}: ${g.blocking.join(" | ")}`);
  has(/GAP:.*F2\.owner/);
  has(/RECOMMENDATION: F2 has no owner/);
  has(/RECOMMENDATION: F2 has no measurable element/);
  has(/LINT \(confidence-percent\).*99% confidence/);
  has(/CAPPED-CRITICAL: F1/);
  has(/SUMMARY-TIE: summary shows 1 Critical, findings detail shows 0/);
  has(/SUMMARY-TIE: summary shows 0 High, findings detail shows 2/);
});
t("bad: missing field renders literal placeholder", () => {
  const r = buildReport13(bad);
  assert.ok(JSON.stringify(r).includes(NOT_PROVIDED));
});
t("warnings: long sentence and jargon", () => {
  const w = base([finding(1, { condition: `${"word ".repeat(31)}ends here. We must leverage tools.` })]);
  const g = releaseGate(buildReport13(w), w);
  assert.ok(g.warnings.some((x) => /31-word|3\d-word/.test(x)));
  assert.ok(g.warnings.some((x) => /jargon "leverage"/.test(x)));
  assert.deepEqual(g.blocking, []);
});
t("masking: global restricted terms removed from report and brief", () => {
  const m = base([finding(1, { condition: "Linked to Project Falcon and GIA-2026-SECRET-01." })]);
  const terms = ["Project Falcon", "GIA-2026-SECRET-01"];
  const r = buildReport13(m, { globalRestrictedTerms: terms });
  const s = JSON.stringify(r) + boardBrief(m, { globalRestrictedTerms: terms }).text;
  assert.ok(!s.includes("Falcon") && !s.includes("SECRET-01"));
  assert.ok(s.includes(MASK));
  assert.ok(JSON.stringify(buildReport13(m)).includes("Falcon"), "positive control: unmasked contains term");
});

const esText = (r: ReturnType<typeof buildReport13>) => r.sections[0].paragraphs.join("\n");
const dfText = (r: ReturnType<typeof buildReport13>) => r.sections[4].paragraphs.join("\n");
t("variance: net and gross print for a finding with amounts; nothing prints for a finding without (known positive and negative)", () => {
  const d = dfText(buildReport13(good));
  assert.match(d, /F1 Variance: net MYR 20, gross absolute MYR 80 over 2 lines\. Offsetting differences are present/);
  assert.ok(!/F2 Variance/.test(d), "F2 has no amounts, so no variance line");
  assert.ok(!/net 0\b|net MYR 0\b/.test(d), "no zero variance is shown");
  const empty = base([finding(3, { amounts: [] })]);
  assert.ok(!/Variance/.test(dfText(buildReport13(empty))), "empty amounts print nothing");
});
t("executive summary: plain-language opening with rating, counts, top finding, management ask and Board ask", () => {
  const r = buildReport13(good);
  const p = r.sections[0].paragraphs;
  assert.match(p[0], /^Overall rating: Critical\. Serious weaknesses need immediate action\.$/);
  assert.equal(p[1], "2 findings need management action, and 1 is High or above.");
  assert.equal(p[2], "The most significant finding is: Finding 1 title.");
  assert.match(p[3], /Management is asked to complete the 2 agreed actions by the due dates, from 2027-03-31 to 2027-03-31\./);
  assert.equal(p[4], "The Board or Audit Committee is asked to note this report.");
  assert.ok(!/decide/.test(esText(r)), "known negative: nothing overdue, so no decision is requested");
  assert.ok(r.sections[0].tables![0].headers[0] === "Band", "the opening sits before the tables and the band table stays first");
});
t("executive summary: an overdue Critical or High finding turns the Board ask into a decision", () => {
  const r = buildReport13(good, { asOf: "2028-01-01" });
  assert.match(r.sections[0].paragraphs[4], /asked to decide how to resolve 1 overdue Critical or High finding\./);
});
t("executive summary: legend gives score bands and all seven evidence tags", () => {
  const e = esText(buildReport13(good));
  assert.match(e, /Critical is 20 or more, High is 12 to 19, Medium is 6 to 11, and Low is 1 to 5/);
  for (const tag of ["INS", "PHY", "CON", "REP", "REC", "OBS", "ANA"]) assert.ok(e.includes(`[${tag}]`), `legend has ${tag}`);
});
t("executive summary: no findings reads plainly and the gate still passes its plain-language checks for well-formed data", () => {
  const none = base([]);
  const p = buildReport13(none).sections[0].paragraphs;
  assert.equal(p[1], "0 findings need management action, and 0 are High or above.");
  assert.equal(p[2], "No finding is recorded.");
  assert.deepEqual(releaseGate(buildReport13(good), good).warnings, []);
});
t("board brief carries the same opening", () => {
  const opening = buildReport13(good).sections[0].paragraphs.slice(0, 5);
  const b = boardBrief(good);
  for (const line of opening) assert.ok(b.paragraphs.includes(line) && b.text.includes(line), line);
  assert.ok(boardBrief(good, { asOf: "2028-01-01" }).text.includes("asked to decide"));
});
t("stored cap flag (known positive): sentence lists the ref with the wording; table and section 5 show it", () => {
  const f0 = good.findings[0];
  const inp = base([{ ...f0, priorityBand: "High", severityFlag: "pending fieldwork corroboration; original score 40 clamped to 19" }]);
  const r = buildReport13(inp);
  const s0 = r.sections[0];
  const line = s0.paragraphs.find((p) => p.includes("pending fieldwork corroboration"));
  assert.ok(line && line.includes(f0.code), String(line));
  assert.ok(!s0.paragraphs.includes("No finding has been held back by the severity cap."));
  assert.ok(s0.tables![1].rows.some((row) => row[2].includes("pending fieldwork corroboration")));
  assert.ok(JSON.stringify(r.sections[4]).includes("pending fieldwork corroboration"));
  assert.deepEqual(r.cappedCodes, [f0.code]);
});
t("stored cap flag (known negative): no flag keeps the no-held-back sentence", () => {
  const inp = base([{ ...good.findings[0], priorityBand: "High", severityFlag: null }]);
  const r = buildReport13(inp);
  assert.ok(r.sections[0].paragraphs.includes("No finding has been held back by the severity cap."));
  assert.deepEqual(r.cappedCodes, []);
});
console.log(`${pass} tests passed`);
