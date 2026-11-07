import assert from "node:assert/strict";
import { benford, benfordBand, duplicates, normaliseKey, profile, reconcile, toNumber, ANA_LABEL } from "../src/lib/analytics";
import { parseCsv } from "../src/lib/engine";

let passed = 0;
function t(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}
const rowsOf = (csv: string) => parseCsv(csv).rows;

// ---- profile
t("profile+ counts blanks, distinct, numeric range, error strings", () => {
  const p = profile(rowsOf("id,amt,note\n1,10,a\n2,#REF!,b\n3,,a\n4,5.5,#DIV/0!\n5,#N/A,\n"));
  const amt = p.columns.find((c) => c.name === "amt")!;
  assert.equal(p.rowCount, 5);
  assert.equal(amt.blank, 1);
  assert.equal(amt.numericCount, 2);
  assert.equal(amt.min, 5.5);
  assert.equal(amt.max, 10);
  assert.equal(amt.sum, 15.5);
  assert.equal(amt.errorStrings, 2);
  assert.equal(p.columns.find((c) => c.name === "note")!.errorStrings, 1);
  assert.equal(p.columns.find((c) => c.name === "note")!.distinct, 3);
  assert.equal(p.totalErrorStrings, 3);
  assert.equal(p.label, ANA_LABEL);
});
t("profile- clean data has zero error strings and no numeric stats for text", () => {
  const p = profile(rowsOf("name,amt\nx,1\ny,2\n"));
  assert.equal(p.totalErrorStrings, 0);
  assert.equal(p.columns[0].min, null);
});
t("toNumber is strict (no 'ABC1' -> 1)", () => {
  assert.equal(toNumber("ABC1"), null);
  assert.equal(toNumber("1,234.50"), 1234.5);
  assert.equal(toNumber("(200)"), -200);
  assert.equal(toNumber(""), null);
});

// ---- benford
function conforming(n: number): number[] {
  // Deterministic quantile construction: values whose first-digit shares follow log10(1+1/d).
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const u = (i + 0.5) / n;
    out.push(Math.floor(10 ** (1 + u) * 100)); // log-uniform over [10,100) scaled: Benford-conforming mantissa
  }
  return out;
}
t("benford+ log-uniform set (n=3000) conforms closely, no small-sample warning", () => {
  const b = benford(conforming(3000));
  assert.equal(b.n, 3000);
  assert.ok(b.mad! < 0.006, `mad=${b.mad}`);
  assert.equal(b.band, "close conformity");
  assert.equal(b.smallSample, false);
  assert.equal(b.warnings.length, 0);
});
t("benford- uniform first digits is nonconformity", () => {
  const vals: number[] = [];
  for (let d = 1; d <= 9; d += 1) for (let k = 0; k < 40; k += 1) vals.push(d * 100 + k);
  const b = benford(vals);
  assert.equal(b.n, 360);
  assert.equal(b.band, "nonconformity");
  assert.ok(b.mad! > 0.015);
});
t("benford ignores <10 and non-numerics, and flags n<300", () => {
  const b = benford(["5", "9.99", "abc", "", "1,200", 350, -45, "(77)"]);
  assert.equal(b.ignoredBelowTen, 2);
  assert.equal(b.ignoredNonNumeric, 2);
  assert.equal(b.n, 4);
  assert.equal(b.smallSample, true);
  assert.ok(b.warnings[0].includes("Small sample"));
  assert.equal(b.digits[0].count, 1); // 1,200
  assert.equal(b.digits[2].count, 1); // 350
  assert.equal(b.digits[3].count, 1); // -45
  assert.equal(b.digits[6].count, 1); // (77)
});
t("benford empty input is not assessable", () => assert.equal(benford([]).band, "not assessable"));
t("benford band boundaries (Nigrini)", () => {
  assert.equal(benfordBand(0.00599), "close conformity");
  assert.equal(benfordBand(0.006), "acceptable conformity");
  assert.equal(benfordBand(0.01199), "acceptable conformity");
  assert.equal(benfordBand(0.012), "marginally acceptable conformity");
  assert.equal(benfordBand(0.01499), "marginally acceptable conformity");
  assert.equal(benfordBand(0.015), "nonconformity");
});

