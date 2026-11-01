# gia-lean-comms v1.4

Bounded brevity layer for GIA sessions, plus portfolio hygiene tooling. Lean working chatter; full-fidelity
protection for findings, Board/AC papers, external submissions and governance files; a multilingual
(English, Malay, Spanish, Chinese) meaning-flip guard with recorded human sign-off; audits for broken
citations, same-name and near-duplicate skills, validity, and quality-gate coverage. It defines no Iron
Rules, orchestration or Kaizen engine of its own.

**Start here:** `ACTION_PLAN.md` (what to do, in order) then `UAT_REPORT.md` and `CRITIQUE.md`.

| Path | What |
|---|---|
| `skills/gia-lean-comms/` | the skill: SKILL.md, 14 scripts, interop contract, seed fixtures |
| `portfolio-patches/` | 10 applied fixes as unified diffs + `apply_patches.sh` (apply / `--check` / `--revert` / `--dir`) |
| `decision-patches/` | 4 owner-decision patches (S1 check x2, two repoints). **Never applied by default** |
| `evals/` | 20 trigger evals (10 should, 10 should-not) |
| `templates/` | pre-commit hook, scheduled-task prompt, workspace config, lessons replay, proposed CLAUDE.md lines |
| `tests/` | 217 tests in 6 suites + `run_uat.sh` |
| `action-results/` | verbatim rehearsal of the action plan on a full copy, with before/after |
| `ACTION_PLAN.md` | gaps, decisions with commands, validation, pass criteria, undo |
| `CRITIQUE.md` | the adversarial critique: defects found in this package and advice on the engines |
| `LIVE_VERIFICATION.md` | the checks that need the real environment |
| `UAT_REPORT.md`, `CHANGELOG.md` | results and history |

**First run on a new installation:** `bash skills/gia-lean-comms/scripts/portfolio_gates.sh --bootstrap`, review, then
`--bootstrap --yes`. Your registry and baseline live in `~/.gia-lean-comms` (or `$GIA_STATE_DIR`), so a plugin update
cannot overwrite them. `references/seed/` holds fixtures from one sandbox and is never used implicitly.

Verify: `bash tests/run_uat.sh`      Run every gate: `bash skills/gia-lean-comms/scripts/portfolio_gates.sh`
Needs bash, Python 3.7+ with PyYAML, GNU `date`, `patch`. Run scripts with `bash` (some mounts are noexec).
Exit codes everywhere: 0 clean, 1 finding or failure, 2 INCOMPLETE (a check could not run; **not** a pass).
