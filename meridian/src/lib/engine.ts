import type { RowResult, TestWorkpaper } from "@/db/schema";

export type ProcedureId =
  | "dual_approval"
  | "duplicate_payment"
  | "inventory_recon"
  | "access_review"
  | "three_way_match"
  | "journal_entry";

export type Procedure = {
  id: ProcedureId;
  name: string;
  objective: string;
  criterion: string;
  columns: string[];
  sampleHeader: string;
  thresholds: { key: string; label: string; defaultValue: number; help: string }[];
  currency: string;
};

export const PROCEDURES: Procedure[] = [
  {
    id: "dual_approval",
    name: "Invoice dual approval",
    objective: "Confirm invoices above the approved threshold received two different approvals before payment.",
    criterion: "Company policy requires two different approvers before an invoice at or above the threshold is paid.",
    columns: ["invoice_id", "vendor", "amount", "currency", "approver_1", "approver_2", "payment_date"],
    sampleHeader: "invoice_id,vendor,amount,currency,approver_1,approver_2,payment_date",
    thresholds: [
      { key: "amount", label: "Approval threshold", defaultValue: 50000, help: "Invoices at or above this amount are in scope." },
    ],
    currency: "MYR",
  },
  {
    id: "duplicate_payment",
    name: "Duplicate payment candidates",
    objective: "Identify exact duplicate payment candidates for investigation. A candidate is not a confirmed duplicate or a fraud finding.",
    criterion: "The same vendor, invoice number, and amount should not be paid more than once.",
    columns: ["payment_id", "vendor", "invoice_number", "amount", "currency", "payment_date"],
    sampleHeader: "payment_id,vendor,invoice_number,amount,currency,payment_date",
    thresholds: [
      { key: "nearDays", label: "Near-match window (days)", defaultValue: 3, help: "Same vendor and amount inside this window is disclosed, not failed, unless the invoice number also matches." },
    ],
    currency: "MYR",
  },
  {
    id: "inventory_recon",
    name: "Inventory book-to-physical",
    objective: "Compare book quantity to the physical count and quantify the value of exceptions.",
    criterion: "A book-to-physical difference is an exception when quantity variance exceeds the approved percentage or the value exceeds the approved amount.",
    columns: ["item", "location", "book_qty", "physical_qty", "unit_cost"],
    sampleHeader: "item,location,book_qty,physical_qty,unit_cost",
    thresholds: [
      { key: "pct", label: "Quantity variance %", defaultValue: 2, help: "Absolute quantity variance divided by book quantity." },
      { key: "value", label: "Value threshold", defaultValue: 10000, help: "Absolute quantity difference times unit cost." },
    ],
    currency: "MYR",
  },
  {
    id: "access_review",
    name: "User access review",
    objective: "Test whether enabled accounts match current employment and approved access, including privileged access.",
    criterion: "A person who has left must not have an enabled account. Privileged access must be explicitly approved. Active access marked not approved is an exception.",
    columns: ["user_id", "name", "system", "role", "hr_status", "account_status", "privileged", "approved"],
    sampleHeader: "user_id,name,system,role,hr_status,account_status,privileged,approved",
    thresholds: [],
    currency: "MYR",
  },
  {
    id: "three_way_match",
    name: "Three-way match",
    objective: "Match purchase order, receipt, and invoice quantity and price before treating a payment as supported.",
    criterion: "Invoice quantity must not exceed receipt quantity. Invoice price must stay within the approved tolerance of the purchase-order price.",
    columns: ["invoice_id", "vendor", "po_qty", "po_price", "receipt_qty", "invoice_qty", "invoice_price"],
    sampleHeader: "invoice_id,vendor,po_qty,po_price,receipt_qty,invoice_qty,invoice_price",
    thresholds: [
      { key: "pricePct", label: "Price tolerance %", defaultValue: 2, help: "Absolute price difference divided by purchase-order price." },
    ],
    currency: "MYR",
  },
  {
    id: "journal_entry",
    name: "Journal-entry exceptions",
    objective: "Flag journal entries that breach segregation of duties or lack support. These are exceptions, not fraud conclusions.",
    criterion: "Preparer and approver must be different people. A large round-amount entry needs a description. A weekend entry above the threshold needs review.",
    columns: ["je_id", "posted_on", "preparer", "approver", "amount", "currency", "description"],
    sampleHeader: "je_id,posted_on,preparer,approver,amount,currency,description",
    thresholds: [
      { key: "roundAmount", label: "Round-amount threshold", defaultValue: 10000, help: "Round amounts at or above this value need a description of at least 12 characters." },
      { key: "weekendAmount", label: "Weekend threshold", defaultValue: 25000, help: "Saturday or Sunday postings at or above this value are exceptions." },
    ],
    currency: "MYR",
  },
];

