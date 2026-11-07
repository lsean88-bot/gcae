import assert from "node:assert/strict";
import { checkRewrite, draftNarrative, type AiDrafter } from "../src/server/report13-ai";
import { compatibleConfig } from "../src/lib/ai";
import type { Report13 } from "../src/lib/report13";

let pass = 0;
async function t(name: string, fn: () => void | Promise<void>) { await fn(); pass++; console.log(`ok - ${name}`); }

const source = "This report covers Test Sdn Bhd for Jan to Jun 2026. 2 findings are recorded.\n\nOverall rating: Critical. One finding is rated High and needs a second approver above 5,000.";
const report: Report13 = {
  sections: [
    { number: 1, title: "Executive Summary", paragraphs: source.split("\n\n"), tables: [{ headers: ["Band", "Findings"], rows: [["High", "1"]] }] },
    { number: 7, title: "Root Cause", paragraphs: ["Process design: F1 Approval step was not built into the workflow."] },
  ],
  gaps: [], rating: "Critical", counts: {}, cappedCodes: [],
};
const fake = (text: string): AiDrafter => ({ name: "fake-model", complete: async () => ({ ok: true, text }) });

(async () => {
  await t("(a) clean rewrite is accepted (leading MODEL DRAFT line stripped)", () => {
    const r = checkRewrite(source, "MODEL DRAFT — NOT AN ISSUED OPINION.\nThis report covers Test Sdn Bhd for Jan to Jun 2026 and records 2 findings.\n\nThe overall rating is Critical. One finding is rated High and needs a second approver above 5,000.");
    assert.equal(r.ok, true);
    assert.ok(r.ok && !r.text.includes("MODEL DRAFT"));
  });
  await t("(b) a new number is rejected", () => {
    const r = checkRewrite(source, "This report covers Test Sdn Bhd. 3 findings are recorded. Critical. High. 5,000.");
    assert.equal(r.ok, false);
    assert.ok(!r.ok && /new number/.test(r.reason) && r.reason.includes("3"));
  });
  await t("(c) '99% confidence' is rejected by the lint check", () => {
    const r = checkRewrite(source, "This report covers Test Sdn Bhd for Jan to Jun 2026 with 99% confidence. 2 findings. Critical. High. 5,000.");
    assert.equal(r.ok, false);
    assert.ok(!r.ok && r.reason.startsWith("lint"));
  });
  await t("(c2) numeric confidence is still rejected when the number is already in the source (lint, not number check)", () => {
    const r = checkRewrite(`${source} Sample size 99.`, "Covers Test Sdn Bhd Jan to Jun 2026, 2 findings, Critical, High, 5,000, with 99% confidence. Sample size 99.");
    assert.ok(!r.ok && r.reason.startsWith("lint"));
  });
  await t("(d) High changed to Critical is rejected", () => {
    const r = checkRewrite(source, "This report covers Test Sdn Bhd for Jan to Jun 2026. 2 findings are recorded.\n\nOverall rating: Critical. One finding is rated Critical and needs a second approver above 5,000.");
    assert.equal(r.ok, false);
    assert.ok(!r.ok && /severity/.test(r.reason));
  });
  await t("empty output is rejected", () => assert.equal(checkRewrite(source, "  \n").ok, false));
  await t("draftNarrative: clean model rewrites sections 1 and 7, labels them, keeps the tables", async () => {
    const d = await draftNarrative(report, fake("Reworded text. Critical. High. 2 findings. 2026. 5,000."));
    assert.deepEqual(d.accepted, [1]);
    assert.deepEqual(d.rejected.map((r) => r.section), [7]);
    assert.ok(d.report.sections[0].paragraphs[0].startsWith("AI-assisted (local model: fake-model)"));
    assert.equal(d.report.sections[0].tables?.[0].rows[0][0], "High");
  });
  await t("draftNarrative: failed checks keep template text and record why; model error keeps template", async () => {
    const d = await draftNarrative(report, fake("New figure 77 here."));
    assert.deepEqual(d.accepted, []);
    assert.equal(d.rejected.length, 2);
    assert.deepEqual(d.report.sections, report.sections);
    const e = await draftNarrative(report, { name: "x", complete: async () => { throw new Error("offline"); } });
    assert.deepEqual(e.report.sections, report.sections);
    assert.ok(e.rejected[0].reason.includes("offline"));
  });
  await t("compatibleConfig: key-less local URL accepted and flagged localOnly; remote needs a key; look-alike hosts are not local", () => {
    const keep = { b: process.env.AI_BASE_URL, k: process.env.AI_API_KEY };
    delete process.env.AI_API_KEY;
    const cases: [string, boolean, boolean][] = [
      ["http://127.0.0.1:11434/v1", true, true], ["http://localhost:11434/v1", true, true], ["http://[::1]:11434/v1", true, true], ["http://[::2]:11434/v1", false, false],
      ["https://api.example.com/v1", false, false], ["http://localhost.evil.com/v1", false, false], ["http://127.0.0.1@evil.com/v1", false, false],
    ];
    for (const [url, configured, local] of cases) { process.env.AI_BASE_URL = url; assert.deepEqual(compatibleConfig(), { configured, localOnly: local }, url); }
    process.env.AI_BASE_URL = "https://api.example.com/v1"; process.env.AI_API_KEY = "k";
    assert.deepEqual(compatibleConfig(), { configured: true, localOnly: false });
    if (keep.b === undefined) delete process.env.AI_BASE_URL; else process.env.AI_BASE_URL = keep.b;
    if (keep.k === undefined) delete process.env.AI_API_KEY; else process.env.AI_API_KEY = keep.k;
  });
  console.log(`${pass} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
