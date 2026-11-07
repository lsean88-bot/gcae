import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { analyticsRuns, engagements, people } from "@/db/schema";
import { ANA_LABEL, benford, duplicates, profile, reconcile, type Row } from "@/lib/analytics";
import { MAX_UPLOAD_BYTES, parseUpload } from "@/lib/analytics-io";
import { uid } from "@/lib/format";
import { sha256 } from "@/lib/hash";
import { guardRecord, hiddenEngagementIds } from "@/server/access";
import { logEvent } from "@/server/authz";

/**
 * Analytics core. Pure of next/headers so UAT can call it with an explicit person.
 * Files are parsed in memory and are never stored or sent to a model: only the SHA-256, row count, parameters and result are saved.
 */
export type Who = { id: string; name: string; authority: string };
export type TestType = "profile" | "benford" | "duplicates" | "reconcile";
export const TEST_TYPES: TestType[] = ["profile", "benford", "duplicates", "reconcile"];
export type UploadFile = { name: string; bytes: Uint8Array; sheet?: string | null };
export type RunParams = { column?: string; keyCols?: string[]; keyCol?: string; amountCol?: string; keyColB?: string; amountColB?: string; tolerance?: number };

const RUNNERS = ["gcae", "manager", "auditor"];
const READERS = ["gcae", "manager", "auditor", "qa"];

export type RunView = {
  id: string; engagementId: string | null; engagementCode: string | null; testType: string; params: Record<string, unknown>;
  inputFilename: string; inputSha256: string; rowCount: number; result: Record<string, unknown>; createdBy: string; createdAt: string; label: string;
};
export type Out<T> = ({ ok: true } & T) | { ok: false; error: string };

export async function inspectUploadAs(who: Who, file: UploadFile): Promise<Out<{ headers: string[]; rowCount: number; sheetNames: string[]; sheet: string | null; sha256: string; preview: Row[] }>> {
  if (!RUNNERS.includes(who.authority)) return { ok: false, error: "Not permitted." };
  try {
    const p = await parseUpload(file.name, file.bytes, file.sheet);
    return { ok: true, headers: p.headers, rowCount: p.rows.length, sheetNames: p.sheetNames, sheet: p.sheet, sha256: sha256(file.bytes), preview: p.rows.slice(0, 5) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not read the file." };
  }
}

const lc = (s: unknown) => String(s ?? "").trim().toLowerCase();

export async function runAnalyticsAs(who: Who, input: { engagementId?: string | null; test: string; fileA: UploadFile; fileB?: UploadFile | null; params: RunParams }): Promise<Out<{ id: string; run: RunView }>> {
  if (!RUNNERS.includes(who.authority)) return { ok: false, error: "Analytics can be run by the GCAE, a manager or an auditor." };
  if (!TEST_TYPES.includes(input.test as TestType)) return { ok: false, error: "Unknown test." };
  const test = input.test as TestType;
  const engagementId = input.engagementId || null;
  if (engagementId) {
    const hidden = await guardRecord(who, { engagementId });
    if (hidden) return hidden;
    const [eng] = await db.select({ id: engagements.id }).from(engagements).where(eq(engagements.id, engagementId));
    if (!eng) return { ok: false, error: "Engagement not found." };
  }
  try {
    const a = await parseUpload(input.fileA.name, input.fileA.bytes, input.fileA.sheet);
    const p = input.params;
    const need = (headers: string[], cols: (string | undefined)[], side: string) => {
      for (const c of cols) if (!c || !headers.includes(lc(c))) throw new Error(`Column "${c ?? ""}" not found in ${side}.`);
    };
    let result: Record<string, unknown>;
    const params: Record<string, unknown> = { sheet: a.sheet };
    let rowCount = a.rows.length;
    if (test === "profile") {
      result = profile(a.rows);
    } else if (test === "benford") {
      need(a.headers, [p.column], "the file");
      params.column = lc(p.column);
      result = benford(a.rows.map((r) => r[lc(p.column)]));
    } else if (test === "duplicates") {
      const keyCols = (p.keyCols ?? []).map(lc);
      if (!keyCols.length) throw new Error("Choose at least one key column.");
      need(a.headers, keyCols, "the file");
      params.keyCols = keyCols;
      result = duplicates(a.rows, keyCols);
    } else {
      if (!input.fileB) throw new Error("Reconciliation needs a second file (B).");
      const b = await parseUpload(input.fileB.name, input.fileB.bytes, input.fileB.sheet);
      const keyCol = lc(p.keyCol), amountCol = lc(p.amountCol);
      const keyColB = lc(p.keyColB || p.keyCol), amountColB = lc(p.amountColB || p.amountCol);
      need(a.headers, [keyCol, amountCol], "file A");
      need(b.headers, [keyColB, amountColB], "file B");
      const tolerance = Number(p.tolerance ?? 0);
      const rowsB = b.rows.map((r) => ({ [keyCol]: r[keyColB], [amountCol]: r[amountColB] }));
      result = reconcile(a.rows, rowsB, keyCol, amountCol, tolerance);
      Object.assign(params, { keyCol, amountCol, keyColB, amountColB, tolerance, fileB: { filename: input.fileB.name, sha256: sha256(input.fileB.bytes), rowCount: b.rows.length, sheet: b.sheet } });
    }
    const id = uid("an");
    const row = {
      id, engagementId, testType: test, paramsJson: params, inputFilename: input.fileA.name, inputSha256: sha256(input.fileA.bytes),
      rowCount, resultJson: result, createdBy: who.id, createdAt: new Date().toISOString(),
    };
    await db.insert(analyticsRuns).values(row);
    const b = params.fileB as { filename: string; sha256: string } | undefined;
    await logEvent(who, "Ran analytics", "analytics", id, `${test} on "${row.inputFilename}" (${rowCount} rows, sha256 ${row.inputSha256.slice(0, 16)}…)${b ? ` against "${b.filename}" (sha256 ${b.sha256.slice(0, 16)}…)` : ""}. ${ANA_LABEL}.`, undefined, undefined, engagementId);
    const view = await getRunAs(who, id);
    if (!view) return { ok: false, error: "Run saved but could not be read back." };
    return { ok: true, id, run: view };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "The analysis failed." };
  }
}

