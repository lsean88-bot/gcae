# Deployment and integration manual

This is the step-by-step guide for installing Meridian on a private server and connecting Claude, Gemini, or ChatGPT.

The calculations stay in the app. The model only interprets the packet or rewrites tone. It cannot issue a report, invent a figure, or waive an iron rule.

## Part A. Deploy the app

Preferred route (Docker on Oracle Cloud Free with a Cloudflare private-network tunnel and WARP, no domain needed, or an office PC): follow [DEPLOY-ORACLE-CLOUDFLARE.md](DEPLOY-ORACLE-CLOUDFLARE.md). The manual steps below remain for a hand-built server.

### A1. What you need

- A private computer or virtual machine that only Internal Audit can reach.
- Node.js 22.
- PostgreSQL 15 or newer.
- HTTPS in front of the website.
- Outbound HTTPS from the server to the model you will use:
  - Claude: `api.anthropic.com`
  - ChatGPT: `api.openai.com`
  - Gemini: `generativelanguage.googleapis.com`
- PostgreSQL must not be open to the internet.

### A2. Unpack

1. Download `meridian-all-files.zip`.
2. Unzip it to a folder, for example `C:\meridian` or `/opt/meridian`.
3. Open a terminal in that folder.

### A3. Create the database

```sql
CREATE DATABASE meridian;
CREATE USER meridian_app WITH PASSWORD 'choose-a-long-password';
GRANT ALL PRIVILEGES ON DATABASE meridian TO meridian_app;
```

Connect to the `meridian` database and run:

```sql
GRANT ALL ON SCHEMA public TO meridian_app;
```

### A4. Configure the connection

1. Copy `.env.example` to `.env`.
2. Set:

```bash
DATABASE_URL=postgresql://meridian_app:choose-a-long-password@127.0.0.1:5432/meridian
```

3. Set `APP_SECRET` to a random string of at least 32 characters. Generate one with `openssl rand -base64 48`. In production the app refuses to save or read a model key without it. If you change it later, saved model keys become unreadable and must be pasted again.
4. `drizzle.config.ts` reads `DATABASE_URL`. You do not put the password in source code.

Do not commit `.env`. Do not email it.

### A5. Install and start

```bash
npm install
npx drizzle-kit push
npm run build
npm run start
```

The site listens on port 3000 unless `PORT` is set.

### A6. Check the install

1. Open `http://SERVER:3000/api/health`. It must show `{"ok":true}`.
2. Open the site. You must see **Sign in with your role.** You must not see the audit file before sign-in.
3. Issue one-time passwords (step A7), then sign in as Group Chief Audit Executive with that person's one-time password. The Password page opens first. Choose your own password (at least 12 characters, not containing your role or id).
4. Open **UAT evidence** and click **Run UAT again**. Expected result: 32 passed, 0 failed (22 calculation and gate checks, 10 security checks).
5. Put HTTPS in front of the site. Allow only the audit network.

### A7. First-day setup for the audit team

No password exists in the source code. Nobody can sign in until an administrator issues one.

1. On the server, in the app folder, run `npm run setup:passwords`. It creates the audit-log protection, then prints one random one-time password per person. **They are shown once and cannot be recovered.** Only a scrypt hash is stored. On the first run against a database it issues to everyone, which also clears any password from an earlier release.
2. To reissue for one person, run `npm run setup:passwords -- p-mgr` (use the person id). To reissue for everyone, run `npm run setup:passwords -- --all`.
3. Hand each person their role and one-time password through a private channel. Do not email them in bulk.
4. At first sign-in the person is sent to the Password page and no other page works until they set their own password.
5. Five wrong passwords for a role lock that role for 15 minutes. Twenty wrong passwords from one address lock that address. Sessions end after 30 minutes idle or 12 hours.
6. The access register (GCAE only) shows password status per person. It never shows a password.
7. The audit log cannot be edited or deleted. A database trigger blocks UPDATE, DELETE and TRUNCATE on `audit_events`. `npm run db:harden` applies it again if needed. If `drizzle-kit push` is rerun, run `npm run db:harden` afterwards.
8. The per-address limit is off by default because client address headers can be forged. Behind a reverse proxy that sets `X-Forwarded-For` and removes any client-supplied value, set `TRUST_PROXY=1` in `.env` to turn it on. The per-role lockout always applies. Set `NODE_ENV=production` (the default for `npm run start`) so the session cookie is Secure and HSTS is sent. Serve the site over HTTPS only.

## Part B. Connect Claude

A Claude.ai chat login is not an API key.

1. Sign in to the app as Group Chief Audit Executive.
2. Click **Connect AI**.
3. On another tab, open https://console.anthropic.com/settings/keys
4. Sign in. Add a payment method if asked. This is separate from Claude chat.
5. Click **Create key**.
6. Copy the whole key. It usually starts with `sk-ant-`.
7. Paste it into **Paste Claude API key**.
8. Click **Connect Claude**. Wait. The app sends one short test. If the key is rejected, nothing is saved.
9. Click **Use Claude for the harness**.
10. Open **Agent harness**. The pill should say Claude is connected.
11. Choose a practice engagement and click **Run harness**.
12. Read the note. It is not an issued report.

