**CONFIDENTIAL - GCAE ONLY - routine internal audit (not privileged) - DRAFT for human review**
**Engagement:** MKTron plant payroll, Malaysia | Apr-Aug 2026 | MYR | Materiality: overall 20,000 / performance 12,000 / clearly trivial 1,000 (GCAE-set) | Jurisdiction: VERIFY JURISDICTION (no statute cited; every legal or statutory point below is open)
**Employees are referred to by Emp_ID only. Nothing here names a person as responsible for anything.**

---

## 1. Sufficiency status

**PARTIAL.** The three files are internally consistent and complete for the period. They are enough to raise leads. They are not enough to conclude on any of them.

| Required evidence | Received? | Source / ref | Gap | Requested from | Priority |
|---|---|---|---|---|---|
| HR master (120 rows) | Yes | hr_master.csv, sha256 5e4d66ab... | No extract date, author or source control total. No change or audit trail. | HR | High |
| Payroll Apr-Aug (603 rows) | Yes | payroll.csv, sha256 0f32fd9f... | No payroll register or bank-file total to tie to (file totals: Basic 2,128,100, OT pay 95,900, OT hours 3,836). | Payroll / Finance | High |
| Attendance Apr-Aug (603 rows) | Yes | attendance.csv, sha256 2eaf7c14... | No source system or clock-device log. No leave records. | Plant HR / time-office | High |
| Termination records (notice, final settlement, leave encashment, withdrawn resignations) | No | none | Cannot test E011 benign causes | HR | **Critical** |
| New-joiner / contractor / agency-worker list and onboarding file for E999 | No | none | Cannot test E999 benign causes | HR / Payroll | **Critical** |
| OT approval forms and approver | No | none | Cannot test who approved the padding | Plant / Production | High |
| Bank account holder verification and bank payment file | No | none | Payee cannot be authenticated from this data | Finance / Treasury | High |
| Sept-Oct 2026 payroll | No (out of scope) | none | Cannot say whether E999 and E011 are still being paid | Payroll | High |
| Statutory OT limits, OT rate rules | No | none | Cannot assess E030. VERIFY JURISDICTION. | Counsel / HR | Medium |

**Data quality.** Row counts reconcile exactly: 121 payroll IDs x 5 months, less 2 months for E026 (stopped after June), is 603. Attendance has the same 603 keys with no one-sided keys. There are no duplicate employee-months, no bank or Basic mismatches between payroll and HR, and PayDate is the 28th every month. These are my own cross-checks, not tool output. The tool's `unparsed_values` counters in `profile` read as noise (text columns counted as unparsed numbers), so I did not rely on them. The extract is not tied to a source control total, so every figure below is a figure in the file, not a figure in the ledger.

## 2. Judgment and confidence

Four leads are worth your attention. Two involve payments to an ID or a leaver, one involves overtime paid with no clock record, and one is a company-wide overtime pattern. None is a conclusion.

- **E999 (ghost-employee lead): MYR 16,550 paid, Apr-Aug.** I rate it **moderate confidence as a lead; no conclusion**. On the files there is no HR record, a bank account found nowhere else, and zero days present in all five months. A benign explanation (HR load lag, agency or contract worker paid through payroll) is plausible but has not been seen. It would need five months of a missing master record to be benign.
- **E011 (paid after resignation): MYR 10,100 paid Jun-Aug.** **Moderate confidence.** HR shows resignation on 31 May 2026. Payroll paid on 28 Jun, 28 Jul and 28 Aug. Attendance shows E011 present 23-25 days a month and clocking OT after 31 May, so the person appears to have kept working. That points to a wrong or withdrawn resignation record, or to attendance being recorded for someone who is no longer there. I cannot tell which.
- **E050 (OT with no clock): MYR 2,000.** **Moderate confidence.** Exactly 16 OT hours is paid every month for five months, and clocked OT is 0 every month. Benign causes (OT worked off-clock, a manual approval, a missing time-clock feed) are open.
- **Uniform +2 hour OT excess: MYR 6,450 across 129 employee-months.** **Moderate to low confidence on cause, high confidence on the pattern.** Paid hours exceed clocked hours by exactly 2 in these rows. It is spread over 87 employees, all four departments and all five months. That looks like a process rule (rounding up, or a default entry) more than individual abuse. It is a Class B/C lead, not a fraud lead.
- **Overtime abuse in the sense of excessive hours: not shown.** The only extreme user is E030 at 60 OT hours a month, 300 hours and MYR 7,500 over the period. The clock supports those hours (58-60 clocked), so this is a working-hours and approval question, not payment without evidence. I cannot say whether 60 hours a month breaches any limit: VERIFY JURISDICTION.

