# Changelog

## 2.0.7: entity registration (decision D8)
- **Added:** `Perfect Healthcare` and `Perfect Longevity` (Perfect Longevity Sdn Bhd; Malaysia, Healthcare, Group entities) to `config/entities.json`, registered with the shipped
  `register_entity.py` (dry run first). Shelves and graphs for them now validate; an unregistered name is still refused. `Fleet Parade` (Proton car dealership, Malaysia) was already a code.
- **Changed (test):** `test_unknown_entity_warn_draft_error_final` used "Perfect Longevity" as its example of an *unregistered* entity (it was the D8 gap); it now uses a name that is not registered.
- AKOS side: a three-edit diff is provided separately (`AKOS-entity-registration.diff`); the AKOS skill is app-managed and was not edited.

## 2.0.6: pilot dry run findings
- **Added:** `contradictions --include-unconfirmed [--min-overlap 0.5]` (opt-in): pairs a CONFIRMED item with an unverified one. Caught the planted 512 vs 540 conflict in the dry run,
  with one false positive in two pairs. Default behaviour unchanged. `min_overlap` is validated (0.2 to 1.0).
- **Added:** `docs/PILOT-DRY-RUN-REPORT.md` (P1 98%, P2 100%, P4 95%, P7 clean; the answer-key corrections and the word-form miss are disclosed).

## 2.0.5: one-command Windows setup
- **Added:** `setup_windows.ps1` (in `tools/` and the bundle root): finds Python 3.11, creates one venv with pinned graphify, copies the skill to a stable folder,
  writes `gia` / `giagraph` launchers, creates and locks down your library, runs `doctor` and a 10-step smoke test, optionally sets `PYTHONUTF8`, `GIA_ANCHOR_FILE` and PATH.
  User profile only, no admin, idempotent, `-CheckOnly`, `-Remove`. Tested end to end (setup, re-run, launchers from cmd.exe, three refusal paths, uninstall) and its
  syntax is checked by the release gate (new SETUP.PS1 step).
- No change to the skill, scripts or commands.

## 2.0.4 (bridge 2.0.4, brain 2.0.4, plugin 2.0.4): Windows commands + independent checks
- **Fixed (Windows):** all 18 slash commands call `python3`, which on a typical Windows PC is the Microsoft Store stub and fails. Every command now carries
  an explicit Windows fallback (`py -3` / `python`); `install.py` warns when it finds the stub; plugin tests (74) and an installer test enforce it.
- **Fixed (skill text):** stage `from-graphify` output to a NEW file and never overwrite the working KG without a backup (seen in a fresh-prompt eval).
- **Added:** `docs/DECISION-SHEET.md` (D2-D22 with defaults and an independent supersession review for D2), `docs/REMAINING-ACTIONS.md` (the five steps only the
  owner can do), fresh-prompt eval results in `docs/LIVE-EVAL-REPORT.md` (7 of 7 correct on safety rules).
- `tools/post_install_check.py` now reads the version of long-frontmatter skills correctly.

## 2.0.3 (bridge 2.0.3, brain 2.0.3, plugin 2.0.3): evidence round
- **Fixed (search):** single-digit and dotted numbers were dropped by the tokeniser, so "clause 4.2", "Rule 7" and "Schedule 4" could not be told apart.
  Single digits and dotted numbers are now kept (single letters stay noise). Recall index format bumped to 3 (old indexes rebuild).
- **Faster recall:** the default ranking is now computed inside SQLite for indexed shelves (exact, proved equal to the scan on ties, accents, Tamil, rank
  limits and multi-shelf merges). 100k nodes / 300k edges, cold process: common words 5.05s -> 1.07s, selective term 3.01s -> 0.88s.
  The index is built by `brain.py index` (or `GIA_RECALL_INDEX=always`), never by your next question.
- **Fixed (skill text, from the live evals):** readiness questions now run `validate --gate final` AND `deliverable`; every refusal to merge, share or index a
  confidential graph states ALLEGED-not-confirmed, a safe alternative, the `group-cae-fraud-v2` custody route, and Board/AC-only-after-conclusion.
