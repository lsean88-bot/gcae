# GIA governance suite: production-readiness report

Prepared for Sean, Group CAE. Date 2026-10-10. Suite version 1.2.1 (1.2.0 plus a verifier hotfix found by running it on your live install). This report replaces the earlier stress-test report; its findings are folded in.

## 1. Bottom line

I researched what was missing, built or fixed everything Claude can do from here, and validated it against about 820 test items. **The deterministic tools are production-grade. The suite is ready for a controlled pilot with your gates in place, not for unsupervised reliance**, because three things cannot be proven from inside this session: Claude's own classification and behaviour under real pressure, the accuracy of the statutory register against primary notifications, and how the tools behave on your real data.

The most important discovery of this round was not in the code: **at least eight of your installed India payroll skills still present the EPF wage ceiling as INR 15,000 "current"**, and it reportedly became INR 25,000 on 17 September 2026. Audits of pay periods from that date using those skills would apply the wrong ceiling. That is now fixed by a dated change notice and a freshness gate.

## 2. Research and what it changed

| Question | Finding | Source quality | What I did |
|---|---|---|---|
| Is there a defence against prompt injection that actually works? | Pattern filters are bypassed by adaptive attacks; the recognised defences are structural: isolate untrusted text in a quarantined reader, accept only constrained structured output, apply least privilege, keep humans on consequential actions | Peer-reviewed design-patterns paper (arXiv 2506.08837), OWASP LLM01, practitioner write-ups | Built the quarantined-reader protocol and a deterministic extract validator; demoted the pattern scanner to a tripwire |
| Did the EPF wage ceiling change? | Yes: INR 15,000 to 25,000, S.O. 5109(E), effective 17 Sep 2026, mid-month, rates unchanged, no postponement reported | Consistent across a BDO alert, an EPFO FAQ as reproduced, news and practitioner sources; Gazette not opened | Dated register, rate-table checker, notices in affected skills, split-period handling |
| What applies to a Puducherry unit? | Central laws plus UT rules; UT minimum wage notification dated 9 Sep 2024 (shops and establishments); S&E Act registration exemption order; profession tax is a local-body levy; GST code 34; a dedicated Registrar of Companies; official site blocks automated access | Mostly secondary (compliance vendors) and official-site snippets | Built a research-grade skill with a source-rated verification register; no value stated without a "verify" flag |
| Malaysian parameters since the skills were written | Minimum wage RM1,700 (Feb 2025), SOCSO/EIS ceiling RM6,000 (Oct 2024), EPF for foreign workers (Oct 2025) match your skills; an unverified "June 2026 SOCSO premium" change and revised Employment Pass thresholds need checking | Vendor guides | Recorded in the register with status and verify notes |
| Correct IIA citation numbering for GIAS 2024 | Not re-verified this round; existing skills cite standards by number and the QAIP skill says Standard 8 while the directory says Standard 12 | n/a | Flagged below as an open item |

## 3. Action plan Claude performed

| Gap | Action | Validation |
|---|---|---|
| Keyword router weak (29% to 42% on unseen requests) | Re-architected: Claude classifies, the script plans (`--intents`, `--entities`, `--jurisdictions`, `--flags`, `list-intents`); similarity demoted to suggestions with confidence labels | Plan correct 164/164 when classification is declared; regression 94/94 and 50/50 |
| Injection scanner weak (1 of 20 fresh attacks) | Quarantined-reader protocol, `validate_extract.py` (hash, verbatim grounding, containment), evidence-is-data rule | 15/15 extract-validator tests, including fabricated quotes, wrong hash, smuggled keys and instruction-like fact text |
| Stale statutory values in skills | `gia-statutory-freshness` (register + `check_rates.py`), change notices in five India skills, freshness step in the payroll and regulatory playbooks, `payroll-recompute --period-start` for mid-period changes | New case C24 (stale ceiling, split month, open-ended table row): 3/3; checker flags the open-ended and stale rows |
| No Puducherry coverage | `puducherry-india-ops-audit` (research-grade), jurisdiction and routing | Routing scenarios pass; registry check clean |
| Upgrade path unknown | Verifier (`verify_install.py`) that detects missing, older, duplicate and stale items; install and upgrade guide | Against today's install: 5 pass, 10 warn, 1 fail with specific actions; simulated upgrade from the shipped files: 12 pass, 1 expected warn, 0 fail |
| Security of the tools | Hardened `--where` (AST allow-list), CSV-injection-safe output, path confinement, SHA-256 instead of SHA-1, partial-path subprocess removed | Unit tests for each; bandit clean at medium and above; code search shows no network libraries, eval, exec or shell |
| Traceability | Input SHA-256 in every output, `--record` run log, tool versions | Unit test on the record |
| Compatibility | Python 3.9 syntax check; second environment on pandas 2.2.3 / numpy 1.26 | 45/45 unit tests and 43/43 analytics runs on both stacks |
| Quality gates | 45 unit tests, lint, one-command scorecard | All required suites pass against the shipped files, stress at 20x |
| Behaviour never exercised | Answered all 26 scenarios as Claude with the skills loaded and graded them | 23/26 on the first grader pass; the 3 misses were correct answers worded unexpectedly; 26/26 after widening those phrasings (tuned, self-graded) |

