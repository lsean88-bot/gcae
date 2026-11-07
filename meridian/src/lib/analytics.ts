import { variancePair, type VariancePair } from "@/lib/iron-rules";

/** Every analytics result carries this label (CLAUDE.md severity discipline: [ANA] alone caps at High and is never a finding). */
export const ANA_LABEL = "[ANA] auditor analysis — indicator, not a finding";

export type Row = Record<string, string>;
export const ERROR_STRINGS = ["#REF!", "#DIV/0!", "#NAME?", "#VALUE!", "#N/A"] as const;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Strict numeric parse. Accepts thousands commas and (1,200) negatives. Anything else is null (never guessed). */
export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  let s = value.trim().replace(/,/g, "");
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

const isBlank = (v: string | undefined) => v === undefined || v === null || String(v).trim() === "";

function columnsOf(rows: Row[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row)) seen.add(key);
  return [...seen];
}

function requireColumns(rows: Row[], cols: string[]) {
  if (!rows.length) return;
  const have = new Set(columnsOf(rows));
  const missing = cols.filter((c) => !have.has(c));
  if (missing.length) throw new Error(`Column not found: ${missing.join(", ")}`);
}

// ---------------------------------------------------------------------------------------------
// profile
// ---------------------------------------------------------------------------------------------

export type ColumnProfile = {
  name: string;
  blank: number;
  distinct: number;
  numericCount: number;
  min: number | null;
  max: number | null;
  sum: number | null;
  errorStrings: number;
  errorByString: Record<string, number>;
};
export type ProfileResult = { label: string; rowCount: number; columnCount: number; columns: ColumnProfile[]; totalErrorStrings: number };

export function profile(rows: Row[]): ProfileResult {
  const names = columnsOf(rows);
  const columns: ColumnProfile[] = names.map((name) => {
    let blank = 0, numericCount = 0, errors = 0;
    let min = Infinity, max = -Infinity, sum = 0;
    const distinct = new Set<string>();
    const byString: Record<string, number> = {};
    for (const row of rows) {
      const raw = row[name];
      if (isBlank(raw)) { blank += 1; continue; }
      const text = String(raw).trim();
      distinct.add(text);
      const upper = text.toUpperCase();
      for (const err of ERROR_STRINGS) {
        if (upper.includes(err)) {
          errors += 1;
          byString[err] = (byString[err] ?? 0) + 1;
          break;
        }
      }
      const n = toNumber(text);
      if (n !== null) {
        numericCount += 1;
        if (n < min) min = n;
        if (n > max) max = n;
        sum += n;
      }
    }
    return {
      name, blank, distinct: distinct.size, numericCount,
      min: numericCount ? min : null, max: numericCount ? max : null, sum: numericCount ? round2(sum) : null,
      errorStrings: errors, errorByString: byString,
    };
  });
  return { label: ANA_LABEL, rowCount: rows.length, columnCount: names.length, columns, totalErrorStrings: columns.reduce((a, c) => a + c.errorStrings, 0) };
}

// ---------------------------------------------------------------------------------------------
// benford (first digit)
// ---------------------------------------------------------------------------------------------

export const BENFORD_EXPECTED = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => Math.log10(1 + 1 / d));
export type BenfordBand = "close conformity" | "acceptable conformity" | "marginally acceptable conformity" | "nonconformity" | "not assessable";

export function benfordBand(mad: number): BenfordBand {
  if (mad < 0.006) return "close conformity";
  if (mad < 0.012) return "acceptable conformity";
  if (mad < 0.015) return "marginally acceptable conformity";
  return "nonconformity";
}

export type BenfordResult = {
  label: string;
  n: number;
  ignoredBelowTen: number;
  ignoredNonNumeric: number;
  digits: { digit: number; count: number; observed: number; expected: number; difference: number }[];
  mad: number | null;
  band: BenfordBand;
  smallSample: boolean;
  warnings: string[];
  basis: string;
};

