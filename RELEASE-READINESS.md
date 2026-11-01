# Release readiness record: GIA governance suite v1.2.1 (2026-10-10)

## Verdict

**Ready for a controlled pilot on real engagements, with your gates in place. Not ready to be relied on unsupervised.** The deterministic tools, packaging, verification and documentation meet the criteria below. The parts that depend on judgement (Claude's classification, behaviour under real pressure, the statutory register) are self-assessed or research-grade and need the acceptance steps in section 3.

## 1. Go / no-go criteria and evidence

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Analytics find every planted issue and flag no decoy | GO | 43/43 runs over 20 synthetic cases, including the EPF ceiling-change case |
| 2 | Wording scanner correct on 65 scenarios incl. evasion and multilingual | GO | 65/65 |
| 3 | Plan is right when classification is declared | GO | 164/164 |
| 4 | Routing regression gate | GO | 94/94 core, 50/50 natural |
| 5 | Quarantined-reader validator rejects bad extracts, accepts faithful ones | GO | 15/15 |
| 6 | Unit and CLI tests | GO | 47/47 (45 on pandas 2.2.3 / numpy 1.26 before the two plugin-install tests were added; all 47 on pandas 3.0) |
| 7 | Lint and security scan | GO | ruff clean; bandit no medium or high findings; no network libraries, eval, exec or shell; subprocess only for pdftotext with fixed argv |
| 8 | Compatibility | GO | Python 3.9 syntax for all 32 scripts; two pandas/numpy stacks |
| 9 | Stress and hostile input | GO | 45/45 at 20x volume (up to 80,000 rows), peak about 260 MB; corrupt, malformed, binary and hostile inputs give messages, not tracebacks |
| 10 | Known vulnerabilities fixed | GO | Path traversal in `init_engagement.py`; CSV formula injection; unrestricted `--where` expression (now an AST allow-list) |
| 11 | Shipped files install and verify cleanly | GO | `.skill` files unzipped into a fresh tree: verify_install 12 pass, 1 expected warn (optional L99 patch), 0 fail (simulated upgrade) |
| 11b | Verified against the live account (read-only) | GO with actions | `/gia-verify` on the installed v1.2.0: 8 pass, 8 warn, 0 fail. It exposed a verifier defect (false registry drift for plugin installs), fixed in 1.2.1 with a regression test that fails on 1.2.0. Remaining warnings are real: duplicate copies, stale routing references, missing EPF notices |
| 12 | Traceability of results | GO | Input SHA-256 on every analytics output; optional run record log |
| 13 | Router natural-language accuracy | NO-GO as a control | Keyword inference 29% and 42% strict on unseen sets, top-3 78% and 82%. Mitigated by architecture: Claude classifies, script plans |
| 14 | Prompt-injection detection by pattern | NO-GO as a control | 1 of 20 fresh attacks. Mitigated by quarantined reader, least privilege and human gates |
| 15 | Model behaviour on the 26 scenarios | NOT INDEPENDENTLY VERIFIED | Self-run 26/26 after the grader was widened to three natural phrasings (tuned); regex grader passed only 5 of 11 correctly worded answers and caught 10 of 10 hedged wrong ones |
| 16 | Statutory register accuracy | CONDITIONAL | Dated and sourced, but mostly secondary sources; primary notifications not opened |

## 2. Residual risks (accepted, with owner)

| Risk | Mitigation | Owner |
|---|---|---|
| Novel prompt injection influences the model | Quarantine, gates, read PRESSURE/INJECTION items yourself | Sean |
| Wrong classification leads to the wrong plan | Confirm plans at gates; measure with the behaviour scenarios | Sean |
| Statutory values wrong or stale | Verify against official notification; refresh register monthly | Sean / GIA analyst |
| Personal data in uploads | Mask identifiers; restricted Projects | Sean |
| Installed skills outside this suite carry stale content | Patch notices staged; run verify_install | Sean |

## 3. Acceptance steps before relying on it (you)

1. Install per `INSTALL-AND-UPGRADE.md` and obtain a clean `verify_install` result.
2. Verify the EPF ceiling change and any rate you will use against the official notification; update the register if needed.
3. Run the 26 behaviour scenarios in Cowork and grade with the LLM-judge prompt (ideally by a second reviewer). Require no critical failure on the eight named scenarios.
4. Pilot on one low-risk engagement with every gate manual; log misses in the Test Lab.
5. Re-run `run_all.py` after any change to a script, registry or rule.

## 4. Version and integrity

Suite 1.2.1: gia-evidence-discipline 1.2.0, gcgo-orchestrator 1.2.1, gia-statutory-freshness 1.0.0, puducherry-india-ops-audit 1.0.0. File integrity: see `MANIFEST.sha256` in the master zip.
