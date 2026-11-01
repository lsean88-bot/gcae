# File manifest: gia-lean-comms v1.4.0 (final)

Verified 2026-10-27 (outputs folder): both zips match the working tree exactly; the plugin passed `claude plugin validate`; 68 UAT checks and 217 tests pass.

## The three downloads

| File | SHA-256 | What it is |
|---|---|---|
| `gia-lean-comms-enhanced-package.zip` | `01983662f0a23d5ffa19ed3bcae2fe9118b904affc1d172fb9586a5dca2062ab` | EVERYTHING in one download: the plugin, the upload-ready skill, the 6 patched portfolio skills, all documents, tests, patches and evidence. Start here. |
| `gia-lean-comms-plugin-1.4.0.zip` | `6759ca4c0d9843b968fe4a20da798ce6a7a39c3223def634fef493196e6373b0` | The plugin only (install as a Claude Code plugin). Contains the skill, tests, patches, documents and evidence. |
| `gia-lean-comms.skill` | `8c91fde54f2c47e6370dbbaa14c91d68ff4d3bc32836cb5326a536579ca27e51` | The skill only, upload-ready for claude.ai (excludes tests, patches, evals). |

## What is inside the full bundle (`gia-lean-comms-enhanced-package.zip`)

| Path | What |
|---|---|
| `INDEX.md`, `SHA256SUMS` | Index of the bundle; `sha256sum -c SHA256SUMS` checks every file |
| `gia-lean-comms.skill` | The upload-ready skill |
| `patched-skills/` | The 6 portfolio skills the 10 applied patches touch (rename `sp-global_funding-digest` back to `sp-global:funding-digest`) |
| `gia-lean-comms/README.md` | Overview and quick start |
| `gia-lean-comms/ACTION_PLAN.md` | **What to do, in order**, with commands, validation, pass criteria and undo |
| `gia-lean-comms/UAT_REPORT.md` | Results, evidence and honest limits |
| `gia-lean-comms/CRITIQUE.md` | The adversarial critique and advice on the engines |
| `gia-lean-comms/LIVE_VERIFICATION.md` | The checks that need your environment |
| `gia-lean-comms/CHANGELOG.md` | Version history |
| `gia-lean-comms/action-results/` | Verbatim rehearsal of the plan on a full copy, with before/after |
| `gia-lean-comms/skills/gia-lean-comms/` | The skill: `SKILL.md`, 14 scripts, interop contract, seed fixtures |
| `gia-lean-comms/portfolio-patches/` | 10 applied fixes as diffs + `apply_patches.sh` |
| `gia-lean-comms/decision-patches/` | 4 owner-decision patches (never applied by default) |
| `gia-lean-comms/tests/` | 217 tests in 6 suites, `run_uat.sh`, `rehearse_action_plan.sh` |
| `gia-lean-comms/templates/` | Pre-commit hook, scheduled-task prompt, CLAUDE.md additions and merge script, lessons replay |
| `gia-lean-comms/evals/` | 20 trigger evals |

## Complete file list (full bundle)

