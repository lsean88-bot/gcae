# Use-case review: payroll audit (ghost, post-resignation, overtime) - v2.5.0
Method: a synthetic payroll dataset (120 employees, 5 months, planted findings) was handed to a fresh session loaded with the plugin, with Step 0 answers pre-supplied. The session used the toolkit for every number and logged friction. Data: skills/.../evals/usecase-payroll/. Example output: docs/example-payroll-lead-report.md.

## What worked
- All five planted conditions were recovered as leads, none concluded: a payee not on the HR master with zero attendance (16 000 base pay), payments after resignation, repeated OT outlier, OT claimed but never clocked, shared bank account.
- The session also surfaced an unplanted pattern (paid OT 2 hours above clocked on 129 employee-months) and correctly labelled it a process rule more than individual abuse.
- It kept the discipline: Emp_IDs only, no named person, no legal citation, no loss claimed, no projection, four red-line gates, an RFI and an honest "self-applied QA" label.

## Weaknesses found and what was done (v2.5.0)
| Weakness | Action |
|---|---|
| No test for "paid with no support" per entity; ghost test needed two tools by hand | NEW `unsupported` |
| `datecheck` only worked one direction and treated blank resignation dates as noise | NEW `--mode b-after-a`, blank A date = no event, counts by issue, amount by key |
| `recon` could not isolate over-claims | NEW `--direction a-gt-b` / `a-lt-b` |
| Repeat outliers appeared as five separate rows | NEW `outlier --entity` roll-up |
| Overlap discipline was manual | NEW `--exclude COL=v1|v2` |
| Console flooded; `profile` showed alarming "unparsed" counts for text columns | NEW `--quiet`; per-column parse rates; probing no longer counted |
| `shared` hid the IDs and lowercased the value | Shows ids and original value |
| -h gave flag names only | Help text on key flags |
| No path for pre-answered Step 0, mid-analysis tolerances, defined test runs, output order for lead-stage reports, standard term for flagged totals, scenario vs projection conflict, IDs vs names, "country known, law not verified" | Rules added to SKILL.md sections 1 and 10 |
| No Decision Log template; run log unrelated to it | templates/decision-log.md; `--log` is its evidence appendix |
| MO library payroll rows pointed to tests that do not apply | Corrected |

## Remaining weaknesses (honest)
1. Synthetic data. Real extracts have encoding, merged-cell, multi-sheet and ERP-code problems the tests do not exercise. Back-test on anonymised closed cases.
2. Attendance after resignation needs daily attendance dates; the sample had monthly summaries.
3. Not automated: OT rate consistency (pay/hours), proration of final-month pay, statutory deduction anomalies, headcount reconciliation to the ledger, lapping, posting-time and unbalanced journal tests, inventory count/shrinkage analytics.
4. The skill is long (SKILL.md plus 14 references); different parts say related things in different places. A consolidation pass and the description-trigger optimiser are still to do.
5. The independent QA in these runs was self-applied; a separate reviewer should check high-stakes outputs.
6. Hooks protect only Claude Code sessions that have the plugin loaded.
7. Tool outputs embed absolute file paths, making JSON less portable.
8. Overlap with other group skills (cae-fraud-investigation, group-cae-fraud, grc-agentic-fleet) is unresolved.

## Suggested next functionality (priority order)
1. Back-test harness: run the toolkit on closed cases and record precision per test (false-positive rate).
2. OT rate and capacity test; final-pay proration test; daily attendance vs leaver date.
3. Posting-time, rarely-used-account and unbalanced journal tests; lapping from receipts allocation.
4. Workbook export of leads (Excel RCM-style working paper with row references) for Audit Committee files.
5. Fuzzy name matching with legal-suffix stripping and phonetic keys for related-party detection.