**What was not found.** No other IDs are paid without being on the HR master. There are no payments to a joiner before their join date (all joined 2024-01-15). E026 resigned 30 Jun and was correctly dropped from July payroll, which shows the leaver process can work. Payment dates are uniform.

## 3. Evidence table

All figures come from `fraud_analytics.py` v2.5.0 (script sha256 4f0672cee5b4...), run with `python3 -I -B`. Input hashes are in the run log. Row numbers are file lines (header = line 1).

| # | Lead | Test and parameters | Population / denominator | Exceptions | Refs | MYR (file figure) |
|---|---|---|---|---|---|---|
| L1 | E999 paid, not on HR master | `overlap --unmatched` payroll.Emp_ID vs hr.Emp_ID (t1_ghost.json) | 603 payroll rows vs 120 HR IDs | 5 rows | payroll rows 122, 243, 364, 484, 604 | see L1b |
| L1b | E999 paid, no attendance | `unsupported` keys Month,Emp_ID, Basic vs Days_Present (t2) | 603 rows, 121 IDs | 1 ID, 5 of 5 months | same rows | Basic 16,000 |
| L1c | E999 bank account unique | `overlap --unmatched` payroll.Bank vs hr.Bank (t7) | 603 rows | 5 rows, ACC9999 | same rows | within L1b |
| L2 | E011 paid after resignation | `datecheck --mode b-after-a` hr.Resign vs payroll.PayDate, amount Basic (t3) | 120 HR rows, 2 with a resignation date | 3 payments, +28, +58, +89 days after 31 May | payroll rows 254, 375, 495; HR row 12 | Basic 9,600 |
| L3 | E050 OT with no clock | `unsupported` OT_Pay vs OT_Hours_Clocked, amount OT_Pay (t4b) | 603 rows | 1 ID, 5 of 5 months, 16 hrs a month | payroll rows 51, 172, 293, 413, 533 | 2,000 |
| L4 | Paid OT hours above clocked hours | `recon --direction a-gt-b` keys Month,Emp_ID, OT_Hours vs OT_Hours_Clocked, tol-pct 0 (t4) | 603 keys, 603 matched | 138 keys; 133 differ by exactly 2 hrs, 5 are E050 | see t4_otrecon.json | 346 hrs net |
| L5 | Repeat OT outlier | `outlier` OT_Hours by Month, entity Emp_ID, z 3.5 (t5) | 603 rows | E030 in 5 of 5 months, 60 hrs vs median 8 or 4 | payroll rows 31, 152, 273, 393, 513 | 7,500 (clocked, supported) |
| L6 | Shared bank account | `shared` Bank by Emp_ID, on HR master and on payroll (t6, t6b) | 120 HR rows | ACC1042 shared by E041 and E042 (HR rows 42-43) | HR rows 42, 43; payroll rows 42-43, 163-164 and 3 more pairs | not quantified |

**Amounts, each shown once (overlap discipline).** Amounts in L1/L1b/L1c are the same payments. L4 includes E999 (3 rows), E011 (1 row, Aug) and E050 (5 rows), which are already in L1, L2 and L3.

| Component | Basis | MYR |
|---|---|---|
| E999 payments Apr-Aug (L1) | Basic 16,000 (tool) + OT pay 550 (payroll rows) | 16,550 |
| E011 payments Jun-Aug (L2) | Basic 9,600 (tool) + OT pay 500 (payroll rows) | 10,100 |
| E050 OT pay with no clock (L3) | tool | 2,000 |
| +2 hr OT excess (L4), excluding E999, E050 and E011-Aug | 129 rows x 2 hrs x MYR 25/hr | 6,450 |
| **Headline: payments flagged for resolution** | | **35,100** |