// ---- duplicates
t("duplicates+ '00123' vs '123' found by normalised match only", () => {
  const d = duplicates(rowsOf("inv,amt\n00123,10\n123,10\nABC,5\n"), ["inv"]);
  assert.equal(d.exact.groupCount, 0);
  assert.equal(d.normalised.groupCount, 1);
  assert.equal(d.normalisedOnly.groupCount, 1);
  assert.deepEqual(d.normalised.groups[0].rowNumbers, [2, 3]);
});
t("duplicates+ exact repeat, case and spacing normalised, composite key", () => {
  const d = duplicates(rowsOf("v,inv\nAcme,1\nAcme,1\n acme ,2\nACME,2\nOther,1\n"), ["v", "inv"]);
  assert.equal(d.exact.groupCount, 1);
  assert.equal(d.normalised.groupCount, 2);
  assert.equal(d.normalisedOnly.groupCount, 1);
});
t("duplicates- unique keys give no groups; blank keys skipped; missing column throws", () => {
  const d = duplicates(rowsOf("inv\n1\n2\n\n 3\n"), ["inv"]);
  assert.equal(d.normalised.groupCount, 0);
  assert.equal(d.rowsTested, 3);
  assert.throws(() => duplicates(rowsOf("a\n1\n"), ["zzz"]), /Column not found/);
  assert.equal(normaliseKey("000"), "0");
  assert.equal(normaliseKey("  Ab0 "), "ab0");
});

// ---- reconcile
const A = rowsOf("id,amt\n001,100.00\n002,200.00\n003,300.00\n004,50\nONLYA,75\n");
const B = rowsOf("id,amt\n1,100.00\n002,200.50\n003,320.00\n004,50.00\nONLYB,10\n");
t("reconcile+ matched/mismatched/only-in with net and gross", () => {
  const r = reconcile(A, B, "id", "amt", 1);
  assert.equal(r.matchedWithinTolerance, 3); // 001~1 normalised, 002 (0.50<=1), 004
  assert.equal(r.matchedByNormalisedKey, 1);
  assert.equal(r.mismatchedBeyondTolerance, 1); // 003 off by 20
  assert.equal(r.onlyInACount, 1);
  assert.equal(r.onlyInBCount, 1);
  assert.equal(r.pairedVariance.net, 20.5);
  assert.equal(r.pairedVariance.grossAbsolute, 20.5);
  assert.equal(r.mismatchedVariance.net, 20);
  assert.equal(r.onlyInAAmount, 75);
  assert.equal(r.onlyInBAmount, 10);
  assert.equal(r.keysA, r.matchedWithinTolerance + r.mismatchedBeyondTolerance + r.onlyInACount + r.unparseableAmountPairs);
});
t("reconcile tolerance edge: difference == tolerance matches, just above does not", () => {
  const a = rowsOf("id,amt\nx,100\ny,100\n");
  const b = rowsOf("id,amt\nx,100.50\ny,100.51\n");
  const r = reconcile(a, b, "id", "amt", 0.5);
  assert.equal(r.matchedWithinTolerance, 1);
  assert.equal(r.mismatchedBeyondTolerance, 1);
  assert.equal(r.mismatched[0].key, "y");
});
t("reconcile- offsetting errors: net 0 but gross > 0 and flagged", () => {
  const r = reconcile(rowsOf("id,amt\na,100\nb,100\n"), rowsOf("id,amt\na,110\nb,90\n"), "id", "amt", 0);
  assert.equal(r.pairedVariance.net, 0);
  assert.equal(r.pairedVariance.grossAbsolute, 20);
  assert.equal(r.pairedVariance.offsetting, true);
  assert.equal(r.mismatchedBeyondTolerance, 2);
});
t("reconcile- identical files reconcile cleanly; bad input rejected", () => {
  const r = reconcile(A, A, "id", "amt", 0);
  assert.equal(r.mismatchedBeyondTolerance + r.onlyInACount + r.onlyInBCount, 0);
  assert.equal(r.pairedVariance.grossAbsolute, 0);
  assert.throws(() => reconcile(A, B, "id", "amt", -1), /Tolerance/);
  assert.throws(() => reconcile(A, B, "id", "nope", 0), /Column not found/);
});
t("reconcile non-numeric amount is reported, never silently dropped", () => {
  const r = reconcile(rowsOf("id,amt\na,abc\nb,5\n"), rowsOf("id,amt\na,10\nb,5\n"), "id", "amt", 0);
  assert.equal(r.unparseableAmountPairs, 1);
  assert.equal(r.matchedWithinTolerance, 1);
});

console.log(`\n${passed} analytics tests passed`);
