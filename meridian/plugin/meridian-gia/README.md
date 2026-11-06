# Meridian GIA skill plugin

This folder is the installable Claude skill for the Meridian assurance workbench.

## Install in Claude Code or a project folder

Copy `SKILL.md` to:

```text
.claude/skills/meridian-gia/SKILL.md
```

The same file is already at `.claude/skills/meridian-gia/SKILL.md` in this kit.

## Install in Claude.ai

1. Create a Project.
2. Open `SKILL.md`.
3. Paste the instructions under the front matter into the project instructions.
4. Or, in the app, click **Copy Claude constitution** on Agent harness and paste that shorter text.

## Connector (Claude Desktop / Claude Code)

The skill describes the Meridian MCP tools and their limits. The MCP server itself is in `mcp/` and is set up as in `docs/CLAUDE-CONNECTOR.md`. The skill alone does not connect to Meridian.

## What this plugin does not do

It does not replace the web app. It does not contain a hidden model key. It does not issue audit reports. It tells Claude how to behave when a person asks for audit help.
