import { lintText } from "../lib/iron-rules";
import type { R13Section, Report13 } from "../lib/report13";

/** Optional AI wording for the 13-section report. Pure functions: no database, no network. The model call is injected. */
export type ModelResult = { ok: true; text: string } | { ok: false; error: string };
export type AiDrafter = { name: string; complete: (prompt: string) => Promise<ModelResult> };
export type Check = { ok: true; text: string } | { ok: false; reason: string };

/** Sections the model may reword: 1 Executive Summary (paragraphs only, tables untouched) and 7 Root Cause. */
export const AI_SECTIONS = [1, 7];
const MARKER = "MODEL DRAFT — NOT AN ISSUED OPINION.";
const SEVERITY = /\b(Critical|High|Medium|Low)\b/g;

export const aiLabel = (model: string) => `AI-assisted (local model: ${model})`;

export function numbersIn(text: string): Set<string> {
  return new Set((text.match(/\d[\d,]*(?:\.\d+)?/g) || []).map((n) => n.replace(/,+$/, "").replace(/,/g, "")));
}

function severityCounts(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of text.match(SEVERITY) || []) out[m] = (out[m] || 0) + 1;
  return out;
}

/** Accept a model rewrite only if it adds no numbers, no lint hit, and keeps every severity word. Otherwise say why. */
export function checkRewrite(source: string, output: string): Check {
  const text = output.split("\n").filter((l, i) => !(i === 0 && l.trim() === MARKER)).join("\n").trim();
  if (!text) return { ok: false, reason: "empty output" };
  const src = source.toLowerCase();
  const hits = lintText(text).filter((h) => !src.includes(h.term.toLowerCase()));
  if (hits.length) return { ok: false, reason: `lint: ${hits.map((h) => `"${h.term}"`).join(", ")}` };
  const known = numbersIn(source);
  const added = [...numbersIn(text)].filter((n) => !known.has(n));
  if (added.length) return { ok: false, reason: `new number(s) not in the source: ${added.join(", ")}` };
  const a = severityCounts(source);
  const b = severityCounts(text);
  const words = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const w of words) if ((a[w] || 0) !== (b[w] || 0)) return { ok: false, reason: `severity word "${w}" changed (source ${a[w] || 0}, output ${b[w] || 0})` };
  return { ok: true, text };
}

export function buildPrompt(section: R13Section): string {
  return [
    `Reword the "${section.title}" paragraphs of an internal audit report in plain, clear language.`,
    "Use only the text between the lines. Add no fact, number, date, name or opinion. Keep every severity word (Critical, High, Medium, Low) exactly as written.",
    "Do not state a numeric confidence. Return paragraphs separated by a blank line, with no heading and no markdown.",
    "---",
    section.paragraphs.join("\n\n"),
    "---",
  ].join("\n");
}

/** Rewrites sections 1 and 7 only. Any failed check or model error keeps the template text and records why. */
export async function draftNarrative(report: Report13, ai: AiDrafter) {
  const accepted: number[] = [];
  const rejected: { section: number; reason: string }[] = [];
  const sections: R13Section[] = [];
  for (const s of report.sections) {
    if (!AI_SECTIONS.includes(s.number)) { sections.push(s); continue; }
    let res: ModelResult;
    try { res = await ai.complete(buildPrompt(s)); } catch (e) { res = { ok: false, error: e instanceof Error ? e.message : "model call failed" }; }
    if (!res.ok) { rejected.push({ section: s.number, reason: `model error: ${res.error}` }); sections.push(s); continue; }
    const c = checkRewrite(s.paragraphs.join("\n\n"), res.text);
    if (!c.ok) { rejected.push({ section: s.number, reason: c.reason }); sections.push(s); continue; }
    const paragraphs = c.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    accepted.push(s.number);
    sections.push({ ...s, paragraphs: [`${aiLabel(ai.name)}. Review before use.`, ...paragraphs] });
  }
  return { report: { ...report, sections }, accepted, rejected };
}
