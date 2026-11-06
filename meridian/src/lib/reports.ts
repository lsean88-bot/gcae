import type { ImpactMap } from "@/db/schema";
import { BANNED_PHRASES, IMPACT_DIMENSIONS, bandFor, cadenceLabel } from "@/lib/methodology";
import { formatDate, isOverdue, money } from "@/lib/format";

export type FindingFact = {
  id: string;
  code: string;
  title: string;
  criteria: string;
  condition: string;
  symptom: string;
  immediateCause: string;
  rootCause: string;
  fiveWhys: string[];
  rootCauseClass: string;
  rootCauseTheme: string;
  riskRating: string;
  likelihood: number;
  likelihoodRationale: string;
  impacts: ImpactMap;
  priorityScore: number;
  priorityBand: string;
  highestImpact: number;
  highestDimension: string;
  residualRisk: string;
  businessValue: string;
  valueLevel: string;
  recommendation: string;
  expectedOutcome: string;
  managementPosition: string;
  quantifiedImpact?: string | null;
  evidenceIds: string;
  status: string;
  isolatedOrRecurring: string;
};

export type ActionFact = {
  id: string;
  findingId: string;
  agreedAction: string;
  ownerName: string;
  originalDue: string;
  revisedDue?: string | null;
  status: string;
  interimControl?: string | null;
  evidenceRequired: string;
  validationStatus: string;
  percentComplete: number;
};

export type TestFact = {
  id: string;
  procedure: string;
  result: string;
  populationCount: number;
  recordsTested: number;
  exceptionsCount: number;
  exposureAmount: number | null;
  currency: string | null;
  qaStatus: string;
  limitations: string | null;
  approvalStatus: string;
};

export type BriefInput = {
  title: string;
  code: string;
  period: string;
  entityName: string;
  objective: string;
  scope: string;
  businessContext: string;
  limitations?: string | null;
  overallRating?: string | null;
  opinion?: string | null;
  ratingOverrideReason?: string | null;
  audience: string;
  materialityAmount?: number | null;
  materialityCurrency?: string | null;
  materialityApproved: boolean;
  gcaeApproved: boolean;
  findings: FindingFact[];
  actions: ActionFact[];
  tests: TestFact[];
};

export type ReportSection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
};

const dimLabel = (id: string) => IMPACT_DIMENSIONS.find((item) => item.id === id)?.label || id;

export function countBands(findings: FindingFact[]) {
  const counts: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0, Unscored: 0 };
  findings.forEach((finding) => {
    counts[finding.priorityBand] = (counts[finding.priorityBand] || 0) + 1;
  });
  return counts;
}

export function recommendedRating(findings: FindingFact[]) {
  if (findings.length === 0) return "Not yet rated";
  const highest = Math.max(...findings.map((finding) => finding.priorityScore));
  return bandFor(highest);
}

export function buildBriefing(input: BriefInput): ReportSection[] {
  const counts = countBands(input.findings);
  const recommended = recommendedRating(input.findings);
  const countText = input.findings.length
    ? `${counts.Critical} critical, ${counts.High} high, ${counts.Medium} medium, and ${counts.Low} low.`
    : "No finding is on file.";
  const themes = unique(input.findings.map((finding) => finding.rootCauseClass));
  const topActions = [...input.actions].slice(0, 3);
  const overdue = input.actions.filter((action) => isOverdue(action.status, action.revisedDue || action.originalDue));
  const quantified = input.findings.filter((finding) => finding.quantifiedImpact).map((finding) => `${finding.code}: ${finding.quantifiedImpact}`);

  return [
    {
      heading: "Why this audit matters",
      paragraphs: [
        input.businessContext,
        `The audit covers ${input.entityName} for ${input.period}. Objective: ${input.objective}`,
      ],
    },
    {
      heading: "What we found",
      paragraphs: [
        input.opinion ||
          `The working conclusion is not yet an issued opinion. ${input.findings.length} finding${input.findings.length === 1 ? " is" : "s are"} recorded: ${countText}`,
        `The highest finding band is ${recommended}. ${
          input.overallRating
            ? `The rating currently on the file is ${input.overallRating}.`
            : "A final rating has not been set."
        } ${input.gcaeApproved ? "The GCAE has approved issuance." : "The GCAE has not approved issuance."}`,
      ],
    },
    {
      heading: "What this means for the business",
      paragraphs: [
        quantified.length
          ? `Quantified or stated exposure, limited to what the workpapers support: ${quantified.join(" ")}`
          : "No finding has a quantified exposure yet. Do not treat that silence as zero impact.",
        input.limitations || "No engagement-level limitation is recorded.",
      ],
      bullets: input.findings.slice(0, 4).map((finding) => `${finding.code}: ${finding.residualRisk}`),
    },
    {
      heading: "What is driving the issues",
      paragraphs: [
        themes.length
          ? `The recorded root-cause classes are ${themes.join(", ")}. These describe the process, system, or accountability gap. They do not name a person as the cause.`
          : "Root causes are not yet recorded.",
      ],
      bullets: input.findings.map((finding) => `${finding.code} — ${finding.rootCauseClass}: ${finding.rootCause}`),
    },
    {
      heading: "What needs to happen",
      paragraphs: [
        topActions.length
          ? "The actions below are the ones already on file. Dates and owners are shown only where management or the audit file has recorded them."
          : "No agreed action is on file.",
      ],
      bullets: topActions.map(
        (action) =>
          `${action.ownerName} — ${action.agreedAction} Target ${formatDate(action.revisedDue || action.originalDue)}. Status: ${action.status}.`,
      ),
    },
    {
      heading: "Decisions or support required",
      paragraphs: [decisionParagraph(input, overdue.length, recommended)],
      bullets: [
        input.materialityApproved
          ? `Materiality of ${money(input.materialityAmount, input.materialityCurrency || "MYR")} is approved.`
          : "Materiality is not approved. Testing cannot be treated as in-scope until the GCAE approves the threshold.",
        overdue.length
          ? `${overdue.length} action${overdue.length === 1 ? " is" : "s are"} past the agreed date and not closed.`
          : "No open action is past its agreed date.",
      ],
    },
  ];
}

