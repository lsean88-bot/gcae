# Second-brain operating guide: all work, all projects

The library brain is a **searchable, tamper-evident filing cabinet that tells you how far to trust what it holds**. It is a good second
brain for work because it refuses the usual second-brain failure: a notes pile where a guess looks the same as a verified fact.
Read the limits at the end before relying on it.

## 1. Layout (one library, many shelves)

Keep one library per person or team, on a **local disk under your user profile** (not a network share). Run `brain.py doctor <lib>` once:
the line "owner-only protection" must say OK, otherwise do not store investigations there.

| Shelf kind | Use it for | Examples | Shared by default? |
|---|---|---|---|
| `statutory` | rates, notifications, sections, with `--review-days` | `tn-statutory`, `my-statutory`, `mx-nomina` | yes |
| `policy` / `reference` | group policies, frameworks, methodologies | `group-policies`, `frameworks` | yes |
| `engagement` | one audit or review each | `clrw-dc`, `payroll-jd` | yes |
| `project` | everything about a non-audit project (a system rollout, a plan, a negotiation) | `proj-sap-migration`, `proj-24m-plan` | yes |
| `notes` | your day-to-day captures, not yet classified | `inbox`, `meeting-notes` | yes |
| `investigation` | allegations and anything sensitive | `inv-mksdl-tooling` | **never** (sealed, owner-only, own recall) |

Entity codes must exist in `config/entities.json`; the tool will not invent one (open decision D8 for the four codes still missing).

> On Windows, `setup_windows.ps1` creates the library and the `gia` launcher for you; everywhere below, `gia <command>` means `brain.py <command>`.

## 2. The trust ladder: how a thing becomes "known"

```
capture (INDICATOR) -> classify + attach a source (PROVISIONAL, rank R4) -> corroborate (CONFIRMED, rank R1-R3) -> seal
```
* Everything you `capture` is an **unclassified INDICATOR**; the FINAL gate blocks it. It can never reach a Board paper by accident.
* A note becomes a real node only through the Ingest workflow (the skill's section "Ingest workflow"), with a source and an evidence rank.
* Verbal or unverified = R5 = INDICATOR whatever the stated confidence. Management-prepared = R4 = PROVISIONAL.

## 3. Rhythm

| When | Command | Why |
|---|---|---|
| Any time | `capture <lib> --shelf inbox --text "..." --project CLD-14` | get it out of your head in 5 seconds |
| Before a meeting | `brief <lib> --project CLD-14` then `recall <lib> "<topic>"` | what we know, how far to trust it, what is stale |
| After a review | `seal <lib> --shelf S --reason "..."` (with `GIA_ANCHOR_FILE` set) | freezes a baseline and anchors the audit head off-library |
| Weekly | `stale <lib> --strict`, `contradictions <lib>` | statutory items past review-by; conflicting confirmed facts |
| Before sharing anything | `lockdown <lib>` then `guard <lib>` then `verify <lib>` | confidential shelves private, trail intact |
| Monthly | `anchor-check <lib> --file <anchor file>`, `doctor <lib>` | proves the log was not truncated or rewritten |
| Hand-off | `custody-export <lib> --shelf S --out <file>` (set `GIA_CUSTODY_KEY` to sign) | one self-checking provenance file |

Record what worked: `remember` after a useful or wrong answer (needs graphify), then `reflect` proposes lessons for **you** to approve.

## 4. Using it from Claude

* Claude Code: install the skill and the 18 slash commands (`INSTALL.md`, route 2). Examples: `/akos-brain-recall`, `/akos-brain-brief`,
  `/akos-brain-capture`, `/akos-brain-guard`.
* claude.ai: upload the skill (route 1). The commands that need graphify (`index`, `remember`, `reflect`, `to-graphify`) say so in one line
  if graphify is not in that sandbox; everything else works.
* The skill's description routes second-brain wording (recall, seal, tamper, capture, project briefing, contradictions) to it. Two prompt
  families overlap with neighbours and need your routing rule (decision D16).

## 5. Rules that keep it trustworthy

1. One library, one writer at a time per shelf (the tools lock; other programs do not).
2. Never edit a shelf's `KNOWLEDGE_GRAPH.json` by hand after sealing: `changes` will name exactly what you moved.
3. Investigations live only in `investigation` shelves, recalled one shelf at a time. Their recalls are logged (`access-log`); the question is stored as a hash.
4. Put the anchor file on another drive or in a mailbox. A copy beside the log protects against nothing.
5. Statutory facts need a primary source and a review-by date (`review_by: YYYY-MM-DD`); an unreadable date is treated as **not** fresh.

## 6. What it is not

* Not an audit tool that finds findings: it organises and protects what you establish.
* Not semantic search: it matches words (accent- and script-aware, with editable synonyms and optional IDF). "Remuneration" will not find "wages" unless a synonym says so.
* Extraction quality on your real documents is unproven until the CLD-14 pilot (`PILOT-CLD-14.md`).
* The `contradictions` report is a heuristic prompt, never a finding.
