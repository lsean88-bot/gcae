# Decision sheet: reply with the numbers you accept (e.g. "accept D3, D6, D16-D19; D2 reconcile")

Each row: the question, what I found, my default, and what I will change if you accept. Nothing is applied until you answer.
Evidence for D2 is the independent portfolio review below. D3-D15 are carried from `DECISIONS_PENDING.md` (2.0.0), unchanged in substance.

| # | Decision | Evidence | My default | If accepted, I change |
|---|---|---|---|---|
| **D2** | Does `super-grc-audit-plugin-l99` really supersede seven skills? | independent review (table below): **claim not verified**; it actually lists 13 | **Reconcile first**; accept for 3, reject for 2, reconcile 2 | edit `supersedes`, migrate reference files, then stubs (per CLAUDE.md: merge, do not delete) |
| **D3** | Is `group-cae-fraud-v2` the canonical fraud skill for new investigations? | v2 newest (593 lines); does not mark v1 superseded | **Yes**; mark v1 "superseded by v2" | one description line in `group-cae-fraud` |
| **D4** | Do you still have `mac-audit-constitution-l99`? | portfolio notes call it retired on purpose or missing by accident: not established | you answer: restore, or record "retired on purpose" | record the decision in CLAUDE.md |
| **D6 / D15** | Whose Charlie Hills wording wins: `charlie-hills-code` six-point workflow or the five-phase summary (and RACM-12 / RC-11 wording)? | the only remaining drift finding | **`charlie-hills-code`** (the fuller methodology), edit the summary to match | one document edited to match |
| **D8** | Entity codes for Perfect Longevity Sdn Bhd, SAPL, MABI, Fleet Parade | taxonomy says "do not invent variants" | you give code, name, country, sector, and whether Group or external client | `register_entity.py` (dry run first) |
| **D10** | Does the external HTML plugin's QA array list all 12 gate checks? | its code is outside anything I can reach | you check; add the two missing items if needed | nothing in this repo |
| **D16** | Who owns the two overlapping prompt families? | trigger eval: SHARED with `gia-statutory-freshness` and `gia-evidence-discipline`; closest description 0.21 | portal lookups -> `gia-statutory-freshness`; "what the library holds" -> this skill | one cross-reference sentence in each description |
| **D17** | Where does the audit anchor live? | an anchor beside the log protects nothing | another drive, plus a monthly mail to yourself of `anchor-check`; a ticket for investigations | set `GIA_ANCHOR_FILE` |
| **D18** | Who holds `GIA_CUSTODY_KEY`? | unsigned exports detect only accidental change | the CAE, not stored in the library or repo; rotate per engagement | none (a process rule) |
| **D19** | Replace the account's 2.0.0 plugin with 2.0.7? | `post_install_check`: the installed 2.0.0 fails 7 of 12 smoke steps (no project shelves, capture, anchors, lockdown) and its `guard` does not check Windows permissions | **Replace** (steps in `REMAINING-ACTIONS.md` item 2) | nothing in this repo |
| **D20** (new) | Run the Linux suite via WSL2 (admin step) or Developer Mode only? | WSL2 closes 12 skips + 51 patch tests + S9; Developer Mode closes 4 | **WSL2** | none |
| **D21** (new) | Declare network shares and FAT/exFAT drives unsupported for libraries? | `doctor` already reports FAIL where ACLs cannot be held | **Yes** | one line in INSTALL.md (already says so) |
| **D22** (new) | Semantic search: build now? | no evidence lexical recall is the bottleneck; pilot P4 decides | **Not yet** | none |


## D2 detail: independent portfolio review of the supersession claim

Reviewer: the portfolio QA agent, read-only, 64 tool calls over your installed skills. **This is model output that I have not independently re-verified;
the reviewer lists what it did not read. Treat each row as a lead to confirm, not a finding.**

**Verdict: claim not verified; reconcile first.** The superseding skill (single installed copy, 2,086 lines, dated 2026-09-23) lists **13** skills in
`metadata.supersedes`, not 7, and is internally inconsistent: version labels v5.0 / 5.1 / v5.0, `date` 07-18 vs a v5.1 changelog row of 07-20, and a
Module 9 pointer ("in Module 17") to content Module 17 does not contain. The GARP and IFRS content that the fleet-roster map says was migrated (Modules 21/22) is
**not present** in the installed v5.1 (Modules 21/22 are different modules there).

| Skill | Installed? | Acknowledges supersession? | Still routed to? | Recommendation |
|---|---|---|---|---|
| group-cae | yes | no | 8 references in AKOS | **Accept** after a redirect stub; confirm `fraud-inv.md` and `risk-register.md` content exists elsewhere |
| group-cae-core | yes | no | cited by reporting and second-brain | **Reconcile first**: migrate its reference files (risk appetite template, mandatory AC communications, GIAS non-conformance list), then stub |
| group-cae-fraud | yes | no (v2 supersedes it per the registry) | AKOS registry, fleet-roster map | **Reject** the L99 claim; redirect v1 to `group-cae-fraud-v2` (D3) |
| group-cae-reporting | yes (8 sub-files) | no | AKOS registry, gcgo "Keep" | **Reject**; keep live; remove from `supersedes` (about 27 KB of templates and gates L99 lacks) |
| managing-internal-audit | no (archives only) | yes (retired stub) | legacy registries only | **Reconcile**: its stub says GARP/IFRS migrated, but they are absent from installed v5.1 |
| cae-audit-cowork-plugin | no (successor `cae-cowork-ai-plugin` v6.0 installed) | yes, by v6.0 | iron-rules-governance, registries | **Reconcile**: two masters claim the same predecessor; pick one successor and drop the claim from L99 |
| ia-rag-assistant | no (uploads only) | no | gcgo registry only | **Accept in substance** after adding three missing items to Module 12 |

Minimal reconciliation the reviewer proposes: (1) cut `supersedes` to what is verified (group-cae, group-cae-core, ia-rag-assistant, after migrating their
reference files); (2) remove group-cae-fraud and group-cae-reporting; (3) restore the GARP/IFRS modules (use new numbers) and align the version labels;
(4) only then write redirect stubs. CLAUDE.md applies: do not layer new authority on an unresolved conflict. **Nothing here has been edited.**
Not verified by the reviewer: the 30-item gate count, the R1-R5 article, the full text of the MAC retirement.
