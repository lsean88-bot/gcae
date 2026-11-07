# CGAE Command on your own laptop (Windows): quick start

CGAE Command (the Meridian app) runs only on your laptop, for one person: the Group Chief Audit Executive (GCAE). It listens on `127.0.0.1:3000`, so no other computer can reach it. You use it from the browser and from Claude Desktop or Claude Code.

**The people and engagements after setup are demonstration data, not live audit data.** Do not treat any figure in them as a real result.

Time needed: about 30 minutes, most of it downloads.

**Limitation:** the `.ps1` scripts were reviewed statically only and have not been run on Windows in this release. Your first install is the acceptance test. If a step fails, stop and report the message.

## What you will end up with

- CGAE Command at http://127.0.0.1:3000 (start it when you want to work, stop it when you finish).
- The Claude connector (20 tools), which reads Meridian and files drafts only.
- Claude can never issue a report, approve a rating, close an action, clear QA or conclude on fraud. Meridian refuses these itself.

## Windows 11 (PowerShell)

Open **PowerShell** (Start menu, type PowerShell). Run the commands one at a time. The commands use `npm.cmd`, so the PowerShell execution policy does not block them.

### Step 1. Install Node 22 and PostgreSQL 16

```powershell
winget install OpenJS.NodeJS.LTS
```

Close PowerShell and open it again. Check:

```powershell
node -v
```

It must show `v22` or higher. Then install PostgreSQL:

```powershell
winget install PostgreSQL.PostgreSQL.16
```

Keep port 5432. The installer asks you to choose a password for the `postgres` user. Remember it. You type it once in step 2. Open a new PowerShell window afterwards.

Also install Git and Claude Code for steps 6 and 7:

```powershell
winget install Git.Git
```

Install Claude Code from https://claude.com/claude-code (follow the Windows steps there). Open a new PowerShell window, then check:

```powershell
git --version
claude --version
```

### Step 2. Get the code and run setup

```powershell
git clone https://github.com/lsean88-bot/gcae.git C:\gcae
cd C:\gcae\meridian
powershell -ExecutionPolicy Bypass -File .\laptop\setup.ps1
```

Setup asks for the PostgreSQL admin user (press Enter for `postgres`) and its password. The password is used once and not saved. Setup:

- creates the database `meridian` and a database user `meridian_app`;
- writes `meridian\.env` with a random database password and a random `APP_SECRET`;
- installs, creates the tables, hardens the audit log and builds the app;
- runs the self-checks `test:rules` and `test:analytics`;
- builds the Claude connector;
- prints **one one-time password for `p-gcae`**.

**Write the password down now. It is shown once.** Setup can be run again safely. It keeps `.env` and does not issue a second password.

### Step 3. Start Meridian

Leave this window open:

```powershell
powershell -ExecutionPolicy Bypass -File .\laptop\start.ps1
```

Open a second PowerShell window for the next steps:

```powershell
cd C:\gcae\meridian
```

### Step 4. Issue or reset the sign-in password

Setup already issued the password in step 2. Only if you lost it, reset it (in the second window):

```powershell
npm.cmd run setup:passwords -- p-gcae
```

Each reset prints a new one-time password. Write it down.

Then open http://127.0.0.1:3000 in Edge, Chrome or Firefox. Sign in as the Group Chief Audit Executive with the one-time password. Meridian asks for a new password (at least 12 characters). Do this before step 5: a token cannot be created while the one-time password is still active.

### Step 5. Create your Claude token

```powershell
npm.cmd run token:create -- --person p-gcae --name laptop --days 90
```

It prints a token that starts with `mt_`. **It is shown once.** Add `--read-only` if you never want Claude to file drafts.

Store it for Claude Code and Claude Desktop. Replace the text in quotes with your token:

```powershell
setx MERIDIAN_TOKEN "mt_paste_your_token_here"
```

`setx` saves it as a user environment variable on this laptop. Close every PowerShell window and open a new one so it takes effect. Do not paste the token into a chat, an email or a file in the repository.

### Step 6. Connect Claude

Option A, Claude Code plugin:

```powershell
claude plugin marketplace add lsean88-bot/gcae
claude plugin install meridian-gia@gcae-tools
```

If the repository is private, Git asks you to sign in to GitHub once. These plugin commands were not re-run in this release. Check `claude plugin list` after install.

Option B, MCP config (Claude Desktop, or Claude Code without the plugin). The full JSON and the `claude mcp add` command are in `CLAUDE-CONNECTOR.md`, Steps 2 and 3. Use `MERIDIAN_URL` = `http://127.0.0.1:3000` and the path `C:\gcae\meridian\mcp\dist\index.js`.

Then, with Meridian running, start `claude` in a new window and type: `List my Meridian engagements.` Type `/mcp` to check that `meridian` is connected. You should see six demonstration engagements (for example `GRP-AP-2026`).

### Step 7. Back up

Back up any time, also while Meridian is running:

