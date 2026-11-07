---
description: Check draft text against the Meridian iron rules before filing it (read only)
allowed-tools: mcp__plugin_meridian-gia_meridian__lint_text
---

Text to check: `$ARGUMENTS` (or the draft in this conversation).

Call `lint_text`. List each violation with its rule, level (block or note) and excerpt. If any is `block`, propose a rewrite that removes it using only facts already in the draft, then lint again. Never claim the draft is approved: a clear lint is not an approval.
