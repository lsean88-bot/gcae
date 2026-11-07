import { createHash } from "node:crypto";
import { desc, eq, inArray, max } from "drizzle-orm";
import { db } from "@/db";
import { actions, controls, engagements, entities, evidence, findings, people, planItems, reportVersions, risks, testRuns } from "@/db/schema";
import { engagementHidden, externalModelRefused } from "@/server/access";
import { aiStatus, completeWithModel } from "@/lib/ai";
import { aiLabel, draftNarrative, type AiDrafter } from "@/server/report13-ai";
import { auditAs, restrictedMaskTerms } from "@/server/guardrail";
import { deriveEvidenceTags, maskRestricted, type TagSource } from "@/lib/iron-rules";
import { boardBrief, buildReport13, releaseGate, type Report13Input, type R13Finding, type R13Test } from "@/lib/report13";
import { renderBoardBriefDocx, renderReport13Docx } from "@/lib/report13-docx";
import { uid } from "@/lib/format";

type Viewer = { id: string; name: string; authority: string };
type Fail = { ok: false; error: string };
export type ReportStatus = "Draft" | "Reviewed" | "Final";
const NOT_FOUND: Fail = { ok: false, error: "Not found." };

/** Empty or blank becomes undefined so the builder records the gap. */
const u = <T,>(v: T | null | undefined) => (v === null || v === undefined || String(v).trim() === "" ? undefined : v) as T;
const ids = (s: string | null | undefined) => String(s ?? "").split(/[\s,;|]+/).filter(Boolean);