/** Magnitudes are used (sign dropped). Values with magnitude below 10 and non-numerics are ignored and counted. */
export function benford(values: readonly unknown[]): BenfordResult {
  const counts = new Array(9).fill(0) as number[];
  let n = 0, below = 0, nonNumeric = 0;
  for (const v of values) {
    if (typeof v === "string" && v.trim() === "") { nonNumeric += 1; continue; }
    const num = toNumber(v);
    if (num === null) { nonNumeric += 1; continue; }
    const mag = Math.abs(num);
    if (mag < 10) { below += 1; continue; }
    const digit = Number(mag.toExponential()[0]); // exact leading digit, no floating-point log error
    counts[digit - 1] += 1;
    n += 1;
  }
  const digits = counts.map((count, i) => {
    const observed = n ? count / n : 0;
    return { digit: i + 1, count, observed, expected: BENFORD_EXPECTED[i], difference: observed - BENFORD_EXPECTED[i] };
  });
  const mad = n ? digits.reduce((a, d) => a + Math.abs(d.difference), 0) / 9 : null;
  const smallSample = n < 300;
  const warnings: string[] = [];
  if (n === 0) warnings.push("No usable values (numeric and 10 or more). The test cannot be assessed.");
  else if (smallSample) warnings.push(`Small sample: n=${n} is below 300. The MAD band is unreliable at this size; treat as weak indication only.`);
  return {
    label: ANA_LABEL, n, ignoredBelowTen: below, ignoredNonNumeric: nonNumeric, digits, mad,
    band: mad === null ? "not assessable" : benfordBand(mad), smallSample, warnings,
    basis: "First-digit test on absolute values of 10 or more. MAD bands per Nigrini: <0.006 close, <0.012 acceptable, <0.015 marginal, otherwise nonconformity. Nonconformity is a reason to look, not evidence of error or fraud.",
  };
}

// ---------------------------------------------------------------------------------------------
// duplicates
// ---------------------------------------------------------------------------------------------

/** Normalisation: cast to string, trim, case-fold, strip leading zeros (keeps a single 0 for all-zero values). */
export function normaliseKey(value: unknown): string {
  const s = String(value ?? "").trim().toLowerCase();
  return s.replace(/^0+(?=.)/, "");
}

export type DuplicateGroup = { key: string; count: number; rowNumbers: number[]; variants: string[] };
export type DuplicatePass = { groupCount: number; rowsInGroups: number; groups: DuplicateGroup[]; truncated: boolean };
export type DuplicatesResult = {
  label: string;
  keyCols: string[];
  rowsTested: number;
  skippedBlankKey: number;
  exact: DuplicatePass;
  normalised: DuplicatePass;
  /** Normalised groups that exact matching did not find (the raw keys differ only by spacing, case or leading zeros). */
  normalisedOnly: DuplicatePass;
  note: string;
};

const SEP = "\u001f";

/** Row numbers are spreadsheet row numbers: data row 1 is row 2 (row 1 is the header). */
export function duplicates(rows: Row[], keyCols: string[], opts: { maxGroups?: number } = {}): DuplicatesResult {
  if (!keyCols.length) throw new Error("At least one key column is required.");
  requireColumns(rows, keyCols);
  const maxGroups = opts.maxGroups ?? 500;
  const exact = new Map<string, number[]>();
  const norm = new Map<string, { rows: number[]; raw: Set<string> }>();
  let skipped = 0, tested = 0;
  rows.forEach((row, i) => {
    const rawParts = keyCols.map((c) => String(row[c] ?? ""));
    if (rawParts.every((p) => p.trim() === "")) { skipped += 1; return; }
    tested += 1;
    const rawKey = rawParts.join(SEP);
    (exact.get(rawKey) ?? exact.set(rawKey, []).get(rawKey)!).push(i + 2);
    const nk = keyCols.map((c) => normaliseKey(row[c])).join(SEP);
    const entry = norm.get(nk) ?? norm.set(nk, { rows: [], raw: new Set() }).get(nk)!;
    entry.rows.push(i + 2);
    entry.raw.add(rawKey);
  });
  const show = (k: string) => k.split(SEP).join(" | ");
  const pack = (groups: DuplicateGroup[]): DuplicatePass => ({
    groupCount: groups.length,
    rowsInGroups: groups.reduce((a, g) => a + g.count, 0),
    groups: groups.sort((a, b) => b.count - a.count).slice(0, maxGroups),
    truncated: groups.length > maxGroups,
  });
  const exactGroups = [...exact.entries()].filter(([, r]) => r.length > 1).map(([k, r]) => ({ key: show(k), count: r.length, rowNumbers: r, variants: [show(k)] }));
  const normGroups = [...norm.entries()].filter(([, e]) => e.rows.length > 1).map(([k, e]) => ({ key: show(k), count: e.rows.length, rowNumbers: e.rows, variants: [...e.raw].map(show) }));
  const onlyNorm = normGroups.filter((g) => g.variants.length > 1);
  return {
    label: ANA_LABEL, keyCols, rowsTested: tested, skippedBlankKey: skipped,
    exact: pack(exactGroups), normalised: pack(normGroups), normalisedOnly: pack(onlyNorm),
    note: "Duplicate keys are candidates for review. Repeated keys can be legitimate (instalments, credit notes, re-used codes). Row numbers include the header row.",
  };
}

