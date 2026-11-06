# Meridian knowledge transfer and project memory

Document type: project memory and technical handover.
Product: Meridian Assurance Workbench.
Audience: Group Chief Audit Executive, maintainers, and a future Claude session continuing this work.
Status: strategic baseline for the web application delivered in this project.
This document does not replace the source zip and does not modify original evidence.

## 1. What this is

Meridian is a private web application for internal audit, risk, and compliance work. It keeps a system of record and runs a reviewer-first specialist harness.

It is original. Public descriptions of reviewer-first agentic audit, including Optro’s published positioning, informed the idea that agents do fieldwork and people approve. Those public descriptions do not authorise a reconstruction of any vendor’s prompts, orchestration, or code. Do not claim that any vendor system was reverse-engineered.

The word `aibagent` in an earlier note was a typographical error for “AI agent”. There is no skill, package, or repository of that name to find.

## 2. Decisions that must be preserved

- Enhance and integrate. Do not rebuild a fictional five-plugin Claude fleet inside this web app.
- The orchestrator sequences work. It does not decide a finding, a rating, or a report.
- Evidence is registered before substantive testing. Originals are read-only. New versions are new rows.
- Materiality and thresholds are approved by the GCAE before a test is in scope.
- Permitted test outcomes are only Pass, Fail / Exception, Unable to conclude, and Not applicable.
- An evidence gap is not converted into a confirmed failure or into reassurance.
- Priority = likelihood score × highest relevant business-impact score.
- Bands: 20–25 Critical, 12–19 High, 6–11 Medium, 1–5 Low.
- Impact dimensions: financial, operational, compliance, fraud, technology, customer, strategic. Scores are 1–5. A dimension that is not relevant is not scored.
- Fraud indicators are not findings of fraud.
- QA re-performs material calculations. The harness may compare a recalculation. It must not mark QA cleared by itself.
- The GCAE issues the report.
- Kaizen may tighten a rule. A lesson that waives an iron rule is rejected.
- Claude or ChatGPT may interpret a packet or rewrite tone. They do not calculate the test and they do not invent facts.
- A model draft that contains a figure absent from the source must not be saved into the opinion.
- Do not claim production readiness of any earlier Claude plugin package. This web app’s UAT is separate and is recorded on the UAT evidence page.
- Demonstration data is not a live population.
- Claude connector (Phase 3): a personal access token lets a model read and file drafts only. It acts with its owner's authority, never issues, approves or closes, and refuses figures not in the source. Decisions taken by the GCAE: QA tokens are read-only in effect (QA cannot draft); API drafts are saved with status "Draft"; the rate limit (120 a minute per token) is in memory for the single app instance; the GCAE can revoke any person's token.
- Restricted engagements: only the GCAE sets or lifts the restriction and grants access (table engagement_access). Without access a person sees no trace of the engagement or its records, and direct links behave as not found. One gate does this: `src/server/access.ts`, used by the UI data loader (`bundleFor` in `src/lib/data.ts`), by every mutation on engagement records (`guardRecord`) and by the API. Claude tokens never see restricted engagements, even the GCAE's. External model calls on a restricted engagement are refused unless the GCAE ticks "allow external AI models" for that engagement.
- Evidence body over the API (`GET evidence/{id}?include=body`) is allowed only for the GCAE, the audit manager, or the auditor who leads that engagement (`engagements.lead_id`). Everyone else gets metadata.

## 3. Target way of working

Seven evidence-to-assurance stages:

1. Assignment understanding.
2. Evidence intelligence.
3. Data understanding. Materiality must be approved before leaving this stage.
4. Audit execution.
5. Exception investigation.
6. Independent QA.
7. Reporting and approval. Issuance is a separate GCAE action, not an automatic stage move.

Specialist order inside the harness:

1. Knowledge.
2. Process.
3. Evidence.
4. Testing.
5. Assurance.
6. Reporting.
7. Kaizen.

Forbidden tool names, even if a model asks: issue_report, approve_materiality, approve_rating, change_threshold, delete_evidence, overwrite_evidence, close_action, conclude_fraud, waive_iron_rule.

## 4. How Claude and ChatGPT are connected

- Screen path: Connect AI. GCAE only. The key is tested with one short call, then stored in the `settings` table under `secret_anthropic_key` or `secret_openai_key`. The key is not returned to the browser.
- Preferred model: `ai_preferred` in `settings`, or the first connected provider.
- Environment path, optional: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `OPENAI_API_KEY`, `OPENAI_MODEL`.
- Claude HTTP call: POST `https://api.anthropic.com/v1/messages` with headers `x-api-key` and `anthropic-version: 2023-06-01`. Default model id: `claude-sonnet-5-5`.
- ChatGPT HTTP call: POST `https://api.openai.com/v1/chat/completions` with `Authorization: Bearer`. Default model id: `gpt-4.1`.
- A chat subscription is not an API key.
- No key is present in the delivered preview. UAT does not call a live model. That limitation must stay visible.

## 5. Data memory

Database: PostgreSQL. Client: Drizzle ORM in `src/db`. Connection: `DATABASE_URL`.

Tables:

- people, entities, engagements, evidence, controls, risks
- frameworks, requirements
- findings, actions, test_runs, pbc_requests
- vendors, ai_systems, agent_runs, audit_events, lessons, settings

Important demonstration identifiers:

