import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import JSZip from "jszip";
import { SECTION_TITLES, boardBrief, buildReport13, type Report13Input, type R13Finding } from "../src/lib/report13";
import { renderBoardBriefDocx, renderReport13Docx } from "../src/lib/report13-docx";

let pass = 0;
async function t(name: string, fn: () => Promise<void>) {
  await fn();
  pass++;
  console.log(`ok - ${name}`);
}

const finding = (n: number, over: Partial<R13Finding> = {}): R13Finding => ({
  id: `f${n}`, code: `F${n}`, title: `Finding ${n} title`, priorityBand: "High", priorityScore: 10 + n,
  condition: `Condition text ${n}.`, criteria: `Policy section ${n} requires a second approver.`,
  cause: `Approval step was not built into the workflow ${n}.`, effect: `Unapproved payments may pass unnoticed ${n}.`,
  recommendation: `Implement a second approver on all payments above 5,000 ${n}.`, owner: "Finance Manager", dueDate: "2027-03-31",
  evidenceTags: ["INS", "REC"], workpaperRef: `WP-${n}`, rootCauseClass: "Process design", managementResponse: `Management agrees with finding ${n}.`, ...over,
});
const fs = [finding(1, { priorityBand: "Critical" }), finding(2, { priorityBand: "Medium" })];
const input: Report13Input = {
  title: "Payments audit", code: "GIA-2026-TEST-PAY-01", period: "Jan to Jun 2026", entityName: "Test Sdn Bhd",
  objective: "Confirm that payments are approved.", scope: "Payments in the period.", businessContext: "The entity pays suppliers monthly.",
  limitations: "Bank confirmations were not requested.", audience: "Audit Committee", materialityApproved: true, gcaeApproved: false,
  findings: fs,
  actions: fs.map((f) => ({ id: `a-${f.id}`, findingId: f.id, agreedAction: `Add approver step for ${f.code}`, ownerName: "Finance Manager", originalDue: "2027-03-31", status: "Open", evidenceRequired: "Screenshot", validationStatus: "Pending", percentComplete: 0 })),
  tests: [{ id: "T1", procedure: "Re-performed approval check", result: "2 exceptions", populationCount: 400, recordsTested: 40, exceptionsCount: 2, limitations: null, evidenceTags: ["REC"] }],
  risks: fs.map((f) => ({ id: `r${f.id}`, findingCode: f.code, name: "Payment error risk", rating: "High" })),
  controls: fs.map((f) => ({ id: `c${f.id}`, findingCode: f.code, name: "Payment approval", design: "Effective", operating: "Ineffective" })),
};
const report = buildReport13(input);
const brief = boardBrief(input);
const meta = (status: "Draft" | "Reviewed" | "Final") => ({ entity: "Test Sdn Bhd", status, version: "v1", generatedAt: "2026-11-07" });

async function xml(buf: Buffer, part = "word/document.xml") {
  return (await JSZip.loadAsync(buf)).file(part)!.async("string");
}
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

(async () => {
  const draft = await renderReport13Docx(report, meta("Draft"));
  if (process.env.SAMPLE_OUT) writeFileSync(process.env.SAMPLE_OUT, draft);

  await t("zip signature", async () => assert.equal(draft.subarray(0, 2).toString(), "PK"));
  await t("document.xml has all 13 titles", async () => {
    const x = decode(await xml(draft));
    SECTION_TITLES.forEach((s, i) => assert.ok(x.includes(`${i + 1}. ${s}`), `missing ${s}`));
  });
  await t("draft header carries DRAFT notice and entity; footer has page fields", async () => {
    const h = decode(await xml(draft, "word/header1.xml"));
    assert.ok(h.includes("DRAFT – not for issue") && h.includes("Test Sdn Bhd") && h.includes("Draft"));
    const f = await xml(draft, "word/footer1.xml");
    assert.ok(/PAGE/.test(f) && /NUMPAGES/.test(f) && f.includes("Page "));
  });
  await t("every row is cantSplit; header rows repeat; fills are 6-digit hex", async () => {
    const x = await xml(draft);
    const rows = x.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || [];
    assert.ok(rows.length > 5);
    rows.forEach((r) => assert.ok(r.includes("<w:cantSplit/>") || /<w:cantSplit w:val="(true|1)"\/>/.test(r), "row without cantSplit"));
    assert.ok(x.includes("<w:tblHeader"));
    (x.match(/w:fill="([^"]*)"/g) || []).forEach((m) => assert.match(m, /w:fill="[0-9A-Fa-f]{6}"/));
  });
  await t("Final status drops the DRAFT notice", async () => {
    const fin = await renderReport13Docx(report, meta("Final"));
    const h = decode(await xml(fin, "word/header1.xml"));
    assert.ok(!h.includes("DRAFT – not for issue") && h.includes("Final"));
  });
  await t("board note renders with its sections and notice", async () => {
    const b = await renderBoardBriefDocx(brief, meta("Reviewed"));
    assert.equal(b.subarray(0, 2).toString(), "PK");
    const x = decode(await xml(b));
    ["Top findings", "Decisions or asks", "Limitations"].forEach((s) => assert.ok(x.includes(s)));
    assert.ok(decode(await xml(b, "word/header1.xml")).includes("DRAFT – not for issue"));
    (x.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []).forEach((r) => assert.ok(r.includes("<w:cantSplit")));
  });
  await t("empty meta never prints undefined or null", async () => {
  const empty = { entity: "Test Sdn Bhd" } as unknown as Parameters<typeof renderReport13Docx>[1];
  for (const buf of [await renderReport13Docx(report, empty), await renderBoardBriefDocx(brief, empty)]) {
    const x = await xml(buf);
    assert.ok(!/undefined|null/i.test(x), "word/document.xml contains undefined/null");
    assert.ok(decode(x).includes("[Not provided – required before issue]"));
    assert.ok(decode(x).includes("Draft"));
  }
});
console.log(`\n${pass} tests passed`);
})().catch((e) => { console.error(e); process.exit(1); });