Notes on the table:
- The MYR 25/hr rate is what the file shows on every OT row (OT_Pay / OT_Hours = 25 in all 417 rows with OT). It is not a verified policy rate.
- I rebuilt the figures with a second method (pure-Python re-read of the three files). They agree with the tool.
- The 129-row count and the 6,450 come from summing the tool's `recon` output with the three overlap exclusions above. The tool cannot exclude rows itself.
- **35,100 is a sum of payments flagged for resolution, not a loss.** Some or all may prove to be valid payments. It is **not ACTUAL LOSS**.

**Against your thresholds.** The whole headline (35,100) is above overall materiality (20,000). Individually: L1 (16,550) is above performance materiality (12,000) and below overall; L2 (10,100) is above clearly trivial and below performance; L3 (2,000) is just above clearly trivial; L4 (6,450) is below performance but systemic (87 employees, every month). L5/L6 carry no amount. Whether any item matters qualitatively regardless of amount is your call.

## 4. Triage (context-first)

| Lead | Class | Basis | Missing context | Question that resolves it |
|---|---|---|---|---|
| L1 E999 | **C + open question** (2 of 3 evidence types) | Control failure (paid with no master record) plus economic inconsistency (no attendance days). No benefit or concealment evidence seen; bank ownership is unknown. | Who is E999; who created the payroll record; whose account is ACC9999 | See RFI Q1-Q2 |
| L2 E011 | **C** | Termination not processed; attendance contradicts the resignation date | Was the resignation withdrawn or extended; who is the attendance record for | RFI Q3 |
| L3 E050 | **C** | OT paid with no clock evidence | Approval and basis for 16 flat hours | RFI Q4 |
| L4 +2 hr | **B/C** | Uniform, company-wide, small per row; reads as a rule or system behaviour | The OT claim and approval process | RFI Q4 |
| L5 E030 | **B** | Clocked and paid; hours limit and approval unknown | Approval, fatigue and any statutory limit (VERIFY JURISDICTION) | RFI Q5 |
| L6 ACC1042 | **A** (lead only) | Shared account for two employees | Relationship, account holder | RFI Q6 |

No item reaches Class D. Class D needs three independent evidence types and none has three. L1 has two of three, and the third (who benefits) is exactly what the files cannot show.

Benign explanations considered (at least two for each adverse reading):
- **E999:** HR master load lag for a real joiner; agency or contract worker paid via payroll; an ID reused after a rehire; a clock-card keyed to the wrong ID (E999 shows OT clocked in three months while showing zero days present, which is itself contradictory).
- **E011:** resignation withdrawn or notice period extended; HR master not updated; garden leave or rehire under the same ID.
- **E050:** OT worked off-clock under written approval; time-clock feed gap for that person; fixed-OT allowance paid as hours.
- **+2 hr rule:** rounding up to a scheduling block; a system default; meal or handover time paid as OT.
- **E030:** peak production; approved extended-hours arrangement.
- **ACC1042:** family member or joint account.

## 5. Root cause by layer (preliminary, not confirmed)

| Layer | Observed fact | Benign / adverse explanation | Test to distinguish | Structural fix | Owner (role) | Due |
|---|---|---|---|---|---|---|
| L0 Data | No control totals or extract metadata for any file | Benign gap vs unreliable extract | Obtain source totals, re-run `profile` | Standard extract pack with totals | Internal Audit | On receipt of data |
| L1 Master data | E999 on payroll but not HR; E011 resignation recorded but pay continues | Load lag / stale master vs unauthorised record | HR and payroll change logs, who created E999 | Payroll cannot pay an ID absent from the active HR master | Group HR + Payroll | Proposed 60 days |
| L2 Transactions | OT paid above clocked hours in 133 rows; 16 hrs flat for E050 | Process rule vs padding | OT approvals vs clock data | Pay OT from clocked, approved hours only | Payroll | Proposed 60 days |
| L3 Process | Leaver stops after resignation for E026 but not E011 | Process works but is inconsistent | Leaver checklist for both | Mandatory leaver-to-payroll stop with sign-off | HR + Payroll | Proposed 60 days |
| L4 Reporting | Headcount on payroll (121) differs from HR (120) | Timing vs ghost | Headcount reconciliation to the ledger (not automated) | Monthly payroll-to-HR reconciliation, reviewed by Finance | Finance Controller | Proposed 30 days |
| L5 Governance | No independent review of payroll vs HR evident | Not tested | Interview and policy review (human) | Quarterly payroll analytics review by GIA | GCAE | Proposed next quarter |

