# Round 2 independent QA: gia-core, gia-audit, gia-fraud, gia-analytics, gia-report-qa (all 1.0.1)
Date 30-Oct-2026. Fresh copy of build/gia-* in qa/work2/ (gia-core re-copied at 07:1x after the builder regenerated BUILD_HASHES; the other four are byte-identical to build). Builder claims were treated as unverified. Logs: qa/logs2/. Scripts: qa/scripts/r2_*.py.
Labels: PASS / FAIL / PARTIAL / NOT OBSERVED / BLOCKED / NOT APPLICABLE.

## 1. Release verdict per plugin
| Plugin | Verdict | Basis |
|---|---|---|
| gia-fraud | RELEASE-READY | All tests re-run clean; structure, references, statutory, wording, confidentiality clean; economy within 700 |
| gia-analytics | RELEASE-READY | All 7 suites clean; only Low notes (plugin-level redirects `(use gia-audit)`, `(use gia-report-qa)` in two descriptions) |
| gia-report-qa | RELEASE-READY | 4 suites clean; Low notes (grammar glitch, one legacy header still flagged by the drift script) |
| gia-audit | READY-WITH-NOTES | All Round 1 High defects verified fixed; Malaysia (about 40 lines) and Mexico (about 16 lines) still carry inline SST, tax, penalty values with no register row; 1 port row PARTIAL |
| gia-core | READY-WITH-NOTES | 21/21 quick steps clean in 3 of 3 sequential runs; all `--full` steps completed (run separately); 7 port rows PARTIAL; descriptions 784 tokens against 700 |
Live Claude Code UAT remains NOT OBSERVED for every plugin (RELEASE_MANIFEST says NOT_ACCEPTED); verdicts cover what can be observed here.

## 2. Summary table (check x plugin)
| # | Check | core | audit | fraud | analytics | report-qa |
|---|---|---|---|---|---|---|
| 1 | Test entry points re-run, counts vs claims | PASS | PASS | PASS | PASS | PASS |
| 2 | Structure (manifest, frontmatter, line caps, models, reviewer tools, evals >=3/>=3) | PASS | PASS | PASS | PASS | PASS |
| 3 | Cross-suite and local references | PASS | PASS | PASS | PASS | PASS |
| 4 | Trigger overlap, pairwise | PASS | PASS | PASS | PASS | PASS |
| 5 | Governance drift | PASS | PARTIAL | PASS | PASS | PARTIAL |
| 6 | Statutory (register agreement, pointers, no inline values) | NOT APPLICABLE | PARTIAL | PASS | PASS | PASS |
| 7 | Confidentiality, role-not-name | PASS | PASS | PASS | PASS | PASS |
| 8 | Conclusive fraud wording outside fixtures | PASS | PASS | PASS | PASS | PASS |
| 9 | Economy (name+description chars/4 vs 700) | FAIL | FAIL | PASS | PASS | PASS |
| 12 | Every SKILL/agent/command frontmatter parses as YAML | PASS | PASS | PASS | PASS | PASS |
Checks 10, 11, 13, 14 are suite-level (sections 3.10, 3.11, 3.13, 3.14).

## 3. Evidence
### 3.1 Test re-runs (builder claim vs observed)
| Plugin | Observed |
|---|---|
| gia-core quick set | 21 steps (was 20; adds "router selections exist"), 21 passed, in each of 3 sequential runs. Guard 170 assertions; GR hooks 349/349; lint 72 and 25; iron-rules 20; effort 20; router 16/16; verify_install 13/0/0; self-learning 14; hygiene 27; kg 14; brain 273 passed 68 skipped; pytest 32. Hashes: all BUILD_HASHES entries OK on the final copy |
| gia-core extra | pytest wrappers, economy, grader, fuzz 39 passed (195 s); guard mutation 72/72 killed; grader mutation 23/23 killed; GR-controls mutation 45/45 killed |
| gia-audit | `unittest` 54 OK (was 28) |
| gia-fraud | gate 31/31, e2e ALL PASS, FAE 13/13 (15/15 planted), Benford 6/6, opt-in 3/3, structure 168/0 |
| gia-analytics | 24, 18, 15, 21, 26, 23, 24; structure 120/0 |
| gia-report-qa | selftest 121 ALL PASSED; new checks 36/36; structure 118/118; evals 16/16 |
Shared `validate_structure.py` now passes on gia-audit (279/0), gia-report-qa (218/0), gia-core (220/0). All counts equal or exceed Round 1.

