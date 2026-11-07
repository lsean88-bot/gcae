# Meridian on your own laptop: quick start

Meridian runs only on your laptop, for one person: the Group Chief Audit Executive (GCAE). It listens on `127.0.0.1:3000`, so no other computer can reach it. You use it from the browser and from Claude Code, which talks to it through a plugin.

**The people and engagements you see after setup are demonstration data, not live audit data.** Do not treat any figure in them as a real result.

Time needed: about 30 minutes, most of it downloads.

## What you will end up with

- Meridian at http://127.0.0.1:3000 (start it when you want to work, stop it when you finish).
- The Claude Code plugin `meridian-gia`: the audit skill, a connector that reads Meridian and files drafts only, three agents, and two commands.
- Claude can never issue a report, approve a rating, close an action, clear QA or conclude on fraud. Meridian refuses these itself.

## Windows 11 (PowerShell)

Open **PowerShell** (Start menu, type PowerShell). Run the commands one at a time.

1. **Install Node 22 or newer.** `winget install OpenJS.NodeJS.LTS` (or download the installer from https://nodejs.org). Close PowerShell and open it again. Check: `node -v` shows `v22` or higher.
2. **Install PostgreSQL 16 or newer.** `winget install PostgreSQL.PostgreSQL.16` (or the installer from https://www.postgresql.org/download/windows/). Keep port 5432. The installer asks you to choose a password for the `postgres` user. Remember it. You will type it once in step 5.
3. **Install Git and Claude Code.** `winget install Git.Git`. Install Claude Code from https://claude.com/claude-code (follow the Windows steps there). Open a new PowerShell window afterwards. Check: `git --version` and `claude --version` both print a version.
4. **Get Meridian.** 
   ```
   git clone https://github.com/lsean88-bot/gcae.git C:\gcae
   cd C:\gcae\meridian
   ```
5. **Run setup.** 
   ```
   powershell -ExecutionPolicy Bypass -File .\laptop\setup.ps1
   ```
   It asks for the PostgreSQL admin user (press Enter for `postgres`) and its password. The password is used once and not saved. Setup creates the database, writes `meridian\.env` with a random database password and a random secret, installs, builds, and prints **one one-time password for `p-gcae`**. **Write it down now. It is shown once.** You can run setup again safely: it keeps your `.env` and does not issue a second password.
6. **Start Meridian.** In this window: `powershell -ExecutionPolicy Bypass -File .\laptop\start.ps1`. Leave the window open. Open a second PowerShell window for the next steps and run `cd C:\gcae\meridian` in it.
7. **Sign in and change the password.** Open http://127.0.0.1:3000 in Edge, Chrome or Firefox. Sign in as the Group Chief Audit Executive with the one-time password. Meridian asks for a new password (at least 12 characters). Do this before step 8: a token cannot be created while the one-time password is still active.
8. **Create your Claude token** (second window, in `C:\gcae\meridian`):
   ```
   npm.cmd run token:create -- --person p-gcae --name laptop --days 90
   ```
   It prints a token that starts with `mt_`. **It is shown once.** Add `--read-only` if you never want Claude to file drafts.
9. **Store the token for Claude Code** (replace the text in quotes with your token):
   ```
   setx MERIDIAN_TOKEN "mt_paste_your_token_here"
   ```
   `setx` saves it as a user environment variable on this laptop. Close every PowerShell window and open a new one so it takes effect. Do not paste the token into a chat, an email or a file in the repository.
10. **Install the plugin.**
    ```
    claude plugin marketplace add lsean88-bot/gcae
    claude plugin install meridian-gia@gcae-tools
    ```
    If the repository is private, Git asks you to sign in to GitHub once.
11. **Ask Claude.** Make sure Meridian is running (step 6). In a new PowerShell window run `claude`, then type: `List my Meridian engagements.` Claude may ask permission to use the Meridian tool. Say yes. You should see six demonstration engagements (for example `GRP-AP-2026`). To check the connector, type `/mcp`: `meridian` shows as connected.

Other things you can try: `/meridian-gia:meridian-status` and `/meridian-gia:meridian-draft eng-ap`.

## Mac, Linux or WSL (bash)

1. **Node 22 or newer.** Mac: `brew install node@22`. Ubuntu/WSL: `curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs`. Check `node -v`.
2. **PostgreSQL 16 or newer.** Mac: `brew install postgresql@16 && brew services start postgresql@16`. Ubuntu/WSL: `sudo apt-get install -y postgresql postgresql-client && sudo service postgresql start`. You need the password of a PostgreSQL admin user. On a fresh Homebrew install the admin user is your Mac user name (type it at the first prompt instead of `postgres`) and may have no password: if so, press Enter at the password prompt. On Ubuntu, set one first: `sudo -u postgres psql -c "alter user postgres password 'choose-one'"`.
3. **Git and Claude Code.** Install Git (`brew install git` or `sudo apt-get install -y git`) and Claude Code from https://claude.com/claude-code.
4. **Get Meridian.** `git clone https://github.com/lsean88-bot/gcae.git ~/gcae && cd ~/gcae/meridian`
5. **Run setup.** `./laptop/setup.sh`. Same prompts and same one-time password as Windows step 5. Write the password down.
6. **Start Meridian.** `./laptop/start.sh` and leave it running. Open a second terminal and `cd ~/gcae/meridian`.
7. **Sign in and change the password** at http://127.0.0.1:3000 in Chrome, Edge or Firefox (Safari may refuse the session cookie on plain http).
8. **Create the token.** `npm run token:create -- --person p-gcae --name laptop --days 90`
9. **Store the token.** Add `export MERIDIAN_TOKEN="mt_paste_your_token_here"` to `~/.zshrc` (Mac) or `~/.bashrc` (Linux/WSL), then open a new terminal.
10. **Install the plugin.** `claude plugin marketplace add lsean88-bot/gcae` then `claude plugin install meridian-gia@gcae-tools`.
11. **Ask Claude.** Run `claude` and type: `List my Meridian engagements.`

WSL note: run Meridian, Node and Claude Code all inside WSL, or all in Windows. Do not mix them.

## Every day

Start Meridian (step 6), then use Claude Code. Stop Meridian with Ctrl+C. Claude Code cannot read Meridian while it is stopped.

## Every 90 days: renew the token

A token lasts at most 90 days. Before it expires:

1. Start Meridian and run `npm run token:create -- --person p-gcae --name laptop-2 --days 90` in the `meridian` folder.
2. Windows: `setx MERIDIAN_TOKEN "<new token>"`. Mac/Linux: edit the `export` line.
3. Close and reopen the terminal, then restart Claude Code.
4. Sign in to Meridian, open **Account**, and revoke the old token.

If you lose a token, revoke it on the Account page and create another. If it was ever pasted anywhere, revoke it now.

## Backups and updates

- Meridian keeps everything in the local PostgreSQL database `meridian`. Back it up with your normal laptop backup or `pg_dump`.
- To update: `git pull`, then run setup again (it is safe to re-run).

## If something goes wrong

| What you see | What it means and what to do |
| --- | --- |
| `Node ... is too old` | Install Node 22 or newer, open a new terminal. |
| `psql was not found` | PostgreSQL is not installed or its `bin` folder is not on PATH. Install it, open a new terminal, run setup again. |
| `Could not connect to PostgreSQL` in setup | The PostgreSQL service is not running, or the admin password is wrong. Start the service and try again. |
| `Cannot connect to the database named in .env` | PostgreSQL is stopped, or you changed the database password. Start PostgreSQL. If it still fails, delete `meridian\.env` and run setup again (data in the database is kept). |
| Setup did not show a password the second time | Correct: one password is issued once. To reset it: `npm run setup:passwords -- p-gcae` (Windows: `npm.cmd run ...`). |
| `npm.ps1 cannot be loaded because running scripts is disabled` | Windows blocks npm's PowerShell wrapper. Type `npm.cmd` instead of `npm`, or run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. |
| `still has a one-time password, so no token can be created` | Sign in at http://127.0.0.1:3000 and change the one-time password first. |
| `Port 3000 is already in use` | Another program uses port 3000. Close it, or a previous Meridian is still running. |
| Claude says `Could not reach Meridian (ECONNREFUSED)` | Meridian is not running. Start it (step 6). |
| `MERIDIAN_TOKEN is not set` | The environment variable is missing in the terminal that started Claude Code. Redo step 9 and open a new terminal. |
| `A valid bearer token is required (HTTP 401)` | The token is wrong, revoked or expired. Create a new one (renewal steps). |
| `This token does not have the "draft" scope (HTTP 403)` | You created a read-only token. Create one without `--read-only` if you want drafts. |
| `The draft contains figures that are not in the source file` | The guard is working. Remove the figure or cite evidence that holds it. |
| The browser signs you out at once, or the page loops on sign-in | Use Edge, Chrome or Firefox at http://127.0.0.1:3000 (not another address). Safari may not keep the session on plain http. |
| `meridian` not listed in `/mcp` | Run `claude plugin list`. Reinstall with step 10, then restart Claude Code. |
| `HTTP 429` | More than 120 requests in a minute. Wait a minute. |

## Notes for the owner

- Laptop data protection (disk encryption, screen lock, backups) is the owner's decision and is not handled by Meridian.
- `meridian\.env` holds the database password and the secret that seals saved model keys. It is git-ignored. Do not copy it into the repository, an email or a chat.
- The seeded people other than the GCAE have no password and cannot sign in. Only `p-gcae` can use the app.
- UAT result for this setup: 55 passed, 0 failed. UAT does not call a live model.
