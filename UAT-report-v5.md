# UAT report v5: akos-graphify-bridge 2.0.2 + library brain + plugin 2.0.2 (Windows 11)

Evidence grade: **Rank 1**: tool output captured on one Windows 11 Home machine, Python 3.11.11, graphify 0.9.38, 31 Oct 2026.
Earlier reports (v4) were produced on Ubuntu 24 / Python 3.12 / graphify 8. This report is the first full run on Windows.
`docs/GAP-CLOSURE-REGISTER.md` explains each change; this file reports what was measured and what was **not** covered.

## 1. Results

| Gate | Result |
|---|---|
| Release gate, full mode: **RELEASE GATE PASSED**. MANIFEST (201 files), COMPILE (95 files), SKILL (description 939/1024), SURFACE (70 v1.2.0 flags / 20 commands), GOLDEN (43 scenarios, 0 regressions, platform-normalised) | PASS |
| Skill tests (full mode, includes the 100k-node performance tests) | **359 passed, 12 skipped (stated reasons), 0 failed** |
| Of which new in 2.0.2 (`test_v202.py`) | 26 tests (and 1 new 100k-node performance test): Windows ACL (attack and repair), index equivalence (7), anchors (3), custody (1), contradictions, access log (2), capture / brief (3), CLI exit codes |
| Plugin tests | 56 passed (18 commands; every script, subcommand and flag a command names exists) |
| Installer tests (11) | pass (dry run changes nothing; duplicate refused; uninstall restores; bundle verifies on Windows) |
| Patch suite (51) | **skipped on Windows**: the tool targets the Linux `plugin:skill` catalog (':' cannot exist in NTFS names). Not run, not passed. |
| Trigger eval (28 prompts, 546 catalog skills) | 14/14 positives routed, 14/14 unrelated prompts not mis-routed, closest description 0.21 (no collision); 2 SHARED and 2 NEAR-TIE reported (decision D16) |
| UAT scenarios (Windows) | S1 26/26 · S2 14/14 · S3+S5 21/21 · S4 7/7 · S7 7/7 · S8 6/6 = **81/81** on the final code · **S9 not run** (Linux patch tool) |

## 2. Skips, listed rather than hidden (skill suite)
Symlink privilege not held (4), file names NTFS forbids (2), POSIX permission modes (4: the Windows equivalent is tested in `test_v202.py`),
time-zone semantics (2), performance (1, only when `GIA_SKIP_PERF` is set; the gate's full mode runs it).
Because symlink-refusal code paths could not run, a run with Windows Developer Mode on, or on Linux, is still needed to prove them on a new machine.

## 3. Performance, measured (cold CLI process unless stated)

| Operation, 100k nodes / 300k edges, 71 MB shelf | 2.0.1 behaviour (scan) | 2.0.2 with recall index | Note |
|---|---|---|---|
| recall, common words (`payroll minimum wage`) | 4.45 s | **1.63 s** | all matching nodes still ranked |
| recall, selective (`zebra quokka`) | 2.91 s | **0.70 s** | |
| same, in-process (test) | 2.46 s | **0.23 s** | |
| first call that builds the index | n/a | about 13 s, **once**, done by `brain.py index`, not by a question | |
| identical results scan vs index | | **True** (7 equivalence tests + this run) | |
| index of 13 shelves / 39k nodes (UAT S1.2) | 65 s | 65 s | budget 60s is Linux-calibrated; set to 120s on Windows, documented |
| recall scan, in-process (test budget) | 4.1-4.4 s | same | budget 3.0s Linux, 6.0s Windows |

The 1 s goal is **not** met for common-word queries on this laptop. That path is bounded by ranking 100k candidates, not by parsing.

## 4. Attacks run against the new code (all detected or refused)
Everyone-read ACL added to a confidential shelf (guard ERROR; `lockdown` removes it); permissions unreadable (guard ERROR, fail closed);
lock-down failure (shelf creation refuses); library path with spaces and Tamil/accented characters; audit log truncated (LOG_TRUNCATED);
audit entry forged with recomputed hashes (LOG_REWRITTEN); anchor record deleted (ANCHOR_FILE_TAMPERED); anchor file placed inside the library
(refused); custody export edited (digest mismatch), then re-digested by an attacker (HMAC INVALID); access-log record deleted (chain break);
corrupt and stale recall index (ignored, rebuilt); a note that tries to enter a final deliverable (blocked by TYPE_UNCLASSIFIED).

## 5. What this does NOT guarantee
* **One machine, one OS.** Not run on macOS, on another Windows build, on a network share, or on exFAT/FAT (where ACLs do not exist: `doctor` reports FAIL).
* **Local administrators and SYSTEM can always read** an "owner-only" folder. Disk encryption (BitLocker) is the control for a lost device; it is outside this tool.
* **Advisory locks** protect against cooperating runs, not another program editing files.
* **The trigger eval is a lexical proxy**, not Claude's routing. The 13 behavioural evals (`evals/evals.json`) have still not been run with a live model.
* **Extraction quality on your real documents is untested** (pilot protocol: `docs/PILOT-CLD-14.md`).
* **Retrieval is lexical**, not semantic. `contradictions` is a heuristic.
* **The ecosystem patch was not applied** and is not applicable on Windows; 7 owner decisions remain open (`DECISIONS_PENDING.md`).
* **graphify 0.9.38 was tested; graphify 8 was not.** The bridge's HTML defect (N-01) is a version difference between them.
* **Not tested here:** the Claude desktop app upload path and the plugin loader (no way to drive them from a script). `install.py` was tested with an isolated fake home only; the live install was not performed.

## 6. Recommended next steps
1. Run the CLD-14 pilot (`PILOT-CLD-14.md`); P3 and P5 are the stop conditions.
2. Run the 13 live evals when subagents are available; resolve D16 first.
3. Repeat the gate on Linux or with Developer Mode on to execute the 13 skipped tests.
4. Decide D19 (replace the account's 2.0.0 plugin) after step 1's P7.
