# Meridian user guide

This guide is for the Group Chief Audit Executive, audit managers, auditors, QA reviewers, and process owners. You do not need to write code.

## Who you are in the app

You sign in with your role and your own password. The server decides what your buttons allow from your sign-in, never from anything the browser sends. Your first password is a one-time password from IT. At first sign-in the Password page opens and nothing else works until you choose your own: at least 12 characters, different from the old one, and not containing your role or id. Five wrong attempts lock the role for 15 minutes. You are signed out after 30 minutes idle.

| Person in the demonstration file | Role | What they can do |
| --- | --- | --- |
| Amira Hassan | Group Chief Audit Executive | Approve materiality, connect a model, issue a report, accept a lesson |
| Daniel Okonkwo | Audit manager | Approve a test result, save an opinion draft, accept a lesson |
| Priya Nair, Luis Ortega, Mei Lin Tan | Auditors | Open engagements, register evidence, run tests, draft findings, start the harness |
| Hannah Berg | Independent QA | Re-perform a test. The person who ran the test cannot clear it |
| Farid Abdullah, Grace Chen, Rohan Iyer, Sofia Rahman | Process owners | Update action progress. They cannot close an action |
| Kenji Mori, Lila Mensah | Executives | Read and own some risks. They do not issue the report |

Switch to Amira Hassan before you connect Claude or ChatGPT, approve materiality, or issue a report.

## The rule that never changes

Nothing is issued without a person. The model may rewrite tone. It may not add a figure, change a score, approve materiality, close an action, or call an indicator a fraud finding.

## Daily path for one audit

### 1. Open the engagement

1. Click **Audit universe** or **Engagements**.
2. Open the engagement, or click **Open an engagement** and fill title, entity, period, objective, and scope.
3. Write why the area matters to the business. If you do not know, leave a labelled placeholder such as `[BUSINESS CONTEXT NOT STATED]`. Do not guess.

### 2. Approve materiality before testing

1. Open the engagement.
2. On Overview, enter the amount and the thresholds, for example `amount=50000`.
3. Click **Propose**.
4. Switch to Amira Hassan.
5. Write why the amount is appropriate.
6. Click **GCAE approves**.

Until that approval is saved, the testing agent must refuse to run.

### 3. Register evidence

1. Click **Evidence ledger**.
2. Choose the engagement, source system, filename, custodian, completeness, and reliability.
3. Paste the extract.
4. Click **Register and hash**.

The file is then read-only. A new version is a new row. Do not ask anyone to edit the original.

Reliability grades:

- R1 — independent source, complete enough to test, hash recorded.
- R2 — system extract, custodian known, with a stated limit.
- R3 — management-prepared and only partly corroborated.
- R4 — inquiry only. Cannot support a pass.
- R5 — missing or unverified. Must be disclosed.

### 4. Run a test

1. Click **Testing bench**.
2. Choose the engagement, the procedure, and the registered extract.
3. Leave the thresholds as approved. If you change them, only the GCAE can authorise that change.
4. Click **Run procedure**.
5. Read every tickmark: Pass, Fail / Exception, Unable to conclude, or Not applicable.
6. Switch to Hannah Berg.
7. Click **Re-perform**.
8. Switch to Daniel Okonkwo or Amira Hassan.
9. Write why you approve or reject the result, then click the button.

A missing population is not a pass and not an extra failure. Say so in the workpaper.

### 5. Write the finding

1. Click **Findings**.
2. Use a title a manager can understand, such as "Invoices above the threshold can be paid without a second review".
3. Fill criteria, condition, symptom, immediate cause, and root cause.
4. If the cause is not known, write `[ROOT CAUSE TO BE CONFIRMED WITH MANAGEMENT]`.
5. Mark only the impact dimensions that apply. Write a reason for each score.
6. Priority is calculated for you: likelihood times the highest relevant impact.
7. Link the evidence id, such as `ev-ap-inv`.
8. Save.

Bands: 20–25 Critical, 12–19 High, 6–11 Medium, 1–5 Low.

### 6. Agree the action

1. Click **Action tracker**.
2. Record the agreed step, owner, date, interim control, and the evidence that will prove it.
3. Owners may update progress.
4. Only Internal Audit may set status to Closed, and only after validation is Validated.
5. Click **Download workbook** for the committee pack.

