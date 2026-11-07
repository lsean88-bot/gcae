# Installation guide

This is for the person who hosts the private copy. The person using the audit app does not need to follow this if the site is already open.

## What you are installing

Meridian is a Next.js 16 application with a PostgreSQL database. It does not phone home. Claude or ChatGPT is called only after a key is saved from the Connect AI page, or placed in the server environment.

## What the server needs

- A private computer or virtual machine that only Internal Audit can reach.
- Node.js 22.
- PostgreSQL 15 or newer.
- HTTPS in front of the website.
- Outbound HTTPS to `api.anthropic.com` if Claude will be used, and to `api.openai.com` if ChatGPT will be used.
- PostgreSQL must not be open to the internet.

## Step 1. Copy the kit

1. Download `meridian-gia-kit.zip`.
2. Unzip it to a folder, for example `C:\meridian` or `/opt/meridian`.
3. Open a terminal in that folder.

Do not copy `node_modules` from another machine. The install command creates it.

## Step 2. Create the database

In PostgreSQL:

```sql
CREATE DATABASE meridian;
CREATE USER meridian_app WITH PASSWORD 'choose-a-long-password';
GRANT ALL PRIVILEGES ON DATABASE meridian TO meridian_app;
```

On PostgreSQL 15 and later, also grant schema rights after connecting to `meridian`:

```sql
GRANT ALL ON SCHEMA public TO meridian_app;
```

## Step 3. Point the app at the database

Create a file named `.env` in the folder:

```bash
DATABASE_URL=postgresql://meridian_app:choose-a-long-password@127.0.0.1:5432/meridian
APP_SECRET=<output of: openssl rand -base64 48>
```

`drizzle.config.ts` reads `DATABASE_URL`, and drizzle-kit loads `.env`. If the table-creation command cannot connect, export `DATABASE_URL` in the shell first.

Do not commit `.env`. Do not email the password.

## Step 4. Install, create tables, and build

```bash
npm install
npx drizzle-kit push
npm run setup:passwords
npm run build
npm run start
```

The site listens on port 3000 unless you set `PORT`.

The first time someone opens the site, the demonstration file is loaded. That is expected. It is practice data, not a live population.

`npm run setup:passwords` prints one random one-time password per person, once. Keep the output private. Each person must change theirs at first sign-in. See `DEPLOYMENT-AND-INTEGRATION.md` section A7.

## Step 5. Put HTTPS in front

Use the organisation’s reverse proxy. Allow only the audit network. Do not publish port 5432.

Example checks after install:

- `http://SERVER:3000/api/health` returns `{"ok":true}` when the database is reachable.
- The home page shows Meridian, not an error.
- **UAT evidence** can be opened by Amira Hassan’s role. Click **Run UAT again**. You want 55 of 55.

## Step 6. Hand the site to the GCAE

Send Amira Hassan, or the real Group Chief Audit Executive, the private URL and `CLAUDE-CHATGPT-CONNECTION.md`. They connect the model from the screen. They do not edit `.env` unless IT chooses to store the key there instead.

## Optional: store the model key in the environment

If IT prefers not to use the Connect page, add one of these to `.env` and restart:

```bash
ANTHROPIC_API_KEY=sk-ant-the-key
ANTHROPIC_MODEL=claude-sonnet-4-6
```

or

```bash
OPENAI_API_KEY=sk-the-key
OPENAI_MODEL=gpt-4.1
```

Restart with `npm run start` after any `.env` change.

## What good installation looks like

- The site is private.
- The database is private and backed up.
- `.env` is not in email or in the zip you forward.
- UAT evidence shows 55 passed and 0 failed.
- Connect AI shows Not connected until the GCAE pastes a key, or Connected if IT set the environment key.

## If installation fails

| What you see | What to do |
| --- | --- |
| `DATABASE_URL is required` | Create `.env` and restart |
| `password authentication failed` | Fix the user or password in `DATABASE_URL` and `drizzle.config.json` |
| `relation "people" does not exist` | Run `npx drizzle-kit push` again against the correct database |
| Health check is not ok | PostgreSQL is down, or the URL is wrong |
| Port 3000 is in use | Stop the other program or set `PORT=3001` |
| Claude model error after connect | Set `ANTHROPIC_MODEL` to a model the account can call, then restart |
