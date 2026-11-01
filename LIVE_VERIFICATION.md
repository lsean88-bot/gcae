# Live verification: what a sandbox cannot check

These checks need Claude Code, the `claude` CLI, or your real skill folders. The package ships a script
(`skills/gia-lean-comms/scripts/live_verify.sh`) that runs the one that can be automated, and is built to
report **INCOMPLETE (exit 2), never a pass**, when it cannot run. Record each result in the table at the end.

## L1. The plugin loads: VERIFIED with the real Claude Code CLI (v2.1.296), 2026-10-10
Installed the CLI (no API key needed for offline plugin commands) and ran, on this exact package:
- `claude plugin validate gia-lean-comms` -> **Validation passed** (the only note is advice to add a marketplace install line to the README).
- `claude plugin validate gia-lean-comms/skills` -> **Validation passed**.
- Copied into `~/.claude/skills` and ran `claude plugin list` -> **`gia-lean-comms@skills-dir`, Version 1.x, Status: loaded**.
- `claude plugin details gia-lean-comms` -> 1 skill, 0 agents, 0 hooks, 0 MCP servers; **about 236 tokens always-on per session, about 2.6k when invoked**.
Repeat on your machine with the same three commands. Pass: validation passes and the plugin lists as loaded. (A `.skill` file is a skill package, not a plugin: validate its folder with `quick_validate.py`, not `claude plugin validate`.)

## L2. Real trigger behaviour
```
bash skills/gia-lean-comms/scripts/live_verify.sh            # 20 evals, 3 runs each
```
Pass: at least 80% of should-trigger queries trigger and at least 90% of should-not queries do not
(the script prints MET or NOT MET). If NOT MET, improve the description with skill-creator's loop:
`python -m scripts.run_loop --eval-set evals/trigger_evals.json --skill-path skills/gia-lean-comms --model <your model>`
from the skill-creator folder, then re-run `trigger_proxy.py` and the preflight.
Note: the lexical check `trigger_proxy.py` is a vocabulary check, not evidence of triggering.

## L3. caveman: hook default versus skill description (only if caveman is installed)
UAT showed `{"defaultMode": "off"}` makes caveman's **hooks** ignore phrases like "be brief". caveman's
**skill description** says it auto-triggers on those phrases, and whether Claude loads it was not tested.
1. Put `templates/caveman.json` in a fresh workspace as `.caveman.json`.
2. In a new session ask: "Be brief: what is the capital of Malaysia?"
3. Check whether the caveman skill was invoked (look in the transcript for a skill load).
Decision: if it loaded, uninstall the caveman skill from GIA workspaces, or rely on the protected zones as binding.

## L4. Patches and registry against your real install
```
bash portfolio-patches/apply_patches.sh <SKILLS_ROOT> --check
python3 skills/gia-lean-comms/scripts/registry_check.py --roots <your skill folders>
```
Pass: every patch reports `needed` or `already`, or `MISSING`/`CONFLICT` with nothing touched. The registry
finds skills by folder name, so any layout works; `registry_stale` means your copy differs from the one the
registry was written against, so review it, then `--refresh`. Your drift baseline must be rewritten on your
own findings: `bash skills/gia-lean-comms/scripts/portfolio_gates.sh --bootstrap`, review, then `--bootstrap --yes`.
The seed registry and baseline in `references/seed/` describe the sandbox this package was verified in and are never used implicitly.

## L5. The scheduled task
Paste `templates/scheduled-task-portfolio-gates.md` into Cowork and run it once by hand.
Pass: an output file is written; a gates exit of 1 or 2 puts "ACTION NEEDED" first. The prompt does not
create the schedule: you do that in Cowork.

## L6. Lean state is not inherited by a subagent's deliverable
With lean mode on, have an orchestrator delegate the drafting of a finding. Pass: the delivered document
is in normal professional prose with no process commentary. This is a design rule, not something tested here.

## L7. Your operating system
`bash tests/run_uat.sh`. Needs bash, Python 3.7+, PyYAML, GNU `date`, and `patch`. On macOS install GNU
coreutils. On Windows use WSL. Pass: exit 0 (exit 2 if the portfolio is not mounted, which is not a pass).

| Check | Date | Result | By | Notes |
|---|---|---|---|---|
| L1 | | | | |
| L2 | | | | |
| L3 | | | | |
| L4 | | | | |
| L5 | | | | |
| L6 | | | | |
| L7 | | | | |
