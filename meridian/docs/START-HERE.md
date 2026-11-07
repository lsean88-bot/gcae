# CGAE Command (Meridian) — start here

This kit is the handover for the assurance workbench used by MK Tron Group Internal Audit. The display name is **CGAE Command**. The folder, package and database names are still `meridian`.

Meridian is an original evidence-to-assurance system. It is informed by publicly described reviewer-first audit practice. It is not Optro, not AuditBoard, and not a reconstruction of any vendor product.

## Release notes: CGAE Command (2026-11-07)

**Guardrails** (`src/lib/iron-rules.ts`)
- When evidence is only REP or ANA, severity is capped at High, the score is clamped to 19, and the finding is flagged "pending fieldwork corroboration".
- Fraud-ladder wording is linted below "corroborated". "NN% confidence" is linted.
- Variance is reported as net and gross.
- Masking uses the global restricted set.
- A rule violation blocks approval of an agent draft. Only the GCAE can override, with a reason of at least 10 characters. The override is audit-logged and captured as a kaizen lesson.
- CON and PHY evidence tags come only from a GCAE-set evidence class, never from free text.

**Analytics** (`/analytics`)
- CSV or XLSX upload, 20 MB maximum. Files stay on the laptop and are never sent to a model. Only the SHA-256, the parameters and the result are stored.
- Tests: profile with an error-string scan; Benford (MAD and Nigrini bands, warning when n < 300); duplicates (exact and leading-zero normalised); reconcile with tolerance (net and gross).
- Saved runs are read-only. An unlinked run can be linked to an engagement once.
- Results are labelled "[ANA] indicator, not a finding".

**Claude connector (MCP)**
- 20 tools. New: `list_analytics_runs`, `get_analytics_run`, `run_analytics` (.csv/.xlsx only; optional `CGAE_DATA_DIR` restricts the folder), `lint_text`, `get_audit_plan`, `get_risk_register`.
- No tool approves or finalises.

**Windows laptop**
- `laptop/setup.ps1` and `laptop/start.ps1` work on PowerShell 5.1 and call `npm.cmd`.
- The app binds to 127.0.0.1 only.
- Setup runs `test:rules` and `test:analytics` after the build.
- New: `laptop/backup.ps1` (pg_dump to `%USERPROFILE%\CGAE-backups`, keeps 14; prints the schtasks command and does not schedule it) and `laptop/restore.ps1` (asks you to type RESTORE and takes a safety backup first).

**Verification** (Linux, PostgreSQL 16): `test:rules` 31/31, `test:analytics` 16/16, UAT 69/69. An independent QA pass was run, and the leak fix was re-tested.

**Limitations**
- The `.ps1` files were reviewed statically only. They have not been run on Windows. The first install on a Windows laptop is the acceptance test.
- UAT does not call a live model. A live Claude or ChatGPT call is not verified.
- Backups are not encrypted and do not contain `.env`. No backup is scheduled.
- The data in the app is demonstration data, not a live population.
- UAT counts: the in-app **UAT evidence** page runs T-01 to T-55 (55 checks, defined in `src/server/`). `npm run uat` runs those plus T-56 to T-69 (guardrails, analytics, leak regression, defined in `scripts/uat.ts`), 69 in total.

## Read these in order

1. `LAPTOP-QUICKSTART.md` — install and run on a Windows laptop (the current mode).
2. `USER-GUIDE.md` — user manual.
3. `CLAUDE-CONNECTOR.md` — connect Claude Desktop or Claude Code.
4. `KNOWLEDGE-TRANSFER.md` — memory, decisions, and data.
5. `DEPLOYMENT-AND-INTEGRATION.md` section A7 — how one-time passwords are issued. No password is stored in the kit.
6. `DEPLOYMENT-AND-INTEGRATION.md` — shared-server deployment (reference only in laptop mode).
7. `INSTALLATION-GUIDE.md`, `SETUP-GUIDE.md`, `UPDATE-GUIDE.md` — install, first-day setup and updates.
8. The full source is the git repository itself (`meridian/` folder).

The zip `meridian-gia-kit.zip` contains the same guides, the skill plugin, and the complete application source.

## Fastest way to use it on the laptop

1. Follow `LAPTOP-QUICKSTART.md` once.
2. Run `start.ps1`, then open http://127.0.0.1:3000.
3. Sign in as the GCAE and open **Agent harness**, then click **Run harness**.
4. Open **UAT evidence** to see the proof tests.
5. Optional: **Connect AI** for in-app model drafts. An API key is needed for this only. Claude Desktop and Claude Code use your Claude subscription through the connector and need no API key.

A Claude.ai chat plan or ChatGPT Plus login is not an API key.

## Do not

- Paste a live API key or a Claude token into a link, chat, email or file in the repository.
- Load confidential evidence into a shared preview.
- Treat a model draft as an issued report.
- Treat a fraud indicator or an analytics result as a finding of fraud.
- Search for a skill or repository named `aibagent`. That word was a typo in an earlier note. It does not exist.
