# Decisions resolved: 31 Oct 2026

Decided by the owner in this session (answers given in chat). This file supersedes the status columns of `DECISION-SHEET.md` and `REMAINING-ACTIONS.md`
(which are inside the 2.0.6 package and are not changed). "Applied" means a file was changed; "Prepared" means exact edits are written for you to apply
(the installed skills are managed by the Claude app and are not edited by me).

| # | Decision | Answer | Status |
|---|---|---|---|
| D2 | `super-grc-audit-plugin-l99` supersession of 7 (actually 13) skills | **Reconcile first** | Prepared: staged plan in `PORTFOLIO-EDIT-PROPOSALS.md` section D2; recorded in CLAUDE.md |
| D3 | `group-cae-fraud-v2` canonical for new investigations | **Yes** | Prepared: one description edit (section D3); recorded in CLAUDE.md |
| D4 | `mac-audit-constitution-l99` | **Retired on purpose** | Recorded in CLAUDE.md (note: the fleet-roster map says its content is "not recoverable", so the retirement is final) |
| D6 / D15 | Charlie Hills protocol wording | **`charlie-hills-code` six-point workflow wins** | Prepared: replacement sentences (section D6); recorded in CLAUDE.md |
| D8 | Entity codes for Perfect Longevity Sdn Bhd, SAPL, MABI, Fleet Parade | **Answered 31 Oct 2026**: `Perfect Healthcare` and `Perfect Longevity` (Perfect Longevity Sdn Bhd): Malaysia, Healthcare, **Group entities**, full names as codes. `Fleet Parade` (Proton car dealership): Malaysia, automotive retail. SAPL and MABI: left as they are | **Applied** to our `config/entities.json` (2.0.7: shelves for both Perfect entities now work; unregistered names are still refused). **Prepared** for the AKOS skill: `AKOS-entity-registration.diff` (3 small edits: schema enum, taxonomy table with the Fleet Parade row filled, and "nine" to "eleven"). Re-upload plugin 2.0.7 so the account copy knows them |
| D10 | External HTML plugin QA array lists all 12 gate checks | **Owner checks it** | Open on your side (outside this repo) |
| D16 | Ownership of overlapping prompt families | **Split by purpose** | Prepared: one sentence for each neighbour (section D16); our skill already states its side |
| D17 | Where the audit anchor lives | Resolved by action | `D:\GIA-Anchors\gia-anchors.jsonl`, set as user variable `GIA_ANCHOR_FILE`; first seal anchored and verified |
| D18 | Holder of `GIA_CUSTODY_KEY` | **The CAE** | Process rule recorded in CLAUDE.md; never store the key in the library or any repository; rotate per engagement |
| D19 | Replace the account's 2.0.0 plugin | Resolved by action | Account now holds exactly one copy, 2.0.6; `post_install_check` PASSED |
| D20 | Linux verification | Resolved by action | WSL2 Ubuntu; gate passed on 2.0.5 and 2.0.6; UAT S1-S9 passed |
| D21 | Network shares and FAT/exFAT unsupported for libraries | **Accepted** | `doctor` reports FAIL on volumes that cannot hold ACLs |
| D22 | Semantic search | **Not yet** | Revisit after the real CLD-14 pilot; a light word-form stemmer is the cheaper first fix |

## Still open after this
1. **Re-upload the plugin** (`akos-graph-plugin-2.0.7.zip`) so the account copy includes the two new entities; your local `gia` copy refreshes by re-running `setup_windows.ps1`.
2. **Apply the AKOS diff** (`AKOS-entity-registration.diff`) to the AKOS skill; then the schema and taxonomy agree with the tool.
3. **D10**: check the external plugin's QA array.
4. **Apply the prepared portfolio edits** in `PORTFOLIO-EDIT-PROPOSALS.md` (D2, D3, D6, D16) to the skill sources you maintain.
5. **The real CLD-14 pilot** (needs your papers; the synthetic dry run is done).
6. **Device encryption**: you accepted the risk; keep investigation shelves off this laptop until it is encrypted.