```powershell
powershell -ExecutionPolicy Bypass -File .\laptop\backup.ps1
```

- Writes `meridian-<date-time>.dump` to `%USERPROFILE%\CGAE-backups` and keeps the newest 14.
- Needs the PostgreSQL tools (`pg_dump`, `pg_restore`), found on PATH or in `C:\Program Files\PostgreSQL\16\bin`.
- Does not include `.env`. Keep a copy of `APP_SECRET` somewhere safe if you saved model keys in the app.
- Backups are not encrypted.
- Nothing is scheduled. The script prints a `schtasks` command. Run it yourself only if you want a daily backup.

To restore (replaces the database contents, asks you to type RESTORE, and takes a safety backup first):

```powershell
powershell -ExecutionPolicy Bypass -File .\laptop\restore.ps1
```

Use `-File <path>` to choose a backup file directly. Stop Meridian (Ctrl+C in its window) before restoring.

## Every day

Start Meridian (Step 3), then use Claude. Stop Meridian with Ctrl+C. Claude cannot read Meridian while it is stopped.

## Every 90 days: renew the token

A token lasts at most 90 days. Before it expires:

1. Start Meridian and run `npm.cmd run token:create -- --person p-gcae --name laptop-2 --days 90` in the `meridian` folder.
2. Run `setx MERIDIAN_TOKEN "<new token>"`, and edit the token in the Claude Desktop config or the `claude mcp` entry.
3. Close and reopen PowerShell, then restart Claude.
4. Sign in to Meridian, open **Account**, and revoke the old token.

If you lose a token, revoke it on the Account page and create another. If it was ever pasted anywhere, revoke it now.

## Updates

Stop Meridian, then in `C:\gcae`: `git pull`, and run setup again (it is safe to re-run). Then start Meridian.

## If something goes wrong

| What you see | What it means and what to do |
| --- | --- |
| `Node ... is too old` | Install Node 22 or newer, open a new PowerShell window. |
| `PostgreSQL (psql) was not found` | PostgreSQL is not installed or its `bin` folder is not on PATH. Install it, open a new window, run setup again. |
| `Could not connect to PostgreSQL` in setup | The PostgreSQL service is not running, or the admin password is wrong. |
| `Cannot connect to the database named in .env` | PostgreSQL is stopped, or you changed the database password. Start PostgreSQL. If it still fails, delete `meridian\.env` and run setup again (data in the database is kept). |
| `npm.ps1 cannot be loaded because running scripts is disabled` | Use `npm.cmd` instead of `npm`, or run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. |
| `still has a one-time password, so no token can be created` | Sign in at http://127.0.0.1:3000 and change the one-time password first. |
| `Port 3000 is already in use` | Another program uses port 3000, or a previous Meridian is still running. |
| `The app is not built` from start.ps1 | Run setup again. |
| `Could not reach Meridian (ECONNREFUSED)` in Claude | Meridian is not running. Start it (Step 3). |
| `A valid bearer token is required (HTTP 401)` | The token is wrong, revoked or expired. Create a new one. |
| `This token does not have the "draft" scope (HTTP 403)` | The token is read only. Create one without `--read-only` if you want drafts. |
| `meridian` not listed in `/mcp` | Run `claude plugin list` or check the MCP config. Reinstall, then restart Claude. |
| `HTTP 429` | More than 120 requests in a minute. Wait a minute. |

## Notes for the owner

- Laptop data protection (disk encryption, screen lock, backups) is the owner's decision. Backups are not encrypted.
- `meridian\.env` holds the database password and the secret that seals saved model keys. It is git-ignored. Do not copy it into the repository, an email or a chat.
- The seeded people other than the GCAE have no password and cannot sign in. Only `p-gcae` can use the app.
- Verification for this release (Linux, PostgreSQL 16): `test:rules` 31/31, `test:analytics` 16/16, UAT 69/69. UAT does not call a live model.

## Mac, Linux or WSL (bash)

These steps were not changed or re-run in this release. They use `laptop/setup.sh` and `laptop/start.sh`, which were not reviewed here. Check the scripts before use.

1. **Node 22 or newer.** Mac: `brew install node@22`. Ubuntu/WSL: `curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs`. Check `node -v`.
2. **PostgreSQL 16 or newer.** Mac: `brew install postgresql@16 && brew services start postgresql@16`. Ubuntu/WSL: `sudo apt-get install -y postgresql postgresql-client && sudo service postgresql start`.
3. **Get Meridian.** `git clone https://github.com/lsean88-bot/gcae.git ~/gcae && cd ~/gcae/meridian`
4. **Run setup.** `./laptop/setup.sh`. Write the password down.
5. **Start.** `./laptop/start.sh` and leave it running.
6. **Token.** `npm run token:create -- --person p-gcae --name laptop --days 90`
7. **Connect Claude.** As in `CLAUDE-CONNECTOR.md`, with `MERIDIAN_URL` = `http://127.0.0.1:3000`.
