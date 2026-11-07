import assert from "node:assert/strict";
import { severityCap, fraudLadderLint, confidencePercentLint, variancePair, maskRestricted } from "../src/lib/iron-rules";

let passed = 0;
function t(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}

// (a) severityCap
t("a+ Critical with REP only -> High + flag", () => {
  const r = severityCap("Critical", ["REP"]);
  assert.equal(r.severity, "High");
  assert.equal(r.flag, "pending fieldwork corroboration");
});
t("a+ Critical with REP+ANA -> High + flag", () => assert.equal(severityCap("Critical", ["REP", "ANA"]).severity, "High"));
t("a+ Critical with empty tags -> High + flag", () => {
  const r = severityCap("Critical", []);
  assert.equal(r.severity, "High");
  assert.equal(r.flag, "pending fieldwork corroboration");
});
t("a- Critical with CON stays Critical", () => {
  const r = severityCap("Critical", ["CON"]);
  assert.equal(r.severity, "Critical");
  assert.equal(r.flag, null);
});
t("a- High with REP unchanged, no flag", () => {
  const r = severityCap("High", ["REP"]);
  assert.equal(r.severity, "High");
  assert.equal(r.flag, null);
});
t("a edge: mixed REP+CON means no cap", () => assert.equal(severityCap("Critical", ["REP", "CON"]).severity, "Critical"));
t("a edge: bracketed lowercase tags [rep] still capped", () => assert.equal(severityCap("Critical", ["[rep]"]).severity, "High"));

// (b) fraudLadderLint
t("b+ 'committed fraud' at indicator flagged", () => assert.ok(fraudLadderLint("The manager committed fraud.", "indicator").length > 0));
t("b+ fraudster / stole / intentionally / motive / deliberately flagged at allegation", () => {
  for (const w of ["He is a fraudster.", "He stole stock.", "It was done intentionally.", "The motive was greed.", "He deliberately altered it."]) {
    assert.ok(fraudLadderLint(w, "allegation").length > 0, w);
  }
});
t("b- neutral wording at indicator not flagged", () => assert.equal(fraudLadderLint("Duplicate payments are a red flag requiring follow-up.", "indicator").length, 0));
t("b- assertive wording allowed when corroborated", () => assert.equal(fraudLadderLint("The manager committed fraud.", "corroborated").length, 0));
t("b- assertive wording allowed when substantiated", () => assert.equal(fraudLadderLint("He stole stock.", "substantiated").length, 0));
t("b- negated mention not flagged", () => assert.equal(fraudLadderLint("Motive is not inferred.", "indicator").length, 0));
t("b edge: unknown state treated strictly", () => assert.ok(fraudLadderLint("He stole stock.", "bogus").length > 0));

// (c) confidencePercentLint
t("c+ '99% confidence'", () => assert.equal(confidencePercentLint("We have 99% confidence in this.").length, 1));
t("c+ '95 % confident'", () => assert.equal(confidencePercentLint("We are 95 % confident.").length, 1));
t("c+ 'confidence of 90%'", () => assert.equal(confidencePercentLint("A confidence of 90% applies.").length, 1));
t("c edge: '99.5%' decimal flagged", () => {
  assert.equal(confidencePercentLint("There is 99.5% confidence here.").length, 1);
  assert.equal(confidencePercentLint("Confidence level of 99.5% was used.").length, 1);
});
t("c- evidence-class wording not flagged", () => assert.equal(confidencePercentLint("Tested 40 of 120 invoices [INS]; the rest were not tested. Variance was 5% of revenue.").length, 0));

// (d) variancePair
t("d+ offsetting errors: net 0, gross 20", () => {
  const r = variancePair([{ expected: 100, actual: 110 }, { expected: 100, actual: 90 }]);
  assert.equal(r.net, 0);
  assert.equal(r.grossAbsolute, 20);
});
t("d- same-direction errors: net equals gross", () => {
  const r = variancePair([{ expected: 100, actual: 105 }, { expected: 50, actual: 55 }]);
  assert.equal(r.net, 10);
  assert.equal(r.grossAbsolute, 10);
});
t("d edge: empty rows", () => assert.deepEqual([variancePair([]).net, variancePair([]).grossAbsolute], [0, 0]));

// (e) maskRestricted
t("e+ masks all terms case-insensitively", () => {
  const out = maskRestricted("Case Alpha-7 and GAMMA were reviewed; alpha-7 again.", ["ALPHA-7", "gamma"]);
  assert.ok(!/alpha-7/i.test(out));
  assert.ok(!/gamma/i.test(out));
  assert.equal(out.split("[RESTRICTED]").length - 1, 3);
});
t("e- unrelated text untouched", () => assert.equal(maskRestricted("Nothing to hide here.", ["secret"]), "Nothing to hide here."));
t("e- empty set leaves text unchanged", () => assert.equal(maskRestricted("Alpha stays.", []), "Alpha stays."));

console.log(`\n${passed} passed, 0 failed`);