- **Verified:** full suite and golden master against graphify 0.8.51, 0.9.38 and 0.9.97: 0 failures, 0 regressions. The golden comparison now ignores graphify's
  own saved-memory file naming (0.9.97 adds a hash and shortens the slug).
- **Added:** `docs/LIVE-EVAL-REPORT.md` (13 live evals x with/without the skill, 26 runs); `tools/pilot_sampler.py` (CLD-14 pilot sampling, P1/P4/P5 scoring);
  `tools/post_install_check.py` (finds every installed copy, flags duplicates, runs a smoke test of each); both self-tested by the release gate (new TOOLS step).
- Skill tests 362 passed (14 skipped, stated reasons), plugin 56, installer 11, golden master 0 regressions.

## 2.0.2 (bridge 2.0.2, brain 2.0.2, plugin 2.0.2): Windows-safe, second-brain release
- **Fixed (security):** owner-only protection was not enforced on Windows (NTFS has no POSIX modes) and `guard` reported 0 errors. Added an NTFS
  ACL layer (`icacls`, SID-based check over SDDL, fail-closed, `lockdown` command, `doctor` self-test). `guard` is now an ERROR on Windows.
- **Fixed:** graphify 0.9.x `to_html` returns `None` on success; the bridge treated it as failure and dropped `graph.html`.
- **Added:** persisted recall index (`.recall.sqlite`, identical answers, auto-rebuilt, `GIA_RECALL_INDEX=off|auto|always`).
- **Added:** `anchor-record` / `anchor-check` (+ `seal --anchor-file`, `GIA_ANCHOR_FILE`), `custody-export` / `custody-verify` (HMAC),
  `contradictions`, `access-log`, `capture`, `brief`, `lockdown`; shelf kinds `project` and `notes`; six new slash commands (18 total).
- **Added:** `tools/trigger_eval.py` (routing and collision proxy), `tools/make_manifest.py`, `evals/trigger_cases.json` (28 prompts).
- **Changed:** `SKILL.md` description rewritten (it missed 7 of 14 second-brain prompts in the trigger eval); installer refuses a duplicate install.
- **Changed (tests/gate):** Windows-clean release gate and test suite (POSIX manifest paths, UTF-8, graphify auto-detect, stated-reason skips).
  The patch tool and its suite are Linux-only (`plugin:skill` folder names contain ':').
- Skill tests 356 passed (13 skipped, stated reasons), plugin 56, installer tests, golden master unchanged (43 scenarios, 0 regressions after
  platform normalisation). Details: `docs/UAT-report-v5.md`, `docs/GAP-CLOSURE-REGISTER.md`.

## 2.0.1 (bridge 2.0.1, plugin 2.0.1)
- **Fixed:** without graphify installed, `to-graphify`, `index` and `remember` crashed with exit 3 ("internal error"). They now exit 2 with one clear line saying what to install; `index` says it once instead of failing every shelf. Everything that does not need graphify (validate, recall, seal, changes, verify, stale, status, guard, dashboard, deliverable, export-xlsx, merge, doctor) was proven to work without it (4 new tests).
- **Added:** `install.py` installer (dry run by default, backup, idempotent, self-checks, uninstall), a lean claude.ai upload ZIP, and `INSTALL.md` (separate Install Bundle).
- **Fixed (patch tool):** on a catalog with no `user/` folder, `apply` creates one to install the skill into, and `--rollback` left the empty folder behind, so the catalog was not byte-identical. Apply now journals folders it creates and rollback removes them (only if still empty). Found by making the real-catalog rollback test layout-agnostic. The two real-catalog tests now adapt to any catalog layout, and the exact-operation-count test skips honestly when the layout differs.
- Skill tests 344, patch tests 49 (+2 honest skips), plugin 38; golden master unchanged (43 scenarios, 0 regressions).


## 2.0.0, production release (bridge 2.0.0, plugin 2.0.0, patch 2.0, drift script 1.2, AKOS 2.3)

