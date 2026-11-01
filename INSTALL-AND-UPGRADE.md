# Install and upgrade guide (GIA governance suite v1.2.1)

Your account already holds v1.0 copies of `gcgo-orchestrator` (with its command skills) and `gia-evidence-discipline`. This is an **upgrade**. I could not install anything for you; I can only provide the files and the verification.

## What to install

| Option | Files | Use when |
|---|---|---|
| A. One plugin | `gia-governance-suite.plugin` (4 skills, 13 slash commands) | You want slash commands (`/gcgo`, `/gia-analytics`, `/gia-freshness`, `/gia-verify` and others) |
| B. Four skills | `gia-evidence-discipline.skill`, `gcgo-orchestrator.skill`, `gia-statutory-freshness.skill`, `puducherry-india-ops-audit.skill` | You prefer skills without commands, or Cowork rejects the `.plugin` extension (it is a zip) |

Install **A or B, not both**, or the same skills load twice and the verifier will warn.

## What your live install needs (verified read-only on 2026-10-10)

`/gia-verify` on your account reported 8 pass, 8 warn, 0 fail. You have the suite plugin installed **and** other copies. To clean up:

1. **Remove** the standalone `gia-evidence-discipline` and the standalone `gia-statutory-freshness` (the suite plugin already provides them).
2. **Remove** the old v1.0 plugin `gcgo-orchestrator` (its skill `gcgo-orchestrator` and command skills `gcgo`, `gcgo-brief`, `gcgo-health`, `gcgo-selftest`, `gcgo-status`).
3. **Upload v1.2.1**: the installed suite plugin carries gcgo-orchestrator v1.2.0, whose verifier reports false registry drift for plugin installs. Reinstall `gia-governance-suite.plugin` (v1.2.1).
4. **Apply the resolution pack**: Phase 1 removes the duplicate library skills (including `akos-enterprise-orchestrator-2` and `gia-file-catalog-2`) and fixes the six routing-document references; Phase 2 adds the EPF change notice to `chennai-india-ops-audit` and `pune-india-ops-audit`.
5. Re-run `/gia-verify`. The warning "routing documents cite only installed skills" may remain if you do not apply Phase 1 or the optional L99 patch.

## Steps

1. **Back up.** Save your current skill and plugin files outside Claude (the resolution pack's `0-backup` zip covers the library skills it changes; export the v1.0 GCGO and evidence skills too if you customised them).
2. **Remove the old v1.0 copies** of `gcgo-orchestrator` (including its command skills `gcgo`, `gcgo-brief`, `gcgo-health`, `gcgo-selftest`, `gcgo-status`) and `gia-evidence-discipline`. Do not leave two copies.
3. **Install** option A or B.
4. **Copy `CLAUDE.md`** to the root of your GIA workspace folder, and paste `Project-Instructions-Template.md` into each engagement Project (fill the brackets in Mode 0 and have Sean approve them).
5. **Apply the library resolution pack** (separate zip) in the phase order in its README. Its Phase 2 and Phase 3 skills carry the EPF ceiling change notice.
6. **Verify.** Run `/gia-verify`, or `python scripts/verify_install.py` from the `gcgo-orchestrator` skill. Fix every FAIL and act on each WARN. The one WARN you may accept: "routing documents cite only installed skills" if you have not applied the optional L99 patch.
7. **Acceptance tests** in Cowork: run the 26 behaviour scenarios in `GIA-Test-Lab` (BEHAVIOUR-CASES.md) with the skills on, grade each answer with `grade_response.py --judge-prompt`, and keep the results. Pass criteria: no critical failure on B02, B06, B07, B08, B09, B13, B15, B16.

## Verification you can repeat

```
python gcgo-orchestrator/scripts/verify_install.py          # install health
python gcgo-orchestrator/scripts/gcgo_route.py selftest      # routing regression
python GIA-Test-Lab/lab/run_all.py --evidence <skill> --gcgo <skill> --freshness <skill>   # full scorecard (add --full for 20x stress)
```

Needs Python 3.9 or later with pandas, numpy, scipy, openpyxl, python-docx and pyyaml (`pip install pandas numpy scipy openpyxl python-docx pyyaml`). Tested on pandas 2.2.3 with numpy 1.26 and on pandas 3.0 with numpy 2.4.

## Rollback

Delete the new skills and upload the v1.0 files you saved (and, for library skills, the originals from `0-backup`). Run `verify_install.py` again. No script modifies installed skills; everything changes only when you upload or delete.

## After install: first week

- Run the freshness gate on every rate table before any statutory test (`/gia-freshness`). Verify the EPF ceiling change against the Gazette notification yourself; the register is research from secondary sources.
- Treat the Puducherry skill as a map: obtain the primary notifications before relying on any value in it.
- Log every correction with `/gia-lesson`; add every miss to the Test Lab as a scenario before you fix it.
