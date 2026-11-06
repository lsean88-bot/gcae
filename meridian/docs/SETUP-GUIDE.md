# Setup guide

Do this once, after installation, before a live audit. The clicks are in the app. You do not edit code.

## 1. Open the site

1. Open the private URL IT gave you.
2. Confirm the top left says **Meridian**.
3. Confirm **Acting as** is Amira Hassan, or switch to the Group Chief Audit Executive.

If this is the shared preview rather than your private server, use it only to learn. Do not paste live evidence or a real API key.

## 2. Confirm the practice file loaded

1. Click **Command**.
2. You should see decisions waiting, entities, and overdue actions.
3. Click **Engagements**. You should see MKAPL die casting, invoice approval, access, procurement, payroll, and a closed fixed-asset review.

If the lists are empty, IT must check that PostgreSQL is running and that the first page was opened after `drizzle-kit push`.

## 3. Run the proof test

1. Click **UAT evidence**.
2. If a result is already shown, read it.
3. Click **Run UAT again**.
4. Wait until it says how many checks passed.

The expected result on the delivered build is 32 passed and 0 failed. If any check fails, do not start a live audit on that copy. Send the failed row to the person who maintains the app.

## 4. Connect a model, if you want one

Follow `CLAUDE-CHATGPT-CONNECTION.md`. You can skip this and still test, score, and draft from the file. The model is only the interpreter.

## 5. Learn the gates on the practice file

Do these three clicks before you trust the tool:

1. Open `GRP-P2P-2026`. Try to run the three-way match before approving materiality. It must refuse.
2. Open **Agent harness**, choose that same engagement, and click **Run harness**. Testing must be blocked. The report must not become Issued.
3. Open `MKAPL-DC-2026` on **Testing bench**, switch to Hannah Berg, and click **Re-perform**. A match is not a clearance until a person approves it.

## 6. Prepare a live engagement

1. Click **Audit universe**.
2. Click **Open an engagement**.
3. Use the real entity, period, objective, and scope.
4. Propose materiality. The GCAE approves it.
5. Register only extracts for that period.
6. Do not copy numbers from the demonstration findings into the live report.

## 7. Tell the team the roles

- Auditors register evidence and run tests.
- QA re-performs material tests.
- The manager or GCAE approves the test result.
- The GCAE alone issues the report and approves materiality.
- Process owners update actions. They do not close them.
- Anyone may read a model draft. Only the manager or GCAE may save it into the opinion.

## 8. Backup

Ask IT to back up the PostgreSQL database every night before live use. The evidence bodies, workpapers, findings, and the audit log are in that database. A copy of the zip is not a backup of your work.