// ---------------------------------------------------------------------------------------------
// reconcile
// ---------------------------------------------------------------------------------------------

export type ReconPair = { key: string; keyB: string; matchedBy: "raw" | "normalised"; amountA: number; amountB: number; difference: number };
export type ReconSide = { key: string; amount: number | null };
export type ReconcileResult = {
  label: string;
  keyCol: string;
  amountCol: string;
  tolerance: number;
  keysA: number;
  keysB: number;
  matchedWithinTolerance: number;
  matchedByNormalisedKey: number;
  mismatchedBeyondTolerance: number;
  onlyInACount: number;
  onlyInBCount: number;
  unparseableAmountPairs: number;
  totalA: number;
  totalB: number;
  totalDifferenceBMinusA: number;
  onlyInAAmount: number;
  onlyInBAmount: number;
  /** variancePair over every paired key (B actual vs A expected): net and gross absolute. */
  pairedVariance: VariancePair;
  /** variancePair over mismatched pairs only. */
  mismatchedVariance: VariancePair;
  mismatched: ReconPair[];
  onlyInA: ReconSide[];
  onlyInB: ReconSide[];
  unparseable: { key: string; reason: string }[];
  duplicateKeysA: number;
  duplicateKeysB: number;
  blankKeyRowsA: number;
  blankKeyRowsB: number;
  truncated: boolean;
  note: string;
};

type SideEntry = { raw: string; amount: number | null; unparseable: boolean; count: number; rowNumbers: number[] };

function aggregate(rows: Row[], keyCol: string, amountCol: string) {
  const map = new Map<string, SideEntry>();
  let blankKeys = 0, dupKeys = 0;
  rows.forEach((row, i) => {
    const raw = String(row[keyCol] ?? "").trim();
    if (!raw) { blankKeys += 1; return; }
    const amt = toNumber(row[amountCol]);
    const e = map.get(raw) ?? { raw, amount: null, unparseable: false, count: 0, rowNumbers: [] };
    e.count += 1;
    e.rowNumbers.push(i + 2);
    if (amt === null) e.unparseable = true;
    else e.amount = (e.amount ?? 0) + amt;
    map.set(raw, e);
  });
  for (const e of map.values()) if (e.count > 1) dupKeys += 1;
  return { map, blankKeys, dupKeys };
}

