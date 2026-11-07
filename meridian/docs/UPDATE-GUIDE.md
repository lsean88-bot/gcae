# Update guide

Update the app only from a kit you trust. Do not paste unknown code into the folder. Do not let a model edit production evidence.

## Before every update

1. Ask IT to back up the PostgreSQL database.
2. Write down the current date and the private URL.
3. Open **UAT evidence** and record the pass count.
4. Export the action workbook from **Action tracker**.
5. Do not start a live issuance while the update is running.

## Update the application

1. Unzip the new `meridian-gia-kit.zip` to a new folder, for example `meridian-new`.
2. Copy the existing `.env` into `meridian-new`. Do not replace it with an example file.
3. If `drizzle.config.json` in the new kit has a sample database URL, set it back to your `DATABASE_URL`.
4. In `meridian-new`, run:

```bash
npm install
npx drizzle-kit push
npm run build
```

5. Stop the old site.
6. Start the new folder with `npm run start`.
7. Open `/api/health`. It must say ok.
8. Open **UAT evidence** and click **Run UAT again**.
9. Expected result on this release: 55 passed, 0 failed.
10. Open one known engagement, such as `GRP-AP-2026`, and confirm the findings are still there.

`drizzle-kit push` adds new tables and columns. It should not delete your engagements. Still take the backup first. If a future kit says it will reset the database, stop and ask for a migration note before you continue.

## Update the Claude skill plugin

The skill is instructions for Claude. It does not replace the app.

1. In the kit, open `.claude/skills/meridian-gia/SKILL.md`.
2. For Claude Code or Cowork, copy that folder into the project’s `.claude/skills/` directory.
3. For Claude.ai, open the Project, replace the project instructions with the constitution section of the skill, or click **Copy Claude constitution** in the app after the update.
4. Start a new Claude chat so it reads the new skill.
5. Ask Claude: "What must you not do in Meridian?" It should say it cannot issue a report, invent a figure, or waive an iron rule.

## Update a connected model

You do not update Claude or ChatGPT inside this app. The provider updates the model.

1. If a run says the model name was not found, open `.env`.
2. Change `ANTHROPIC_MODEL` or `OPENAI_MODEL` to the name your account shows.
3. Restart `npm run start`.
4. On **Connect AI**, you do not need to paste the key again if it was already accepted.
5. Run the harness on the practice engagement and read the note.

## What an update must not change

These decisions stay in force unless the GCAE writes a new decision:

- No finding without traceable evidence.
- Four test outcomes only: Pass, Fail / Exception, Unable to conclude, Not applicable.
- An evidence gap is not a pass and not a confirmed failure.
- QA re-performs material calculations.
- The GCAE issues the report.
- The orchestrator is not the decision-maker.
- Kaizen may tighten a rule. It may not waive one.
- A fraud indicator is not a fraud finding.
- The five existing demonstration plugins from any earlier Claude package review are not inside this app. Do not rebuild them from memory and do not claim this app is those packages.
- There is no component named `aibagent`.

## Roll back

1. Stop the new site.
2. Start the previous folder again with the same `.env`.
3. If the new update changed tables and the old app cannot start, restore the database backup, then start the old folder.
4. Record the rollback in the audit log by adding a note in **Audit log** after the site is up, or ask the maintainer to insert an audit event.

## Small safe updates you can do without a new kit

| Change | Where | Restart needed |
| --- | --- | --- |
| Connect or disconnect a model | Connect AI page | No |
| Choose Claude or ChatGPT for the harness | Connect AI page | No |
| Change the model name IT set | `.env` | Yes |
| Add a user to Acting as | Not available in this release. Roles are the demonstration people plus anyone IT adds in the database | Yes, after a database change |
| Take a backup | IT, PostgreSQL backup tool | No |

## After the update, tell the team

Send three lines:

- The private URL is unchanged.
- UAT evidence shows the new pass count.
- Connect AI still shows the same model, or say if they must connect again.
