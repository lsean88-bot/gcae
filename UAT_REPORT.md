# UAT report v1.4: the action plan, executed and verified

Date: 13 October 2026. Reproduce with `bash tests/run_uat.sh` (about 100 seconds).

## 1. Verdict

**Every decision in the plan (D0 to D8) was executed end to end on a full copy of your portfolio and verified.**
It was **not** applied to your real environment, because this container is ephemeral and is not that environment;
applying it there is a step you run, with the same tools, in about five commands (`ACTION_PLAN.md`).
217 tests and 68 UAT checks pass, 0 fail, 0 skip, both on a machine that has the Claude Code CLI and on one that does not.

## 2. What was verified for real that was previously "external"

I installed the real Claude Code CLI (v2.1.296; offline plugin commands need no API key) and ran it on this package:

| Check | Result |
|---|---|
| `claude plugin validate <plugin>` | **Validation passed** |
| `claude plugin validate <plugin>/skills` | **Validation passed** |
| Install as a skills-dir plugin, `claude plugin list` | lists as `gia-lean-comms@skills-dir`, version 1.4.0 |
| `claude plugin details` | 1 skill, 0 agents, 0 hooks, 0 MCP servers |
| Projected token cost | **about 236 tokens always-on per session, about 2.7k when the skill fires** |

Still not verifiable here: real trigger behaviour (needs a model and API key), whether Claude loads caveman's skill on "be brief",
macOS and Windows, and subagent behaviour. `live_verify.sh` reports INCOMPLETE, never a pass, when it cannot run.

## 3. The rehearsal (`action-results/`)

| Measure | Before | After |
|---|---|---|
| Skill folders | 146 | 143 |
| Declared same-name collisions | 5 | 2 (the two accepted launcher pairs) |
| Quality-gate gaps in live skills | 2 | **0** |
| Known drift finding lines | 43 | 41 |
| `verify_actions.py` | 7/9 (the two failures are exactly the two gaps) | **12/12** |

A rollback drill restored all three retired copies **byte-identical** to the originals; re-applying verifies 12/12 again.

## 4. What executing the plan found

Running the plan against real data corrected the plan and exposed defects in my own tooling:

- **D2 was wrong as written.** The retirement tool blocked it: `scheduled-task-library.md` tells you to read `data/lessons.jsonl` through the
  *prefixed* name, but that file exists only in the canonical copy. Two reference repoints (decision patches 03 and 04) are now a prerequisite.
- **D4 (AKOS).** I read the two plugin-only lines: one is the same pipeline with its first stage renamed; the other is the stale routing row
  that the canonical copy documents it deliberately removed. Retire without merging it, with an explicit review acknowledgement.
- **D3 (pune)** needed an explicit acknowledgement: its one remaining reference is a same-plugin name mention.
- Several stale copies belong to plugins **you author**: run the tool against the plugin source and re-publish; an installed plugin cache is overwritten on update.
- **Defect:** `apply_patches.sh` left `.orig` files inside skill folders. The new verifier caught it; backups now go to the state directory.
- **Defect:** the citation audit read path strings in scripts as citations, so this plugin failed its own audit when installed in a skills root.
  It now checks documentation by default (code is opt-in), with a self-hosting test.
- **Defect:** my own docs tripped two governance drift checks (gate-count phrases and R1-R5-shaped row IDs) once installed. Reworded.
- **Defect:** the retirement matcher counted a bare name inside a prefixed one, and counted evidence logs and fixtures as live references.
- Three rehearsal-harness bugs of mine (a typo, a deleted line, a stale folder) and one unquoted YAML colon in a test fixture (the third time this
  project) were found and fixed; none reached the product.

## 5. Evidence

| Check | Result |
|---|---|
| Test suites | 35 + 27 + 61 + 10 + 53 + 31 = **217/217** |
| `run_uat.sh` | **68 checks PASS, 0 FAIL, 0 SKIP**, with and without the CLI |
| Safety rules in `retire_copy.py` | 6 rules broken one at a time (changed copy, archive inside a root, unreviewed references, merge gate, tampered archive, substring matching): **all 6 caught by the tests** |
| Control: revert the 10 portfolio patches | UAT fails **16** checks |
| Control: apply the owner-decision patches to the live mount | UAT fails **9** checks |
| Restored state | UAT PASS; no stray `.orig` files; 10 patches applied, 4 decision patches still pending |
| Generator-driven fuzz (two earlier runs) | 128,000 cases each, 0 violations |
| Static analysis | ruff, shellcheck clean; bandit clean (earlier); minimum Python 3.7 |
| CLAUDE.md promotion (D6) | merge is idempotent, keeps a `.bak`, undoes cleanly, and `verify_actions` fails a file without the lessons |

## 6. What is still yours

1. **Run it for real:** `bash tests/rehearse_action_plan.sh` on your copy, then the five steps in `ACTION_PLAN.md`.
2. **Promote the lessons** with `templates/promote_claude_md.sh` (7 rules; I cannot edit your real `CLAUDE.md`).
3. **Live checks** you can do in minutes with the CLI: L2 (trigger measurement, needs a model), L3 (caveman), L7 (your OS).
4. **A token-economy note:** this skill costs about 236 tokens in every session. Its description could be shortened, but the effect on
   triggering cannot be measured without L2, so I left it alone.

## 7. Honest limits

- The meaning guard is a lexical trip-wire: it misses who-did-what, entity names, the order of ordinary verbs, Tamil and Hindi.
- A sign-off records who decided and when, not who they really are.
- `gate_audit` is a keyword proxy over written text. It shows what a gate mentions, not what any tool enforces.
- The registry and baseline shipped in `references/seed/` describe one sandbox. Your own come from `portfolio_gates.sh --bootstrap`.
