import { createHash } from "crypto";
import { BANDS, buildHeat, risksWithoutControl, topRisks, viewScore, type ErmRisk } from "@/lib/erm";
import { bandFor, cadenceLabel } from "@/lib/methodology";
import { progressByQuarter } from "@/lib/plan-scoring";

/** Stable JSON: keys sorted, so the hash survives a round trip through Postgres jsonb (which reorders keys). */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}
export const snapshotHash = (snapshot: unknown) => createHash("sha256").update(canonicalJson(snapshot)).digest("hex");

export type PackInput = {
  from: string;
  to: string;
  asOf: string;
  generatedBy: string;
  generatedByAuthority: string;
  engagements: { id: string; code: string; title: string; status: string; opinion: string | null; issuedAt: string | null; startDate: string; restricted: boolean }[];
  findings: { engagementId: string; code: string; title: string; status: string; priorityBand: string }[];
  actions: { engagementId: string; findingId: string; agreedAction: string; ownerId: string; status: string; originalDue: string; revisedDue: string | null }[];
  findingIdToBand: Record<string, { code: string; band: string }>;
  people: { id: string; name: string; role: string }[];
  risks: (ErmRisk & { entity: string })[];
  controlIds: string[];
  lessons: { engagementId: string | null; title: string; area: string; status: string; createdAt: string }[];
  plan: { year: number; version: number; status: string; capacityDays: number; weightsApproved: boolean; items: { title: string; quarter: string; status: string; budgetDays: number; changeReason: string | null; engagementId: string | null }[] } | null;
  demoPresent: boolean;
  /** Ids of ALL restricted engagements, including ones the generator cannot see. */
  restrictedIds: string[];
};

const inPeriod = (d: string | null, from: string, to: string) => !!d && d.slice(0, 10) >= from && d.slice(0, 10) <= to;
const days = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000);

/**
 * Builds the frozen pack content from plain data only. No model call. Restricted engagements and every record under them
 * are removed here, for every viewer including the GCAE: the pack only ever states how many exist.
 */