export function procedureById(id: string) {
  return PROCEDURES.find((item) => item.id === id);
}

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const cleaned = text.replace(/^\uFEFF/, "").trim();
  if (!cleaned) return { headers: [], rows: [] };
  const lines = splitLines(cleaned).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = splitRow(lines[0]).map((h) => h.trim().toLowerCase());
  const rows = lines.slice(1).map((line) => {
    const cells = splitRow(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = (cells[index] ?? "").trim();
    });
    return row;
  });
  return { headers, rows };
}

function splitLines(text: string) {
  return text.split(/\r?\n/);
}

function splitRow(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function num(value?: string) {
  if (!value) return null;
  const parsed = Number(value.replace(/,/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function blank(value?: string) {
  return !value || !value.trim();
}

function samePerson(a?: string, b?: string) {
  if (blank(a) || blank(b)) return false;
  return a!.trim().toLowerCase() === b!.trim().toLowerCase();
}

function yn(value?: string) {
  const v = (value || "").trim().toLowerCase();
  if (["y", "yes", "true", "1", "approved"].includes(v)) return "yes";
  if (["n", "no", "false", "0", "not approved"].includes(v)) return "no";
  return "";
}

export type Execution = {
  result: "PASS" | "FAIL_EXCEPTION" | "UNABLE_TO_CONCLUDE" | "NOT_APPLICABLE";
  populationCount: number;
  recordsTested: number;
  passed: number;
  failed: number;
  unable: number;
  notApplicable: number;
  exposure: number | null;
  currency: string;
  limitations: string[];
  workpaper: TestWorkpaper;
  missingColumns: string[];
};

export function executeProcedure(
  procedureId: string,
  csv: string,
  thresholds: Record<string, number>,
): Execution {
  const procedure = procedureById(procedureId);
  if (!procedure) {
    throw new Error("Unknown procedure.");
  }
  const parsed = parseCsv(csv);
  const missingColumns = procedure.columns.filter((column) => !parsed.headers.includes(column));
  const limitations: string[] = [];
  if (missingColumns.length) {
    limitations.push(`The extract is missing required columns: ${missingColumns.join(", ")}.`);
  }
  if (parsed.rows.length === 0) {
    limitations.push("The extract has no data rows. The test was not run.");
  }
  const currency = procedure.currency;
  const rowResults: RowResult[] = missingColumns.length
    ? []
    : parsed.rows.map((row, index) => evaluateRow(procedure.id, row, thresholds, index));

  const passed = rowResults.filter((row) => row.outcome === "Pass").length;
  const failed = rowResults.filter((row) => row.outcome === "Fail / Exception").length;
  const unable = rowResults.filter((row) => row.outcome === "Unable to conclude").length;
  const notApplicable = rowResults.filter((row) => row.outcome === "Not applicable").length;
  const exposureValues = rowResults
    .filter((row) => row.outcome === "Fail / Exception" && row.amount != null)
    .map((row) => Math.abs(row.amount || 0));
  const exposure = exposureValues.length ? Math.round(exposureValues.reduce((sum, value) => sum + value, 0)) : null;

  if (unable > 0) {
    limitations.push(
      `${unable} record${unable === 1 ? "" : "s"} could not be concluded. Those gaps are not counted as failures and they are not reassurance.`,
    );
  }
  if (parsed.rows.length > 0 && missingColumns.length === 0) {
    limitations.push("The result covers the records in this extract only. It does not, by itself, prove the extract is the complete population.");
  }

  let result: Execution["result"] = "PASS";
  if (missingColumns.length || parsed.rows.length === 0) result = "UNABLE_TO_CONCLUDE";
  else if (failed > 0) result = "FAIL_EXCEPTION";
  else if (unable > 0) result = "UNABLE_TO_CONCLUDE";
  else if (passed === 0 && notApplicable === parsed.rows.length) result = "NOT_APPLICABLE";
  else result = "PASS";

  const narrative = buildNarrative(procedure, result, parsed.rows.length, passed, failed, unable, notApplicable, exposure, currency);

  return {
    result,
    populationCount: parsed.rows.length,
    recordsTested: missingColumns.length ? 0 : parsed.rows.length,
    passed,
    failed,
    unable,
    notApplicable,
    exposure,
    currency,
    limitations,
    missingColumns,
    workpaper: {
      procedureName: procedure.name,
      criterion: procedure.criterion,
      steps: [
        "Read the registered extract. Do not alter source cells.",
        "Confirm the approved threshold and parameter set.",
        "Apply the criterion to every row.",
        "Classify each row as Pass, Fail / Exception, Unable to conclude, or Not applicable.",
        "Sum supportable exposure on exceptions only.",
        "Disclose population completeness as a limitation unless an independent population count was tied out.",
      ],
      rowResults,
      passed,
      failed,
      unable,
      notApplicable,
      exposure,
      currency,
      narrative,
      limitations,
      fraudNote:
        "Exceptions and indicators do not establish fraud, misconduct, or intent. A fraud conclusion needs corroborated evidence and a human decision against the applicable standard of proof.",
    },
  };
}

function evaluateRow(
  procedure: ProcedureId,
  row: Record<string, string>,
  thresholds: Record<string, number>,
  index: number,
): RowResult {
  if (procedure === "dual_approval") return evalDual(row, thresholds, index);
  if (procedure === "duplicate_payment") return evalDuplicate(row, index);
  if (procedure === "inventory_recon") return evalInventory(row, thresholds, index);
  if (procedure === "access_review") return evalAccess(row, index);
  if (procedure === "three_way_match") return evalMatch(row, thresholds, index);
  return evalJournal(row, thresholds, index);
}

function evalDual(row: Record<string, string>, thresholds: Record<string, number>, index: number): RowResult {
  const key = row.invoice_id || `row-${index + 1}`;
  const amount = num(row.amount);
  const threshold = thresholds.amount ?? 50000;
  if (amount == null) {
    return { key, outcome: "Unable to conclude", reason: "Amount is missing, so the threshold test cannot be applied.", amount: null, fields: row };
  }
  if (amount < threshold) {
    return { key, outcome: "Not applicable", reason: `Amount is below the approved threshold of ${threshold}.`, amount, fields: row };
  }
  if (blank(row.approver_1) || blank(row.approver_2)) {
    return { key, outcome: "Fail / Exception", reason: "In-scope invoice was paid without two recorded approvals.", amount, fields: row };
  }
  if (samePerson(row.approver_1, row.approver_2)) {
    return { key, outcome: "Fail / Exception", reason: "Both approval fields are the same person, so independent review is not evidenced.", amount, fields: row };
  }
  return { key, outcome: "Pass", reason: "Two different approvers are recorded before payment.", amount, fields: row };
}

function evalDuplicate(row: Record<string, string>, index: number): RowResult {
  const key = row.payment_id || `row-${index + 1}`;
  const amount = num(row.amount);
  if (blank(row.vendor) || blank(row.invoice_number) || amount == null) {
    return { key, outcome: "Unable to conclude", reason: "Vendor, invoice number, or amount is missing.", amount, fields: row };
  }
  return { key, outcome: "Pass", reason: "Pending group evaluation.", amount, fields: row };
}

export function finalizeDuplicates(execution: Execution, rows: Record<string, string>[]) {
  if (execution.workpaper.procedureName !== "Duplicate payment candidates") return execution;
  const groups = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const amount = num(row.amount);
    if (blank(row.vendor) || blank(row.invoice_number) || amount == null) return;
    const group = `${row.vendor.trim().toLowerCase()}|${row.invoice_number.trim().toLowerCase()}|${amount}`;
    const list = groups.get(group) || [];
    list.push(index);
    groups.set(group, list);
  });
  const extraIndexes = new Set<number>();
  const flagged = new Set<number>();
  groups.forEach((indexes) => {
    if (indexes.length > 1) {
      indexes.forEach((index, position) => {
        flagged.add(index);
        if (position > 0) extraIndexes.add(index);
      });
    }
  });
  execution.workpaper.rowResults = execution.workpaper.rowResults.map((row, index) => {
    if (row.outcome === "Unable to conclude") return row;
    if (flagged.has(index)) {
      return {
        ...row,
        outcome: "Fail / Exception",
        amount: extraIndexes.has(index) ? row.amount : 0,
        reason: extraIndexes.has(index)
          ? "Repeat payment line for the same vendor, invoice number, and amount. Counted once as a candidate overpayment, not as a confirmed loss or a fraud finding."
          : "This line matches a later payment on vendor, invoice number, and amount. The candidate amount is counted on the later line so it is not double-counted.",
      };
    }
    return { ...row, reason: "No exact vendor, invoice, and amount match in this extract." };
  });
  const near = findNearMatches(rows);
  if (near.length) {
    execution.limitations.push(
      `Near matches (same vendor and amount, different invoice, within the review window) are disclosed and are not failed: ${near.join("; ")}.`,
    );
    execution.workpaper.limitations = execution.limitations;
  }
  return recount(execution);
}

function findNearMatches(rows: Record<string, string>[]) {
  const notes: string[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i];
      const b = rows[j];
      if (blank(a.vendor) || a.vendor.trim().toLowerCase() !== b.vendor.trim().toLowerCase()) continue;
      const amountA = num(a.amount);
      const amountB = num(b.amount);
      if (amountA == null || amountA !== amountB) continue;
      if ((a.invoice_number || "").trim().toLowerCase() === (b.invoice_number || "").trim().toLowerCase()) continue;
      const days = dateGap(a.payment_date, b.payment_date);
      if (days != null && days <= 3) {
        notes.push(`${a.payment_id || i} and ${b.payment_id || j}`);
      }
    }
  }
  return notes;
}