Hardening release. All v1.2.0 capabilities are preserved: the golden master (43 scenarios) shows no removal or change, and every v1.2.0
subcommand and flag is still present. See `docs/UAT-report-v4.md` for the 24 defects fixed, 7 intentional behaviour changes, measured
performance and stated limits.

### Added
- Concurrency safety (locks), crash safety (staged swaps, write-ahead journal, resumable rollback), strict input handling, output sanitisation.
- Tamper-evident audit trail (`audit.log`), `seal`, `changes`, `verify --anchor`; `doctor`; opt-in `recall --ranking idf`.
- `apply_patch --rollback`; refuses a backup inside the catalog; one apply at a time; per-operation failure isolation.
- `tools/release_gate.py`, `MANIFEST.sha256`, `compat/` (golden master and capability surface), `uat/` (9 stress scenarios).
- Plugin commands `/akos-brain-verify` and `/akos-brain-doctor`.

### Changed (intentional)
See section 3 of the UAT report: `index` exit code on shelf failure; confidential lessons stay in the shelf; duplicate JSON keys / NaN rejected;
local date; bounded arguments; malformed input exits 2.

### Fixed
24 defects (I-01..I-24), each reproduced before it was fixed and pinned by a test.


## 2026-10-04: Enhanced package (bridge 1.2.0, plugin 1.2.0, patch 2.0, drift script 1.2, AKOS 2.3)

### Fixed (found by testing; each has a regression test)
- Recall mangled accented words ("Nómina" matched "mina") and could never find Tamil or Chinese text. New `textnorm.py`.
- Unreadable dates (`April 2026`, `2026-4-1`) were treated as **fresh**. Now `BAD_DATE`, fail-closed; only `YYYY-MM-DD` accepted.
- Every file was written `0600`, unreadable by teammates; confidential shelves were not deliberately locked. Shared = 0644, confidential = 0700/0600; `guard` warns on drift.
- Non-ASCII ids collapsed in slugging (`ஊதிய-01` -> `01`). Hash-suffixed.
- A corrupt shelf file crashed the whole index/guard/status. Now skipped and reported; guard fails closed.
- `dashboard` on a non-library crashed (exit 1) because running `brain.py` as a script created two copies of the module. Aliased.
- `register_entity` never updated the "nine entities" wording (off-by-one).
- Status classifier fused a markdown table into one "sentence" (one "legacy" row mislabelled other skills). Per-row/bullet/heading units.
- Drift script: single-root blind spot, crash on `:` in folder names, false positives on narrative and a deliberate mirror (v1.1, v1.2).
- My own skill and a protocol heading tripped drift Check 2.
- Earlier overstatement corrected: `mac-audit-constitution-l99` is **unconfirmed**, not "retired".

### Added
- Evidence ranks R1-R5 end to end: shown in recall, `--max-rank`, R4 -> PROVISIONAL, R5 -> INDICATOR, `CONF_VS_RANK`, `RANK_INVALID`, `deliverable --max-rank`.
- Editable `synonyms.json` (payroll / nómina / gaji, EPF / provident fund, ...); expansions reported; direct matches outrank synonyms.
- Dual-format output: `brain.py dashboard` (HTML + XLSX) and `akos_graph.py export-xlsx`; HTML-escaped and Excel-formula-neutralised; confidential shelves counts only.
- `/akos-brain-dashboard`; plugin-command executability tests.
- Patch ops E1-E5: namespaces applied inside racm-ecosystem and cae-report-conversion; v6 gate made a true 12; master-audit-superagent namespace; LEGACY banners. AKOS citation fix. Drift script v1.2.
- Mutation-checked tests.

### Verified
193 tests in this package (130 + 32 + 31), graphify upstream 4,930 passed, full patch applied to a copy of the real catalog: drift 5/6 -> 1/6 flagged, interop warnings 7 -> 3, idempotent, byte-exact rollback.

## 2026-10-03: first release (bridge 1.0/1.1, library brain, interop check, patch 1.0)
