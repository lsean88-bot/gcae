# Rehearsal results (decisions D0-D6 on a full copy of the portfolio)

Produced by `bash tests/rehearse_action_plan.sh`; verbatim log in `rehearsal.log`. The source roots were not modified.

| Measure | Before | After |
|---|---|---|
| Skill folders | 146 | 143 |
| Declared same-name collisions | 5 | 2 |
| Quality-gate gaps in live skills | 2 | 0 |
| Known drift finding lines | 43 | 41 |
| `verify_actions.py` | 7/9 (the 2 failures are exactly the 2 gaps D1 closes) | 12/12 |

Rollback drill: all three retired folders restored **byte-identical** to the originals, then re-applied; final verification 12/12.

Files: `registry.after-actions.json` (the registry after D1-D4), `baseline.before.txt` / `baseline.after.txt`,
`MANIFEST.example.json` (what `retire_copy.py apply` records; paths are the rehearsal's).