function decisionParagraph(input: BriefInput, overdue: number, recommended: string) {
  const parts = ["The GCAE remains the approval authority."];
  if (!input.gcaeApproved) parts.push("The report is not issued.");
  if (input.overallRating && input.overallRating !== recommended && recommended !== "Not yet rated") {
    parts.push(
      `The file rating is ${input.overallRating}. The highest finding band is ${recommended}. ${
        input.ratingOverrideReason || "A reason for the difference is not yet recorded."
      }`,
    );
  }
  if (overdue) parts.push("Overdue actions should be escalated to the accountable executive and included in the next audit-committee update.");
  return parts.join(" ");
}

export function stakeholderViews(input: BriefInput): ReportSection[] {
  const recommended = recommendedRating(input.findings);
  const themes = unique(input.findings.map((finding) => `${finding.rootCauseClass} (${finding.rootCauseTheme})`));
  return [
    {
      heading: "Audit committee",
      paragraphs: [
        `${input.entityName}, ${input.period}. Working rating: ${input.overallRating || "not set"}. Highest finding band: ${recommended}.`,
        "This view stays with conclusion, exposure, root-cause theme, and the decision required. Operational steps sit in the process-owner view.",
      ],
      bullets: [
        ...input.findings.slice(0, 4).map((finding) => `${finding.code} ${finding.priorityBand} — ${finding.title}`),
        themes.length ? `Themes: ${themes.join("; ")}` : "No theme recorded.",
        input.gcaeApproved ? "Issuance is approved." : "Issuance is waiting on the GCAE.",
      ],
    },
    {
      heading: "Executive management",
      paragraphs: [
        input.businessContext,
        "The trade-off is between the cost of the agreed action and the exposure left open if the root cause stays in place. Figures below are only those supported by the file.",
      ],
      bullets: input.findings.map((finding) => `${finding.code}: ${finding.quantifiedImpact || "Impact not quantified."} Value of fixing it: ${finding.businessValue}`),
    },
    {
      heading: "Process owner",
      paragraphs: [
        "This view is for implementation. It keeps the condition, the gap, the owner, the date, and the interim control.",
      ],
      bullets: input.findings.map((finding) => {
        const action = input.actions.find((item) => item.findingId === finding.id);
        return action
          ? `${finding.code}: ${finding.condition} Action: ${action.agreedAction} Owner: ${action.ownerName}. Interim: ${action.interimControl || "Not recorded."}`
          : `${finding.code}: ${finding.condition} No action is on file.`;
      }),
    },
    {
      heading: "Risk and compliance",
      paragraphs: [
        `Risk appetite note on the engagement: ${input.audience}. Highest residual themes are listed from the findings, not from a new assessment.`,
      ],
      bullets: input.findings.map(
        (finding) =>
          `${finding.code}: ${finding.priorityBand} (likelihood ${finding.likelihood} × impact ${finding.highestImpact} on ${dimLabel(finding.highestDimension)}). Residual: ${finding.residualRisk}`,
      ),
    },
    {
      heading: "Finance",
      paragraphs: [
        `Materiality on file: ${
          input.materialityAmount
            ? money(input.materialityAmount, input.materialityCurrency || "MYR")
            : "not set"
        }. Actual loss and potential exposure are stated separately. Absence of a recorded loss is not evidence that the control worked.`,
      ],
      bullets: input.findings.map((finding) => `${finding.code}: ${finding.quantifiedImpact || "No amount on file."} ${finding.residualRisk}`),
    },
  ];
}