export async function loadReport13Input(viewer: Viewer, engagementId: string): Promise<{ ok: true; input: Report13Input } | Fail> {
  const [eng] = await db.select().from(engagements).where(eq(engagements.id, engagementId));
  if (!eng || (await engagementHidden(viewer, engagementId))) return NOT_FOUND;

  const [entity] = await db.select({ name: entities.name }).from(entities).where(eq(entities.id, eng.entityId));
  const fRows = await db.select().from(findings).where(eq(findings.engagementId, engagementId));
  const aRows = await db.select().from(actions).where(eq(actions.engagementId, engagementId));
  const tRows = await db.select().from(testRuns).where(eq(testRuns.engagementId, engagementId));
  const pRows = await db.select().from(planItems).where(eq(planItems.engagementId, engagementId));

  const evIds = [...new Set([...fRows.flatMap((f) => ids(f.evidenceIds)), ...tRows.map((t) => t.evidenceId).filter(Boolean) as string[]])];
  const evRows = evIds.length ? await db.select().from(evidence).where(inArray(evidence.id, evIds)) : [];
  const evById = new Map(evRows.map((e) => [e.id, e]));
  const tagSrc = (id: string): TagSource[] => {
    const e = evById.get(id);
    return e ? [{ documentType: e.documentType, reliability: e.reliability, evidenceClass: e.evidenceClass }] : [];
  };
  const testById = new Map(tRows.map((t) => [t.id, t]));

  const ownerIds = [...new Set(aRows.map((a) => a.ownerId))];
  const owners = ownerIds.length ? await db.select({ id: people.id, name: people.name }).from(people).where(inArray(people.id, ownerIds)) : [];
  const ownerName = new Map(owners.map((p) => [p.id, p.name]));

  const ctlIds = [...new Set(fRows.map((f) => f.controlId).filter(Boolean) as string[])];
  const ctlRows = ctlIds.length ? await db.select().from(controls).where(inArray(controls.id, ctlIds)) : [];
  const ctlById = new Map(ctlRows.map((c) => [c.id, c]));
  const riskRows = ctlIds.length ? await db.select().from(risks) : [];

  const outFindings: R13Finding[] = fRows.map((f) => {
    const act = aRows.find((a) => a.findingId === f.id);
    const run = f.testRunId ? testById.get(f.testRunId) : undefined;
    const qaCleared = Boolean(run) && run!.qaStatus.toLowerCase() === "cleared";
    const tags = deriveEvidenceTags(ids(f.evidenceIds).flatMap(tagSrc), { qaCleared });
    // Findings hold no amounts. The linked test run does: each exception row's amount (a signed difference, so expected 0 and actual = amount),
    // else the run's single exposure figure. No non-zero amount means nothing is passed on, and nothing prints.
    const rowAmts = (run?.workpaper?.rowResults ?? [])
      .filter((r) => r.outcome === "Fail / Exception" && typeof r.amount === "number" && Number.isFinite(r.amount) && r.amount !== 0)
      .map((r) => ({ label: r.key, expected: 0, actual: r.amount as number }));
    const amounts = rowAmts.length ? rowAmts : run?.exposureAmount ? [{ label: run.id, expected: 0, actual: run.exposureAmount }] : undefined;
    const effect = [u(f.residualRisk), u(f.quantifiedImpact)].filter(Boolean).join(" ");
    return {
      id: f.id, code: f.code, title: f.title, priorityBand: f.priorityBand, priorityScore: f.priorityScore,
      condition: u(f.condition), criteria: u(f.criteria), cause: u(f.rootCause), effect: u(effect), recommendation: u(f.recommendation),
      owner: u(act ? ownerName.get(act.ownerId) : undefined), dueDate: u(act ? act.revisedDue || act.originalDue : undefined),
      evidenceTags: tags, workpaperRef: u(f.testRunId ? `Test ${f.testRunId}` : f.evidenceIds),
      rootCauseClass: u(f.rootCauseClass), managementResponse: u(f.managementPosition),
      ...(amounts ? { amounts, currency: u(run?.currency || run?.workpaper?.currency) } : {}),
    };
  });

  const outTests: R13Test[] = tRows.map((t) => ({
    id: t.id, procedure: t.procedure, result: t.result, populationCount: t.populationCount, recordsTested: t.recordsTested,
    exceptionsCount: t.exceptionsCount, limitations: t.limitations,
    evidenceTags: deriveEvidenceTags(t.evidenceId ? tagSrc(t.evidenceId) : [], { qaCleared: t.qaStatus.toLowerCase() === "cleared" }),
  }));

  const outRisks: Report13Input["risks"] = [];
  const outControls: Report13Input["controls"] = [];
  for (const f of fRows) {
    if (!f.controlId) continue;
    const c = ctlById.get(f.controlId);
    if (c) outControls.push({ id: c.id, findingCode: f.code, name: c.title, design: c.designEffectiveness, operating: c.operatingEffectiveness });
    for (const r of riskRows.filter((r) => ids(r.linkedControlIds).includes(f.controlId!))) {
      outRisks.push({
        id: r.id, findingCode: f.code, name: r.title,
        rating: r.residualLikelihood != null && r.residualImpact != null ? `Residual ${r.residualLikelihood * r.residualImpact}` : undefined,
      });
    }
  }

  const planNote = pRows.map((p) => `Annual plan item "${p.title}" (${p.quarter}, ${p.budgetDays} budget days).`).join(" ");
  const input: Report13Input = {
    title: eng.title, code: eng.code, period: u(eng.period), entityName: u(entity?.name), objective: u(eng.objective),
    scope: [u(eng.scope), planNote].filter(Boolean).join(" ") as string, businessContext: u(eng.businessContext),
    limitations: eng.limitations, overallRating: eng.overallRating, opinion: eng.opinion, ratingOverrideReason: eng.ratingOverrideReason,
    audience: eng.audience, materialityAmount: eng.materialityAmount, materialityCurrency: eng.materialityCurrency,
    materialityApproved: eng.materialityApproved, gcaeApproved: eng.gcaeApproved,
    findings: outFindings,
    actions: aRows.map((a) => ({
      id: a.id, findingId: a.findingId, agreedAction: a.agreedAction, ownerName: ownerName.get(a.ownerId) ?? "", originalDue: a.originalDue,
      revisedDue: a.revisedDue, status: a.status, interimControl: a.interimControl, evidenceRequired: a.evidenceRequired,
      validationStatus: a.validationStatus, percentComplete: a.percentComplete,
    })),
    tests: outTests, risks: outRisks, controls: outControls,
  };
  return { ok: true, input };
}

