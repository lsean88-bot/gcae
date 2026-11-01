# CLD-14 pilot: dry run on a synthetic corpus (not your real papers)

Evidence grade: Rank 1 for the measurements; the corpus is **invented** (8 short documents, 25 known facts, planted traps), so this tests the *pipeline and scoring*,
not extraction quality on your real workpapers. 31 Oct 2026, Windows 11, scratch library (your real library was not used). Extraction was done by a Claude sub-agent
(Sonnet) following the skill's ingest rules, without seeing the answer key; scoring used the real `tools/pilot_sampler.py` and `brain.py` commands.

| # | Test | Result | Pass line | Verdict |
|---|---|---|---|---|
| P1 | Extraction precision (40 random nodes judged against source) | **39/40 = 98%** (one action item typed `Decision`; the schema has no Action type) | 90% | PASS |
| P2 | Extraction recall (25 known facts present) | **25/25 = 100%** | 80% | PASS |
| P3 | High/100% nodes a document does not support | **0** by the rule check (but see judgement call below) | 0 | PASS |
| P4 | Recall quality (20 questions, right node in top 5) | **19/20 = 95%** after correcting 4 expected ids in *my* answer key (raw 15/20, see below) | 80% | PASS |
| P5 | Trust labels | **no wrong label** on any returned item (17/18; the 18th item was the one missed in P4) | 100% | PASS on labels |
| P6 | Time saved | not measured (synthetic) | | n/a |
| P7 | Safety: guard, verify, anchor-check after sealing both shelves | **0 errors on all three** | 0 | PASS |
| P8 | Stale / contradiction detection | stale: **3 of 3 flagged items real** (512 past its review date; two undated). contradictions: **missed the planted 512 vs 540 conflict** (default mode compares CONFIRMED items only; the 540 item was correctly unconfirmed) | precision 60% | MIXED |

## What the dry run found
1. **Answer-key errors were mine, and I disclose them.** My first key matched the first node containing a phrase ("R-01" matched the RACM header, "C-01" matched "DOC-01...",
   "14" matched "DOC-0142"). Four of the five raw P4 misses were this. I corrected those four ids by hand and kept the raw 15/20 visible here. Treat 19/20 as an estimate.
2. **One real recall miss: word forms.** "how many contractors were *sampled*" did not find "sample of 40 contractors": the search matches whole words, with no stemming.
   One miss in 20 is small, but it is a pattern to watch in the real pilot. A light stemmer is a candidate fix (not semantic search); it was **not** built because it changes ranking for everyone.
3. **Contradictions gap, now addressed (2.0.6).** `contradictions --include-unconfirmed --min-overlap 0.5` pairs a CONFIRMED figure with an unverified one. On this corpus it caught the planted
   512 vs 540 conflict and produced **one false positive** (small vs large contractor counts: different numbers, not a conflict): precision 1 of 2. It is opt-in; the default is unchanged.
4. **Judgement call the scripts cannot make (P3).** The extractor rated the statutory rate `100% / R1` from a note that *transcribes* a notification, not the notification itself.
   A strict reviewer would call that R2/High. No rule check catches this: a human must confirm that an R1 node's source is the primary document. Put it in the real pilot checklist.
5. **Splitting statutory items from engagement items drops cross-links:** 5 edges between them could not be kept (a shelf holds only its own edges). Decide your shelf design before the real ingest.
6. **The 512 rate is correctly STALE today** (review-by 2025-12-31) and recall says so: the freshness control works end to end.

## What this does and does not tell you
It shows the pilot process runs end to end, the scoring tools work, and a Claude extractor following the skill produces precise, well-calibrated nodes on clean, short, well-structured text.
It does **not** show how it behaves on your real, messy workpapers (scans, long PDFs, mixed languages, tables): that is still the real pilot. Real documents will score lower on P1 and P2.