### 3.2 Structure
36 skills, 46 agents, 40 commands; all plugin.json valid, version 1.0.1; every skill name equals its directory; descriptions <=397 chars; longest SKILL.md 209 lines; every agent `sonnet|haiku` with an Effort line; READMEs 22 to 46 lines; MIGRATION.md 18 to 67 lines. Evals (yaml.safe_load): every skill has >=3 should and >=3 should-NOT prompts (gia-audit was 0/0 in Round 1). Reviewer agents `itgc-erp-reviewer` and `data-validator` are now `Read, Grep, Glob`. `statutory-validator` keeps `Write` (it updates register rows; Low). Hygiene (Low): 6 empty `scripts/` dirs in gia-audit, `gia-audit/.work/`, 1 `__pycache__` in build.

### 3.3 References
1,418 `gia-*:<name>` strings scanned, 0 unresolved (only `gia-core:fleet` in CHANGELOG.md:11 as history; the router now selects existing agents, tested by the new step). 56 description redirects: 51 resolve to skills, 2 point to a plugin (`gia-audit`, `gia-report-qa`), 3 are prose ("that skill", "the pack statutory registers", an agent). In-skill `references/x` mentions: the 24 residual hits are all "`plugin:skill` references/x" cross-skill forms or sentence-embedded names, each checked to exist. `check_rates.py` now exists (`gias-navigator/scripts/`). `run_critique.py` finds `run_preflight.py` in the flat layout and in a simulated `<plugin>/<version>/` cache layout (was None). Script paths use `${CLAUDE_PLUGIN_ROOT}` (core 13 files, audit 7, fraud 5, analytics 10, report-qa 9; relative `python3 scripts/` count 0).

### 3.4 Trigger overlap
Highest token-Jaccard: pack-india vs pack-mexico 0.306, pack-malaysia vs pack-mexico 0.264, pack-india vs pack-malaysia 0.255. No pair >0.35; no shared trigger phrase beyond the "12-item Quality Gate" definition. Every description has "Do NOT use" with a pointer. Lexical heuristic only.

### 3.5 Governance drift (2 of 8 checks flag)
- Check 2: `gia-report-qa/.../legacy-13-section-conversion.md` still lists "IRON RULES - RC-01 to RC-12" in its contents (line 21). The file defers to gia-core:iron-rules. Low. The nmsb-finance and nmsb-ops findings are cleared.
- Check 3: `gia-audit/.../workbench-apps.md:3,22` mention "15-item gate" while documenting the retired app. Documentary, Low.
- Greps clean: no gate counts other than 12 outside history files, no rule totals, no Fable/sentinel/Craigs outside scrub notes, no chi-square-primary, "beyond reasonable doubt" only as a prohibition (`gia-fraud-investigation/SKILL.md:50`).

### 3.6 Statutory and 11 pointer re-sample
- Registers agree with VALIDATED_FACTS.md on every comparable row (EPF Rs 25,000 from 17-Sep-2026; ESIC Rs 21,000; Labour Codes 21-Nov-2025; MY minimum wage RM1,700 and RM8.72; SOCSO/EIS RM6,000; UMA 117.31; minimum wage 315.04 and 440.87; ISO 37001:2025; MAD bands). Register rows: IN 146, MY 30, MX 38.
- Pointers are now `[IN-nnn]`, `[MY-nnn]`, `[MX-nnn]`: 905 pointers, 139 distinct IDs, 0 missing IDs, 0 leftover `[register]`. Sample of 30 (seed 20261031; 10 IN, 10 MY, 10 MX): 30 of 30 point to a topically matching row (one partial: IN-055 "minimum bonus" cited for the Rs 7,000 floor, which the row text contains). PASS.
- Stale values from Round 1 are gone (RM1,500; RM8.17; ISO 37001:2016; MXN 108; Rs 15,000; SOCSO ceiling RM5,000).
- Remaining (Medium, gia-audit): inline values with no register row, mainly Malaysia SST, corporate tax, penalties (`mkpc-sst_compliance.md` 9 lines, `clinic-C_sst_compliance.md` 5, `mfg-R15-compliance-calendar.md` 4, `clinic-F_statutory_hr.md` 4, `mkpc-employment_payroll.md:45-47` SOCSO table) and 16 Mexico lines (REPSE 6%, IVA 16%, PTU 10%). No contradiction with a register row was found; they are unverified.

