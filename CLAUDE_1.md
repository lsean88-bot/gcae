# CLAUDE.md — GIA skill portfolio working rules (consolidation 29–30 Oct 2026)

## Canonical portfolio (use these; old names are redirect stubs)
- gia-core: iron-rules, gcgo-router (single router), runtime-guard, safeguard-lint, model-effort-routing, project-memory, self-learning, skill-hygiene
- gia-audit: lifecycle, engagement-planning, racm-icfr-testing, fieldwork-workpapers, gias-navigator, pack-india, pack-mexico, pack-malaysia
- gia-fraud: investigation, fraud-risk-governance, fraud-analytics, fsf-window-dressing, rbia-frm, entity-watch
- gia-analytics: data-reconciliation, performance-analytics, cost-accounting, recovery-analysis, scenario-modelling, continuous-assurance, payroll-analytics
- gia-report-qa: ia-report, board-brief, disclosure-calibration, external-release, evidence-trace, report-qa, presentation
- Old-to-new: MIGRATION_MAP.csv. Never re-create a retired skill; extend the canonical one.

## Standing decisions
- Report = standard concise IA report + Excel working paper (Profile A auditee/EXCO; Profile B Board/AC/Chairman). 13-section = legacy conversion reference only.
- Quality Gate = 12 items. Evidence R1–R5 (strict R3). Deficiency CD/SD/MW. Fraud ladder; no motive. Cite iron rules by name + number, never a total.
- Benford: Nigrini MAD primary (table version printed), z-scores locate spikes, chi-square supplementary. Control limits 3σ alarm / 2σ warning.
- Hooks: fail-closed for evidence/destructive/scope; warn-only for text lint. RBIA enforce hook opt-in only.
- Statutory values live ONLY in statutory-register-<juris>.md rows (IN-/MY-/MX-nnn) with verified-on; skills point to row IDs. Re-verify at point of use (Rule 02).

## Patterns learned (apply to any skill/plugin work)
1. Inventory by realpath. The same skill appears under many mount roots (1,573 hits = 682 unique).
2. Keyword scoping misclassifies vendor plugins. Define scope by an explicit owned-plugin list.
3. Split analysis and build by plugin ownership, so parallel agents never edit the same files.
4. Builder RESULTS.md files are claims. Independent QA re-runs everything on a copy. Round 1 found 15 defects the builders had not reported.
5. Keyword-matched cross-references fail: 23 of 30 sampled pointers were wrong. Use stable row IDs plus a pointer test, then sample semantically.
6. Quote every YAML description, because a colon in the text breaks the frontmatter.
7. Version is single-authority: bump every source together, then regenerate hashes last.
8. Mapping a retired skill is not the same as porting it. Record PORTED-to-path or DROPPED-with-reason per element (PORT_CHECK).
9. Embedded statistics and statutes go stale (ACFE 2024, pre-Labour-Code Acts, EPF ceiling 15k→25k). Keep them in one dated register.
10. Rate limits hit long agents. Save to disk continuously and resume agents (SendMessage), never restart them.
11. The description budget is per-plugin, not the 700-token total. Use ≤400 chars per description, trigger words first, and one "Do NOT use … (use …)" clause.

## Open items (owner: CAE)
- About 250 register rows are [UNVERIFIED]. Verify at point of use, or run a batch validation.
- Conflict MX-C4: is the REPSE 6% retention IVA or ISR? Standard of proof needs Legal input. Entity code MKSDL (alias MKSLD).
- No live Claude Code UAT has been run, and trigger evals are scripted rather than live. GCAE runtime status stays NOT_ACCEPTED until the T0–T16 UAT is run.
