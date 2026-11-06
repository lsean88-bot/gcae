# Connect Claude Desktop or Claude Code to Meridian

This lets Internal Audit staff ask Claude, on their own PC, to read the Meridian audit file and file drafts. It uses the person's existing Claude subscription. No extra Claude cost and no API key.

## What Claude can and cannot do

- Can: read engagements, findings, actions, evidence details (raw evidence text only when Claude asks for one record with its body), risks, test runs, lessons and the generated briefing. It can file a **draft** finding, a **draft** report text, or a **proposed** lesson.
- Cannot, ever: issue a report, approve materiality or a rating, change a threshold, close an action, clear QA, approve a test, delete or overwrite evidence, conclude on fraud, or waive an iron rule. These are refused by Meridian itself, not only by the connector. No such tool or route exists.
- Meridian refuses any draft that contains a figure not in the source file, and any draft that says fraud is proven.
- **Restricted engagements are invisible to Claude.** An engagement the GCAE has restricted, and all its findings, evidence, tests, actions and lessons, never appear through a token, even the GCAE's. Direct ids return "not found". Any attempt is logged.
- Raw evidence text (`get_evidence` with `includeBody`) is allowed only for the GCAE, the audit manager, and the auditor who leads that engagement. Other people's tokens get the evidence details without the text.
- QA reviewers can read through a token but cannot file drafts. Draft findings are saved with status "Draft". The GCAE can revoke any person's token.
- Everything is logged as "<your name> via Claude token <token name>".

## Before you start

- You must be Internal Audit (GCAE, audit manager, auditor or QA reviewer). Business owners and executives cannot create tokens.
- You must have signed in to Meridian and replaced your one-time password. A one-time password cannot create a token.
- **Cloudflare WARP must be connected** whenever you use the connector. Meridian is on the private address https://172.30.0.10.
- **Claude.ai in a web browser cannot use this.** The web service cannot reach a private-network server. Use Claude Desktop or Claude Code on your PC.

## Step 1. Create your token (once per PC)

1. Sign in to Meridian and click **Account**.
2. Under **Claude access tokens**, type a name (for example "Amira office PC").
3. Leave days at 90 (the maximum). Tick **Read only** if you never want drafts.
4. Click **Create token**.
5. Copy the token (it starts with `mt_`) now. **It is shown once.** Meridian keeps only a fingerprint and cannot show it again. If you lose it, revoke it and create another.

## Step 2. Install Node 22 on the PC

1. Go to https://nodejs.org and download the Node 22 LTS installer for your PC. Run it with the default options.
2. Open a terminal (Windows: Command Prompt; Mac: Terminal) and type `node -v`. It must show `v22` or higher.

## Step 3. Get the connector folder

Either:
- `git clone` the Meridian repository and use its `meridian/mcp` folder; or
- download the repository as a ZIP from your IT contact and unzip it.

Then in the terminal go into the `mcp` folder and run:

```
npm ci
npm run build
```

When it finishes, the file `dist/index.js` exists inside `mcp`. Note its full path (for example `C:\Meridian\meridian\mcp\dist\index.js`).

## Step 4. Get the Meridian root certificate

Meridian uses a private certificate authority. Ask IT for the file `meridian-root-ca.crt` (exported from Caddy's internal CA) and save it somewhere permanent. Note its full path. Without it Claude will report "certificate is not trusted". Do not turn certificate checks off.

## Step 5A. Claude Desktop

1. Open Claude Desktop, then **Settings > Developer > Edit Config** (screens may differ by version). This opens `claude_desktop_config.json`. Usual locations: Windows `%APPDATA%\Claude\claude_desktop_config.json`; Mac `~/Library/Application Support/Claude/claude_desktop_config.json`.
2. Add this (keep any existing content; use your own paths and token; on Windows write `\\` for each backslash):

```json
{
  "mcpServers": {
    "meridian": {
      "command": "node",
      "args": ["C:\\Meridian\\meridian\\mcp\\dist\\index.js"],
      "env": {
        "MERIDIAN_URL": "https://172.30.0.10",
        "MERIDIAN_TOKEN": "mt_paste_your_token_here",
        "NODE_EXTRA_CA_CERTS": "C:\\Meridian\\meridian-root-ca.crt"
      }
    }
  }
}
```

3. Save, then fully quit and reopen Claude Desktop.
4. Check that WARP is connected. Start a chat and ask: "List the Meridian engagements." Claude may ask permission to use the tool. The tool list appears under the connector or tools icon (screens may differ).

## Step 5B. Claude Code (alternative)

Syntax checked against `claude mcp add --help` (stdio form `claude mcp add <name> -e KEY=value -- <command> [args]`). Check `claude mcp add --help` on your version.

```
claude mcp add meridian -e MERIDIAN_URL=https://172.30.0.10 -e MERIDIAN_TOKEN=mt_paste_your_token_here -e NODE_EXTRA_CA_CERTS=/path/to/meridian-root-ca.crt -- node /path/to/mcp/dist/index.js
```

Use `--scope user` to make it available in every folder. Then run `claude mcp list`.

## Token hygiene

- One token per person and per PC. Never share a token or use someone else's.
- Never paste a token into a chat, email or ticket. If it was pasted anywhere, revoke it now.
- Tokens expire after at most 90 days. Create a new one before then. Revoke tokens you no longer use on the Account page.
- When someone leaves Internal Audit, revoke their tokens the same day. The GCAE can revoke any person's token. Removing the person's authority also stops the token, because the token acts with the owner's current authority.
- Each token is limited to 120 requests a minute. The counter is held in memory by the single Meridian app instance, so it resets if the app restarts.
- Token use that is refused (revoked, expired, wrong authority) is written to the audit log.

## If something goes wrong

| Message | Meaning |
| --- | --- |
| Could not reach Meridian ... Check that WARP is connected | WARP is off or the URL is wrong. |
| The certificate is not trusted | `NODE_EXTRA_CA_CERTS` is missing or points at the wrong file. |
| This token is revoked / expired (HTTP 401) | Create a new token on the Account page. |
| HTTP 403 | The token's owner does not have authority for that, or the token is read only. |
| The draft contains figures that are not in the file | Remove the figure or cite evidence that holds it. This is the guard working. |
| HTTP 429 | More than 120 requests in a minute. Wait a minute. |

## For IT

- API: `/api/v1/*`, bearer token only. A request that carries a browser session cookie is refused.
- Tokens are stored as SHA-256 only, table `api_tokens`. Rate limit is held in memory per app process (single instance). Evidence bodies are served only by `GET /api/v1/evidence/{id}?include=body`; the list returns metadata only. The connector refuses an `http://` MERIDIAN_URL unless the host is localhost.
- Draft routes: `POST /api/v1/findings`, `POST /api/v1/engagements/{id}/report-draft`, `POST /api/v1/lessons`. No other write route exists. UAT T-33 to T-38 test this.
