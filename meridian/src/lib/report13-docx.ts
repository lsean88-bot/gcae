/**
 * Pure DOCX renderers for the 13-section report and the Board note. No database, no network.
 * Plain professional layout, Calibri 11pt. Every table row is cantSplit, header rows repeat,
 * shading fills are strict 6-digit hex (CLAUDE.md 7.3). Callers must mask restricted terms first.
 */
import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, LevelFormat, Packer, PageNumber,
  Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import type { BoardBrief, Report13, R13Table } from "@/lib/report13";

export type DocxMeta = { entity: string; status: "Draft" | "Reviewed" | "Final"; version: string | number; generatedAt: string };

const FONT = "Calibri";
const WIDTH = 9026; // A4 with 1 inch margins, in DXA
const HEAD_FILL = "D9E2F3";
const LABEL_FILL = "F2F2F2";
const border = { style: BorderStyle.SINGLE, size: 4, color: "999999" };
const borders = { top: border, bottom: border, left: border, right: border };

const run = (text: string, o: { bold?: boolean; size?: number; color?: string } = {}) => new TextRun({ text, font: FONT, size: o.size ?? 22, bold: o.bold, color: o.color });
const para = (text: string, o: { bold?: boolean; size?: number; after?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
  new Paragraph({ alignment: o.align, spacing: { after: o.after ?? 120 }, children: [run(text, o)] });
const bullet = (text: string) => new Paragraph({ numbering: { reference: "bul", level: 0 }, spacing: { after: 60 }, children: [run(text)] });
const h1 = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text, font: FONT })] });

function cell(text: string, width: number, o: { head?: boolean; fill?: string; bold?: boolean } = {}) {
  const fill = o.head ? HEAD_FILL : o.fill;
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    shading: fill ? { type: ShadingType.CLEAR, fill, color: "auto" } : undefined,
    children: String(text ?? "").split("\n").map((line) => new Paragraph({ children: [run(line, { size: 20, bold: o.head || o.bold })] })),
  });
}

function dataTable(t: R13Table): Table {
  const n = Math.max(1, t.headers.length);
  const w = Math.floor(WIDTH / n);
  const widths = Array.from({ length: n }, (_, i) => (i === n - 1 ? WIDTH - w * (n - 1) : w));
  const pad = (r: string[]) => Array.from({ length: n }, (_, i) => r[i] ?? "");
  return new Table({
    width: { size: WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: pad(t.headers).map((h, i) => cell(h, widths[i], { head: true })) }),
      ...t.rows.map((r) => new TableRow({ cantSplit: true, children: pad(r).map((c, i) => cell(c, widths[i])) })),
    ],
  });
}

function coverTable(meta: DocxMeta, rating: string): Table {
  const rows: [string, string][] = [
    ["Entity", meta.entity],
    ["Overall rating", rating],
    ["Version", String(meta.version)],
    ["Status", meta.status],
    ["Date", meta.generatedAt],
  ];
  const widths = [2400, WIDTH - 2400];
  return new Table({
    width: { size: WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    rows: rows.map(([k, v]) => new TableRow({ cantSplit: true, children: [cell(k, widths[0], { fill: LABEL_FILL, bold: true }), cell(v, widths[1])] })),
  });
}

async function pack(title: string, meta: DocxMeta, children: (Paragraph | Table)[]): Promise<Buffer> {
  const notFinal = meta.status !== "Final";
  const headerChildren = [new Paragraph({ children: [run(`${meta.entity} | ${meta.status}`, { size: 18, color: "595959" })] })];
  if (notFinal) headerChildren.push(new Paragraph({ children: [run("DRAFT – not for issue", { size: 18, bold: true, color: "C00000" })] }));
  const doc = new Document({
    title,
    creator: "Meridian",
    styles: {
      default: { document: { run: { font: FONT, size: 22 } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: FONT, size: 28, bold: true, color: "1F3864" }, paragraph: { spacing: { before: 320, after: 120 }, keepNext: true, outlineLevel: 0 } },
      ],
    },
    numbering: { config: [{ reference: "bul", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }] },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      headers: { default: new Header({ children: headerChildren }) },
      footers: {
        default: new Footer({
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
            new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], font: FONT, size: 18 }),
          ] })],
        }),
      },
      children,
    }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

export async function renderReport13Docx(report: Report13, meta: DocxMeta): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    para("Internal Audit Report", { bold: true, size: 44, after: 240 }),
    coverTable(meta, report.rating),
    para("", { after: 200 }),
  ];
  for (const s of report.sections) {
    children.push(h1(`${s.number}. ${s.title}`));
    s.paragraphs.forEach((p) => children.push(para(p)));
    (s.tables ?? []).forEach((t) => {
      children.push(dataTable(t));
      children.push(para("", { after: 120 }));
    });
  }
  return pack("Internal Audit Report", meta, children);
}

export async function renderBoardBriefDocx(brief: BoardBrief, meta: DocxMeta): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    para(brief.title || "Board note", { bold: true, size: 44, after: 240 }),
    coverTable(meta, brief.rating),
    para("", { after: 200 }),
    ...brief.paragraphs.map((p) => para(p)),
    h1("Top findings"),
    ...brief.topFindings.map(bullet),
    h1("Decisions or asks"),
    ...brief.asks.map(bullet),
    h1("Limitations"),
    ...brief.limitations.map(bullet),
  ];
  return pack(brief.title || "Board note", meta, children);
}
