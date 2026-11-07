# Meridian GIA skill

The installable Claude Code plugin now lives in `claude-plugin/meridian-gia/` (skill, bundled connector, agents, commands). Install it as in `docs/LAPTOP-QUICKSTART.md`.

The skill file is `claude-plugin/meridian-gia/skills/meridian-gia/SKILL.md`. A copy is kept at `.claude/skills/meridian-gia/SKILL.md` so the skill also loads when Claude Code is opened inside this repository. Keep the two identical when you edit.

## Install in Claude.ai

1. Create a Project.
2. Open the skill file above.
3. Paste the instructions under the front matter into the project instructions.
4. Or, in the app, click **Copy Claude constitution** on Agent harness and paste that shorter text.

Claude.ai on the web cannot reach a Meridian server on your laptop, so the connector tools are not available there.

## What this plugin does not do

It does not replace the web app. It does not contain a hidden model key. It does not issue audit reports. It tells Claude how to behave when a person asks for audit help.

## CGAE Command connector tools (v1.1.0)

The connector has 20 tools, all read or staged draft. Added: `list_analytics_runs`, `get_analytics_run`, `run_analytics` (local file read by the connector), `lint_text`, `get_audit_plan`, `get_risk_register`. `list_lessons` was already present. No tool approves, overrides or issues anything, and restricted engagements are filtered on the server by the token. Commands: `/meridian-status`, `/meridian-draft`, `/meridian-analytics`, `/meridian-lint`.