## 4. Results (shipped files, release run)

| Suite | Result |
|---|---|
| Analytics: 20 cases, 43 runs | 43/43 |
| Router regression (core, natural) | 94/94, 50/50 |
| Router with declared classification | 164/164 |
| Router on unseen requests (informational) | strict 29% and 42%; top-3 78% and 82% |
| Wording scenarios | 65/65 |
| Extract validator | 15/15 |
| Unit tests | 47/47 (pandas 3.0; 45 earlier on pandas 2.2.3) |
| Lint, security scan, Python 3.9 syntax | clean |
| Injection sets (informational) | known sets 45/45 and 30/30; fresh set 1/20 attacks, 2/20 false alarms |
| Grader | self-test 26/26; caught 10/10 hedged wrong answers; passed 5/11 reworded correct answers |
| Stress at 20x (45 tests) | 45/45, up to 80,000 rows, peak about 260 MB |

## 5. Defects found and fixed across the programme

Security: path traversal in `init_engagement.py`; CSV formula injection in analytics output; unrestricted filter expression (now allow-listed and tested). Reliability: raw tracebacks on corrupt documents, malformed CSVs, corrupt registers and a corrupt registry. Performance: router 79 ms to 6 to 10 ms per request; `split` 166 s to 1.2 s; `ghost` 22 s to 0.5 s. Correctness: amounts in parentheses and European decimals mis-parsed; small-sample Benford flags; round-number test blind to vendor concentration; wording-scanner misses on headings, short factual sentences and look-alike characters, and false alarms on negated terms. Content: stale EPF ceiling in installed skills (notice and gate). Verifier: running `/gia-verify` on your live install showed false registry-drift warnings for plugin-prefixed installs, because I had tested only standalone installs; fixed in 1.2.1 with a regression test that fails on 1.2.0.

Corrections to earlier statements: eight of the nine first-pass analytics failures were mistakes in my own answer keys, not tool defects; the earlier near-perfect router and scanner scores were tuned to my own test sets and did not generalise.

## 6. What Claude cannot do from here, and what you need to do

1. **Install and upgrade**: I cannot change your account. Follow `INSTALL-AND-UPGRADE.md`, then run `/gia-verify`.
2. **Verify the primary sources**: confirm the EPF Gazette notification and any rate you rely on; the register is dated research from mostly secondary sources, and the Puducherry official site could not be read.
3. **Independent behaviour test**: run the 26 behaviour scenarios in Cowork and have someone other than the model grade them; the self-run here is not independent.
4. **Real-data pilot**: run one low-risk engagement with every gate manual.
5. **Information only you hold**: the L99 v5.0 file, the IAR template v8.2, confirmation of entity codes (MKSDL, MABI, Fleet Parade, SAPL, BCP, Jacks), the engagement ID format, and which entity and licences are in scope for Puducherry.

## 7. Open items

- IIA citation numbers inside the existing skills (for example QAIP under Standard 8 versus Standard 12) were not re-verified; check them against the published GIAS 2024 text before external use.
- Other installed skills may hold stale parameters beyond the EPF ceiling (for example Malaysian values, Mexico, GST rates). The freshness register covers only the items listed; extend it as you find them.
- The optional L99 hygiene patch is not part of the default pack because a v5.0 file may exist elsewhere.

## 8. Recommendation

Proceed with a controlled pilot: install the suite, run `verify_install`, verify the three statutory items you will actually use, run the behaviour scenarios, and keep every decision gate manual for the first engagements. Measure, log misses in the Test Lab, and revisit after the pilot.
