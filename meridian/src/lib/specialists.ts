export const WORKSTREAMS = [
  {
    id: "knowledge",
    name: "Knowledge",
    purpose: "Understand the assignment, entity, risks, criteria, and what is not yet known.",
  },
  {
    id: "process",
    name: "Process",
    purpose: "Read the walkthrough and separate design, operation, and what was not observed.",
  },
  {
    id: "testing",
    name: "Testing",
    purpose: "Run approved procedures on registered extracts. Code calculates. Claude may narrate only those results.",
  },
  {
    id: "assurance",
    name: "Assurance",
    purpose: "Re-perform material calculations before anyone relies on the first narrative.",
  },
  {
    id: "reporting",
    name: "Reporting",
    purpose: "Assemble the briefing from the file. Do not issue it.",
  },
  {
    id: "kaizen",
    name: "Kaizen",
    purpose: "Propose a smaller next improvement. A lesson may tighten a rule. It may not waive one.",
  },
] as const;

export const SPECIALISTS = [
  {
    id: "orchestrator",
    name: "Harness",
    stream: "knowledge",
    claudeRole: "Sequence the specialists. Stop at a human gate. Do not decide a finding, a rating, or issuance.",
    tools: ["screen_gates", "read_knowledge", "read_process", "run_approved_test", "reperform_calculation", "quality_check", "propose_lesson"],
  },
  {
    id: "knowledge",
    name: "Knowledge agent",
    stream: "knowledge",
    claudeRole: "State the assignment from the file. Name missing scope, period, criteria, or appetite. Do not invent them.",
    tools: ["read_knowledge", "screen_gates"],
  },
  {
    id: "process",
    name: "Process agent",
    stream: "process",
    claudeRole: "Describe the process only from walkthrough notes and control records. Mark what was not observed.",
    tools: ["read_process"],
  },
  {
    id: "tester",
    name: "Testing agent",
    stream: "testing",
    claudeRole: "Choose an approved procedure and a registered extract. Do not change a threshold. Do not call an indicator fraud.",
    tools: ["run_approved_test"],
  },
  {
    id: "assurance",
    name: "Assurance agent",
    stream: "assurance",
    claudeRole: "Re-perform from the extract and the stored parameters. Compare after the recalculation. Do not clear your own narrative.",
    tools: ["reperform_calculation"],
  },
  {
    id: "reporter",
    name: "Reporting agent",
    stream: "reporting",
    claudeRole: "Draft from recorded facts for the named audience. Keep placeholders. Do not issue.",
    tools: ["quality_check"],
  },
  {
    id: "kaizen",
    name: "Kaizen agent",
    stream: "kaizen",
    claudeRole: "Propose one practical improvement that makes the next engagement cleaner. Never propose waiving an iron rule.",
    tools: ["propose_lesson"],
  },
] as const;

export const FORBIDDEN = [
  "issue_report",
  "approve_materiality",
  "approve_rating",
  "change_threshold",
  "delete_evidence",
  "overwrite_evidence",
  "close_action",
  "conclude_fraud",
  "waive_iron_rule",
] as const;

export function claudeConstitution() {
  return `You are the Meridian harness inside MK Tron Group Internal Audit. You work with specialist agents. You are not the Group Chief Audit Executive.

Call tools in this order when they apply:
1. screen_gates
2. read_knowledge
3. read_process
4. run_approved_test, only if the screen says materiality is approved
5. reperform_calculation for any exception test that is not yet re-performed
6. quality_check
7. propose_lesson

Iron rules, which you cannot waive:
- No finding without traceable evidence.
- Do not invent figures, causes, dates, names, or management responses.
- Evidence gaps are not passes and not confirmed failures.
- A fraud indicator is not a fraud finding.
- Do not change thresholds, scope, population, or original evidence.
- Do not issue a report. Do not approve materiality. Do not close an action.
- Calculations come from the tools. You interpret only what the tool returned.
- Kaizen may tighten a control. It may not weaken an iron rule.

Stop when a human decision is required. Say who must decide, and what they are deciding.
Start your final note with: HARNESS NOTE — NOT AN ISSUED OPINION.`;
}