/** Canonical JSON: object keys sorted at every depth. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

function deepMask<T>(v: T, terms: Iterable<string>): T {
  if (typeof v === "string") return maskRestricted(v, terms) as unknown as T;
  if (Array.isArray(v)) return v.map((x) => deepMask(x, terms)) as unknown as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepMask(x, terms)])) as T;
  return v;
}

export async function createReportVersion(viewer: Viewer, engagementId: string, ai?: AiDrafter): Promise<{ ok: true; id: string; versionNo: number; blocking: number; aiNote?: string } | Fail> {
  const loaded = await loadReport13Input(viewer, engagementId);
  if (!loaded.ok) return loaded;
  // Mask every OTHER restricted engagement. This engagement's own terms stay visible to a viewer who can open it.
  const terms = await restrictedMaskTerms(engagementId);
  let report = buildReport13(loaded.input, { globalRestrictedTerms: terms });
  let aiAssist: { label: string; accepted: number[]; rejected: { section: number; reason: string }[] } | undefined;
  if (ai) {
    const d = await draftNarrative(report, ai);
    report = d.report;
    aiAssist = { label: d.accepted.length ? aiLabel(ai.name) : `AI draft attempted (model: ${aiStatus().compatibleModel || ai.name}); no section passed the checks, template text kept`, accepted: d.accepted, rejected: d.rejected };
  }
  const brief = boardBrief(loaded.input, { globalRestrictedTerms: terms });
  const gate = releaseGate(report, loaded.input);
  const content = { entity: maskRestricted(loaded.input.entityName || "Entity not provided", terms), report, brief, ...(aiAssist ? { aiAssist } : {}) };
  const sha256 = createHash("sha256").update(canonicalJson({ content, gate })).digest("hex");

  for (let attempt = 0; attempt < 3; attempt++) {
    const [{ m }] = await db.select({ m: max(reportVersions.versionNo) }).from(reportVersions).where(eq(reportVersions.engagementId, engagementId));
    const versionNo = (m ?? 0) + 1;
    const id = uid("rpt");
    try {
      await db.insert(reportVersions).values({
        id, engagementId, versionNo, status: "Draft", contentJson: content as unknown as Record<string, unknown>, gateJson: gate,
        sha256, createdBy: viewer.name, createdAt: new Date().toISOString(),
      });
      await auditAs(viewer, "report13.version.create", "engagement", engagementId, `Report version ${versionNo} stored as Draft. Blocking items: ${gate.blocking.length}. sha256 ${sha256.slice(0, 12)}.${aiAssist ? ` ${aiAssist.label}. Sections rewritten: ${aiAssist.accepted.join(", ") || "none"}. Rejected: ${aiAssist.rejected.map((r) => `section ${r.section} (${r.reason})`).join("; ") || "none"}.` : ""}`);
      return { ok: true, id, versionNo, blocking: gate.blocking.length, aiNote: aiAssist?.label };
    } catch (e) {
      if (attempt === 2) throw e; // version_no collision from a concurrent create: retry with a fresh maximum
    }
  }
  return { ok: false, error: "Could not store the version." };
}

/** GCAE only. Uses the local model only (127.0.0.1 or localhost); no remote provider is ever called from here. */
export async function createAiReportVersion(viewer: Viewer, engagementId: string) {
  if (viewer.authority !== "gcae") return { ok: false as const, error: "Only the GCAE can draft the narrative with AI." };
  const st = aiStatus();
  if (!(st.compatible && st.localOnly && st.compatibleModel)) return { ok: false as const, error: "No local model is configured." };
  if (await externalModelRefused(engagementId, { localOnly: true })) return { ok: false as const, error: "Model use is refused for this engagement." };
  const name = st.compatibleModel;
  const complete: AiDrafter["complete"] = async (prompt) => {
    try {
      const r = await completeWithModel("compatible", name, prompt, process.env.AI_API_KEY);
      return r.ok ? { ok: true, text: r.text } : { ok: false, error: r.error };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "The model call failed." };
    }
  };
  return createReportVersion(viewer, engagementId, { name, complete });
}

