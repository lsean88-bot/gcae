import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditPlans, planItems, risks } from "@/db/schema";
import { MAX_UPLOAD_BYTES } from "@/lib/analytics-io";
import { buildHeat, residualLabel, topRisks, viewScore, type ErmRisk, type RiskView } from "@/lib/erm";
import { restrictedEngagementIds } from "@/server/access";
import { getRunAs, listRunsAs, runAnalyticsAs, TEST_TYPES, type RunParams, type RunView, type UploadFile, type Who } from "@/server/analytics";
import { auditApi, type ApiActor } from "@/server/api-tokens";
import { evaluateText } from "@/server/guardrail";

export const whoOf = (actor: ApiActor): Who => ({ id: actor.person.id, name: actor.actorLabel, authority: actor.authority });
export type ApiOut = { status: number; body: Record<string, unknown> };

/** Tokens never see restricted engagements, not even the GCAE's token. The person's own access is applied as well by the analytics layer. */
const visible = (r: RunView, hidden: Set<string>) => !r.engagementId || !hidden.has(r.engagementId);

export async function listAnalyticsRuns(actor: ApiActor) {
  const hidden = await restrictedEngagementIds();
  return (await listRunsAs(whoOf(actor))).filter((r) => visible(r, hidden));
}

export async function getAnalyticsRun(actor: ApiActor, id: string) {
  const run = await getRunAs(whoOf(actor), id);
  return run && visible(run, await restrictedEngagementIds()) ? run : null;
}

type FileIn = { name?: unknown; contentBase64?: unknown; sheet?: unknown };
function toFile(f: FileIn | undefined): UploadFile | { error: string } | null {
  if (!f || typeof f !== "object") return null;
  if (typeof f.name !== "string" || !f.name || typeof f.contentBase64 !== "string") return { error: "A file needs name and contentBase64." };
  const bytes = new Uint8Array(Buffer.from(f.contentBase64, "base64"));
  if (!bytes.byteLength) return { error: "The file is empty." };
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return { error: "File is larger than 20 MB." };
  return { name: f.name.slice(0, 200), bytes, sheet: typeof f.sheet === "string" && f.sheet ? f.sheet : null };
}

/** Runs a deterministic test and saves a read-only run. It decides nothing: no rating, no approval, no finding. */
export async function runAnalyticsFromApi(actor: ApiActor, body: Record<string, unknown>): Promise<ApiOut> {
  const a = toFile(body.fileA as FileIn);
  if (!a) return { status: 400, body: { ok: false, error: "Send fileA {name, contentBase64}." } };
  if ("error" in a) return { status: 400, body: { ok: false, error: a.error } };
  const b = toFile(body.fileB as FileIn);
  if (b && "error" in b) return { status: 400, body: { ok: false, error: b.error } };
  const test = String(body.test || "");
  if (!TEST_TYPES.includes(test as never)) return { status: 400, body: { ok: false, error: `Unknown test. Use one of: ${TEST_TYPES.join(", ")}.` } };
  const engagementId = typeof body.engagementId === "string" && body.engagementId ? body.engagementId : null;
  if (engagementId && (await restrictedEngagementIds()).has(engagementId)) {
    await auditApi(actor.actorLabel, "Claude token use denied", "engagement", engagementId, "Restricted engagement. Tokens never see restricted engagements.", "denied");
    return { status: 404, body: { ok: false, error: "Engagement not found." } };
  }
  const params = body.params && typeof body.params === "object" && !Array.isArray(body.params) ? (body.params as RunParams) : {};
  const res = await runAnalyticsAs(whoOf(actor), { engagementId, test, fileA: a, fileB: b && !("error" in b) ? b : null, params });
  if (!res.ok) return { status: 422, body: { ok: false, error: res.error } };
  await auditApi(actor.actorLabel, "Ran analytics via Claude token", "analytics", res.id, `${test} on "${a.name}". Saved read-only; nothing approved.`, "saved");
  return { status: 201, body: { ok: true, run: res.run, note: "Saved as a read-only analytics run. Interpreting it and drafting any finding stays with a person." } };
}

/** Lints text against the iron rules. Stores nothing. */
export function lintForApi(body: Record<string, unknown>): ApiOut {
  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) return { status: 400, body: { ok: false, error: "Send {text}." } };
  if (text.length > 100_000) return { status: 400, body: { ok: false, error: "Text is too long." } };
  const evidenceState = typeof body.evidenceState === "string" && body.evidenceState ? body.evidenceState : undefined;
  const { violations } = evaluateText(text, { evidenceState });
  return { status: 200, body: { ok: true, clear: !violations.some((v) => v.level === "block"), violations } };
}

export async function getAuditPlan(q: { planId?: string; year?: number }) {
  const all = await db.select().from(auditPlans).orderBy(desc(auditPlans.year), desc(auditPlans.version));
  const plan = q.planId ? all.find((p) => p.id === q.planId) : q.year ? all.find((p) => p.year === q.year) : all[0];
  if (!plan) return null;
  const hidden = await restrictedEngagementIds();
  const rows = await db.select().from(planItems).where(eq(planItems.planId, plan.id));
  const items = rows.filter((i) => !i.engagementId || !hidden.has(i.engagementId));
  return { plan, items, withheldItems: rows.length - items.length, otherPlans: all.filter((p) => p.id !== plan.id).map((p) => ({ id: p.id, year: p.year, version: p.version, status: p.status })) };
}

export async function getRiskRegister(view: RiskView, top: number) {
  const rows = await db.select().from(risks);
  const ranked = rows.map((r) => ({ ...r, inherentScore: viewScore(r as ErmRisk, "inherent"), residualScore: viewScore(r as ErmRisk, "residual"), residualLabel: residualLabel(r) }));
  return {
    view,
    count: rows.length,
    residualNotAssessed: rows.filter((r) => viewScore(r as ErmRisk, "residual") === null).length,
    top: topRisks(rows as ErmRisk[], view, top).map((t) => ({ id: t.risk.id, title: t.risk.title, score: t.score })),
    heat: buildHeat(rows as ErmRisk[], view),
    risks: ranked,
  };
}
