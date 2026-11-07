---
description: Guided DRAFT finding in Condition, Criteria, Cause, Effect, Recommendation format (files a Draft only)
argument-hint: [engagement id, for example eng-ap]
allowed-tools: Read, mcp__plugin_meridian-gia_meridian__list_engagements, mcp__plugin_meridian-gia_meridian__get_engagement, mcp__plugin_meridian-gia_meridian__list_evidence, mcp__plugin_meridian-gia_meridian__get_evidence, mcp__plugin_meridian-gia_meridian__list_test_runs, mcp__plugin_meridian-gia_meridian__list_risks, mcp__plugin_meridian-gia_meridian__draft_finding
---

Guide the user through a DRAFT finding for Meridian. Engagement given: `$ARGUMENTS` (if empty, call `list_engagements` and ask which one).

Rules: you file a draft only (status Draft). You never issue, approve, rate, close, clear QA or conclude on fraud. You never invent a figure, date, name, cause or management response. Missing facts become square-bracket placeholders.

Steps:
1. Call `get_engagement`, `list_evidence` and `list_test_runs` for the engagement. Show the registered evidence ids and test results briefly.
2. Ask the user for, one item at a time, and only what Meridian does not already hold:
   - **Condition**: what was observed, from evidence only. Ask which evidence ids support it. At least one registered evidence id of this engagement is required.
   - **Criteria**: the policy, standard or limit that applies.
   - **Cause**: the root cause. If unknown use `[ROOT CAUSE TO BE CONFIRMED WITH MANAGEMENT]`.
   - **Effect**: why it matters. Score likelihood 1 to 5 with a rationale, and score only relevant impact dimensions (financial, operational, compliance, fraud, technology, customer, strategic), 1 to 5, each with a note.
   - **Recommendation**: a specific action. Name an owner role and a date only if the user supplies them; otherwise leave placeholders.
3. Check every number in the draft appears in the evidence or test run you read. Remove or placeholder any that does not. Do not state a rating or priority: Meridian computes it.
4. Show the full draft and ask the user to confirm. Only after an explicit yes, call `draft_finding`.
5. Report the id, status (Draft) and the priority score Meridian returned. If Meridian refuses (figure not in source, fraud stated as proven), show the reason, fix the draft by removing the figure or citing evidence, and ask again. Never reword a figure to get past the check.
6. Close with: the GCAE or manager reviews this draft in the Meridian app. It is not an issued finding.
