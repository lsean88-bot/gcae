/**
 * Iron-rule guardrails. Pure functions only: no database, no network, no clock.
 * They encode the rules in CLAUDE.md sections 2 and 3 so they run in code, not in a prompt.
 * Server wiring lives in src/server/guardrail.ts. Tests: scripts/test-iron-rules.ts.
 */

// ---------------------------------------------------------------------------------------------
// (a) Severity cap
// ---------------------------------------------------------------------------------------------

/** Evidence tags. REP and ANA alone never support a Critical finding. */
export const INDEPENDENT_TAGS = ["CON", "PHY", "INS", "REC", "OBS"] as const;
export const SEVERITY_CAP_FLAG = "pending fieldwork corroboration";

export type SeverityCapResult = { severity: string; capped: boolean; flag: string | null };

function normaliseTag(tag: string) {
  return tag.replace(/[\[\]\s]/g, "").toUpperCase();
}

/**
 * Critical needs at least one independent tag (CON, PHY, INS, REC or OBS).
 * With only REP and/or ANA, or no tags at all, Critical becomes High and carries the flag.
 * Any other severity passes through unchanged.
 */
export function severityCap(findingSeverity: string, evidenceTags: readonly string[]): SeverityCapResult {
  const tags = evidenceTags.map(normaliseTag).filter(Boolean);
  const independent = tags.some((tag) => (INDEPENDENT_TAGS as readonly string[]).includes(tag));
  if (findingSeverity.trim().toLowerCase() === "critical" && !independent) {
    return { severity: "High", capped: true, flag: SEVERITY_CAP_FLAG };
  }
  return { severity: findingSeverity, capped: false, flag: null };
}

export type TagSource = { documentType: string; reliability?: string; evidenceClass?: string | null };

/**
 * Evidence tags for a finding, from the evidence it cites. Conservative by design:
 * a management-supplied extract is [REP], and the auditor's own analysis is [ANA].
 * Only a third-party confirmation, a physical or observed record, an inspected document, or a
 * QA re-performance that cleared the same test lifts a finding above REP/ANA.
 */
export function deriveEvidenceTags(cited: readonly TagSource[], opts: { qaCleared?: boolean } = {}): string[] {
  const tags = new Set<string>(["ANA"]);
  for (const item of cited) {
    const type = item.documentType;
    // CON and PHY come only from evidence_class, which GCAE alone sets. Free-text documentType never upgrades to them.
    const cls = (item.evidenceClass ?? "").trim().toUpperCase();
    if (cls === "CON" || cls === "PHY") tags.add(cls);
    else if (/walkthrough|observ/i.test(type)) tags.add("OBS");
    else if (/inspect|contract|policy|signed|approval form/i.test(type)) tags.add("INS");
    else tags.add("REP");
  }
  if (opts.qaCleared) tags.add("REC");
  return [...tags];
}

// ---------------------------------------------------------------------------------------------
// (b) Fraud ladder lint
// ---------------------------------------------------------------------------------------------

/** Lowest to highest. Wording that asserts fraud, guilt or motive needs "corroborated" or above. */
export const FRAUD_LADDER = ["weakness", "indicator", "suspicion", "allegation", "corroborated", "substantiated"] as const;
export type LadderState = (typeof FRAUD_LADDER)[number];

export type LintHit = { rule: "fraud-ladder" | "confidence-percent"; term: string; excerpt: string; message: string };

const ASSERTION_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bcommitted\s+(a\s+|the\s+)?fraud\b/gi, label: "committed fraud" },
  { re: /\bfraud\s+(was|has\s+been|is)\s+(committed|confirmed|proven|established)\b/gi, label: "fraud confirmed" },
  { re: /\b(confirmed|proven|established)\s+fraud\b/gi, label: "confirmed fraud" },
  { re: /\bfraudsters?\b/gi, label: "fraudster" },
  { re: /\b(is|are|was|were)\s+guilty\b|\bguilty\s+of\b/gi, label: "guilt" },
  { re: /\bintentional(ly)?\b/gi, label: "intentionally" },
  { re: /\bmotive\b/gi, label: "motive" },
  { re: /\b(stole|stolen|steal|stealing)\b/gi, label: "stole" },
  { re: /\b(embezzl\w*|misappropriat\w*|perpetrat\w*|defraud\w*)\b/gi, label: "fraud verb" },
  { re: /\b(deliberate(ly)?|knowingly|willful(ly)?|wilful(ly)?)\b/gi, label: "intent word" },
];

