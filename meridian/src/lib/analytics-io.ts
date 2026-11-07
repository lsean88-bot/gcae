import ExcelJS from "exceljs";
import { parseCsv } from "@/lib/engine";
import type { Row } from "@/lib/analytics";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_ROWS = 500_000;
export const MAX_COLS = 16_384;
export const MAX_UNZIPPED_BYTES = 200 * 1024 * 1024;
export const MAX_ZIP_RATIO = 100;

/** Reads the zip central directory only (no inflate) and rejects zip bombs before ExcelJS loads anything. */
export function checkZipSize(bytes: Uint8Array): void {
  const bad = () => new Error("The file could not be read as an .xlsx workbook.");
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.byteLength - 22; i >= Math.max(0, bytes.byteLength - 22 - 65535); i -= 1) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw bad();
  const entries = dv.getUint16(eocd + 10, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  if (entries === 0xffff || cdOffset === 0xffffffff) throw new Error("Zip64 workbooks are not accepted.");
  let p = cdOffset;
  let total = 0;
  for (let n = 0; n < entries; n += 1) {
    if (p + 46 > bytes.byteLength || dv.getUint32(p, true) !== 0x02014b50) throw bad();
    const usize = dv.getUint32(p + 24, true);
    if (usize === 0xffffffff) throw new Error("Zip64 workbooks are not accepted.");
    total += usize;
    if (total > MAX_UNZIPPED_BYTES) throw new Error("The workbook expands to more than 200 MB and was refused.");
    p += 46 + dv.getUint16(p + 28, true) + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  if (total / Math.max(1, bytes.byteLength) > MAX_ZIP_RATIO) throw new Error("The workbook's compression ratio is above 100:1 and it was refused.");
}

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
  checkZipSize(bytes);
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
  if (width > MAX_COLS) throw new Error(`More than ${MAX_COLS} columns.`);
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
