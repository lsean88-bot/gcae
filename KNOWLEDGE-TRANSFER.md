# Knowledge Transfer: Group CAE Second Brain (master file, as at 2026-11-07)

**Read this first in a new session, then `CLAUDE.md`.** This file collects what is held in this repository into one place so a new session can carry on without asking again.

**Sources (each section names its own):**
- `knowledge transfer.docx` (Cowork memory export dated 2026-10-31). Based on memory notes only. The original reports and workpapers were not available. Figures are as stated in those notes.
- `CLAUDE.md` (standing rules and learned patterns).
- `meridian/docs/*` and the git history up to `c3fd64b` (PR #1 merged on 2026-11-07).
- Root files `REMAINING-ACTIONS.md`, `DECISIONS_PENDING.md`, `DECISION-SHEET.md`, `README.md`.

**Limits.** The earlier session's shared link (claude.ai `cshk_...`) cannot be read from this container. Nothing in this file comes from it. Every status below is as at its own date, not as at today. Individuals are named by role only.

---

## 1. Who and what
- **User:** "mkpc", Group Chief Audit Executive (GCAE), MKTron Group.
- **Scope:** internal audit across subsidiaries in Malaysia, India (Chennai, Pune) and Mexico.
- **Sectors:** automotive manufacturing (die-casting, stamping, auto parts, gas cylinders), healthcare (kidney dialysis), contract labour.
- **Work types:** IIA GIAS 2024 reporting, fraud and governance investigations, Board, Audit Committee and EXCO deliverables, and building audit tools (Meridian).
- **Working style:** Opus plans and coordinates; Sonnet and Haiku agents do the work. Use as few tokens as possible. Be short and direct. Tell the user about every limitation.

## 2. Non-negotiable rules (full text in `CLAUDE.md` section 2)
1. No assumptions. Label each statement as Fact, Assumption, Risk or Opinion.
2. Admit uncertainty and ask before concluding.
3. Stay on the question asked.
4. Truth over agreement. Keep professional scepticism.
5. Evidence first. State confidence as evidence class and coverage. **Never write "99% confidence".**
6. Check that a law or regulation is still current before citing it.
7. An allegation is not a fact. A fraud indicator is not a finding of fraud. Never infer motive.
8. Keep active investigations separate from each other. Refer to individuals by role or initials only.
9. Use the 13-section report. Write each finding as Condition, Criteria, Cause, Effect and a SMART Recommendation with an owner and a date.
10. Evidence tags: [INS] [PHY] [CON] [REP] [REC] [OBS] [ANA]. Cap severity at High when the evidence is only [REP] or [ANA], and for desk reviews. Label a Critical candidate "pending fieldwork corroboration".
11. Report both net variance and gross absolute variance.

## 3. Frameworks and reporting infrastructure
- **Frameworks:** IIA GIAS 2024 and IPPF, COSO ICIF and ERM 2017, SOX, ACFE/CFE, Fraud Triangle.
- **Statutory map (a starting point only; check each law is current before citing):**
  - Malaysia: Companies Act 2016 and MFRS, EPF, SOCSO/PERKESO, MACC s17A, Act 586.
  - India: Ind AS, labour law, EPF/ESIC, GST.
  - Mexico: NIF, IMMEX, LISR.
- **IAR HTML template v8.2:** FDATA arrays, localStorage state and a `window._LOADED_ST` preload. Use `rfind` to find the true final `</body>`. Plain-text fields take a literal `&`. Validate with `node --check` and a headless Chromium run (zero page errors, and the finding-count badge shows).
- **Word reports (docx-js):** set `cantSplit: true` on every TableRow and use 6-digit hex shading. Render to PDF and look at it before delivery.
- **Paired output:** when a full report and a Board briefing are both requested, deliver a full report and a separate Board or Chairman note. Order findings by IA's own view of materiality.
- **Auditee-facing reports:** plain language, each issue tied to a worksheet, plus a short Chairman note.
- **Skill routing table:** `CLAUDE.md` section 5.

## 4. Techniques (standing method; `CLAUDE.md` section 7 has the source of each)
- **Desk review:** tie the same line across sections, recompute every printed %, and compare licence and insurance expiry dates to the report date. Check vintage, meaning stale tables and definitions that change between slides.
- **Stock take:** recompute the raw System, Physical and WIP totals. Match part numbers raw first, then with leading zeros removed. Look for duplicate IDs or IDs in scientific notation. Check completeness before variance.
- **Workbooks:** scan every sheet for #REF!, #DIV/0!, #NAME?, #VALUE! and #N/A. A subtotal range that stops short of the last row is a Critical finding. Watch for confusable codes (KLU vs KUL).
- **PDF ledgers:** parse the file with code, never retype it. Exclude section total lines. Join wrapped name fragments to the row above. De-duplicate names by exact match first, then by token subset.
- **Repairs:** mechanical only. Never invent data. Log each fix in a "GIA AUDIT NOTES" first sheet and re-check the totals.
- **Software builds:** use a separate QA agent for each phase. Mask restricted data against the global restricted set. Never commit secrets.

## 5. Engagement history (from the 2026-10-31 memory notes; not re-verified)
| ID | Entity | Status (date) | Key facts per note |
|---|---|---|---|
| GIA-2026-ERAWAN-FIN-01 | Erawan LMW Industries Sdn Bhd (gas cylinders; BCK and PCH plants, MY) | Report built; 12-tab workpaper in progress (2026-07-13) | 8 findings, including a RM1.70M gap in the comparative base for maintenance OPEX and ratio commentary that contradicts itself |
| GIA-2026-GENCOR-PREEXCO-DESK-01 | Gencor Pacific Auto Engineering (Oragadam TN, Pondy) | Final report issued 2026-08-11; LIMITED ASSURANCE | 164-slide pack; 20 observations (5 High, 7 Medium, 5 Low, 3 Observations). Two different budget figures for Pondy outsourcing. Oragadam insurance shown ACTIVE though lapsed. 3 Pondy compressor certificates lapsed. Receivables +47% while cash fell 76% (Mar-Jul). Oragadam downtime +92%. Follow-up in 60-90 days |
| GIA-2026-GENCOR-QA-STATUTORY-01 | Same | Report NOT ACCEPTED and returned (2026-08-26) | The team concluded "No Issues", but the dashboard shows 0 Low while the detail has 1 open Low. 8 of 16 tracker dates do not tie to the board register. Bank test: about INR143.94L vs INR56.81L reported (probably an intraday cut-off). Chairman paper: 2 High findings, LIMITED ASSURANCE |
| (to assign) | Gencor Asia Pacific, Chennai | Planning only (2026-07-16) | Payroll, HR, bonus, statutory and claims; 100% population for fraud-prone areas |
| GIA-2026-MKPC-FW-PV2375-2526 | MK Precision Castings (M) Sdn Bhd | Awaiting management response (2026-09-05) | RM6,325.32 PV covering 6 foreign workers; 5 findings; segregation-of-duties finding raised to CRITICAL after the link to D7-01 |
| GIA-2026-MKPC-D7-01 | MKPC | Existing workpaper; not reviewed | RM60,000 PV covering 35 pax. One payee role received 54.3% of GL 5-1712 disbursements (Jan-Jul). RM11,925 unreconciled |
| GIA-2026-MKPC-FW-CONSOL-01 | MKPC | OPEN (2026-09-07) | CF-34 is a CRITICAL fraud risk *indicator*: workers re-billed and receipts reused, RM35,900 on top of RM16,440 (CF-05). Audit Committee escalation recommended |
| (to assign) | MKPC Plant 2 ERP (Cyfer Plus vs IMAN) | Requested (2026-09-04) | Independent selection review |
| (to assign) | MKTRON BNP / service stores | Note dated 2026-07-13 | Critical gaps in reconciliation completeness; CFE escalation suggested; country not stated |
| GIA-2026-NEPHROCARE-REV-AUG-01 | Nephrocare Management Sdn Bhd (dialysis, MY) | DRAFT issued (2026-09-22) | Batch PDPKL001942 (about RM240k+, about 88% of August HD+EPO revenue) has no support and no identified payer; no AR or cash sub-ledger |
| (to assign) | Nephrocare stock take Sept 2026 | Delivered (2026-09-28) | 12 centres x 284 SKUs; only 3 of 3,408 count pairs populated; 120 #REF! errors; risk of mixing up KLU and KUL |
| (to assign) | NMSB EXCO Aug 2026 | Delivered (2026-09-27) | Slide 6 shows July data labelled as August; slide 4 does not foot; capacity shown as 81% vs 83.7% in the source; ambulance permit lapsed at Shah Alam |
| (to assign) | Penang Note 2 | Open (2026-10-01) | 479-line ledger; construction and fit-out vs running cost allocation not resolved |
| (to assign) | PLSB (Perfect Longevity Sdn Bhd) | Ongoing (2026-10-10) | Shareholder report vs CIMB ledger; exception X15 (RM250,000); entity code not decided (D8) |
| (to assign) | SKH M India Pvt Ltd | As of 2026-10-20 | Two-way trade pricing recovery and credit-note test (Book2.xlsx) |

**Confidentiality:** treat all MKPC rows as confidential, as a precaution. Do not carry them into other engagements.

## 6. Open items (from the notes; owners and dates are mostly unknown)
- **Nephrocare:** support and payer for PDPKL001942; source bill for the RM510 item; AR and cash sub-ledger; follow-up audit.
- **MKPC:** management response on PV2375; confirmation of OD-31; Audit Committee review of the linked items.
- **Nephrocare stock take:** count evidence from 10 centres; fix the date label, the NO sequence, the centre codes and the Oct-Dec links.
- **NMSB:** rebuild slides 4 and 6; document the capacity method; fix the patient bridge; confirm the ambulance permits.
- **Gencor:** physically verify the factory insurance and the pressure-vessel certificates. The follow-up window is about 2026-10-10 to 2026-11-09, so **it closes in 2 days**.
- **Others:** Erawan workpaper, ERP review, Penang allocation, PLSB round 2.

## 7. Patterns library
- **Promoted (seen in 2 or more engagements):**
  - Compliance trackers that have lapsed or are inconsistent.
  - Stale or copied-forward content.
  - Incomplete counts.
  - Confusable codes.
  - The same worker or receipt across several vouchers.
  - A report summary that contradicts its own detail.
- **Candidates (seen once):**
  - #REF! errors from a stale roll-forward.
  - A subtotal range that stops short of the last row.
  - Transcription errors mistaken for variances.
  - Fuzzy-match name pairs that keep recurring.

## 8. Plugin and tooling portfolio
- **`mkpc-audit-second-brain` v1.0.0:**
  - Skills: audit-second-brain, document-review, multi-jurisdiction-audit.
  - Commands: /recall, /review-doc, /audit-intake, /catalog, /learn-pattern.
  - Registry: holds engagements, open items, the entity master and patterns. The findings register is empty.
- **Not merged:** `internal-audit-fraud-investigation`. Its SKILL.md links 6 files that do not exist. The corrected dialysis playbook and the fixed analytics scripts (threshold splitting, Benford, payroll) are in `knowledge transfer.docx` File 2. Run the known-positive and known-negative tests listed there before relying on them.
- **Overlapping skills with a decision pending:** group-cae-core, master-audit-superagent, super-grc-audit-plugin-l99 and akos-enterprise-orchestrator.
- **Installed GIA plugins in this environment:** gia-audit, gia-fraud, gia-analytics, gia-report-qa, gia-command-plugin, mktron-presentation-intelligence. The zips are in the repo root.
- **AKOS / akos-graph:**
  - Linux verification and the CLD-14 dry run are done.
  - **Still open:** replace akos-graph 2.0.0 with 2.0.7 in the account UI, run the real CLD-14 pilot, and turn on device encryption (the user accepted the risk; keep investigation shelves off that laptop).
- **Owner decisions still open (`DECISIONS_PENDING.md`, `DECISION-SHEET.md`):**
  - D2: supersession claim made by super-grc-l99. Recommendation: reconcile first.
  - D3: make group-cae-fraud-v2 the canonical fraud skill. Recommendation: yes.
  - D4: whether mac-audit-constitution-l99 still exists.
  - D6 and D15: wording of the Charlie Hills protocol.
  - D8: PLSB entity code.
  - D10: HTML QA array must list 12 checks.
  - D16 to D19: skill routing, anchor location, custody key holder, and replacing akos-graph.

## 9. Meridian Assurance Workbench (software project in `meridian/`)
- **What it is:** a private Next.js and PostgreSQL (Drizzle) app for audit, risk and compliance. Agents do the fieldwork; people approve. It is an original build, not a copy of any vendor product. "aibagent" was a typo; it does not exist.
- **Phases delivered (merged in PR #1, 2026-11-07):**
  - Phase 1 security hardening: scrypt passwords, one-time setup passwords, sessions, lockout, append-only audit log, AES-256-GCM key sealing.
  - Phase 3 Claude connector: personal tokens, `/api/v1`, local MCP server.
  - Phase 4 deployment: Docker, Caddy, and a private network via Cloudflare and WARP.
  - Restricted engagements: GCAE decision A.
  - Strategic modules: ERM heat map, risk-based annual plan, Audit Committee pack.
- **Iron rules:**
  - The orchestrator never decides a finding, a rating or a report.
  - Materiality must be approved by the GCAE.
  - Allowed test outcomes: Pass, Fail/Exception, Unable to conclude, Not applicable.
  - QA re-performs calculations, and a person clicks to clear.
  - Only the GCAE issues a report.
  - Models never calculate a test or invent a figure.
- **Scoring:** likelihood × the highest impact score. Bands: 20-25 Critical, 12-19 High, 6-11 Medium, 1-5 Low.
- **Proposed plan weights:** risk 50, age 30, mandatory 20, with an age cap of 5 years. These are **proposals only; the GCAE has not approved them.**
- **UAT:** the docs state "32 passed, 0 failed". The source now defines checks up to **T-55** (strategic T-46 to T-53 and more). So **the docs are out of date with the code. The full suite was not run in this session.** UAT does not prove a live Claude or ChatGPT call.
- **Not done or limits:**
  - No live SAP, bank or SSO connection.
  - The model key is stored in Postgres, so use a private server only.
  - The database URL in `drizzle.config` must be edited for a new server.
  - No model key is present.
- **Detail:** `meridian/docs/KNOWLEDGE-TRANSFER.md` (technical memory), then `START-HERE.md`.

## 10. How to continue in a new session
1. Read this file, then `CLAUDE.md`. For Meridian work, also read `meridian/docs/KNOWLEDGE-TRANSFER.md`.
2. Run `/recall <entity>` before asking the user for context. Run `/catalog` at the end of an engagement.
3. Development branch: `claude/lucid-fermi-rv2vji` (repo `lsean88-bot/gcae`). For Meridian code changes, run the build, then UAT, then an independent QA agent before committing.
4. Next actions, in order of value:
   - (a) Gencor follow-up, because its window closes 2026-11-09.
   - (b) Nephrocare PDPKL001942 support.
   - (c) Response on MKPC CF-34 and AC escalation.
   - (d) Run Meridian UAT and update the docs to the true count.
   - (e) Owner decisions D2, D3 and D8.

## 11. Needs the user (unverified)
- Current status of every CONFIRM row and of every engagement since 2026-10-31.
- Whether Gencor Asia Pacific is the same entity as Gencor Pacific Auto Engineering.
- How the Nephrocare stock-take codes map to the NMSB centres.
- The source reports needed to reconcile the figures.
- The dealership financial files for the CFO-style review (not received).
- What is in the memory project folders (not read): mksld tooling, mkapl BCP, jacks sathya HR, template UAT, risk app ecosystem.
