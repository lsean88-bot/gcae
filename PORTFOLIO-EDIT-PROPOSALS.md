# Prepared edits for your skill portfolio (not applied: the installed copies are managed by the Claude app)

Apply these to the sources you maintain, then re-upload the changed skills. Each edit is minimal and reversible. Per your CLAUDE.md rule: **merge, do not delete;
keep trigger keywords so nothing that used to route breaks.** Quoted "current" text was read from your installed copies on 31 Oct 2026.

## D3: mark `group-cae-fraud` superseded by `group-cae-fraud-v2`
File: `group-cae-fraud/SKILL.md`, frontmatter `description`. **Current** first line: `Activates the Group CAE fraud investigation and forensic review persona using ACFE CFE`.
**Insert before it** (keep everything else, including the trigger list):
```
  SUPERSEDED for NEW investigations by `group-cae-fraud-v2` (decision D3, 2026-10-31): use v2; never use both on one
  investigation. This skill stays installed so existing routing still reaches it.
```
Also add the same sentence as the first line of the body, so a reader who skips the frontmatter still sees it. Optionally add `metadata: { superseded_by: group-cae-fraud-v2 }`.

## D16: split ownership with `akos-graphify-bridge`
* `gia-statutory-freshness` description, add: `For what the knowledge library ALREADY holds on a statutory topic (trust label, STALE/UNDATED), use akos-graphify-bridge; this skill checks current rates against the primary portal.`
* `gia-evidence-discipline` description, add: `Conflicting confirmed figures inside the knowledge library: use akos-graphify-bridge (contradictions); this skill governs how evidence is ranked and cited.`
* `akos-graphify-bridge` already says "Not for ... statutory rate lookups (gia-statutory-freshness)". No change needed there.

## D6 / D15: `charlie-hills-code` six-point workflow wins
`charlie-hills-code/SKILL.md` stays as it is (current sections: 1 Plan Node Default, 2 Subagent Strategy, 3 Self-Improvement Loop, 4 Verification Before Done, 5 Demand Elegance, and the autonomous bug-fixing rule).
In the document that holds the five-phase "Plan-Verify-Execute-Check-Log" summary (the earlier drift check places it in `iron-rules-governance`) and in the lines labelled **RACM-12** and **RC-11**, replace the restated protocol with:
```
Charlie Hills protocol: apply the six-point workflow defined in `charlie-hills-code` (plan first; subagents; self-improvement loop; verification before done;
elegance check; autonomous bug fixing). It is defined there only; do not restate it here.
```
Then `check-governance-drift.sh` Check 4 should report clean (Check 4 is the only open drift finding).

## D2: reconcile `super-grc-audit-plugin-l99` first (staged; do not skip steps)
The reviewer's file path no longer matches your account folder, so re-confirm the current file before editing. Review findings (model output, not re-verified): the
skill lists **13** skills in `metadata.supersedes`; version labels disagree (v5.0 / 5.1 / v5.0); `date` 07-18 vs a v5.1 changelog row of 07-20; Module 9 points to
"Module 17" for content Module 17 does not contain; the GARP and IFRS content said to be migrated (Modules 21/22) is not present.
1. Set `supersedes` to **empty** until step 2 is done for each skill (an unverified claim is worse than none).
2. Migrate, then add to `supersedes` one at a time: `group-cae` (confirm `fraud-inv.md` and `risk-register.md` content exists elsewhere); `group-cae-core` (move its reference files:
   risk appetite template, mandatory AC communications, GIAS non-conformance list); `ia-rag-assistant` (add the three missing items to Module 12).
3. **Do not** list `group-cae-fraud` (it goes to v2, D3) or `group-cae-reporting` (about 27 KB of templates and gates L99 lacks; keep it live).
4. Reconcile `managing-internal-audit` (restore GARP/IFRS under free module numbers, e.g. 25/26; then fix its retirement stub) and `cae-audit-cowork-plugin` (two masters claim it: choose `cae-cowork-ai-plugin` v6.0 or L99 and remove the other claim).
5. Fix the version labels, the date, and the Module 9 pointer. Write a Reconciliation Log at the top (condition / criteria / cause / consequence / decision), as in your CLAUDE.md method.
6. Only then write redirect stubs that keep the old trigger keywords.

## D4 / D18: nothing to edit in a skill
Both are process records and are in CLAUDE.md (D4: MAC retired on purpose; D18: the CAE holds `GIA_CUSTODY_KEY`, never stored in a library or repository, rotated per engagement).