/** Raw key match first, then leading-zero/case/space-normalised match on what is left. Repeated keys on one side are summed and counted. */
export function reconcile(rowsA: Row[], rowsB: Row[], keyCol: string, amountCol: string, tolerance: number, opts: { maxList?: number } = {}): ReconcileResult {
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error("Tolerance must be zero or a positive number.");
  requireColumns(rowsA, [keyCol, amountCol]);
  requireColumns(rowsB, [keyCol, amountCol]);
  const maxList = opts.maxList ?? 500;
  const A = aggregate(rowsA, keyCol, amountCol);
  const B = aggregate(rowsB, keyCol, amountCol);
  const pairs: ReconPair[] = [];
  const unparseable: { key: string; reason: string }[] = [];
  const takePair = (ea: SideEntry, eb: SideEntry, matchedBy: "raw" | "normalised") => {
    if (ea.unparseable || eb.unparseable || ea.amount === null || eb.amount === null) {
      unparseable.push({ key: ea.raw, reason: `Amount missing or non-numeric in ${[ea.unparseable || ea.amount === null ? "A" : "", eb.unparseable || eb.amount === null ? "B" : ""].filter(Boolean).join(" and ")}.` });
      return;
    }
    pairs.push({ key: ea.raw, keyB: eb.raw, matchedBy, amountA: ea.amount, amountB: eb.amount, difference: round2(eb.amount - ea.amount) });
  };
  const restA = new Map<string, SideEntry>();
  const usedB = new Set<string>();
  for (const [k, ea] of A.map) {
    const eb = B.map.get(k);
    if (eb) { takePair(ea, eb, "raw"); usedB.add(k); } else restA.set(k, ea);
  }
  const restBByNorm = new Map<string, SideEntry[]>();
  for (const [k, eb] of B.map) if (!usedB.has(k)) (restBByNorm.get(normaliseKey(k)) ?? restBByNorm.set(normaliseKey(k), []).get(normaliseKey(k))!).push(eb);
  const onlyA: SideEntry[] = [];
  for (const [k, ea] of restA) {
    const list = restBByNorm.get(normaliseKey(k));
    const eb = list?.shift();
    if (eb) takePair(ea, eb, "normalised"); else onlyA.push(ea);
  }
  const onlyB = [...restBByNorm.values()].flat();
  const within = (d: number) => Math.round(Math.abs(d) * 1e6) / 1e6 <= tolerance;
  const mismatched = pairs.filter((p) => !within(p.difference));
  const sum = (xs: (number | null)[]) => round2(xs.reduce<number>((a, x) => a + (x ?? 0), 0));
  const totalA = sum([...A.map.values()].map((e) => e.amount));
  const totalB = sum([...B.map.values()].map((e) => e.amount));
  const toSide = (e: SideEntry): ReconSide => ({ key: e.raw, amount: e.amount === null ? null : round2(e.amount) });
  const mm = mismatched.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
  return {
    label: ANA_LABEL, keyCol, amountCol, tolerance,
    keysA: A.map.size, keysB: B.map.size,
    matchedWithinTolerance: pairs.length - mismatched.length,
    matchedByNormalisedKey: pairs.filter((p) => p.matchedBy === "normalised").length,
    mismatchedBeyondTolerance: mismatched.length,
    onlyInACount: onlyA.length, onlyInBCount: onlyB.length, unparseableAmountPairs: unparseable.length,
    totalA, totalB, totalDifferenceBMinusA: round2(totalB - totalA),
    onlyInAAmount: sum(onlyA.map((e) => e.amount)), onlyInBAmount: sum(onlyB.map((e) => e.amount)),
    pairedVariance: variancePair(pairs.map((p) => ({ label: p.key, expected: p.amountA, actual: p.amountB }))),
    mismatchedVariance: variancePair(mm.map((p) => ({ label: p.key, expected: p.amountA, actual: p.amountB }))),
    mismatched: mm.slice(0, maxList), onlyInA: onlyA.map(toSide).slice(0, maxList), onlyInB: onlyB.map(toSide).slice(0, maxList),
    unparseable: unparseable.slice(0, maxList),
    duplicateKeysA: A.dupKeys, duplicateKeysB: B.dupKeys, blankKeyRowsA: A.blankKeys, blankKeyRowsB: B.blankKeys,
    truncated: mm.length > maxList || onlyA.length > maxList || onlyB.length > maxList || unparseable.length > maxList,
    note: "Net and gross absolute variance are both shown; net alone can hide offsetting differences. Keys: raw match first, then trimmed/case-folded/leading-zero-stripped match. Repeated keys on one side are summed.",
  };
}