### 3.7 and 3.8 Confidentiality and fraud wording
0 hits for all 10 named people and "KJ Tech" and for Datin/Dato titles. First name "Sean" now only in plugin.json author (mandated) and one test string. Public case citation `clinic-A_regulatory_compliance.md:47,79` unchanged (informational). Conclusive wording: none outside fixtures and lint patterns; scheme nouns remain at `hr-fraud-schemes.md:14` ("perpetrator-controlled") and `mx-red_flags.md:178` (Low).

### 3.9 Economy (name+description chars/4)
| | core | audit | fraud | analytics | report-qa | Total |
|---|---|---|---|---|---|---|
| Skills | 784 | 764 | 589 | 693 | 683 | 3,513 (Round 1: 8,021) |
| Agents | 1,010 | 139 | 495 | 265 | 706 | 2,615 |
| Commands | 236 | 120 | 215 | 87 | 325 | 983 |
Against a 700 target per plugin: core and audit miss by 84 and 64 tokens; the other three meet it. Suite total for skills is 5x the 700 library-wide figure the builder quoted; gia-core agents add 1,010 tokens of descriptions.

### 3.10 Port check (migration/PORT_CHECK.md: 27 rows, not 28)
Method: tf-idf distinctive terms of each source SKILL.md compared with the target skill and plugin, then each low-coverage row read against the target files.
| Verdict | Rows |
|---|---|
| PASS (18) | audit (stub); cae-entity-intel; cae-methodology (methodology-playbook.md); cae-audit-workbench and cae-field-auditor (workbench-apps.md maps every tab to its new home); cae-framework-reference x2; dialysis-finance and dialysis-operations chiefs; in-manufacturing-audit (3/3 headings exact); mac-audit-constitution-l99 (retired stub); master-audit-superagent (agent-briefs, phase-map; model rule delegated to model-effort-routing); pune-vda-tracker; cae-data-guardian, cae-command-centre and group-cae-second-brain (source-intake-and-data-discipline.md sections 1 to 6); assurance-orchestrator (assurance-chain.md); mktron-grc-function (charter and QAIP routing in playbooks.md) |
| PARTIAL (9) | cae-24m-plan-manager (tier coverage and plan invariants ported; AC plan-approval paper and coverage-map layout absent); cae-rag-document-intelligence (a 268-line source reduced to one 7-line "document-grounded mode" section; RAG rules 01 to 10 absent); gia-file-catalog and gia-file-catalog-2 (file catalog rules ported; `catalog_engine.py` and `completeness_report.py` not ported, stated in gia-core MIGRATION.md:65); cae-persona x2, group-cae, group-cae-core (role identity and professional capabilities text absent; routing precedence kept; no DROPPED decision recorded); cae-cowork-ai-plugin (955-line app; only its gate variants are documented, as rejected) |
| FAIL (0) | none |
Fix for PARTIAL rows: record each as PORTED or DROPPED with a reason in the owning plugin's MIGRATION.md (7 rows gia-core, 1 gia-audit); for cae-rag, either port RAG-01..RAG-10 or mark them DROPPED. MIGRATION_MAP.csv still says "content-port to be verified by QA" on these rows.

### 3.12 YAML frontmatter
122 files (36 SKILL.md, 46 agents, 40 commands) parsed with `yaml.safe_load`: 0 errors; every skill and agent has non-empty string name and description; every agent model is sonnet or haiku; every command has a description.