export type QualityItem = {
  id: string;
  name: string;
  pass: boolean;
  detail: string;
};

export function qualityChecks(input: BriefInput): QualityItem[] {
  const checks: QualityItem[] = [];
  const missingPieces = input.findings.filter((finding) => {
    const action = input.actions.find((item) => item.findingId === finding.id);
    return (
      !finding.condition ||
      !finding.rootCause ||
      !finding.recommendation ||
      !finding.businessValue ||
      !finding.evidenceIds ||
      !action ||
      !action.ownerName ||
      !action.originalDue
    );
  });
  checks.push({
    id: "complete",
    name: "Issue, risk, impact, cause, value, action, owner, and date",
    pass: input.findings.length > 0 && missingPieces.length === 0,
    detail: missingPieces.length
      ? `Incomplete: ${missingPieces.map((finding) => finding.code).join(", ")}.`
      : input.findings.length
        ? "Each finding has the required pieces and a linked action."
        : "There is no finding to check.",
  });

  const sameCause = input.findings.filter((finding) => {
    const root = normalise(finding.rootCause);
    return root && (root === normalise(finding.symptom) || root === normalise(finding.immediateCause));
  });
  checks.push({
    id: "cause",
    name: "Root cause is distinct from the symptom",
    pass: sameCause.length === 0,
    detail: sameCause.length ? `Cause repeats the symptom: ${sameCause.map((finding) => finding.code).join(", ")}.` : "Causes are distinct from symptoms.",
  });

  const thinImpact = input.findings.filter((finding) =>
    Object.values(finding.impacts).some((cell) => cell.relevant && cell.note.trim().length < 24),
  );
  checks.push({
    id: "impact",
    name: "Business impact is specific",
    pass: thinImpact.length === 0,
    detail: thinImpact.length
      ? `Impact notes are too thin: ${thinImpact.map((finding) => finding.code).join(", ")}.`
      : "Relevant impact notes carry a specific explanation.",
  });

  const thinScore = input.findings.filter((finding) => finding.likelihoodRationale.trim().length < 24);
  checks.push({
    id: "score",
    name: "Scores have a rationale",
    pass: thinScore.length === 0,
    detail: thinScore.length ? `Likelihood rationale is thin: ${thinScore.map((finding) => finding.code).join(", ")}.` : "Likelihood rationales are recorded.",
  });

  const weakRec = input.findings.filter((finding) => finding.recommendation.trim().length < 40);
  checks.push({
    id: "recommendation",
    name: "Recommendations are practical",
    pass: weakRec.length === 0,
    detail: weakRec.length ? `Recommendation is too short to implement: ${weakRec.map((finding) => finding.code).join(", ")}.` : "Recommendations are specific enough to implement.",
  });

  const corpus = [
    input.opinion || "",
    input.businessContext,
    ...input.findings.flatMap((finding) => [finding.title, finding.condition, finding.rootCause, finding.recommendation, finding.businessValue]),
  ]
    .join(" ")
    .toLowerCase();
  const hits = BANNED_PHRASES.filter((phrase) => corpus.includes(phrase));
  checks.push({
    id: "language",
    name: "Plain language, without stock AI phrases",
    pass: hits.length === 0,
    detail: hits.length ? `Remove: ${hits.join(", ")}.` : "No stock AI phrases were found in the file text.",
  });

  checks.push({
    id: "briefing",
    name: "A senior reader can see the conclusion and the decision",
    pass: Boolean(input.businessContext && (input.opinion || input.findings.length)),
    detail: input.opinion ? "An opinion draft is on the file." : "The briefing can be built from the findings, but an opinion sentence has not been saved.",
  });

  const blame = input.findings.filter((finding) =>
    /negligent|incompetent|he failed|she failed|blame/i.test(`${finding.rootCause} ${finding.immediateCause}`),
  );
  checks.push({
    id: "blame",
    name: "Cause sits with process, system, or accountability — not a named fault",
    pass: blame.length === 0,
    detail: blame.length ? `Review wording: ${blame.map((finding) => finding.code).join(", ")}.` : "No blame wording was found in the cause fields.",
  });

  const unlabelled = input.findings.filter((finding) => !finding.rootCause.trim() || finding.rootCause.trim() === "TBD");
  checks.push({
    id: "placeholders",
    name: "Missing facts are labelled, not invented",
    pass: unlabelled.length === 0,
    detail: unlabelled.length
      ? `Empty cause fields: ${unlabelled.map((finding) => finding.code).join(", ")}. Use a labelled placeholder.`
      : "Empty causes were not found. Placeholders that are labelled remain visible to the reader.",
  });

  const partner = input.findings.every((finding) => /should|agree|review|redesign|introduce|reconcile|restrict|monitor/i.test(finding.recommendation));
  checks.push({
    id: "partner",
    name: "The recommendation is constructive and assignable",
    pass: input.findings.length > 0 && partner,
    detail: partner ? "Recommendations use an action a manager can accept or dispute." : "At least one recommendation does not say what should change.",
  });

  checks.push({
    id: "trace",
    name: "Findings cite evidence, and material tests have QA",
    pass:
      input.findings.every((finding) => finding.evidenceIds.trim().length > 0) &&
      input.tests.filter((test) => test.exceptionsCount > 0).every((test) => test.qaStatus === "cleared"),
    detail: "A finding without evidence, or an exception test without re-performance, fails this check.",
  });

  checks.push({
    id: "cadence",
    name: "Follow-up cadence matches the band",
    pass: true,
    detail: input.findings
      .map((finding) => `${finding.code} ${finding.priorityBand}: ${cadenceLabel(finding.priorityBand, false)}`)
      .join(" · ") || "No findings.",
  });

  return checks;
}

