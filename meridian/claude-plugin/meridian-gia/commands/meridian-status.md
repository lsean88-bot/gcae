---
description: Summarise Meridian - engagements, open findings and overdue actions (read only)
allowed-tools: mcp__plugin_meridian-gia_meridian__list_engagements, mcp__plugin_meridian-gia_meridian__list_findings, mcp__plugin_meridian-gia_meridian__list_actions
---

Give the GCAE a short status of the Meridian audit file. Read only: do not draft or change anything.

1. Call `list_engagements`, `list_findings` and `list_actions`. If a call fails, report the error exactly as returned and stop. Do not invent data.
2. Today's date is the current date in this conversation. Use it for overdue tests.
3. Report, using only values returned by Meridian:
   - **Engagements**: a table of code, title, status, stage, overall rating, QA status, and whether materiality and GCAE approval are recorded.
   - **Open findings**: findings whose status is not Closed, ordered by priority score (highest first), with code, title, band, score, status and engagement. Count them by band.
   - **Overdue actions**: actions that are not Closed and whose due date (`revisedDue` if present, otherwise `originalDue`) is before today. Show finding code, owner id, due date, days overdue, status and percent complete. If none, say "No overdue actions found".
4. End with one line: counts of engagements, open findings and overdue actions, and the note "Seeded data is demonstration data, not a live population" if the engagement ids are eng-dc, eng-ap, eng-it, eng-p2p, eng-pay or eng-fa.
5. Do not recommend ratings or closure. Those are the GCAE's acts in the Meridian app.