### 3.13 gia-core `--full` and flakiness
- Steps run separately so each finishes: pytest wrappers 39 passed; guard mutation 72/72; grader mutation 23/23. GR-controls mutation: 45 mutants, 45 killed, 0 survived, 0 pattern-not-found (about 21 s per mutant, 16 minutes in total when run alone; the 900 s attempt in the shared run stopped at 37 killed).
- Quick set run 3 times sequentially, no other load: 21/21, 21/21, 21/21; step timings stable (guard 74 to 76 s, brain 32 to 34 s, verify_install 6 to 7 s).
- Builder's 4 transient failures, diagnosed: (a) "router registry is current" failed in my first snapshot because the builder rewrote `capability-registry.json` at 07:07, after my 07:03 copy (diff showed only that file; build_registry `--check` passes on build and on the refreshed copy); (b) the 2 router test failures in that same first run did not reproduce: after refresh, `test_gcgo.py` passed 16/16 twice with 12 CPU-bound processes running, and passed in all 3 sequential runs, so the failure came from the stale registry, not timing; (c) `verify_install` passed 13/0/0 under the same load and in 3 of 3 runs; (d) the brain timing test passed 273 in 3 of 3 runs but my first mutation run (`mutate_gr_controls.py`, run while 9 other jobs shared the machine) died on a hard 110 s sub-test timeout, so timing-sensitive steps depend on idle CPU. Residual risk: Low, load-dependent; raise the mutation harness timeout from 110 s to 300 s.

### 3.14 Redirect stubs (53 in migration/stubs/)
All 53 parse as YAML, name equals directory, description under 1,024 chars, and each names exactly one `<plugin>:<skill>` that exists in the built plugins; each agrees with MIGRATION_MAP.csv. 53 of 53 PASS. MIGRATION_MAP.csv (196 rows): 13 targets are descriptive text (agents, "presentation review mode", `gia-audit:statutory-register`), not skill names (Low).

## 4. Open items (none Critical or High)
| ID | Sev | Location | Item | Exact fix |
|---|---|---|---|---|
| N1 | Medium | gia-audit/skills/gia-pack-malaysia/references (files in 3.6), gia-pack-mexico/references | About 56 inline statutory values with no register row | Add MY SST/tax/penalty rows and MX REPSE/IVA/PTU rows to the registers (status `[UNVERIFIED]`) and replace the text with pointers |
| N2 | Medium | gia-core, gia-audit MIGRATION.md; migration/MIGRATION_MAP.csv | 9 PARTIAL port rows without a PORTED/DROPPED record | Record dispositions as in 3.10 |
| N3 | Medium | gia-core, gia-audit descriptions | 784 and 764 tokens against 700 | Trim about 85 and 65 tokens (gia-core also trim agent descriptions) |
| N4 | Low | `gia-core/tests/mutate_gr_controls.py` | 110 s sub-test timeout fails under load | Raise to 300 s |
| N5 | Low | `safeguard-lint/SKILL.md:3`, `gia-report-qa/SKILL.md:3` | "when about to releasing / issuing" grammar | "when about to release / issue" |
| N6 | Low | `legacy-13-section-conversion.md:21`; `workbench-apps.md:3,22` | Drift script still flags a contents line and a documentary "15-item gate" | Rename contents entry to "Conversion rules RC-01 to RC-12"; reword to "an older fixed-size gate" |
| N7 | Low | analytics descriptions | `(use gia-audit)` and `(use gia-report-qa)` name a plugin, not a skill | Use `gia-audit:gia-pack-india` etc. |
| N8 | Low | gia-audit | 6 empty `scripts/` dirs, `.work/`; `statutory-validator` has Write | Delete empties; document the Write exception |

## 5. NOT OBSERVED / BLOCKED
- Live Claude Code UAT (install, auto-loading, hook firing, slash commands, `claude plugin validate`): NOT OBSERVED.
- Live trigger evaluation: NOT OBSERVED; overlap and eval checks are lexical or reasoned. The router documents strict accuracy of 29 to 42% on unseen phrasing.
- Statutory truth re-verification against primary sources: NOT OBSERVED (consistency with VALIDATED_FACTS.md only, several rows SECONDARY-ONLY).
- Port check is term-coverage plus reading; semantic equivalence of long sources (cae-cowork-ai-plugin, cae-rag) was judged on headings and key sections, not line by line.
- Cache-layout behaviour simulated with folders, not an installed plugin.
