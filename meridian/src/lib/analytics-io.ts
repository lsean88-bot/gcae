import ExcelJS from "exceljs";
import { parseCsv } from "@/lib/engine";
import type { Row } from "@/lib/analytics";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_ROWS = 500_000;

export type Parsed = { headers: string[]; rows: Row[]; sheetNames: string[]; sheet: string | null; kind: "csv" | "xlsx" };

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    const iso = v.toISOString();
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("error" in o && typeof o.error === "string") return o.error; // #REF!, #DIV/0! ... kept literal
    if ("result" in o) return cellText(o.result); // data-only: cached formula result, never the formula
    if ("formula" in o || "sharedFormula" in o) return "";
    if (Array.isArray(o.richText)) return o.richText.map((r) => String((r as { text?: unknown }).text ?? "")).join("").trim();
    if ("text" in o) return cellText(o.text);
    return "";
  }
  return String(v).trim();
}

/** CSV via the engine's parseCsv (headers lower-cased). XLSX data-only, first sheet unless one is named. Max 20 MB. */
export async function parseUpload(filename: string, bytes: Uint8Array, sheet?: string | null): Promise<Parsed> {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new Error("File is larger than 20 MB.");
  if (bytes.byteLength === 0) throw new Error("File is empty.");
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) {
    const { headers, rows } = parseCsv(Buffer.from(bytes).toString("utf8"));
    if (!headers.length) throw new Error("The CSV has no header row.");
    if (rows.length > MAX_ROWS) throw new Error(`More than ${MAX_ROWS} rows.`);
    return { headers, rows, sheetNames: [], sheet: null, kind: "csv" };
  }
  if (!lower.endsWith(".xlsx")) throw new Error("Only .csv and .xlsx files are accepted.");
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  } catch {
    throw new Error("The file could not be read as an .xlsx workbook.");
  }
  const sheetNames = wb.worksheets.map((w) => w.name);
  const ws = sheet ? wb.getWorksheet(sheet) : wb.worksheets[0];
  if (!ws) throw new Error(sheet ? `Sheet not found: ${sheet}` : "The workbook has no sheets.");
  if (ws.rowCount - 1 > MAX_ROWS) throw new Error(`More than ${MAX_ROWS} rows.`);
  const width = ws.columnCount;
  const seen = new Map<string, number>();
  const headers: string[] = [];
  const head = ws.getRow(1);
  for (let c = 1; c <= width; c += 1) {
    let h = cellText(head.getCell(c).value).toLowerCase() || `col_${c}`;
    const n = seen.get(h) ?? 0;
    seen.set(h, n + 1);
    if (n) h = `${h}_${n + 1}`;
    headers.push(h);
  }
  if (!headers.length) throw new Error("The sheet has no header row.");
  const rows: Row[] = [];
  for (let r = 2; r <= ws.rowCount; r += 1) {
    const src = ws.getRow(r);
    const row: Row = {};
    let any = false;
    headers.forEach((h, i) => {
      const t = cellText(src.getCell(i + 1).value);
      if (t) any = true;
      row[h] = t;
    });
    if (any) rows.push(row);
  }
  return { headers, rows, sheetNames, sheet: ws.name, kind: "xlsx" };
}
