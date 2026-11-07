# Connect Claude Desktop or Claude Code to CGAE Command (Meridian)

Laptop mode (current decision): Meridian runs only on the GCAE's own laptop at http://127.0.0.1:3000. Claude Desktop or Claude Code on the same laptop talks to it through the MCP connector. No WARP, no certificate and no shared server are needed. It uses your existing Claude subscription. No API key.

Setup of the laptop itself: `LAPTOP-QUICKSTART.md`. The connector build is created by `laptop/setup.ps1` (step 9).

## What Claude can and cannot do

- Can: read engagements, findings, actions, evidence details (raw evidence text only when Claude asks for one record with its body), risks, the audit plan, test runs, analytics runs, lessons and the generated briefing. It can file a **draft** finding, a **draft** report text, or a **proposed** lesson.
- Tools (20): read tools plus `list_analytics_runs`, `get_analytics_run`, `run_analytics` (.csv/.xlsx only; optional `CGAE_DATA_DIR` restricts the folder), `lint_text`, `get_audit_plan` and `get_risk_register`.
- Cannot, ever: issue a report, approve materiality or a rating, change a threshold, close an action, clear QA, approve a test, delete or overwrite evidence, conclude on fraud, or waive an iron rule. No tool approves or finalises. These are refused by Meridian itself, not only by the connector. No such tool or route exists.
- Meridian refuses any draft that breaks a guardrail, including a figure not in the source file and a draft that says fraud is proven. Only the GCAE can override, with a reason of at least 10 characters. Overrides are logged.
- Restricted engagements are invisible to Claude. An engagement the GCAE has restricted, and all its findings, evidence, tests, actions and lessons, never appear through a token, even the GCAE's. Direct ids return "not found". Any attempt is logged.
- Raw evidence text (`get_evidence` with `includeBody`) is allowed only for the GCAE, the audit manager, and the auditor who leads that engagement. Other people's tokens get the evidence details without the text.
- Analytics files stay on the laptop. Only the SHA-256, parameters and result are sent to Claude. Results are labelled "[ANA] indicator, not a finding".
- QA reviewers can read through a token but cannot file drafts. Draft findings are saved with status "Draft". The GCAE can revoke any person's token.
- Everything is logged as "<your name> via Claude token <token name>".

## Before you start

- You must be signed in to Meridian as the GCAE and have replaced the one-time password. A one-time password cannot create a token.
- Meridian must be running (`laptop\start.ps1`). When it is stopped, Claude cannot read it.
- Claude.ai in a web browser cannot use this. Use Claude Desktop or Claude Code on the laptop.

## Step 1. Create your token (once per laptop)

In PowerShell, in `C:\gcae\meridian`:

```powershell
npm.cmd run token:create -- --person p-gcae --name laptop --days 90
```

Copy the token (it starts with `mt_`) now. **It is shown once.** Add `--read-only` if you never want Claude to file drafts. Do not paste it into a chat, an email or a file in the repository.

## Step 2. Connect Claude Desktop (MCP config)

1. Open Claude Desktop, then **Settings > Developer > Edit Config**. This opens `claude_desktop_config.json` (Windows: `%APPDATA%\Claude\claude_desktop_config.json`). Screens may differ by version.
2. Add this, keeping any existing content and using your token. On Windows each backslash is written as `\\`.

```json
{
  "mcpServers": {
    "meridian": {
      "command": "node",
      "args": ["C:\\gcae\\meridian\\mcp\\dist\\index.js"],
      "env": {
        "MERIDIAN_URL": "http://127.0.0.1:3000",
        "MERIDIAN_TOKEN": "mt_paste_your_token_here"
      }
    }
  }
}
```

3. Save, then fully quit and reopen Claude Desktop.
4. Start a chat and ask: "List my Meridian engagements." Claude may ask permission to use the tool.

Note: this file holds the token in plain text. Keep it out of the repository.

## Step 3. Connect Claude Code (alternative)

```powershell
claude mcp add meridian --scope user -e MERIDIAN_URL=http://127.0.0.1:3000 -e MERIDIAN_TOKEN=mt_paste_your_token_here -- node C:\gcae\meridian\mcp\dist\index.js
claude mcp list
```

Check `claude mcp add --help` on your version. `--scope user` makes it available in every folder.

## Step 4. Plugin (Claude Code)

The plugin bundles the audit skill, the connector, three agents and two commands. Install commands as written in `LAPTOP-QUICKSTART.md` step 10. These commands were not re-run in this release. Check `claude plugin list` after install.

## Token hygiene

- One token per person and per laptop. Never share a token or use someone else's.
- Never paste a token into a chat, email or ticket. If it was pasted anywhere, revoke it now.
- Tokens expire after at most 90 days. Create a new one before then. Revoke tokens you no longer use on the Account page.
- Each token is limited to 120 requests a minute. The counter is held in memory by the single Meridian app instance, so it resets if the app restarts.
- Token use that is refused (revoked, expired, wrong authority) is written to the audit log.

## If something goes wrong

| Message | Meaning |
| --- | --- |
| Could not reach Meridian (ECONNREFUSED) | Meridian is not running. Start `laptop\start.ps1`. |
| `MERIDIAN_TOKEN is not set` | The variable is missing from the config or the terminal. Redo the step and restart Claude. |
| This token is revoked / expired (HTTP 401) | Create a new token on the Account page. |
| HTTP 403 | The token's owner does not have authority for that, or the token is read only. |
| The draft contains figures that are not in the file | Remove the figure or cite evidence that holds it. This is the guard working. |
| HTTP 429 | More than 120 requests in a minute. Wait a minute. |

## Shared private server (reference only, not used in laptop mode)

The earlier design used Cloudflare WARP and the address https://172.30.0.10, with a private root certificate passed through `NODE_EXTRA_CA_CERTS`. Do not use these in laptop mode. The connector refuses an `http://` MERIDIAN_URL unless the host is localhost.

## For IT

- API: `/api/v1/*`, bearer token only. A request that carries a browser session cookie is refused.
- Tokens are stored as SHA-256 only, table `api_tokens`. Rate limit is held in memory per app process (single instance). Evidence bodies are served only by `GET /api/v1/evidence/{id}?include=body`; the list returns metadata only.
- Draft routes: `POST /api/v1/findings`, `POST /api/v1/engagements/{id}/report-draft`, `POST /api/v1/lessons`. No other write route exists. UAT T-33 to T-38 test this.