```
     1065  INDEX.md
    12361  SHA256SUMS
    56917  gia-lean-comms.skill
      445  gia-lean-comms/.claude-plugin/plugin.json
       35  gia-lean-comms/.ruff_cache/.gitignore
      276  gia-lean-comms/.ruff_cache/0.16.10/10434096814758416293
      580  gia-lean-comms/.ruff_cache/0.16.10/13468044756575975965
      724  gia-lean-comms/.ruff_cache/0.16.10/2034581957991130877
      580  gia-lean-comms/.ruff_cache/0.16.10/2263029279643230926
      444  gia-lean-comms/.ruff_cache/0.16.10/5276567190576312812
       43  gia-lean-comms/.ruff_cache/CACHEDIR.TAG
    10607  gia-lean-comms/ACTION_PLAN.md
     3343  gia-lean-comms/CHANGELOG.md
     6860  gia-lean-comms/CRITIQUE.md
     4292  gia-lean-comms/LIVE_VERIFICATION.md
     2251  gia-lean-comms/README.md
     5802  gia-lean-comms/UAT_REPORT.md
     1911  gia-lean-comms/action-results/MANIFEST.example.json
      813  gia-lean-comms/action-results/SUMMARY.md
     3642  gia-lean-comms/action-results/baseline.after.txt
     4160  gia-lean-comms/action-results/baseline.before.txt
     9844  gia-lean-comms/action-results/registry.after-actions.json
     6824  gia-lean-comms/action-results/rehearsal.log
     1067  gia-lean-comms/decision-patches/01_user_cae-fieldwork-engine_SKILL.md.patch
     1073  gia-lean-comms/decision-patches/02_plugins_cae-cowork-ai-plugin_SKILL.md.patch
      695  gia-lean-comms/decision-patches/03_plugins_mktron-sentinel_automated-action-engine_references_scheduled-task-library.md.patch
      655  gia-lean-comms/decision-patches/04_plugins_skill-sprawl-watch_scripts_scan_overlap.py.patch
     2250  gia-lean-comms/evals/trigger_evals.json
     2018  gia-lean-comms/portfolio-patches/01_plugins_charlie-hills-code_SKILL.md.patch
      683  gia-lean-comms/portfolio-patches/02_plugins_independent-critique_SKILL.md.patch
      986  gia-lean-comms/portfolio-patches/03_plugins_independent-critique_scripts_run_critique.py.patch
     4545  gia-lean-comms/portfolio-patches/04_plugins_iron-rules-governance_SKILL.md.patch
      905  gia-lean-comms/portfolio-patches/05_plugins_iron-rules-governance_references_scheduled-automation.md.patch
     3488  gia-lean-comms/portfolio-patches/06_plugins_iron-rules-governance_scripts_check-governance-drift.sh.patch
     1889  gia-lean-comms/portfolio-patches/07_plugins_skill-factory_SKILL.md.patch
     5697  gia-lean-comms/portfolio-patches/08_plugins_skill-factory_scripts_run_preflight.py.patch
      643  gia-lean-comms/portfolio-patches/09_plugins_skill-sprawl-watch_SKILL.md.patch
      973  gia-lean-comms/portfolio-patches/10_plugins_sp-global_funding-digest_SKILL.md.patch
     2212  gia-lean-comms/portfolio-patches/apply_patches.sh
      704  gia-lean-comms/ruff.toml
    11626  gia-lean-comms/skills/gia-lean-comms/SKILL.md
     5478  gia-lean-comms/skills/gia-lean-comms/references/interop-contract.md
     2087  gia-lean-comms/skills/gia-lean-comms/references/interop.json
      764  gia-lean-comms/skills/gia-lean-comms/references/seed/README.md
     3908  gia-lean-comms/skills/gia-lean-comms/references/seed/baseline.seed.txt
    11934  gia-lean-comms/skills/gia-lean-comms/references/seed/portfolio-registry.seed.json
     2223  gia-lean-comms/skills/gia-lean-comms/scripts/compress_gate.py
     8069  gia-lean-comms/skills/gia-lean-comms/scripts/gate_audit.py
     1697  gia-lean-comms/skills/gia-lean-comms/scripts/gia_state.py
     9724  gia-lean-comms/skills/gia-lean-comms/scripts/interop_check.py
     2319  gia-lean-comms/skills/gia-lean-comms/scripts/live_verify.sh
    14042  gia-lean-comms/skills/gia-lean-comms/scripts/meaning_guard.py
     8741  gia-lean-comms/skills/gia-lean-comms/scripts/portfolio_gates.sh
    19059  gia-lean-comms/skills/gia-lean-comms/scripts/registry_check.py
    11165  gia-lean-comms/skills/gia-lean-comms/scripts/retire_copy.py
     6892  gia-lean-comms/skills/gia-lean-comms/scripts/review_log.py
     3657  gia-lean-comms/skills/gia-lean-comms/scripts/trigger_proxy.py
     6222  gia-lean-comms/skills/gia-lean-comms/scripts/validate_portfolio.py
     5611  gia-lean-comms/skills/gia-lean-comms/scripts/verify_actions.py
     3838  gia-lean-comms/skills/gia-lean-comms/scripts/zone_guard.py
     1644  gia-lean-comms/templates/CLAUDE.gia-additions.md
     3034  gia-lean-comms/templates/CLAUDE_md_proposed_lessons.md
      573  gia-lean-comms/templates/README.txt
       27  gia-lean-comms/templates/caveman.json
     3922  gia-lean-comms/templates/log_lessons.sh
     1218  gia-lean-comms/templates/pre-commit.sh
      936  gia-lean-comms/templates/promote_claude_md.sh
     1716  gia-lean-comms/templates/scheduled-task-portfolio-gates.md
      485  gia-lean-comms/tests/fixtures/rules_flipped.md
      648  gia-lean-comms/tests/fixtures/rules_lean_ok.md
      702  gia-lean-comms/tests/fixtures/rules_original.md
     5103  gia-lean-comms/tests/rehearse_action_plan.sh
    13572  gia-lean-comms/tests/run_uat.sh
    35101  gia-lean-comms/tests/test_critique_regressions.py
    10495  gia-lean-comms/tests/test_guards.py
    15302  gia-lean-comms/tests/test_multilingual_fuzz.py
    12101  gia-lean-comms/tests/test_portfolio_patches.py
    17057  gia-lean-comms/tests/test_retire_actions.py
    26772  gia-lean-comms/tests/test_v12.py
     6184  patched-skills/charlie-hills-code/SKILL.md
     5477  patched-skills/independent-critique/SKILL.md
     3338  patched-skills/independent-critique/references/deliverable-critique-standard.md
     3556  patched-skills/independent-critique/references/skill-critique-standard.md
     7717  patched-skills/independent-critique/scripts/run_critique.py
    27855  patched-skills/iron-rules-governance/SKILL.md
     3758  patched-skills/iron-rules-governance/references/charlie-hills-summary.md
     5049  patched-skills/iron-rules-governance/references/drift-check-2026-09-27.md
     3559  patched-skills/iron-rules-governance/references/lesson-proposal-template.md
     2749  patched-skills/iron-rules-governance/references/racm-rc-namespaces.md
     6117  patched-skills/iron-rules-governance/references/reconciliation-history.md
     4368  patched-skills/iron-rules-governance/references/scheduled-automation.md
    10538  patched-skills/iron-rules-governance/scripts/check-governance-drift.sh
     5607  patched-skills/skill-factory/SKILL.md
     9049  patched-skills/skill-factory/scripts/run_preflight.py
     6354  patched-skills/skill-sprawl-watch/SKILL.md
     3259  patched-skills/skill-sprawl-watch/references/library-scan-baseline.md
    10602  patched-skills/skill-sprawl-watch/scripts/scan_overlap.py
    11363  patched-skills/sp-global_funding-digest/LICENSE
    30382  patched-skills/sp-global_funding-digest/SKILL.md
     4889  patched-skills/sp-global_funding-digest/references/sector-seeds.md
```

100 files.

## First thing to do on your machine

```
unzip gia-lean-comms-enhanced-package.zip && cd gia-lean-comms
bash tests/run_uat.sh                     # verify the package on your OS
bash tests/rehearse_action_plan.sh        # rehearse the whole plan on a copy of YOUR skills first
bash skills/gia-lean-comms/scripts/portfolio_gates.sh --bootstrap   # then read ACTION_PLAN.md
```