function toView(r: typeof analyticsRuns.$inferSelect, names: Map<string, string>, codes: Map<string, string>): RunView {
  return {
    id: r.id, engagementId: r.engagementId, engagementCode: r.engagementId ? codes.get(r.engagementId) ?? null : null, testType: r.testType,
    params: r.paramsJson, inputFilename: r.inputFilename, inputSha256: r.inputSha256, rowCount: r.rowCount, result: r.resultJson,
    createdBy: names.get(r.createdBy) ?? r.createdBy, createdAt: r.createdAt, label: ANA_LABEL,
  };
}

/** Visible: runs of engagements the person can see, plus unlinked runs they created (an unlinked run is private to its creator). */
async function visibleRuns(who: Who) {
  if (!READERS.includes(who.authority)) return { rows: [] as (typeof analyticsRuns.$inferSelect)[], names: new Map<string, string>(), codes: new Map<string, string>() };
  const hidden = await hiddenEngagementIds(who);
  const all = await db.select().from(analyticsRuns).orderBy(desc(analyticsRuns.createdAt));
  const rows = all.filter((r) => (r.engagementId ? !hidden.has(r.engagementId) : r.createdBy === who.id));
  const ps = rows.length ? await db.select({ id: people.id, name: people.name }).from(people).where(inArray(people.id, [...new Set(rows.map((r) => r.createdBy))])) : [];
  const es = await db.select({ id: engagements.id, code: engagements.code }).from(engagements);
  return { rows, names: new Map(ps.map((p) => [p.id, p.name])), codes: new Map(es.map((e) => [e.id, e.code])) };
}

export async function listRunsAs(who: Who): Promise<RunView[]> {
  const v = await visibleRuns(who);
  return v.rows.map((r) => toView(r, v.names, v.codes));
}

export async function getRunAs(who: Who, id: string): Promise<RunView | null> {
  const v = await visibleRuns(who);
  const r = v.rows.find((x) => x.id === id);
  return r ? toView(r, v.names, v.codes) : null;
}

/** The only change a saved run allows: an unlinked run is linked to an engagement, once. Parameters, hash and result are never touched. */
export async function linkRunAs(who: Who, runId: string, engagementId: string): Promise<Out<{ message: string }>> {
  if (!RUNNERS.includes(who.authority)) return { ok: false, error: "Not permitted." };
  const run = await getRunAs(who, runId);
  if (!run) return { ok: false, error: "Not found." };
  if (run.engagementId) return { ok: false, error: "This run is already linked. Saved runs are read-only." };
  const hidden = await guardRecord(who, { engagementId });
  if (hidden) return hidden;
  const [eng] = await db.select({ id: engagements.id, code: engagements.code }).from(engagements).where(eq(engagements.id, engagementId));
  if (!eng) return { ok: false, error: "Engagement not found." };
  await db.update(analyticsRuns).set({ engagementId }).where(eq(analyticsRuns.id, runId));
  await logEvent(who, "Linked analytics run", "analytics", runId, `Linked ${run.testType} run on "${run.inputFilename}" to ${eng.code}. Run content unchanged.`, "unlinked", engagementId, engagementId);
  return { ok: true, message: `Linked to ${eng.code}.` };
}

export async function analyticsPageData() {
  const { getActor } = await import("@/lib/data");
  const actor = await getActor();
  const who: Who = { id: actor.id, name: actor.name, authority: actor.authority };
  const hidden = await hiddenEngagementIds(who);
  const eng = (await db.select({ id: engagements.id, code: engagements.code, title: engagements.title }).from(engagements)).filter((e) => !hidden.has(e.id));
  return { actor, engagements: eng, runs: await listRunsAs(who), maxMb: MAX_UPLOAD_BYTES / 1024 / 1024 };
}
