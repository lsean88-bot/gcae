# CFE Gap Analysis and Roadmap (v2.3.0)

Scope: what a professional Certified Fraud Examiner performs versus what this plugin covers, per area requested by the GCAE. Basis: an independent CFE-lens review of v2.2.0 content and the analytics toolkit, plus the pilot simulation. Evidence limits: synthetic data only, single runs, no real-case back-testing.

Status key: COVERED (works now) / PARTIAL / DRAFT (plugin drafts, human decides) / HUMAN (only a qualified person may do it) / EXTERNAL (needs data or systems not in the plugin).

## 1. Fraud audit skill (method)
| CFE activity | Status | Note / next step |
|---|---|---|
| Context-first triage, no fraud conclusion from one anomaly | COVERED | Class A-D, 3 independent evidence types (house rule, not an ACFE standard) |
| Predication and scheme mapping as hypotheses | COVERED | /audit-fraud-assess, agent cfe-investigator |
| Fraud-theory cycle (hypothesise, test, refine) with evidence-vs-hypothesis (ACH) matrix | PARTIAL | Add template (M) |
| Behavioural red flags, fraud triangle/diamond | GAP | Add reference 12 (M) |
| Intake, hotline triage, case log, investigator conflict check, closure criteria | GAP | Add templates (M) |
| Management implicated: route to Audit Committee chair | COVERED (v2.3.0) | Reference 10 section 7 |
| Interviews, accusations, credibility, termination, police referral | HUMAN | Plugin drafts plans only |

## 2. Knowledge
| Item | Status | Next step |
|---|---|---|
| MO library (~30 schemes, 5 families) | PARTIAL | Covers a subset of the ACFE tree; missing branches now disclosed. Add register disbursements, false refunds/voids, cash on hand, false sales/shipping, customer-side, healthcare billing (M) |
| Per-jurisdiction legal map (India, Malaysia, Mexico): mandatory reporting, whistleblower, limitation, labour-law limits on deduction/suspension, data protection, privilege | GAP | Blanket VERIFY JURISDICTION today. Needs counsel-reviewed supplement (L). Do not draft from memory |
| Recovery cautions (set-off, settlement, tipping-off) | COVERED (v2.3.0) | Reference 10 |
| Overlap with group skills (cae-fraud-investigation, group-cae-fraud, grc-agentic-fleet) | RISK | Portfolio duplication. Decide a single owner for MO knowledge and cross-reference rather than copy |

## 3. Fieldwork engine
| Item | Status | Next step |
|---|---|---|
| Evidence hierarchy, preservation, chain-of-custody principles | PARTIAL | Add preservation checklist with retention clocks (CCTV, mailbox, chat, ERP logs) (S) |
| Document pack and interview plan drafts | DRAFT | Add Upjohn-type/non-retaliation wording for counsel review (S) |
| Digital forensics: imaging, write-block, hashing, eDiscovery, privilege screen | EXTERNAL/HUMAN | Specialist provider; add scope-letter template (M) |
| Net-worth, expenditure, bank-deposit methods; link analysis; funds tracing | EXTERNAL/HUMAN | Personal data; plan template only (M) |
| Working papers fit for litigation (second-analyst reperformance) | PARTIAL | Add standard (S) |

## 4. Analysis and data processing
| Item | Status | Next step |
|---|---|---|
| Profile with control totals, duplicates, splits, round, sequence, blanks, calendar, overlap, SoD, recon, JE, rate variance, Benford with preconditions | COVERED | 27 regression checks pass |
| Reader robustness (delimiter, encoding, short rows, multi-line row numbers, ISO timestamps, NaN/inf) | COVERED (v2.3.0) | Fixed after review |
| Non-Latin name matching, same-day change-then-pay, 0 vs 0 recon, gross/absolute recon, no-contract invoices, defaults disclosed, script hash and command logged | COVERED (v2.3.0) | Fixed after review |
| Not yet fixed: numeric locale (1.234,56), day-first-only date formats, ratevar effective dates/amendments/service key, JE credits/period-end/posting-time, JE quadratic runtime, fuzzy match silently skipped on large files, splits overlapping windows | OPEN | Next release (M) |
| Missing tests: Benford first-two/second/last-two digits, robust outliers, vendor concentration, three-way match, invoice after payment, dormant vendor reactivation, payroll ghost/headcount recon, lapping, credit-note/refund abuse | GAP | Next release (L) |
| Independent second-method check (pandas/awk) in CI | GAP | (M) |

## 5. Modus operandi interpretation
| Item | Status | Next step |
|---|---|---|
| Footprint to scheme to benign alternative to settling evidence | COVERED | Tool column may be PARTIAL; scheme is TESTED only if a test actually ran |
| Interpretation guardrails: overlap not additive, no projection from unreconciled quantity, leads not findings | COVERED | |
| Loss-quantification templates (overbilling, phantom scrap, duplicate recovery net of credits, range, overlap matrix) | GAP | Workbook template (M) |
| False-positive tracking and back-testing on closed cases | GAP | Highest-value validation; needs anonymised closed cases (M, EXTERNAL) |

## 6. Prioritised next steps
1. Back-test on 3-5 closed cases and record false-positive rate (EXTERNAL data, M).
2. Jurisdiction supplement reviewed by counsel (L).
3. Close the OPEN analytics items and add the missing procurement/payroll tests (L).
4. Templates: ACH matrix, intake/case log, preservation checklist, loss workbook (M).
5. Run the skill description-trigger optimiser (not yet run) and resolve overlap with existing group skills (S/M).

## 7. Limits
Synthetic data; single runs; the pilot QA was self-applied; hooks protect only Claude Code sessions with the plugin loaded; the plugin cannot authenticate documents, assess credibility or give legal conclusions.