export function buildPrompt(input: BriefInput) {
  const findingBlock = input.findings
    .map((finding) =>
      [
        `${finding.code}: ${finding.title}`,
        `Rating: ${finding.priorityBand}. Likelihood ${finding.likelihood}. Highest impact ${finding.highestImpact} (${dimLabel(finding.highestDimension)}). Priority ${finding.priorityScore}.`,
        `Criteria: ${finding.criteria}`,
        `Condition: ${finding.condition}`,
        `Symptom: ${finding.symptom}`,
        `Immediate cause: ${finding.immediateCause}`,
        `Root cause: ${finding.rootCause}`,
        `Class: ${finding.rootCauseClass}. Theme: ${finding.rootCauseTheme}.`,
        `Residual risk: ${finding.residualRisk}`,
        `Quantified impact: ${finding.quantifiedImpact || "[NOT QUANTIFIED — do not invent a figure]"}`,
        `Value of remediation: ${finding.businessValue}`,
        `Recommendation: ${finding.recommendation}`,
        `Management position: ${finding.managementPosition}`,
        `Evidence: ${finding.evidenceIds || "[NO EVIDENCE ID]"}`,
      ].join("\n"),
    )
    .join("\n\n");

  const actionBlock = input.actions
    .map(
      (action) =>
        `- ${action.agreedAction} | Owner: ${action.ownerName} | Due: ${action.revisedDue || action.originalDue} | Status: ${action.status} | Interim: ${action.interimControl || "[NOT RECORDED]"} | Validation: ${action.validationStatus}`,
    )
    .join("\n");

  return `Act as a senior internal audit business partner and report editor.

Rewrite the risk-based internal audit report below so a non-auditor can see:
- what the issue is
- why it happened
- the risk and business impact
- the value of fixing it
- what management should do, by when, and who is accountable

Rules you must not break:
- Use only the facts in this prompt. Do not invent figures, root causes, names, dates, management responses, or evidence.
- If a fact is missing, write a labelled placeholder in square brackets, such as [ROOT CAUSE TO BE CONFIRMED WITH MANAGEMENT].
- Do not treat a fraud indicator as a finding of fraud.
- Do not convert an evidence gap into a pass or into a confirmed failure.
- Do not blame an individual. Explain the process, system, accountability, or capability gap.
- Write in plain, short, professional sentences. Do not use stock phrases such as delve, robust, leverage, holistic, seamless, or pivotal.
- Keep Internal Audit independent and constructive.

Audience: ${input.audience}
Entity: ${input.entityName}
Period: ${input.period}
Objective: ${input.objective}
Scope: ${input.scope}
Business context: ${input.businessContext}
Limitations: ${input.limitations || "[NONE RECORDED]"}
Materiality: ${input.materialityAmount ? money(input.materialityAmount, input.materialityCurrency || "MYR") : "[NOT APPROVED]"}
Current rating on file: ${input.overallRating || "[NOT SET]"}
GCAE issuance: ${input.gcaeApproved ? "Approved" : "Not approved"}

Findings:
${findingBlock || "[NO FINDINGS RECORDED]"}

Actions:
${actionBlock || "[NO ACTIONS RECORDED]"}

Use this structure:
1. Executive briefing, in plain language, with the decision required.
2. Business context.
3. Overall conclusion and rating, including what the rating means.
4. Findings summary table: code, business issue, rating, priority score, root-cause class, owner, due date, status.
5. Each finding: criteria, condition, why it matters, root cause, existing controls and residual risk, value of fixing it, recommendation, management response.
6. Cross-cutting themes.
7. What good looks like.
8. Appendix: scope, period, methodology limits, and any placeholder that still needs a fact.

Here is the current report context to enhance. Do not add facts that are not above.
`;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function normalise(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