export async function setReportStatus(viewer: Viewer, versionId: string, status: ReportStatus): Promise<{ ok: true } | Fail> {
  if (viewer.authority !== "gcae") return { ok: false, error: "Only the GCAE can change a report status." };
  if (!["Draft", "Reviewed", "Final"].includes(status)) return { ok: false, error: "Unknown status." };
  const [row] = await db.select().from(reportVersions).where(eq(reportVersions.id, versionId));
  if (!row) return NOT_FOUND;
  if (row.status === "Final") return { ok: false, error: "A Final version is frozen." };
  if (status === "Final" && row.gateJson.blocking.length > 0) return { ok: false, error: `Final is refused: ${row.gateJson.blocking.length} blocking item(s) remain in the release gate.` };
  const signed = status === "Final" ? { signedOffBy: viewer.name, signedOffAt: new Date().toISOString() } : {};
  await db.update(reportVersions).set({ status, ...signed }).where(eq(reportVersions.id, versionId));
  await auditAs(viewer, "report13.status", "engagement", row.engagementId, `Report version ${row.versionNo} status ${row.status} to ${status}.`, row.status, status);
  return { ok: true };
}

export async function listReportVersions(viewer: Viewer, engagementId: string) {
  if (await engagementHidden(viewer, engagementId)) return [];
  return db
    .select({
      id: reportVersions.id, versionNo: reportVersions.versionNo, status: reportVersions.status, sha256: reportVersions.sha256,
      createdBy: reportVersions.createdBy, createdAt: reportVersions.createdAt, signedOffBy: reportVersions.signedOffBy,
      signedOffAt: reportVersions.signedOffAt, gate: reportVersions.gateJson,
    })
    .from(reportVersions)
    .where(eq(reportVersions.engagementId, engagementId))
    .orderBy(desc(reportVersions.versionNo));
}

/** Renders from the STORED snapshot only. Masks again with the current global set, in case an engagement became restricted later. */
export async function exportVersionDocx(viewer: Viewer, versionId: string, kind: "report" | "brief"): Promise<{ ok: true; buffer: Buffer; filename: string } | Fail> {
  const [row] = await db.select().from(reportVersions).where(eq(reportVersions.id, versionId));
  if (!row || (await engagementHidden(viewer, row.engagementId))) return NOT_FOUND;
  const terms = await restrictedMaskTerms(row.engagementId);
  const c = deepMask(row.contentJson as { entity: string; report: Parameters<typeof renderReport13Docx>[0]; brief: Parameters<typeof renderBoardBriefDocx>[0] }, terms);
  const meta = { entity: c.entity, status: row.status as ReportStatus, version: `v${row.versionNo}`, generatedAt: row.createdAt.slice(0, 10) };
  const buffer = kind === "brief" ? await renderBoardBriefDocx(c.brief, meta) : await renderReport13Docx(c.report, meta);
  await auditAs(viewer, "report13.export", "engagement", row.engagementId, `Exported ${kind} DOCX for version ${row.versionNo}.`);
  return { ok: true, buffer, filename: `${kind === "brief" ? "board-note" : "audit-report"}-v${row.versionNo}-${row.status}.docx` };
}

/** Latest stored version for the page: content masked with the current global restricted set. Null when hidden or none exists. */
export async function latestVersionView(viewer: Viewer, engagementId: string) {
  if (await engagementHidden(viewer, engagementId)) return null;
  const [row] = await db.select().from(reportVersions).where(eq(reportVersions.engagementId, engagementId)).orderBy(desc(reportVersions.versionNo)).limit(1);
  if (!row) return null;
  const terms = await restrictedMaskTerms(engagementId);
  const c = deepMask(row.contentJson as { entity: string; report: { sections: { number: number; title: string; paragraphs: string[]; tables?: { headers: string[]; rows: string[][] }[] }[] } }, terms);
  return { id: row.id, versionNo: row.versionNo, status: row.status, gate: row.gateJson, sections: c.report.sections };
}