Optional server setting, instead of the screen, in `.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-the-key
ANTHROPIC_MODEL=claude-sonnet-5-5
```

Restart `npm run start` after changing `.env`.

If Claude says the model was not found, set `ANTHROPIC_MODEL` to a model your account can call, then restart.

### Claude.ai without an API key

1. On Agent harness, click **Copy Claude constitution**.
2. In Claude.ai, create a Project and paste that text into the project instructions.
3. On Report studio, copy the prompt and paste it into that Project.
4. Paste Claude’s reply back into Report studio and click **File the pasted reply**.
5. A person must still review it before it is saved into the opinion.

## Part C. Connect ChatGPT

ChatGPT Plus is not an API key.

1. Sign in as Group Chief Audit Executive.
2. Click **Connect AI**.
3. Open https://platform.openai.com/api-keys
4. Click **Create new secret key**.
5. Copy the whole key. It usually starts with `sk-`.
6. Paste it into **Paste OpenAI API key**.
7. Click **Connect ChatGPT**.
8. Click **Use ChatGPT for the harness**.
9. Open Agent harness and click **Run harness**, or open Report studio and click **Draft with ChatGPT**.

Optional `.env` settings:

```bash
OPENAI_API_KEY=sk-the-key
OPENAI_MODEL=gpt-4.1
```

Restart after any `.env` change.

You may paste a ChatGPT chat reply into Report studio the same way as Claude. That path does not store a key.

## Part D. Connect Gemini

The Gemini chat app is not an API key.

1. Sign in as Group Chief Audit Executive.
2. Click **Connect AI**.
3. Open https://aistudio.google.com/apikey
4. Sign in with the Google account that will pay for API use.
5. Click **Create API key**.
6. Copy the whole key. It often starts with `AIza`.
7. Paste it into **Paste Gemini API key**.
8. Click **Connect Gemini**.
9. Click **Use Gemini for the harness**.
10. Open Agent harness and click **Run harness**, or open Report studio and click **Draft with Gemini**.

Optional `.env` settings:

```bash
GEMINI_API_KEY=the-key
GEMINI_MODEL=gemini-2.5-flash
```

The app calls:

`POST https://generativelanguage.googleapis.com/v1beta/models/MODEL:generateContent`

with header `x-goog-api-key`.

If the model name is rejected, set `GEMINI_MODEL` to a model shown in Google AI Studio, then restart.

## Part E. Choose one model when more than one is connected

1. Open **Connect AI**.
2. Click **Use Claude for the harness**, **Use ChatGPT for the harness**, or **Use Gemini for the harness**.
3. The harness uses that choice. Report studio still has a separate button for each connected model.

## Part F. What every model is forbidden to do

- Issue the report.
- Approve materiality or a rating.
- Change a threshold, a population, or an original file.
- Close an action.
- Invent a figure, date, name, cause, or management response.
- Treat an indicator as proof of fraud.
- Waive an iron rule.

If a draft contains a figure that is not already in the file, the app refuses to save it into the opinion.

## Part G. Disconnect

1. Open **Connect AI** as the GCAE.
2. Click **Disconnect** on the model.
3. A key saved from the screen is removed.
4. A key set in `.env` is not removed by that button. Delete it from `.env` and restart.

## Part H. If deployment or connection fails

| What you see | What to do |
| --- | --- |
| Sign-in screen does not appear | The site did not start. Check `npm run start` and port 3000 |
| `{"ok":false}` on `/api/health` | PostgreSQL is down, or `DATABASE_URL` is wrong |
| `relation "people" does not exist` | Run `npx drizzle-kit push` again |
| Sign-in failed | Check the role and the password. If nobody has a password yet, run `npm run setup:passwords` on the server |
| Sign-in is locked for 15 minutes | Five wrong attempts for that role. Wait 15 minutes. The GCAE can see the lockout in the Audit log |
| Forgot a password | An administrator runs `npm run setup:passwords -- <person id>` and hands over the new one-time password |
| Key was not accepted | You pasted a chat login, not an API key |
| Model not found | Set `ANTHROPIC_MODEL`, `OPENAI_MODEL`, or `GEMINI_MODEL`, then restart |
| Only the GCAE can connect | Sign in as Group Chief Audit Executive |
| Report will not issue | Stage is not 7, QA is not cleared, a finding has no evidence, or an exception has no finding |

## Part I. Update later

1. Back up PostgreSQL.
2. Unzip the new kit to a new folder.
3. Copy the existing `.env` into that folder.
4. Run `npm install`, `npx drizzle-kit push`, `npm run db:harden`, and `npm run build`. Add `APP_SECRET` to `.env` if it is not there. On the first start of this release run `npm run setup:passwords` once; it reissues one-time passwords to everyone.
5. Stop the old site and start the new folder.
6. Sign in and run UAT again. Expected result on this release: 32 passed, 0 failed.