function dateGap(a?: string, b?: string) {
  if (!a || !b) return null;
  const da = parseLocal(a);
  const db = parseLocal(b);
  if (!da || !db) return null;
  return Math.abs(Math.round((da.getTime() - db.getTime()) / 86_400_000));
}

function parseLocal(value: string) {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function evalInventory(row: Record<string, string>, thresholds: Record<string, number>, index: number): RowResult {
  const key = row.item || `row-${index + 1}`;
  const book = num(row.book_qty);
  const physical = num(row.physical_qty);
  const cost = num(row.unit_cost);
  if (book == null || physical == null || cost == null) {
    return { key, outcome: "Unable to conclude", reason: "Book quantity, physical quantity, or unit cost is missing.", amount: null, fields: row };
  }
  const qtyDiff = physical - book;
  const pct = book === 0 ? (qtyDiff === 0 ? 0 : 100) : (Math.abs(qtyDiff) / Math.abs(book)) * 100;
  const value = Math.abs(qtyDiff) * cost;
  const pctLimit = thresholds.pct ?? 2;
  const valueLimit = thresholds.value ?? 10000;
  if (pct > pctLimit || value > valueLimit) {
    return {
      key,
      outcome: "Fail / Exception",
      reason: `Quantity variance ${pct.toFixed(1)}% and value difference ${Math.round(value).toLocaleString("en-MY")} exceed the approved limit.`,
      amount: Math.round(value),
      fields: row,
    };
  }
  return { key, outcome: "Pass", reason: `Variance ${pct.toFixed(1)}% is within both approved limits.`, amount: Math.round(value), fields: row };
}

function evalAccess(row: Record<string, string>, index: number): RowResult {
  const key = row.user_id || row.name || `row-${index + 1}`;
  const hr = (row.hr_status || "").trim().toLowerCase();
  const account = (row.account_status || "").trim().toLowerCase();
  const privileged = yn(row.privileged);
  const approved = yn(row.approved);
  if (!hr || !account) {
    return { key, outcome: "Unable to conclude", reason: "HR status or account status is missing.", amount: null, fields: row };
  }
  if ((hr === "left" || hr === "terminated") && (account === "enabled" || account === "active")) {
    return { key, outcome: "Fail / Exception", reason: "HR records this person as having left, but the account is still enabled.", amount: null, fields: row };
  }
  if (privileged === "") {
    return { key, outcome: "Unable to conclude", reason: "Privileged flag is blank, so the privileged-access criterion cannot be applied.", amount: null, fields: row };
  }
  if (privileged === "yes" && approved !== "yes") {
    return { key, outcome: "Fail / Exception", reason: "Privileged access is not explicitly approved.", amount: null, fields: row };
  }
  if (approved === "") {
    return { key, outcome: "Unable to conclude", reason: "Approval flag is blank.", amount: null, fields: row };
  }
  if (account === "enabled" && approved === "no") {
    return { key, outcome: "Fail / Exception", reason: "Enabled account is marked not approved.", amount: null, fields: row };
  }
  return { key, outcome: "Pass", reason: "Account status is consistent with HR status and the approval flag.", amount: null, fields: row };
}

function evalMatch(row: Record<string, string>, thresholds: Record<string, number>, index: number): RowResult {
  const key = row.invoice_id || `row-${index + 1}`;
  const poQty = num(row.po_qty);
  const poPrice = num(row.po_price);
  const receipt = num(row.receipt_qty);
  const invoiceQty = num(row.invoice_qty);
  const invoicePrice = num(row.invoice_price);
  if (poQty == null || poPrice == null || invoiceQty == null || invoicePrice == null) {
    return { key, outcome: "Unable to conclude", reason: "Purchase-order or invoice quantity or price is missing.", amount: null, fields: row };
  }
  if (receipt == null) {
    return { key, outcome: "Unable to conclude", reason: "Goods receipt quantity is missing, so the match cannot be completed.", amount: Math.round(invoiceQty * invoicePrice), fields: row };
  }
  const pricePct = poPrice === 0 ? 0 : (Math.abs(invoicePrice - poPrice) / Math.abs(poPrice)) * 100;
  const tolerance = thresholds.pricePct ?? 2;
  const amount = Math.round(invoiceQty * invoicePrice);
  if (invoiceQty > receipt) {
    return { key, outcome: "Fail / Exception", reason: "Invoice quantity exceeds the goods receipt.", amount, fields: row };
  }
  if (pricePct > tolerance) {
    return { key, outcome: "Fail / Exception", reason: `Invoice price differs from the purchase order by ${pricePct.toFixed(1)}%, above the ${tolerance}% tolerance.`, amount, fields: row };
  }
  return { key, outcome: "Pass", reason: "Quantity does not exceed the receipt and price is within tolerance.", amount, fields: row };
}

function evalJournal(row: Record<string, string>, thresholds: Record<string, number>, index: number): RowResult {
  const key = row.je_id || `row-${index + 1}`;
  const amount = num(row.amount);
  if (amount == null || blank(row.posted_on) || blank(row.preparer) || blank(row.approver)) {
    return { key, outcome: "Unable to conclude", reason: "Amount, date, preparer, or approver is missing.", amount, fields: row };
  }
  if (samePerson(row.preparer, row.approver)) {
    return { key, outcome: "Fail / Exception", reason: "Preparer and approver are the same person.", amount, fields: row };
  }
  const posted = parseLocal(row.posted_on);
  const weekend = !!posted && (posted.getDay() === 0 || posted.getDay() === 6);
  const weekendLimit = thresholds.weekendAmount ?? 25000;
  if (weekend && Math.abs(amount) >= weekendLimit) {
    return { key, outcome: "Fail / Exception", reason: "Posted on a weekend at or above the review threshold.", amount, fields: row };
  }
  const roundLimit = thresholds.roundAmount ?? 10000;
  const round = Math.abs(amount) >= roundLimit && Math.abs(amount) % 1000 === 0;
  if (round && (row.description || "").trim().length < 12) {
    return { key, outcome: "Fail / Exception", reason: "Large round amount without a usable description. This is an evidence exception, not a fraud conclusion.", amount, fields: row };
  }
  return { key, outcome: "Pass", reason: "Segregation of duties is evidenced and the entry is not an unsupported round or weekend exception.", amount, fields: row };
}

function recount(execution: Execution): Execution {
  const rows = execution.workpaper.rowResults;
  const passed = rows.filter((row) => row.outcome === "Pass").length;
  const failed = rows.filter((row) => row.outcome === "Fail / Exception").length;
  const unable = rows.filter((row) => row.outcome === "Unable to conclude").length;
  const notApplicable = rows.filter((row) => row.outcome === "Not applicable").length;
  const exposureValues = rows.filter((row) => row.outcome === "Fail / Exception" && row.amount != null).map((row) => Math.abs(row.amount || 0));
  const exposure = exposureValues.length ? Math.round(exposureValues.reduce((sum, value) => sum + value, 0)) : null;
  let result: Execution["result"] = "PASS";
  if (failed > 0) result = "FAIL_EXCEPTION";
  else if (unable > 0 || rows.length === 0) result = "UNABLE_TO_CONCLUDE";
  else if (passed === 0 && notApplicable === rows.length) result = "NOT_APPLICABLE";
  execution.passed = passed;
  execution.failed = failed;
  execution.unable = unable;
  execution.notApplicable = notApplicable;
  execution.exposure = exposure;
  execution.result = result;
  execution.recordsTested = rows.length;
  execution.populationCount = rows.length;
  execution.workpaper.passed = passed;
  execution.workpaper.failed = failed;
  execution.workpaper.unable = unable;
  execution.workpaper.notApplicable = notApplicable;
  execution.workpaper.exposure = exposure;
  execution.workpaper.narrative = buildNarrative(
    { name: execution.workpaper.procedureName },
    result,
    rows.length,
    passed,
    failed,
    unable,
    notApplicable,
    exposure,
    execution.currency,
  );
  return execution;
}

function buildNarrative(
  procedure: { name: string },
  result: Execution["result"],
  population: number,
  passed: number,
  failed: number,
  unable: number,
  notApplicable: number,
  exposure: number | null,
  currency: string,
) {
  const resultText =
    result === "PASS"
      ? "No exception was identified in the records tested."
      : result === "FAIL_EXCEPTION"
        ? "The test identified one or more exceptions."
        : result === "NOT_APPLICABLE"
          ? "None of the records were in scope of the criterion."
          : "The test cannot support a pass or a confirmed exception on the full extract.";
  const exposureText =
    exposure == null ? "No supportable exception amount was calculated." : `Supportable exception amount in this extract: ${currency} ${exposure.toLocaleString("en-MY")}.`;
  return `${procedure.name} was applied to ${population} record${population === 1 ? "" : "s"}. ${passed} passed, ${failed} failed, ${unable} could not be concluded, and ${notApplicable} were not applicable. ${resultText} ${exposureText}`;
}

export function runProcedure(procedureId: string, csv: string, thresholds: Record<string, number>) {
  const execution = executeProcedure(procedureId, csv, thresholds);
  if (procedureId === "duplicate_payment") {
    const parsed = parseCsv(csv);
    return finalizeDuplicates(execution, parsed.rows);
  }
  return execution;
}

export function compareReperformance(
  first: { result: string; failed: number; unable: number; exposure: number | null },
  second: { result: string; failed: number; unable: number; exposure: number | null },
) {
  const differences: string[] = [];
  if (first.result !== second.result) differences.push(`Result differs: first ${first.result}, re-performance ${second.result}.`);
  if (first.failed !== second.failed) differences.push(`Exception count differs: first ${first.failed}, re-performance ${second.failed}.`);
  if (first.unable !== second.unable) differences.push(`Unable-to-conclude count differs: first ${first.unable}, re-performance ${second.unable}.`);
  if ((first.exposure || 0) !== (second.exposure || 0)) {
    differences.push(`Exposure differs: first ${first.exposure ?? 0}, re-performance ${second.exposure ?? 0}.`);
  }
  return {
    match: differences.length === 0,
    differences,
    independentResult: second.result,
    note: "QA recalculated from the registered extract and the stored thresholds. The first conclusion was compared only after the recalculation.",
  };
}

export function resultLabel(result: string) {
  if (result === "PASS") return "Pass";
  if (result === "FAIL_EXCEPTION") return "Fail / Exception";
  if (result === "NOT_APPLICABLE") return "Not applicable";
  return "Unable to conclude";
}