const NEGATOR = String.raw`(?:not|no|never|cannot|can't|won't|without|nor|neither|unless)`;
/** A negator within a few words before the term, with no clause break between them. */
const NEG_BEFORE = new RegExp(String.raw`\b${NEGATOR}\b(?:\s+[\w'-]+){0,4}\s*$`, "i");
/** "term is not ...", "term was never ..." directly after the term. */
const NEG_AFTER = new RegExp(String.raw`^\s+(?:(?:is|was|are|were|has|have|had|been|being)\s+)*${NEGATOR}\b`, "i");
/** Affirmative idioms that contain a negator and must not suppress a hit. */
const AFFIRMATIVE_IDIOM = /\b(?:no\s+(?:doubt|question|denying|mistake)|not\s+only|not\s+just|cannot\s+(?:deny|be\s+denied)|can't\s+deny)\b/gi;

/** True only when a negation directly scopes the flagged phrase, not merely when the sentence contains one. */
function negatedLocally(sentence: string, start: number, length: number): boolean {
  const before = sentence.slice(0, start).replace(AFFIRMATIVE_IDIOM, " ");
  const after = sentence.slice(start + length);
  return NEG_BEFORE.test(before) || NEG_AFTER.test(after);
}

/** The sentence around index, so a negation in the same sentence can be seen on either side. */
function sentenceAround(text: string, index: number, length: number) {
  const start = Math.max(text.lastIndexOf(".", index - 1), text.lastIndexOf("\n", index - 1), text.lastIndexOf(";", index - 1)) + 1;
  const ends = [text.indexOf(".", index + length), text.indexOf("\n", index + length), text.indexOf(";", index + length)].filter((n) => n >= 0);
  const end = ends.length ? Math.min(...ends) : text.length;
  return { start, end, sentence: text.slice(start, end) };
}

/**
 * Flags words that assert fraud, guilt or motive while the evidence state is below "corroborated".
 * A negated mention ("motive is not inferred", "not a finding of fraud") is not flagged.
 * Unknown state is treated as the lowest rung, so an unlabelled draft is checked strictly.
 */
export function fraudLadderLint(text: string, evidenceState: string = "weakness"): LintHit[] {
  const rank = FRAUD_LADDER.indexOf(evidenceState.trim().toLowerCase() as LadderState);
  if (rank >= FRAUD_LADDER.indexOf("corroborated")) return [];
  const hits: LintHit[] = [];
  for (const { re, label } of ASSERTION_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const { start, sentence } = sentenceAround(text, m.index, m[0].length);
      if (negatedLocally(sentence, m.index - start, m[0].length)) continue;
      hits.push({
        rule: "fraud-ladder",
        term: label,
        excerpt: sentence.trim().slice(0, 160),
        message: `"${m[0]}" asserts fraud, guilt or motive but the evidence state is "${evidenceState}". Use the ladder: weakness, indicator, suspicion, allegation, corroborated, substantiated.`,
      });
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------------------------
// (c) Confidence percentage lint
// ---------------------------------------------------------------------------------------------

const PERCENT_CONFIDENCE = [
  /\b\d{1,3}(?:\.\d+)?\s?%\s*(?:confidence|confident)\b/gi,
  /\bconfidence\s+(?:level\s+)?(?:of|at|is)\s+\d{1,3}(?:\.\d+)?\s?%/gi,
];

/** Confidence is expressed as evidence class and coverage, never as a number such as "99% confidence". */
export function confidencePercentLint(text: string): LintHit[] {
  const hits: LintHit[] = [];
  for (const re of PERCENT_CONFIDENCE) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      hits.push({
        rule: "confidence-percent",
        term: m[0],
        excerpt: sentenceAround(text, m.index, m[0].length).sentence.trim().slice(0, 160),
        message: `"${m[0]}" is a numeric confidence. State what was tested, what was not, and what would change the conclusion.`,
      });
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------------------------
// (d) Variance pair
// ---------------------------------------------------------------------------------------------

export type VarianceRow = { label?: string; expected: number; actual: number };
export type VariancePair = { net: number; grossAbsolute: number; offsetting: boolean; rows: number };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Net alone can hide offsetting errors, so both are returned. Gross is the sum of absolute row variances. */
export function variancePair(rows: readonly VarianceRow[]): VariancePair {
  let net = 0;
  let gross = 0;
  for (const row of rows) {
    const v = row.actual - row.expected;
    net += v;
    gross += Math.abs(v);
  }
  return { net: round2(net), grossAbsolute: round2(gross), offsetting: round2(gross) > Math.abs(round2(net)), rows: rows.length };
}

// ---------------------------------------------------------------------------------------------
// (e) Restricted masking
// ---------------------------------------------------------------------------------------------

export const MASK = "[RESTRICTED]";

/**
 * Masks every term of the GLOBAL restricted set (codes, titles, ids of all restricted engagements).
 * The caller must build the set from all restricted engagements, never from the viewer's filtered data:
 * a viewer's filtered data omits exactly the names that need masking.
 */
export function maskRestricted(text: string, globalRestrictedSet: Iterable<string>): string {
  const terms = [...new Set([...globalRestrictedSet].map((t) => t.trim()).filter((t) => t.length >= 2))].sort((a, b) => b.length - a.length);
  let out = text;
  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "gi"), MASK);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Shared: one combined text check, used by the server wiring
// ---------------------------------------------------------------------------------------------

export function lintText(text: string, evidenceState: string = "weakness"): LintHit[] {
  return [...fraudLadderLint(text, evidenceState), ...confidencePercentLint(text)];
}