- People: `p-gcae` Amira Hassan, `p-mgr` Daniel Okonkwo, `p-aud1` Priya Nair, `p-aud2` Luis Ortega, `p-frd` Mei Lin Tan, `p-qa` Hannah Berg.
- Engagements: `eng-dc` MKAPL-DC-2026, `eng-ap` GRP-AP-2026, `eng-it` GRP-IT-2026, `eng-p2p` GRP-P2P-2026, `eng-pay` GRP-PAY-2026, `eng-fa` GRP-FA-2025.
- Evidence: `ev-ap-inv`, `ev-ap-dup`, `ev-dc-count`, `ev-dc-notes`, `ev-it-access`, `ev-p2p`, `ev-je`, `ev-fa`.
- Findings: `F-AP-01` High 16, `F-AP-02` Medium 9, `F-DC-01` High 16, `F-DC-02` Medium 9, `F-IT-01` Critical 20, `F-IT-02` Medium 9, `F-FA-01` Low 4.
- Seeded tests: `tr-ap-dual` 7 exceptions, exposure 639000; `tr-ap-dup` exposure 42000 counted once; `tr-dc-inv` exposure 107895; `tr-it-access` 3 exceptions.
- Settings keys: `seeded`, `uat_latest`, `secret_anthropic_key`, `secret_openai_key`, `ai_preferred`.

The first page load calls `ensureSeed()`. If `settings.seeded` exists, the demonstration file is not inserted again. Lessons are ensured separately.

## 6. UAT memory

Delivered UAT result: 32 passed, 0 failed (T-01 to T-22 calculation and gates in `src/server/uat.ts`, T-23 to T-32 security in `src/server/security-checks.ts`). The cases are shown on `/uat`.

They prove procedure results, scoring, gate refusal, figure detection, briefing generation, stored finding scores, and that the harness does not issue or approve materiality.

They do not prove a live Claude or ChatGPT call. Repeat that sentence in any status report.

## 7. File map

Application screens live in `src/app`. Interactive screens live in `src/components`. Database schema is `src/db/schema.ts`. Pure rules are `src/lib`. Server actions and the harness are `src/server`.

| Path | Purpose |
| --- | --- |
| `src/lib/engine.ts` | Attribute-test procedures |
| `src/lib/scoring.ts` | Priority arithmetic |
| `src/lib/gates.ts` | Stage gates |
| `src/lib/reports.ts` | Briefing, stakeholder views, quality checks, external prompt |
| `src/lib/ai.ts` | Claude and ChatGPT HTTP calls |
| `src/lib/specialists.ts` | Specialist roster, forbidden acts, constitution |
| `src/server/harness.ts` | End-to-end specialist run |
| `src/server/ai-config.ts` | Key storage and preferred model |
| `src/server/mutations.ts` | All user actions, including connect and issue |
| `src/server/uat.ts` | Acceptance checks |
| `.claude/skills/meridian-gia/SKILL.md` | Claude skill plugin |

## 8. Roles and authority

| Act | Who |
| --- | --- |
| Register evidence, run a test, draft a finding, start the harness | Auditor, manager, GCAE |
| Re-perform and clear a test | QA or GCAE, and the clearance click is still a person |
| Approve a test result | Manager or GCAE, only after QA cleared |
| Approve materiality, connect a model, issue a report | GCAE |
| Accept a kaizen lesson | Manager or GCAE, unless it weakens an iron rule |
| Update action progress | Owner or audit team |
| Close an action | Audit team, only if validation is Validated |

Authority comes only from the server-side session. Sign-in is role plus password (scrypt hash in `people.password_hash`). No password is in source: `npm run setup:passwords` issues random one-time passwords, stores `must_change = true`, and prints them once. A person with `must_change` has authority `locked` (`src/lib/guard.ts`), and `AppFrame` shows only the Password page. Sessions are rows in `sessions` keyed by the SHA-256 of the cookie token (30 minute idle, 12 hour absolute, rotated at sign-in, other sessions ended on password change). Failed sign-ins are counted in `login_attempts` (5 per role in 15 minutes lock sign-in; 20 per address when `TRUST_PROXY=1`). Sign-in, failure, lockout, sign-out and password events are written to `audit_events`, which a database trigger makes append-only (`scripts/hardening.sql`). Model keys are sealed with AES-256-GCM under `APP_SECRET` (required, 32 characters or more, in production); format `v2$salt$iv$tag$data`; values not in that format are treated as invalid.

## 9. Known limits

- No live SAP, bank, or identity-provider connection. Evidence is pasted or registered.
- No enterprise single sign-on in this release.
- Connect AI stores the key in PostgreSQL. Use it only on a private server.
- Default model ids may need `ANTHROPIC_MODEL` or `OPENAI_MODEL` if the account rejects them.
- `drizzle.config.json` contains a database URL that must be edited for a new server. `.env` alone is not enough for `drizzle-kit push` until that file is changed.
- Running UAT or the harness on `eng-p2p` may add another proposed kaizen lesson. That does not issue a report.
- This handover does not include the contents of any earlier vendor or plugin zip. Do not invent those file lists.

## 10. How a future session should continue

1. Read this file, `START-HERE.md`, and the skill.
2. Do not rebuild the app from memory if the source zip is present.
3. Do not add agents only to increase the agent count.
4. If asked to connect a model, use the Connect AI page or environment variables. Never write a key into source code or into a guide.
5. If asked to change a gate, keep the iron rules unless the GCAE has recorded a new decision.
6. After any code change, run the project validation and then **Run UAT again**.
7. Preserve the correction that `aibagent` does not exist.

## 11. End of memory

The measure of success is not the number of agents. It is accurate, reproducible, independently checked audit work with a named human approval.