Overdue is calculated from the date. Typing a friendly status does not hide a late action.

Follow-up cadence:

- Critical: fortnightly, weekly if overdue.
- High: monthly.
- Medium: quarterly.
- Low: before the next audit cycle, or twice a year.
- Overdue: escalate to the accountable executive and include it in the next audit-committee update.

### 7. Read the report, then issue it only if you are the GCAE

1. Click **Report studio**.
2. Switch the audience: audit committee, executive, process owner, risk and compliance, or finance.
3. Read the quality check.
4. If you want a tone rewrite, use the connected model or paste a reply from Claude.ai.
5. Save a draft into the opinion only after you have checked that no new figure appeared.
6. On the engagement **Gates** tab, move the stage only when the gate is met.
7. At stage 7, Amira Hassan ticks that the limitations were read, writes a note, and clicks **Issue under my name**.

## Run the harness

1. Click **Agent harness**.
2. Choose the engagement.
3. Click **Run harness**.
4. Wait. Do not click twice.

The order is fixed:

1. Knowledge — assignment, entity, risks, controls, and what is missing.
2. Process — walkthrough notes only. Unobserved steps stay unobserved.
3. Evidence — grade and hash. Originals are not edited.
4. Testing — approved procedure on a registered extract, or a refusal.
5. Assurance — recalculation. A match is not a clearance until QA accepts it.
6. Reporting — briefing and quality check. Not issuance.
7. Kaizen — one proposed improvement. It cannot weaken an iron rule.

## Accept or reject a lesson

1. Click **Kaizen**.
2. Read what was seen, the proposed change, and the iron rule it must keep.
3. As Amira Hassan or Daniel Okonkwo, write why you accept or reject it.
4. A lesson that says waive, skip, or ignore an iron rule cannot be accepted.

## Procedures you can run

| Procedure | What it tests | Columns the extract must have |
| --- | --- | --- |
| Invoice dual approval | Two different approvers at or above the threshold | invoice_id, vendor, amount, currency, approver_1, approver_2, payment_date |
| Duplicate payment candidates | Same vendor, invoice number, and amount paid more than once | payment_id, vendor, invoice_number, amount, currency, payment_date |
| Inventory book-to-physical | Quantity or value variance over the approved limit | item, location, book_qty, physical_qty, unit_cost |
| User access review | Leavers still enabled, or privileged access not approved | user_id, name, system, role, hr_status, account_status, privileged, approved |
| Three-way match | Invoice quantity and price against receipt and purchase order | invoice_id, vendor, po_qty, po_price, receipt_qty, invoice_qty, invoice_price |
| Journal-entry exceptions | Same preparer and approver, weekend posting, or large round amount without a description | je_id, posted_on, preparer, approver, amount, currency, description |

These are audit tests on a file you registered. They are not proof of fraud.

## Demonstration file

The first visit loads a practice file. It is not your live population.

- `GRP-AP-2026` — invoice approval. Seven exceptions. Twenty-two of a stated 40 were not in the extract.
- `MKAPL-DC-2026` — die-casting inventory. Waiting on QA clearance of the count.
- `GRP-IT-2026` — privileged access and a leaver account.
- `GRP-P2P-2026` — three-way match. Stopped until materiality is approved.
- `GRP-PAY-2026` — payroll evidence not yet registered.
- `GRP-FA-2025` — a closed prior-year action, so you can see a validated closure.

For a live audit, open a new engagement and register that period’s extract.

## Where to click

| I want to… | Click |
| --- | --- |
| Connect Claude or ChatGPT | Connect AI |
| Let Claude Desktop or Claude Code read the file and file drafts from my PC | Account, then `CLAUDE-CONNECTOR.md` |
| See what needs a decision | Command |
| Open or plan an audit | Engagements or Audit universe |
| Paste a file | Evidence ledger |
| Test a control | Testing bench |
| Score a finding | Findings |
| Chase an action | Action tracker |
| Let the specialists run | Agent harness |
| Accept a lesson | Kaizen |
| Read or draft the report | Report studio |
| See the proof tests | UAT evidence |
| Download the Excel tracker | Action tracker, then Download workbook |
