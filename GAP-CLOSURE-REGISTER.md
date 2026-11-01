# Gap-closure register: 2.0.1 -> 2.0.2

Evidence grade: **Rank 1** = tool output captured on this Windows 11 machine, Python 3.11, graphify 0.9.38 (31 Oct 2026).
"Closed" means a test or a measurement proves it. "Reduced" and "Open" say what is left, without softening it.

## Weaknesses found when 2.0.1 was compared with 2.0.0

| # | Weakness | Status | What was done | Proof | Residual |
|---|---|---|---|---|---|
| W1 | Owner-only protection relied on POSIX `chmod`; on Windows nothing was enforced and `guard` said "0 errors" | **Closed** | NTFS ACL layer: `win_lockdown` (drop inheritance, remove every other entry, grant owner + SYSTEM, reset children to inherit) and a SID-based checker over `icacls /save` SDDL. `guard` is now an ERROR on Windows, and fails closed if permissions cannot be read. New `lockdown` command repairs a library. `doctor` self-tests it on the volume. | `test_v202.py`: attack test grants *Everyone: read*, guard flags it, `lockdown` removes it; path with spaces and Tamil/accented characters; fail-closed tests. UAT S1.20 and S7.5 now pass on Windows. | Local administrators and SYSTEM can always read (by design). Network shares / FAT / exFAT may not hold ACLs: `doctor` reports FAIL there. |
| W2 | Release gate and tests failed on Windows (76 failures in 2.0.0/2.0.1 on this machine) | **Closed** for the skill and plugin; patch suite **not applicable** | Gate: POSIX manifest paths, UTF-8, graphify auto-detect, platform-normalised golden master. Tests: `conftest.py` with stated-reason skips, short parametrize ids, spawn-safe multiprocessing test. | Skill suite 356 passed / 13 skipped / 0 failed; plugin 56 passed. | 13 skips are symlink-privilege, NTFS-illegal names, POSIX-only modes and time-zone semantics. The patch suite (51 tests) is skipped on Windows: the patch tool targets the Linux `plugin:skill` catalog, which cannot exist on NTFS. Run it in the Linux/Cowork sandbox. |
| W3 | Search is word-matching, not semantic | **Reduced, by design** | Not replaced. Added `contradictions` and kept editable synonyms and `--ranking idf`. A semantic layer must never promote a trust label, so it stays a documented next step (see "Not built"). | n/a | Lexical only. |
| W4 | No persisted index: 100k-node recall re-parsed 64-71 MB per query | **Reduced** | Per-shelf SQLite inverted index, keyed by the KG's SHA-256, rebuilt automatically, ignored if corrupt or stale. | 7 equivalence tests (scan == index, including accents, Tamil, idf, rank limits); measured on 100k nodes / 300k edges, cold CLI process: common words 4.45s -> 1.63s, rare term 2.91s -> 0.70s, identical results. | The 1s target is met only for selective queries. First call builds the index (about 13s once). |
| W5 | Truncation or rewrite of the audit log detectable only if you recorded an anchor by hand | **Closed** (mechanism) | `anchor-record` / `anchor-check`, hash-chained anchor file that must live outside the library; `seal --anchor-file` or `GIA_ANCHOR_FILE` anchors automatically; `doctor` warns if no anchor is configured. | Tests: truncated log -> `LOG_TRUNCATED`; forged entry with recomputed hashes -> `LOG_REWRITTEN`; edited/dropped anchor record -> `ANCHOR_FILE_TAMPERED`; anchor inside library refused. | An anchor file on the same disk protects only against casual edits. Put it on another drive, a mailbox or a ticket. Entries after the last anchor are protected only by the chain. |
| W6 | The 13 behavioural evals never ran; trigger accuracy unproven | **Reduced** | `tools/trigger_eval.py`: TF-IDF routing proxy over your real catalog (546 skills found on this machine) with 28 labelled prompts. It found the description missed 7 of 14 second-brain prompts; the description was rewritten (939 chars). | 14/14 positives routed, 14/14 unrelated prompts not mis-routed to this skill, closest description 0.21 cosine (no collision). | A lexical proxy is not Claude's routing. 2 prompts are SHARED with `gia-statutory-freshness` and `gia-evidence-discipline`, and 2 are near-ties: a portfolio decision (D16). The 13 live evals still need a run with subagents. |
| W7 | Extraction quality on real documents untested | **Open** | `docs/PILOT-CLD-14.md`: a one-engagement pilot protocol with pass/fail thresholds. It needs your documents, so it was not run. | n/a | Open until you run it. |
| W8 | 7 owner decisions open (D2, D3, D4, D6, D8, D10, D15) | **Open** | Carried forward in `docs/DECISIONS_PENDING.md` with recommendations; D16-D19 added. | n/a | Only you can decide. The patch tool is not applied on Windows. |
| W9 | Installer would add a duplicate copy next to the account's `akos-graph` plugin | **Closed** | `install.py` scans plugin, skills and account folders and refuses `--apply` on a duplicate unless `--allow-duplicate`. | `test_install.py`: dry-run warns, apply refused, flag allows. | Detects by skill name only. |

