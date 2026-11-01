# Action plan: closing the gaps and operating the package

Date: 7 October 2026. Every action says how it was validated and how to undo it.

**Status key**
- **CLOSED**: done and verified in this session, with a regression test.
- **REHEARSED**: executed end to end on a full copy of your portfolio and verified (`action-results/`, `bash tests/rehearse_action_plan.sh`); you apply it on your own installation. It cannot be applied here because this container is ephemeral and is not your real skill environment.
- **READY**: built and validated on temp copies; waiting for your decision. Never applied by default.
- **EXTERNAL**: cannot be verified in a sandbox; a procedure and pass criterion are provided.
- **ACCEPTED**: a deliberate decision, recorded with its reason.

Run from the package root. Scripts need `bash`, Python 3.7+ with PyYAML, GNU `date`, and `patch`.

## Phase 0: closed (verified)

| ID | Gap | Fix | Validated by |
|---|---|---|---|
| C1 | Glued amounts and identifiers invisible to the guard (9 of 10 missed) | Engine rewritten | 128,000-case generator fuzz, 0 violations; fuzz fails 7 of 10 against the old engine |
| C2 | Non-English negations, currency, magnitude, full-width digits unprotected | Language packs, NFKC, currency and magnitude classes | 6 of 6 now caught |
| C3 | Zone guard failed open on 15 of 28 filenames | Data files no longer lean by extension; ZH/ES/MS names | filename battery, 0 leaks |
| C4 | Registry bound to this container's folder names | Lookup by folder name | test on a relabelled copy of the real portfolio |
| C5 | CRLF checkouts broke registry hashes | Line-ending-normalised hashing | CRLF test |
| C6 | Sign-off chain forked under contention | File lock | 8 writers x 40 attempts, chain intact |
| C7 | Near-identical skills under different names invisible | Similarity detection + declarations (5 pairs) | registry check; fails on an undeclared pair or drift |
| C8 | Overstated gate claim, in 4 places | Corrected; the old wording is forbidden by a test | register, patch, contract, report |
| C9 | Superseded skills indistinguishable from live ones | Declared (v4, v5 declared; v3 inferred); reported as LEGACY | gate audit |
| C10 | Stale shipped package | Rebuilt, checksummed | clean-extract UAT |
| C11 | 10 portfolio defects (skipped checks read as passes, drift scope 3 of 146 skills, broken paths, stale citations) | 10 patches applied | patch round-trip, byte-identical |

**Control for every Phase 0 item:** reverting the patches fails 12 UAT checks; the old engine fails 6;
the old zone guard fails 4; applying the decision patch to the live mount fails 8.

## Phase 1: decisions for you (do in this order)

Each decision is independent unless noted. Recommended option first.

| ID | Decision | Recommendation | Command | Validation | Pass criterion | Undo | Status |
|---|---|---|---|---|---|---|---|
| D0 | Bootstrap your installation (do this first) | **Do it.** Records today's state as *unreviewed* and alerts on change; it does not pick canonical copies | `bash skills/gia-lean-comms/scripts/portfolio_gates.sh --bootstrap` (dry run), review, then `--bootstrap --yes` | next `portfolio_gates.sh` run | exit 0, "nothing new"; state files appear in `python3 skills/gia-lean-comms/scripts/gia_state.py` | delete the state directory | READY |
| D1 | Add CD/SD/MW classification as a gate item (S1) to the v6 engine and its duplicate | **Apply.** One row, no claim about tool behaviour | `bash portfolio-patches/apply_patches.sh ROOT --check --dir decision-patches`, then without `--check`; then `python3 skills/gia-lean-comms/scripts/registry_check.py --refresh`, review, then `--refresh --yes`; then `bash skills/gia-lean-comms/scripts/portfolio_gates.sh --write-baseline` | `gate_audit.py --registry` | 0 `[GAP]` lines; gates PASS; copies still similar (>= 0.9) | `apply_patches.sh ROOT --dir decision-patches --revert`, then restore `.bak` of the registry | REHEARSED |
| D2 | Retire the stale prefixed `self-learning-loop` | **Retire.** It has no data store or `log_lesson.py`; never keep two lesson stores | Manual, see runbook below | `registry_check.py`; `grep` for the name | no skill cites it by a path-bearing reference | move it back | REHEARSED |
| D3 | Retire bare `pune-india-ops-audit` v1.0 | **Retire** once nothing references it | runbook | same | same | move it back | REHEARSED |
| D4 | Retire the plugin AKOS copy | **Review first.** Read the 2 content lines (a Kaizen pipeline line; a routing row naming a 27-item gate). Do **not** merge the 27-item row: governance reconciled it away | runbook | line-level diff | you are satisfied the canonical copy covers the pipeline line | move it back | REHEARSED |
| D5 | Keep or retire each of the 5 near-duplicate pairs | **Keep both for now.** The registry now fails if they drift; retire one when you choose a single architecture | none | `registry_check.py` | exit 0 | n/a | REHEARSED |
| D6 | Promote the 11 logged lessons into `CLAUDE.md` | **Promote 1, 2, 3, 7, 9, 10**, which recurred; judge the rest | edit your `CLAUDE.md` using `templates/CLAUDE_md_proposed_lessons.md` | your review | wording you accept | edit back | REHEARSED |
| D7 | Never compress `CLAUDE.md` | **Keep as is.** The guard cannot prove a rewrite equivalent | none | `zone_guard.py --path CLAUDE.md` | PROTECTED | n/a | ACCEPTED |
| D8 | Launcher / master name collision | **No rename.** Different documents; plugin skills are namespaced; low trigger overlap | none | recorded in the registry | n/a | n/a | ACCEPTED |

