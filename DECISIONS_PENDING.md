# Decisions: resolved this round, and what I still need from you

Evidence grade: Rank 1 = read directly from the installed files or tool output on 3-4 Oct 2026.
"Resolved" means applied by `apply_patch.py` (dry-run first, backed up, reversible, idempotent) and re-measured.

## Resolved

| # | Was | What was done | Evidence it worked |
|---|---|---|---|
| D1 | AKOS routed field-audit work to `cae-audit-cowork-plugin-v4` | Routed to `cae-cowork-ai-plugin` v6.0, whose own metadata declares it supersedes v4/v5 | interop: no `SUPERSEDED_ROUTED` for v4/v5 |
| D5 | v6 asserted a "10-item" gate; canonical is 12 | v6 lacked canonical #7 (CD/SD/MW classification) and #8 (aggregation assessment). Both **added**, so asserted 12 = enumerated 12 (not just relabelled) | drift Check 3 clean; test asserts 12 enumerated rows |
| D7 | `master-audit-superagent` had a parallel "Iron Rules" list | Own namespace **MAS** (heading rename plus a note that the canonical 30 still apply) | drift Check 2 clean |
| D9 | v4, v5, `cae-audit-cowork-plugin` still installed and drifting | **Not deleted.** Marked `LEGACY, superseded (see cae-cowork-ai-plugin)` in the description (all three stay valid, under 1,024 chars); the drift check skips and names them | drift output names the 3 skipped skills |
| D11 | The 27-28 July namespaces (`RACM-01..12`, `RC-01..12`) were decided but never applied inside `racm-ecosystem` and `cae-report-conversion` (12 bare `RULE nn` lines each) | Labels renamed, verified line by line against the approved text. 11 of 12 lines matched exactly in each; the one that differs (RACM-12, RC-11: the Charlie Hills line) was a clear paraphrase, so the label was renamed and **the skill's wording left untouched** | drift Check 1 clean |
| D12 | AKOS's evidence file cited `super-grc-audit-plugin-l99/references/iron-rules-canonical.md`, which does not exist | Citation now points to `iron-rules-governance/SKILL.md`, "Evidence Hierarchy (R1-R5)" | no dangling citation |
| D13 | Drift script reported "clean" on one root; mishandled `:` in folder names; flagged a deliberate AKOS R1-R5 mirror and a dated history narrative | Script v1.2 (multi-root, narrative-aware, colon-safe, legacy-skipping, mirror allowlist) | Check 5 clean; regression tests |
| D14 | My own new skill tripped drift Check 2 (a heading) | Heading renamed | Check 2 clean |

Net effect on the real catalog: drift checks flagged **5 of 6 -> 1 of 6**; interop warnings **7 -> 3**.

## Still open: I need an answer from you

| # | Question | Evidence | My recommendation |
|---|---|---|---|
| **D2** | `super-grc-audit-plugin-l99` declares it supersedes `group-cae`, `group-cae-core`, `group-cae-fraud`, `group-cae-reporting`, `managing-internal-audit`, `cae-audit-cowork-plugin`, `ia-rag-assistant`. Accept it, reject it, or reconcile first? | None of those skills acknowledges it; the AKOS registry still routes to `group-cae-reporting` and `group-cae-fraud`; AKOS Module 17 already flagged this as awaiting your go-ahead. Needs a full read of each skill to judge real overlap, which I have not done | **Reconcile first** (the method used for the Iron Rules), then accept or remove the claim. Until then routing is unchanged and works |
| **D3** | Is `group-cae-fraud-v2` the canonical fraud skill for new investigations (v1 and L99's fraud scope overlapping)? | v2: 593 lines, newest; does not declare it supersedes v1 | **Yes**, then add "superseded by v2" to v1. The registry already carries the interim rule (v2 for new work; never both on one investigation) |
| **D4** | Do you still have `mac-audit-constitution-l99`? | AKOS Module 17: "retired on purpose, or missing by accident? Not established". `reconciliation-history.md`: de-framed, **not** retired | If you have it, restore it. If not, record the decision. No tool of mine can recover a file that is not in the catalog |
| **D6** | Which wins on the Charlie Hills protocol: `charlie-hills-code`'s six-point workflow, or the five-phase Plan-Verify-Execute-Check-Log summary? | Drift Check 4 is the **only** remaining finding; `iron-rules-governance` already lists this as an owner decision | Your call: it is your methodology. Whichever you choose, one document is then edited to match |
| **D8** | What entity code should **Perfect Longevity Sdn Bhd** have, and is it a Group entity or an external audit client? Also names for `SAPL`, `MABI`, `Fleet Parade` (shown as "-" in the taxonomy) | The taxonomy says "use these exactly - don't invent variants". I will not invent a code | Give me code, name, country, sector, then run `register_entity.py` (dry run first): it updates schema, taxonomy and config together |
| **D10** | The external HTML plugin's QA array must list the same 12 gate checks | The skill text now enumerates 12. The app code is not in anything I can reach, so it may still run 10 | Update the QA array; Rule 30 (asserted count = enumerated count) applies to code too |
| **D15** | The Charlie Hills line wording differs between the approved namespace text and the two skills (RACM-12, RC-11) | Word overlap 50% and 64% | Pick one wording (this is the same question as D6); I left the skills' own wording |

## If you do nothing
Routing still works. The drift check keeps flagging Check 4. The interop check keeps warning about D2 and D4. Nothing breaks.

---

## Added in 2.0.2: four more decisions that are yours

| # | Question | Evidence | My recommendation |
|---|---|---|---|
| **D16** | Two prompt families overlap with neighbours: "recall what we hold on a statutory topic" (`gia-statutory-freshness`) and "check for contradictory confirmed facts" (`gia-evidence-discipline`); two more are near-ties. Which skill owns them? | `tools/trigger_eval.py`: SHARED x2, NEAR-TIE x2, no description collision (closest 0.21) | Statutory **lookup against a portal** -> `gia-statutory-freshness`; **what the library already holds** -> this skill. Add one cross-reference line in each description. You own the portfolio routing. |
| **D17** | Where should the audit anchor live? | A copy beside the log protects against nothing; `anchor-record` refuses a path inside the library | A different drive plus a monthly mail to yourself of the `anchor-check` result; for investigations, a ticket entry. |
| **D18** | Who holds `GIA_CUSTODY_KEY` for signed custody exports? | Unsigned exports detect only accidental change | A key held by the CAE, not stored in the library or the repo; rotate per engagement. |
| **D19** | The account already has `akos-graph` 2.0.0. Replace it with 2.0.2? | Installing both would duplicate the skill (the installer refuses it) | **Replace**: remove 2.0.0 in the Claude desktop app, then upload `akos-graph-plugin-2.0.2.zip`. Do it after the CLD-14 pilot's P7 safety check passes on your machine. |
