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
console.log(`${pass} tests passed`);