## Defects found while closing the gaps (not in the 2.0.1 comparison)

| ID | Sev | Defect | Fix |
|---|---|---|---|
| N-01 | High | graphify 0.9.x `to_html` returns `None` on success; the bridge treated that as failure and silently dropped `graph.html` | judge by the file |
| N-02 | High | `icacls /inheritance:r /T` left existing files with an **empty ACL** (owner locked out) | protect the root, then reset children to inherit |
| N-03 | High | explicit "Everyone" entry on a shelf survived re-locking (found by the attack test) | remove every other entry by SID before granting |
| N-04 | Med | `icacls` text output is ambiguous for paths containing spaces and non-ASCII | permission check reads SDDL via `/save`, not text |
| N-05 | Low | `install.py --verify-bundle` compared `\` paths to a `/` manifest | POSIX paths |
| N-06 | Low | the 100k-character query UAT case exceeds Windows' 32k command-line limit | capped at 20k on Windows (documented) |

## New complementary functions (gap 8 and the second-brain objective)

`capture`, `brief`, `contradictions`, `custody-export` / `custody-verify`, `access-log`, `lockdown`, `anchor-record` / `anchor-check`;
shelf kinds `project` and `notes`; six new slash commands (18 in total).

## Not built, on purpose

* **Semantic retrieval** - needs an embedding model choice and a rule that it can never raise a trust label. Do after the CLD-14 pilot shows lexical recall is the bottleneck.
* **Statutory-freshness feed** - `stale` already flags past-due review dates; fetching portals belongs to `gia-statutory-freshness` (D16 decides the routing).
* **Cloud sync of anchors** - choose the destination (mailbox, ticket) yourself (D17).


---

## Update for 2.0.3 (evidence round)

| Item | Was | Now | Proof |
|---|---|---|---|
| W4 common-word recall, 100k nodes | 1.63s indexed | **1.07s** cold CLI (scan 5.05s) | SQL-side ranking; `perf.py` run, results identical |
| W6 behavioural evals never run | Open | **Run: 26 live runs, 94% with the skill vs 64% without** (graded by one reviewer) | `docs/LIVE-EVAL-REPORT.md`; 3 instruction gaps found and fixed |
| graphify compatibility (only 0.9.38 tested) | Open | **0.8.51, 0.9.38, 0.9.97 all pass** (362 / 0 failed; golden 0 regressions) | throwaway virtual environments |
| W7 pilot effort | protocol only | protocol **plus sampler and scorer** (`tools/pilot_sampler.py`) | self-test in the gate |
| Account install untested | checklist | **`tools/post_install_check.py`** (read-only; finds duplicates; smoke-tests each copy) | self-test in the gate |
| N-07 (new) | | single digits and dotted clause numbers were not searchable | fixed; test added |
| N-08 (new) | | the first `recall` after a change paid the 12s index build | build moved to `index` |

Dry-run pilot (31 Oct): P1 98%, P2 100%, P4 95%, P7 clean; found the contradiction gap (fixed, opt-in, 2.0.6) and a word-form miss (not fixed). See `PILOT-DRY-RUN-REPORT.md`.

Still open: the live evals' "after fix" scores are not independent; WSL2/Linux run of the 14 skipped tests and the patch suite; the CLD-14 pilot;
decisions D2-D19; the desktop-app upload; device encryption.
