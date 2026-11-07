import { db } from "@/db";
import { lessons } from "@/db/schema";
import { todayIso, uid } from "@/lib/format";

export async function ensureLessons() {
  const existing = await db.select().from(lessons).limit(1);
  if (existing.length) return;
  await db.insert(lessons).values([
    {
      id: "lsn-1",
      engagementId: "eng-ap",
      title: "State the population before testing the extract",
      observation: "Management stated 40 invoices. The extract had 18. The first draft risked reading the test as coverage of 40.",
      change: "The workpaper must show stated population and records tested as two numbers. The difference stays Unable to conclude.",
      area: "testing",
      ironRule: "An evidence gap is not a pass and not a confirmed failure.",
      status: "accepted",
      createdAt: todayIso(),
      decidedBy: "p-gcae",
      decisionNote: "Accepted. This tightens the population rule. It does not waive it.",
    },
    {
      id: "lsn-2",
      engagementId: "eng-dc",
      title: "Do not clear a count test from the narrative",
      observation: "The alloy count has exceptions and has not been re-performed. A clear story is not a clearance.",
      change: "Exception tests stay pending until the recalculation is stored and a QA reviewer accepts it.",
      area: "assurance",
      ironRule: "QA re-performs material work. It does not merely review the first narrative.",
      status: "accepted",
      createdAt: todayIso(),
      decidedBy: "p-gcae",
      decisionNote: "Accepted.",
    },
    {
      id: "lsn-3",
      engagementId: null,
      title: "Kaizen cannot retire an iron rule",
      observation: "A faster audit is not a reason to skip evidence registration or human issuance.",
      change: "Any lesson that says waive, skip, or override an iron rule is rejected by the harness before a person sees it as a proposal.",
      area: "kaizen",
      ironRule: "Nothing is approved, routed, or issued without a person.",
      status: "accepted",
      createdAt: todayIso(),
      decidedBy: "p-gcae",
      decisionNote: "Standing rule for the harness.",
    },
  ]);
}

/** One shared test for a lesson that would weaken an iron rule. Used by the harness, the manager decision and the API. */
export function weakensIronRule(text: string) {
  // Original patterns (kept), then intent patterns: a phrase that relaxes a rule, not a bare word.
  return /waive|skip the iron|ignore the rule|auto-?issue|no approval|auto-?(approve|close)|issue without|\b(may|can|could|should|allow(ed)?|permit(ted)?|ok(ay)? to|able to)\b[^.]{0,40}\b(skip|bypass|waive|ignore|override)\b|\b(skip|bypass)(ing)?\s+(the\s+)?(evidence|review|qa|approval|gate|guard)\b|without (human|manager|qa|gcae)\b[^.]{0,20}(approval|review|sign-?off)|\b(may|can|could|should|allow(ed)?|permit(ted)?)\b[^.]{0,40}without evidence/i.test(text);
}

// ---------------------------------------------------------------------------------------------
// Kaizen capture: a rejected or overridden agent draft becomes a lesson (agent, rule, reason).
// Stored in the existing lessons table. Status "proposed": a person still accepts or rejects it.
// ---------------------------------------------------------------------------------------------

export const FEEDBACK_AREAS = ["agent-override", "agent-rejection"] as const;
const TITLE_SEP = " · ";

export function feedbackTitle(agent: string, rule: string) {
  return `${agent}${TITLE_SEP}${rule}`;
}

export async function captureLesson(input: { kind: "override" | "rejection"; agent: string; rule: string; reason: string; engagementId: string | null; decidedBy: string }) {
  const id = uid("lsn");
  const verb = input.kind === "override" ? "The GCAE overrode the guardrail on" : "A reviewer rejected a draft from";
  await db.insert(lessons).values({
    id,
    engagementId: input.engagementId,
    title: feedbackTitle(input.agent, input.rule),
    observation: `${verb} ${input.agent} (rule: ${input.rule}). Reason given: ${input.reason.trim()}`,
    change: `Review whether the ${input.agent} prompt or the wording of rule "${input.rule}" needs to be sharper. The rule itself stays.`,
    area: input.kind === "override" ? "agent-override" : "agent-rejection",
    ironRule: "Every rejected or overridden draft is a lesson. Nothing is approved without a person.",
    status: "proposed",
    createdAt: todayIso(),
    decidedBy: null,
    decisionNote: `Captured automatically from a ${input.kind} by ${input.decidedBy}.`,
  });
  return id;
}

export type RecurringLesson = { title: string; count: number; engagements: number; latestReason: string; latestAt: string; overrides: number; rejections: number };

type LessonLike = { title: string; observation: string; area: string; createdAt: string; engagementId: string | null };

/** Groups by title so the same agent and rule counted across engagements shows once. Most frequent first. Pure. */
export function recurringLessons(rows: LessonLike[], limit = 5): RecurringLesson[] {
  const groups = new Map<string, LessonLike[]>();
  for (const row of rows) groups.set(row.title, [...(groups.get(row.title) ?? []), row]);
  return [...groups.entries()]
    .map(([title, items]) => {
      const latest = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      return {
        title,
        count: items.length,
        engagements: new Set(items.map((i) => i.engagementId ?? "group")).size,
        latestReason: latest.observation.replace(/^.*Reason given:\s*/, ""),
        latestAt: latest.createdAt,
        overrides: items.filter((i) => i.area === "agent-override").length,
        rejections: items.filter((i) => i.area === "agent-rejection").length,
      };
    })
    .sort((a, b) => b.count - a.count || b.latestAt.localeCompare(a.latestAt) || a.title.localeCompare(b.title))
    .slice(0, limit);
}
