# Pilot protocol: CLD-14 (one engagement, two weeks)

**Purpose:** find out whether extraction and recall on your *real* documents are good enough to rely on. Nothing in the test suites can show this.
**Not authorised by this document:** loading investigation material. Use the CLD-14 workpapers only (they are not a fraud matter).

## Setup (30 minutes)
1. `brain.py doctor <lib>`: every line OK (owner-only protection especially). `export GIA_ANCHOR_FILE=<path on another drive>`.
2. `shelf-add <lib> clld14 --kind engagement --entity MKAPL-DC` and `shelf-add <lib> inbox --kind notes --entity Group`.
3. Ingest the CLD-14 folder with `/akos-graph-ingest` (Claude is the extractor; use `--backend claude` or `claude-cli`, never an auto-picked cloud backend).

## Measure (record each in the scorecard below)
| # | Test | How | Pass if |
|---|---|---|---|
| P1 | Extraction precision | pick 40 random proposed nodes; check each against its source document | at least 90% correct label, type and source location |
| P2 | Extraction recall | list 25 facts you know are in the workpapers; check each exists as a node | at least 80% present |
| P3 | Wrong confidence | count proposed nodes at High or 100% that a document does not support | 0 (they must arrive as PROPOSED / Low) |
| P4 | Recall quality | 20 questions you would really ask; is the right node in the top 5? | at least 80% |
| P5 | Trust labels | for the 20 answers, was every INDICATOR/PROVISIONAL label right? | 100% (a wrong CONFIRMED is a defect) |
| P6 | Time saved | time to answer 10 of the questions manually vs with `recall` | median at least 50% faster |
| P7 | Safety | `guard`, `verify`, `anchor-check` after the two weeks | 0 errors |
| P8 | Stale / contradiction | `stale --strict` and `contradictions`: are the hits real? | precision at least 60% |

## Decide
* All pass: adopt for one more engagement, then widen.
* P4 or P2 fails: the bottleneck is retrieval or extraction, not trust. That is the trigger for a semantic layer (not before).
* P3 or P5 fails: stop. File the exact node, because it is a trust-model defect.

## Scorecard
| Test | Result | Evidence (file / date) | Pass? |
|---|---|---|---|
| P1 | | | |
| P2 | | | |
| P3 | | | |
| P4 | | | |
| P5 | | | |
| P6 | | | |
| P7 | | | |
| P8 | | | |