**Executing D1 to D6 on your installation** (every step below was rehearsed; see `action-results/SUMMARY.md`):

1. `bash tests/rehearse_action_plan.sh` on your own copy first (set `SRC_USER` / `SRC_PLUGINS`). Expect pre-state 7/9, post-state 12/12.
2. **D1 and the D2 prerequisite:** `bash portfolio-patches/apply_patches.sh ROOT --dir decision-patches` applies 4 patches: the S1 check in both v6 copies, and two repoints. Backups go to `~/.gia-lean-comms/patch-backups/`, never beside the skill.
3. `python3 skills/gia-lean-comms/scripts/registry_check.py --refresh`, read it, then `--refresh --yes`.
4. **D2-D4:** `python3 skills/gia-lean-comms/scripts/retire_copy.py plan --accept-refs pune-india-ops-audit --merge-reviewed akos-enterprise-orchestrator`, read it, then `apply --yes --archive DIR`. It moves, never deletes, hashes every folder, and records a manifest. Undo: `retire_copy.py rollback MANIFEST --yes`.
5. `python3 skills/gia-lean-comms/scripts/verify_actions.py --expect-s1 --manifest MANIFEST --claude-md YOUR/CLAUDE.md`. Pass: every check PASS.
6. **D6:** `bash templates/promote_claude_md.sh YOUR/CLAUDE.md` (idempotent; keeps a `.bak`).

**What the rehearsal on your real data changed in the plan:**
- **D2 was not "just retire".** The tool blocked it: `scheduled-task-library.md` tells you to read `data/lessons.jsonl` through the *prefixed* name, but that file exists only in the canonical copy, so the instruction was broken as written. Decision patches 03 and 04 repoint the two references first.
- **D3 (pune)** needed `--accept-refs`: the one remaining reference is a same-plugin name mention that resolves to the canonical copy; `R12` exists in both.
- **D4 (AKOS)** needed `--merge-reviewed`. I read the two plugin-only lines: line 132 is the same pipeline with the first stage renamed, and line 386 is the "27-item" routing row that the canonical copy documents as a **stale entry it deliberately removed** (its lines 587-588 and 648). Not merging it is correct.
- **If a stale copy belongs to a plugin you author** (the prefixed `mktron-sentinel:*` and AKOS plugin copies do), run these steps against that plugin's **source** and re-publish. Editing an installed plugin cache is overwritten on update. Check with `claude plugin list` first.
- **D5:** keep all five near-duplicate pairs; the registry fails if either drifts.

## Phase 2: external verification (needs the real environment)

| ID | Check | Procedure | Pass criterion | Status |
|---|---|---|---|---|
| L1 | Plugin loads in Claude Code | Install the folder; confirm the skill is listed and invocable | listed; no manifest error | EXTERNAL |
| L2 | Real trigger behaviour | `bash skills/gia-lean-comms/scripts/live_verify.sh` | 80%+ should-trigger, 90%+ should-not (script reports MET / NOT MET) | EXTERNAL |
| L3 | caveman skill vs hook default (only if caveman is installed) | Set `.caveman.json` to `{"defaultMode": "off"}`; in a fresh session ask "Be brief: what is the capital of Malaysia?"; check whether the caveman skill loads | you record the outcome; if it loads, uninstall the caveman skill or rely on the protected zones | EXTERNAL |
| L4 | Patches and registry against your real paths | `apply_patches.sh ROOT --check`; `registry_check.py --roots <your roots>` | `MISSING`/`CONFLICT` reported and nothing touched; or `already`/exit 0 | EXTERNAL |
| L5 | Scheduled task | Paste `templates/scheduled-task-portfolio-gates.md`; run once by hand | output file written; exit 1 or 2 produces "ACTION NEEDED" | EXTERNAL |
| L6 | Lean state not inherited by subagent deliverables | While lean mode is on, have an orchestrator delegate drafting a finding | the deliverable carries no lean style | EXTERNAL |
| L7 | Your OS | `bash tests/run_uat.sh` | exit 0 (macOS: install GNU coreutils) | EXTERNAL |

## Phase 3: operating cadence

| Cadence | Action | Why |
|---|---|---|
| Weekly | `portfolio_gates.sh` (scheduled). Exit 1 or 2 is for a person | Alerts on change; a skipped gate never reads as a pass |
| After any approved change to a registered skill | `registry_check.py --refresh`, review, `--yes` | Re-anchors the registry deliberately |
| Every skill commit | `templates/pre-commit.sh` | Blocks broken citations and invalid frontmatter |
| Within 90 days | Review your `baseline.txt` in the state directory (`python3 skills/gia-lean-comms/scripts/gia_state.py` shows where) | It can become permission to ignore known findings |
| Before compressing any file | `zone_guard.py`, then `compress_gate.py`, then `review_log.py` for any REVIEW | Meaning-critical content stays protected |

## Phase 4: roadmap (not built)

1. Make S1 a tool-enforced check and tighten conversion-gate item 28 to "independent review recorded". The tool source is not in the skill folders.
2. A single source for the v6 engine with a generated copy, replacing two hand-synchronised files.
3. Sign-offs through signed commits, if you need authentication rather than a record.
4. A semantic-diff aid for REVIEW packets (human-in-the-loop), and Tamil and Hindi language packs if needed.