Owners are roles, not named people, and the dates are proposals for you to set.

## 6. Scenarios and projection

**Not produced, on purpose.** The files are not tied to a source control total, and SKILL.md says no forward projection from an unreconciled quantity. What I can state is the observed rate in the file, not a forecast:
- E999 rate in the file: MYR 3,200 Basic a month plus OT of 0-250.
- E011 rate in the file: MYR 3,200 Basic a month plus OT of 0-300.

If both are still on the September and October payrolls (the files stop at August and today is 31 October), the exposure keeps growing at about MYR 6,400 a month before OT. **Formula to use after reconciliation:** exposure = months paid x monthly Basic (+ OT). Status quo / partial control / structural fix scenarios and Low/Base/High ranges need your confirmation of: whether either ID is still paid, the OT approval rule, and the post-reconciliation figures. Any figure produced then is an ESTIMATE.

## 7. Structural remediation (L1 to L5, not a freeze)

1. Hard stop: payroll runs only for IDs with an active HR master record and no resignation date, or within a settled final-pay window.
2. Leaver workflow with a dated sign-off by HR, Payroll and the line manager, and a month-end list of resigned IDs still paid.
3. OT paid from the clock record plus a recorded approval; any claim above the clocked hours needs a named approver and a reason.
4. Monthly payroll-to-HR-to-attendance reconciliation reviewed by the Finance Controller.
5. Bank account change and new-payee review, with account-holder verification for new payees.
6. Working-hours limit and approval rule for OT, once the legal limit is confirmed (VERIFY JURISDICTION).

## 8. Fraud tactics mind map (hypothesis branches, none established)

| Branch (MO library 09) | Status | Footprint seen | Missing evidence |
|---|---|---|---|
| Payroll: ghost employee (E999) | **PARTIALLY TESTED** | No HR record, no attendance, unique bank account | Identity, account holder, onboarding, approver |
| Payroll: departed employee still paid (E011) | **PARTIALLY TESTED** | Paid 3 months after resignation date | Termination file, whether resignation was withdrawn |
| Payroll: falsified hours / OT (E050, +2 hr) | **PARTIALLY TESTED** | OT with no clock; uniform +2 hrs | Approver, clock-device log, supervisor attestation |
| Payroll: shared bank account (ACC1042) | **PARTIALLY TESTED** | Two employees, one account | Account holder, relationship |
| Excessive OT hours (E030) | **PARTIALLY TESTED** | 60 hrs a month, clocked | Approval and legal limit |
| Duplicate payments, bank-change fraud, deduction tampering, headcount reconciliation to GL | **UNTESTED** | none | Not automated or no data (statutory deductions, bank file, GL) |

## 9. RFI draft (for you to review and issue; I have sent nothing)

**Subject:** Information request - plant payroll Apr-Aug 2026 - ref GIA-PAYROLL-[to be set]
**For:** Group HR and Payroll (owner: Head of HR, with Payroll Manager) | **Due:** [GCAE to set] | **Basis:** file rows as listed above

1. For Emp_ID E999 (payroll rows 122, 243, 364, 484, 604): please provide the onboarding record, contract or agency agreement, who created the payroll record and when, and why the ID is not on the HR master.
2. For the bank account used by E999 (ACC9999): please provide the account-holder confirmation held at the time the payee was set up.
3. For Emp_ID E011 (HR row 12, resignation 31 May 2026; payroll rows 254, 375, 495): please provide the resignation letter, any withdrawal or extension, the final settlement calculation, and the reason payroll continued after 31 May.
4. For Emp_ID E050 (16 OT hours a month, no clocked OT) and for the 130 employee-months (excluding E999) where paid OT exceeds clocked OT by exactly 2 hours: please provide the OT approval forms, the approver, and the rule used to arrive at the paid hours.
5. For Emp_ID E030 (60 OT hours a month): please provide the OT approval and any working-hours policy applied.
6. For ACC1042 (E041 and E042): please confirm the account-holder relationship held in the payee record.

