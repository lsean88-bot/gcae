# Critique of gia-lean-comms and the GIA engines

Date: 7 October 2026. Method: I treated my own delivered package as the system under test and tried
to break it with adversarial batteries, not the tests I had written. Every number below was measured
in this session. Where a first measurement was wrong, it says so.

## 1. Scorecard: the meaning engine

A 20-case evasion list, a 10-case "glued amount / identifier" list, a 6-case non-English and unit list,
and a 17-case list of faithful rewrites that should not raise an alarm.

| Measure | v1.2 (shipped earlier) | v1.3 (final) |
|---|---|---|
| Meaning flips that passed silently (of 20) | **15** | **5** |
| Glued amounts and identifiers missed, e.g. `USD100` to `USD900` (of 10) | **9** | **0** |
| Non-English negations, currency, magnitude, full-width digits missed (of 6) | **6** | **0** |
| Faithful rewrites wrongly flagged (of 17) | **9** | **0** |
| Generator-driven fuzz (128,000 cases, independent oracle) | could not detect the glued-amount defect | 0 violations |

The five still passing are the documented blind spots, each pinned by a test so the docs cannot go
stale: who-did-what-to-whom, entity names (`MKPC` vs `MKAPL`), the order of ordinary verbs, Tamil, Hindi.
These need semantic understanding. A token guard cannot supply it.

## 2. Defects found in my own delivered package

| # | Defect | Severity | Evidence | Status |
|---|---|---|---|---|
| 1 | Amounts glued to a currency code, and identifiers (`TP05`, `Q3`, `v2.1`, `7(b)`), were invisible. 9 of 10 flips passed | Critical | red-team list | Fixed, regression-tested |
| 2 | Zone guard documented as "fails closed" **failed open on 15 of 28** realistic filenames: every non-English audit name, and every `.csv/.txt/.json/.yaml` file, was treated as lean | Critical | filename battery | Fixed |
| 3 | Chinese, Malay, Spanish negations and modals were unprotected; numbers after a Chinese character were invisible | High | 6 of 6 missed | Fixed |
| 4 | Registry located skills by this container's folder names: identical content under another layout gave **10 false `declared_missing` errors**, so the gate would fail on every entry in a real install | High | relabelled-layout test | Fixed |
| 5 | Registry hashed raw bytes: a Windows (CRLF) checkout never matched | Medium | CRLF test | Fixed |
| 6 | Sign-off log read-then-append was unlocked. Under contention the chain **broke at entry 29 and 1,163 of 1,200 later writes were refused**, making every approval unverifiable | High | tight-loop contention test | Fixed with a file lock |
| 7 | My fuzz located the numbers it mutated with the guard's own regex, so it shared the guard's blind spot and could not fail | Process | positive control | Rebuilt generator-driven; fails 7 of 10 on the old engine |
| 8 | My gate finding **overstated** the gap ("can go FINAL without either") and was in four delivered or live places | Accuracy | two-gate measurement | Corrected everywhere; a test forbids the old wording |
| 9 | Near-identical skills under **different** names were invisible to a name-based check (the v6 engine is installed twice, similarity 0.98) | Coverage | similarity scan | 5 pairs found, declared, enforced |
| 10 | The shipped package was stale (5 scripts behind the working tree) | Process | cmp | Rebuilt |
| 11 | Faithful rewrites flagged: `5 percent`, `1,700` vs `1700`, `Rule 9` vs `Rule 09`, `RM 1,700` | Medium | 9 of 17 | Fixed |
| 12 | Minor: broken-pipe traceback; missing PyYAML reported as 146 errors; baseline age hidden on non-GNU `date`; a dead import; a missing exception chain | Low | static analysis | Fixed |

Two of my own tests of the critique were invalid when first run (a wrong relative path, a shell
quoting error). I discarded them and re-ran them correctly before drawing conclusions.

## 3. What the critique found sound

- **The CAE fieldwork engine v6.0 is internally consistent.** All seven countable claims in its frontmatter
  match what its body enumerates: 20 iron rules, 12 recon tests, 14 test programs, 18 send functions,
  12 error patterns, 7 scheduled tasks, a 10-item gate; and the 30-item conversion QA sums to 30 across
  its six groups, each matching its declared range. This is stronger self-consistency than most
  skill libraries show.
- The guard scales linearly (about 2 s per MB, no regex blow-up), needs only Python 3.7, makes no
  network calls, and is clean under bandit, shellcheck and ruff.
- Hash-anchored declarations are a sound design once normalised.
- The launcher/master name collision needs **no rename**: they are different documents, plugin skills are
  namespaced, and trigger overlap is low (Jaccard 0.12 to 0.15).

## 4. Advice on the engines

**The meaning guard (my plugin).** Keep it as a trip-wire on Zone L content only. Never use it to
approve a rewrite of anything with legal or regulatory force. Read every REVIEW. A recorded sign-off
proves who decided and when, not that they are who they claim: if you need authentication, record
sign-offs through signed commits. If you hold Tamil or Hindi documents, add a language pack
before compressing them.

**The CAE fieldwork engine v6.0.**
1. Add the supplementary classification check (S1). It is drafted in `decision-patches/` and validated.
2. The conversion gate's item 28 checks that an aggregation summary is *present*, not that the
   independent review was *recorded*. Tightening it is an owner decision.
3. The skill states that the tool enforces the gate, but the tool's source is not in the skill folder, so
   that claim cannot be tested. Ship the tool source or its hash alongside the skill.
4. The v6 engine exists as two near-identical copies. The registry now fails if they drift, but a single
   source with a generated copy is safer than two hand-synchronised files.
5. Mark v3, v4 and v5 as superseded (v6's own metadata supersedes v4 and v5; v3 is inferred).

**AKOS and the lessons mechanism.** Keep exactly one lesson store. 22 of the 24 lines that exist only in
the plugin AKOS copy are older wording or have equivalents in the canonical copy. Two are content: a Kaizen pipeline line to glance at,
and a routing row naming a 27-item gate that governance deliberately reconciled away. Do not merge that row.

**Operating the portfolio.** Run `portfolio_gates.sh` weekly. Review the baseline within 90 days, because
it can quietly become permission to ignore known findings. Refresh the registry only after reviewing a
change, with `registry_check.py --refresh`.

## 5. What this critique could not assess

Live loading of the plugin, real trigger behaviour, how the tool code behind the skills behaves, whether
Claude loads caveman's skill on "be brief", and subagent behaviour. `live_verify.sh` and
`LIVE_VERIFICATION.md` cover these. The script is built to report INCOMPLETE, never a pass, when it cannot run.