export function buildPackSnapshot(input: PackInput) {
  const restrictedIds = new Set([...input.restrictedIds, ...input.engagements.filter((e) => e.restricted).map((e) => e.id)]);
  const open = (e: { engagementId: string | null }) => !e.engagementId || !restrictedIds.has(e.engagementId);
  const engs = input.engagements.filter((e) => !e.restricted);
  const findings = input.findings.filter(open);
  const actions = input.actions.filter(open);
  const nameOf = (id: string) => input.people.find((p) => p.id === id);
  const engOf = (id: string) => engs.find((e) => e.id === id);

  const planItems = (input.plan?.items ?? []).map((i) => (i.engagementId && restrictedIds.has(i.engagementId) ? { ...i, title: "Restricted item", changeReason: "Withheld (restricted)" } : i));
  const plan = input.plan
    ? {
        year: input.plan.year,
        version: input.plan.version,
        status: input.plan.status,
        capacityDays: input.plan.capacityDays,
        weightsApproved: input.plan.weightsApproved,
        allocatedDays: planItems.filter((i) => i.status !== "Deferred" && i.status !== "Cancelled").reduce((s, i) => s + i.budgetDays, 0),
        byQuarter: progressByQuarter(planItems),
        deferredCancelled: planItems.filter((i) => i.status === "Deferred" || i.status === "Cancelled").map((i) => ({ title: i.title, quarter: i.quarter, status: i.status, reason: i.changeReason || "No reason recorded" })),
      }
    : null;

  const issuedReports = engs.filter((e) => e.status === "Issued" && inPeriod(e.issuedAt, input.from, input.to)).map((e) => ({ code: e.code, title: e.title, opinion: e.opinion || "No opinion recorded", issuedAt: (e.issuedAt || "").slice(0, 10) }));

  const openFindings = findings.filter((f) => f.status !== "Closed");
  const byBand: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  const ageing: Record<string, Record<string, number>> = {};
  const buckets = ["0-30 days", "31-90 days", "91-180 days", "Over 180 days"];
  for (const b of buckets) ageing[b] = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  for (const f of openFindings) {
    const band = BANDS.includes(f.priorityBand as (typeof BANDS)[number]) ? f.priorityBand : "Low";
    byBand[band] += 1;
    const e = engOf(f.engagementId);
    const age = e ? days(e.issuedAt || e.startDate, input.asOf) : 0;
    ageing[age <= 30 ? buckets[0] : age <= 90 ? buckets[1] : age <= 180 ? buckets[2] : buckets[3]][band] += 1;
  }

  const overdueActions = actions
    .filter((a) => a.status !== "Closed" && a.status !== "Deferred" && days(a.revisedDue || a.originalDue, input.asOf) > 0)
    .map((a) => {
      const owner = nameOf(a.ownerId);
      const f = input.findingIdToBand[a.findingId];
      const due = (a.revisedDue || a.originalDue).slice(0, 10);
      return { findingCode: f?.code || "", engagementCode: engOf(a.engagementId)?.code || "", agreedAction: a.agreedAction, ownerName: owner?.name || "Unassigned", ownerRole: owner?.role || "", due, daysOverdue: days(due, input.asOf), band: f?.band || "Low", cadence: cadenceLabel(f?.band || "Low", true) };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue || a.findingCode.localeCompare(b.findingCode));

  const heatResidual = buildHeat(input.risks, "residual");
  const heatInherent = buildHeat(input.risks, "inherent");
  const top = topRisks(input.risks, "residual", 5).map(({ risk, score }) => ({ title: risk.title, entity: (risk as { entity?: string }).entity || "Group", inherent: viewScore(risk, "inherent"), residual: score, band: bandFor(score) }));
  const lessons = input.lessons.filter((l) => l.status === "accepted" && open(l) && inPeriod(l.createdAt, input.from, input.to)).map((l) => ({ title: l.title, area: l.area, created: l.createdAt.slice(0, 10) }));

  const limitations = [
    "This pack uses no model. Every figure is calculated from records in the app at the generation date.",
    "Open findings and overdue actions are the status at the generation date, not at the end of the period. The app keeps no status history.",
    "Finding age is counted from the engagement issue date, or its start date if not yet issued. Findings carry no date of their own.",
    "Kaizen lessons are dated by when they were proposed. The app does not store the date a lesson was accepted.",
    `Residual risk not assessed for ${heatResidual.notAssessed.length} of ${input.risks.length} risk(s). Those risks are counted in the inherent view only.`,
    "Whether a live AI model is connected and working was not verified by this pack.",
    "Findings, actions, reports and lessons of restricted engagements are excluded from every figure.",
    ...(input.demoPresent ? ["Demonstration records are present in this database. Confirm what is live before the pack goes to the Audit Committee."] : []),
    ...(plan && !plan.weightsApproved ? ["The plan weights shown have not been approved by the GCAE."] : []),
    ...(!plan ? ["No audit plan was found for the period."] : []),
  ];

  return {
    schema: 1,
    period: { from: input.from, to: input.to },
    asOf: input.asOf,
    generatedBy: input.generatedBy,
    generatedByAuthority: input.generatedByAuthority,
    plan,
    issuedReports,
    findings: { total: openFindings.length, byBand, ageing, buckets },
    overdueActions,
    erm: {
      total: input.risks.length,
      residualBands: heatResidual.bands,
      inherentBands: heatInherent.bands,
      residualNotAssessed: heatResidual.notAssessed.length,
      withoutControl: risksWithoutControl(input.risks, new Set(input.controlIds)).length,
      top,
    },
    lessons,
    // Only the GCAE sees that restricted engagements exist, so only a GCAE-generated pack states the count.
    restricted: input.generatedByAuthority === "gcae" && restrictedIds.size > 0 ? { count: restrictedIds.size, note: `${restrictedIds.size} restricted engagement(s) — reported to the AC Chair separately` } : null,
    limitations,
  };
}
export type PackSnapshot = ReturnType<typeof buildPackSnapshot>;