*This is a process assurance request. No conclusion of misconduct is drawn. Non-response is recorded as a documentation or assurance limitation, not as proof of anything.*

## 10. Decisions for you (red-line gates)

You asked for findings and next steps, so these are the gates the next steps touch. I have taken no action. Distribution stays GCAE only.

**Gate A: hold the next payroll payment for E999 and E011 (payment stop).**
- **Context:** L1 and L2 above. The files stop at August, so I cannot see whether payments continued in September and October.
- **Recommendation:** first confirm from Payroll whether either ID was paid in Sept-Oct (data request, no hold). If still active, consider a time-boxed hold on those two payroll lines pending HR verification, as preservation only. The fix is the control in section 7.
- **Cost-benefit:** a hold protects about MYR 3,200 a month per ID before OT. It risks a real employee going unpaid, which for E011 is plausible given the attendance record.
- **Risk of inaction:** payments continue at about MYR 6,400 a month if still active.
- **Required human decision:** APPROVE / MODIFY / ABORT / ESCALATE. Draft instruction for you to issue: "Payroll to confirm, for E999 and E011, the payment status for Sept and Oct 2026 and the next scheduled payment date; no change to payment until HR confirms employment status."

**Gate B: employment action or any contact with the individuals.** Not recommended. No evidence supports one. Any interview is for a qualified human (CFE or HR with counsel).

**Gate C: Audit Committee, Board or external escalation.** Not recommended now. The escalation checklist fails: fact-finding is not done, fewer than three evidence types, benign alternatives not tested, legal and privilege routing not confirmed. Issue the RFI first.

**Gate D: engage counsel or forensics.** Not yet. Reconsider if the RFI returns no support for E999 or if the account proves to be linked to an insider.

## 11. Next steps

1. Decide Gate A and issue the RFI (you are the only reader; sequencing is yours to set).
2. Obtain Sept-Oct payroll, the termination file, the OT approvals and the bank payment file.
3. Confirm the OT tolerance you want. I ran at 0% tolerance because none was supplied.
4. Confirm the legal OT limit (counsel, VERIFY JURISDICTION).
5. Re-run the tests on the full data once control totals are tied.

## 12. Limits

The work rests on the three supplied files. I cannot authenticate documents, cannot see what was not provided, and cannot verify identities or bank accounts. These are leads for CFE review, not findings of fraud or loss.

**Tool defaults to confirm:** date order dmy (all dates in the files are ISO, so no effect); `min_support` 0; `min_days` 0; `fuzzy` 0; outlier z 3.5 and min group 8; recon tolerance 0%.

**Model and effort log:** Sonnet 5.5, medium effort (triage, synthesis). No Opus trigger fired. Haiku-level work (profiling, flags) was deterministic tool output.

## 13. QA scorecard (self-applied, not independent)

| Check | Result |
|---|---|
| Every claim has a ref or is labelled GAP | PASS (refs are file rows; control totals are a GAP) |
| Every risk has a category and materiality basis | PASS |
| Two benign explanations for each adverse hypothesis | PASS |
| No unsupported legal citation, loss figure or named person | PASS (Emp_IDs only; 35,100 labelled payments flagged, not a loss) |
| Recommendations structural, owned (by role), dated (proposed) | PASS, with owner dates marked as proposals |
| Tone objective, marking correct | PASS |
| Human approval gates present | PASS |
| Independent QA | **NOT DONE.** This is a self-applied pass; recommend an independent review (Opus-level or a human CFE) before any Audit Committee paper. |

Run log, tool outputs and input hashes: `/home/claude/usecase/run/` (runlog.jsonl, t1 to t7 JSON files).
