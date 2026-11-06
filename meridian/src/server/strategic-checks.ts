import { and, eq, inArray } from "drizzle-orm";
import ExcelJS from "exceljs";
import { db, pool } from "@/db";
import { acPacks, actions, auditPlans, engagements, findings, people, planItems, risks } from "@/db/schema";
import { snapshotHash } from "@/lib/ac-pack";
import { buildPackWorkbook } from "@/lib/ac-pack-xlsx";
import { NOT_ASSESSED, buildHeat, residualLabel, type ErmRisk } from "@/lib/erm";
import type { PackSnapshot } from "@/lib/ac-pack";
import { DEFAULT_WEIGHTS, capacityCheck, rankEntities } from "@/lib/plan-scoring";
import { denyAuthority } from "@/lib/guard";
import { approvePlan, addPlanItem, assessResidual, createPlan, generatePack, recordAcNoted, releasePack, updateItemProgress, updatePlanItem, updatePlanSettings, type Who } from "@/server/strategic-core";

export type StrategicCase = { id: string; name: string; pass: boolean; evidence: string };

/** T-46 onward: ERM heat map, annual plan and Audit Committee pack. Uses fixtures with the prefix "uat-strat" and removes them afterwards. */
export async function strategicChecks(): Promise<StrategicCase[]> {
  const cases: StrategicCase[] = [];
  const check = (id: string, name: string, pass: boolean, evidence: string) => cases.push({ id, name, pass, evidence });
  const rows = await db.select().from(people);
  const as = (id: string) => rows.find((p) => p.id === id) as unknown as Who;
  const gcae = as("p-gcae"), mgr = as("p-mgr"), aud = as("p-aud1"), owner = as("p-own1"), cfo = as("p-cfo");
  const RID = "eng-uat-strat-r";
  const year = 2098;
  const cleanup = async () => {
    const plans = await db.select().from(auditPlans).where(eq(auditPlans.year, year));
    const ids = plans.map((p) => p.id);
    if (ids.length) {
      await db.delete(planItems).where(inArray(planItems.planId, ids));
      await db.delete(auditPlans).where(inArray(auditPlans.id, ids));
    }
    // Draft packs are removed. A released pack cannot be deleted (database trigger), so at most one released UAT pack (period 2098) is kept and reused.
    await db.delete(acPacks).where(and(eq(acPacks.periodFrom, `${year}-01-01`), eq(acPacks.status, "Draft")));
    await db.delete(actions).where(eq(actions.id, "act-uat-strat"));
    await db.delete(findings).where(eq(findings.id, "f-uat-strat"));
    await db.delete(engagements).where(eq(engagements.id, RID));
    await db.delete(risks).where(eq(risks.id, "r-uat-strat"));
  };
  await cleanup();
  try {
    // T-46 plan scoring: known inputs, known ranking
    const ranked = rankEntities([
      { entityId: "A", name: "A", risks: [{ inherent: 20, residual: 9 }, { inherent: 4, residual: null }], lastAuditDate: "2024-01-01", mandatory: false },
      { entityId: "B", name: "B", risks: [{ inherent: 25, residual: null }], lastAuditDate: null, mandatory: false },
      { entityId: "C", name: "C", risks: [], lastAuditDate: "2025-01-01", mandatory: true },
    ], DEFAULT_WEIGHTS, "2026-01-01");
    const [rb, ra, rc] = ranked;
    check("T-46", "Plan scoring ranks known inputs: B 80, A 30, C 26; residual beats inherent; never audited = 100", ranked.map((r) => r.entityId).join("") === "BAC" && rb.score === 80 && ra.score === 30 && rc.score === 26 && ra.riskScore === 9 && ra.riskBasis === "residual" && rb.riskBasis === "inherent" && rb.yearsSince === null, ranked.map((r) => `${r.entityId}=${r.score}`).join(" "));

    // T-47 capacity
    const over = capacityCheck([{ budgetDays: 40, status: "Planned" }, { budgetDays: 30, status: "In progress" }, { budgetDays: 20, status: "Deferred" }], 60);
    const fits = capacityCheck([{ budgetDays: 40, status: "Planned" }, { budgetDays: 30, status: "In progress" }, { budgetDays: 20, status: "Cancelled" }], 70);
    check("T-47", "Capacity check flags over-allocation and ignores deferred and cancelled days", over.over && over.allocated === 70 && over.delta === 10 && !fits.over, `over=${over.over} allocated=${over.allocated} delta=${over.delta}; exact fit over=${fits.over}`);

    // Fixtures: a restricted engagement with an overdue finding and action, and a risk with no residual assessment
    const [srcEng] = await db.select().from(engagements);
    const [srcFinding] = await db.select().from(findings);
    const [srcAction] = await db.select().from(actions);
    await db.insert(engagements).values({ ...srcEng, id: RID, code: "UAT-STRAT-SECRET-CODE", title: "UAT-STRAT-SECRET-TITLE", restricted: true, allowExternalModel: false, status: "Issued", issuedAt: `${year}-06-01`, gcaeApproved: true });
    await db.insert(findings).values({ ...srcFinding, id: "f-uat-strat", code: "F-UAT-STRAT-SECRET", engagementId: RID, status: "Agreed" });
    await db.insert(actions).values({ ...srcAction, id: "act-uat-strat", engagementId: RID, findingId: "f-uat-strat", agreedAction: "UAT-STRAT-SECRET-ACTION", status: "In progress", originalDue: "2020-01-01", revisedDue: null });
    await db.insert(risks).values({ id: "r-uat-strat", title: "UAT strat risk", category: "Financial", statement: "fixture", entityId: "ent-ap", inherentLikelihood: 3, inherentImpact: 3, residualLikelihood: null, residualImpact: null, appetite: "Within", treatment: "Mitigate", ownerId: "p-own1", velocity: "Slow", linkedControlIds: "" });

    // T-48 approved plan: an edit creates a new version, never changes the approved one
    const created = await createPlan(mgr, year, 100);
    const planId = created.ok ? created.id! : "";
    const itemA = await addPlanItem(mgr, planId, { entityId: "ent-ap", title: "UAT item A", quarter: "Q1", budgetDays: 30, rationale: "fixture", mandatory: false });
    const managerLink = await addPlanItem(mgr, planId, { entityId: "ent-ap", title: "UAT link", quarter: "Q2", budgetDays: 5, rationale: "fixture", mandatory: false, engagementId: RID });
    const gcaeLink = await addPlanItem(gcae, planId, { entityId: "ent-ap", title: "UAT-STRAT-SECRET-PLANITEM", quarter: "Q3", budgetDays: 10, rationale: "fixture", mandatory: false, engagementId: RID });
    const gcaeLink2 = await addPlanItem(gcae, planId, { entityId: "ent-ap", title: "UAT-STRAT-SECRET-PLANITEM2", quarter: "Q4", budgetDays: 5, rationale: "fixture", mandatory: false, engagementId: RID });
    const approvedOk = await approvePlan(gcae, planId, false);
    const v1Items = await db.select().from(planItems).where(eq(planItems.planId, planId));
    const deferItem = v1Items.find((i) => i.title === "UAT-STRAT-SECRET-PLANITEM");
    const cancelItem = v1Items.find((i) => i.title === "UAT-STRAT-SECRET-PLANITEM2");
    const deferred = deferItem ? await updateItemProgress(gcae, deferItem.id, "Deferred", "UAT-STRAT-SECRET-REASON-D", RID) : { ok: false as const, error: "none" };
    const cancelled = cancelItem ? await updateItemProgress(gcae, cancelItem.id, "Cancelled", "UAT-STRAT-SECRET-REASON-C", RID) : { ok: false as const, error: "none" };
    const a1 = v1Items.find((i) => i.title === "UAT item A");
    const edit = a1 ? await updatePlanItem(mgr, planId, a1.id, { budgetDays: 45 }) : { ok: false as const, error: "no item" };
    const newId = edit.ok ? edit.id! : "";
    const [v1] = await db.select().from(auditPlans).where(eq(auditPlans.id, planId));
    const [v2] = newId ? await db.select().from(auditPlans).where(eq(auditPlans.id, newId)) : [];
    const v1After = await db.select().from(planItems).where(eq(planItems.planId, planId));
    const v2Items = newId ? await db.select().from(planItems).where(eq(planItems.planId, newId)) : [];
    check("T-48", "Editing an approved plan creates a new Draft version that supersedes it; the approved version is unchanged", approvedOk.ok && Boolean(v2) && newId !== planId && v2.version === 2 && v2.status === "Draft" && v2.supersedesId === planId && v1.status === "Approved by GCAE" && v1After.find((i) => i.title === "UAT item A")?.budgetDays === 30 && v2Items.find((i) => i.title === "UAT item A")?.budgetDays === 45 && v1.weights.approved === true, `v1=${v1?.status} v2=${v2?.status} v${v2?.version} v1 days=${v1After.find((i) => i.title === "UAT item A")?.budgetDays} v2 days=${v2Items.find((i) => i.title === "UAT item A")?.budgetDays}`);

    // T-49 only the GCAE approves a plan, sets weights, records AC noting, or releases a pack
    const [packG] = [await generatePack(gcae, `${year}-01-01`, `${year}-12-31`)];
    const packGId = packG.ok ? packG.id! : "";
    const draftForApprove = await approvePlan(mgr, newId, true);
    const refusals = await Promise.all([
      approvePlan(mgr, newId, true), approvePlan(aud, newId, true), approvePlan(cfo, newId, true),
      releasePack(mgr, packGId), releasePack(aud, packGId), releasePack(cfo, packGId), releasePack(owner, packGId),
      recordAcNoted(mgr, planId, "2098-03-01", "MIN-1"), updatePlanSettings(mgr, newId, 100, { risk: 1, age: 1, mandatory: 1 }),
    ]);
    const stillDraft = (await db.select().from(auditPlans).where(eq(auditPlans.id, newId)))[0]?.status === "Draft";
    const stillUnreleased = (await db.select().from(acPacks).where(eq(acPacks.id, packGId)))[0]?.status === "Draft";
    check("T-49", "Non-GCAE roles cannot approve a plan, set weights, record AC noting or release a pack", draftForApprove.ok === false && refusals.every((r) => r.ok === false) && stillDraft && stillUnreleased && denyAuthority("manager", ["gcae"], "x") !== null, `refused=${refusals.filter((r) => !r.ok).length}/${refusals.length} draft kept=${stillDraft} pack kept=${stillUnreleased}`);

    // T-50 restricted engagement never named; snapshot generated by GCAE only for release
    const packM = await generatePack(mgr, `${year}-01-01`, `${year}-12-31`);
    const packMId = packM.ok ? packM.id! : "";
    const snapG = JSON.stringify((await db.select().from(acPacks).where(eq(acPacks.id, packGId)))[0]?.snapshot);
    const snapM = JSON.stringify((await db.select().from(acPacks).where(eq(acPacks.id, packMId)))[0]?.snapshot);
    const secrets = ["UAT-STRAT-SECRET-CODE", "UAT-STRAT-SECRET-TITLE", "F-UAT-STRAT-SECRET", "UAT-STRAT-SECRET-ACTION", "UAT-STRAT-SECRET-PLANITEM", "UAT-STRAT-SECRET-PLANITEM2", "UAT-STRAT-SECRET-REASON-D", "UAT-STRAT-SECRET-REASON-C", RID];
    const leaksG = secrets.filter((s) => snapG.includes(s));
    const leaksM = secrets.filter((s) => snapM.includes(s));
    const relMgrPack = await releasePack(gcae, packMId);
    // Excel built from the manager-generated snapshot, read cell by cell (the file itself is zipped)
    const [mRow] = await db.select().from(acPacks).where(eq(acPacks.id, packMId));
    const wbBuf = await buildPackWorkbook(mRow, mRow.snapshot as unknown as PackSnapshot);
    const wbRead = new ExcelJS.Workbook();
    await wbRead.xlsx.load(wbBuf as ArrayBuffer);
    let sheetText = "";
    wbRead.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => { sheetText += ` ${String(c.value ?? "")}`; })));
    const leaksX = secrets.filter((x) => sheetText.includes(x));
    const dcRows = (JSON.parse(snapM) as PackSnapshot).plan?.deferredCancelled ?? [];
    const dcStatuses = dcRows.map((d) => d.status).sort().join(",");
    check("T-50", "A restricted engagement is never named in a pack: the GCAE pack shows only the count, a manager pack not even that; a manager cannot link a plan item to it; a manager-generated pack cannot be released", leaksG.length === 0 && leaksM.length === 0 && leaksX.length === 0 && deferred.ok && cancelled.ok && gcaeLink2.ok && dcStatuses === "Cancelled,Deferred" && snapG.includes("restricted engagement(s) — reported to the AC Chair separately") && !snapM.includes("restricted engagement(s)") && managerLink.ok === false && gcaeLink.ok === true && relMgrPack.ok === false && /generated by a manager/.test(relMgrPack.ok ? "" : relMgrPack.error), `leaks gcae=${leaksG.length} manager=${leaksM.length} excel=${leaksX.length}; restricted deferred+cancelled rows kept masked=${dcStatuses}; manager link refused=${!managerLink.ok}; manager pack release refused=${!relMgrPack.ok}`);

    // T-51 frozen pack: hash unchanged after data change
    // Reuse the one released UAT pack from an earlier run if there is one; otherwise release this run's draft.
    const [kept] = await db.select().from(acPacks).where(and(eq(acPacks.periodFrom, `${year}-01-01`), eq(acPacks.status, "Released")));
    const released = kept ? ({ ok: true } as const) : await releasePack(gcae, packGId);
    const frozenId = kept ? kept.id : packGId;
    const [before] = await db.select().from(acPacks).where(eq(acPacks.id, frozenId));
    await db.update(risks).set({ residualLikelihood: 5, residualImpact: 5, residualRationale: "uat", residualAssessedBy: "p-gcae", residualAssessedAt: "2099-01-01" }).where(eq(risks.id, "r-uat-strat"));
    await db.update(actions).set({ status: "Closed" }).where(eq(actions.id, "act-uat-strat"));
    const [after] = await db.select().from(acPacks).where(eq(acPacks.id, frozenId));
    const fresh = await generatePack(gcae, `${year}-01-01`, `${year}-12-31`);
    const freshHash = fresh.ok ? fresh.hash : "";
    check("T-51", "A released pack keeps its snapshot and hash after the data changes; a new pack reflects the change", released.ok && before.status === "Released" && after.snapshotHash === before.snapshotHash && snapshotHash(after.snapshot) === before.snapshotHash && JSON.stringify(after.snapshot) === JSON.stringify(before.snapshot) && freshHash !== before.snapshotHash, `hash ${before.snapshotHash.slice(0, 12)} unchanged=${after.snapshotHash === before.snapshotHash}; new pack hash differs=${freshHash !== before.snapshotHash}`);

    // T-52 heat map counts match the risk rows; unassessed residuals are separate
    await db.update(risks).set({ residualLikelihood: null, residualImpact: null, residualRationale: null }).where(eq(risks.id, "r-uat-strat"));
    const all = (await db.select().from(risks)) as unknown as ErmRisk[];
    const inh = buildHeat(all, "inherent");
    const res = buildHeat(all, "residual");
    const cellTotal = (h: ReturnType<typeof buildHeat>) => Object.values(h.cells).reduce((n, ids) => n + ids.length, 0);
    const cellsMatch = all.every((r) => inh.cells[`${r.inherentLikelihood}-${r.inherentImpact}`].includes(r.id) && (r.residualLikelihood == null ? res.notAssessed.includes(r.id) : res.cells[`${r.residualLikelihood}-${r.residualImpact}`].includes(r.id)));
    check("T-52", "Heat-map cell counts equal the risk rows; bands sum to the plotted risks; a null residual is not plotted", cellsMatch && cellTotal(inh) === all.length && cellTotal(res) + res.notAssessed.length === all.length && Object.values(res.bands).reduce((a, b) => a + b, 0) === cellTotal(res) && res.notAssessed.includes("r-uat-strat") && !Object.values(res.cells).flat().includes("r-uat-strat"), `risks=${all.length} inherent plotted=${cellTotal(inh)} residual plotted=${cellTotal(res)} not assessed=${res.notAssessed.length}`);

    // T-53 residual not assessed is shown, never guessed; who may assess
    const [nullRisk] = await db.select().from(risks).where(eq(risks.id, "r-uat-strat"));
    const byAud = await assessResidual(aud, "r-uat-strat", 2, 2, "x");
    const bad = await assessResidual(mgr, "r-uat-strat", 9, 2, "x");
    const noWhy = await assessResidual(mgr, "r-uat-strat", 2, 2, " ");
    const byOwner = await assessResidual(owner, "r-uat-strat", 2, 3, "Dual approval is operating.");
    const [saved] = await db.select().from(risks).where(eq(risks.id, "r-uat-strat"));
    check("T-53", "Null residual shows as not assessed; only the risk owner, a manager or the GCAE can assess; scores 1-5 and a rationale are required", residualLabel({ residualLikelihood: null, residualImpact: null }) === NOT_ASSESSED && residualLabel({ residualLikelihood: 2, residualImpact: 3 }) === "L2 x I3 = 6" && residualLabel(nullRisk) === NOT_ASSESSED && byAud.ok === false && bad.ok === false && noWhy.ok === false && byOwner.ok === true && saved.residualLikelihood === 2 && saved.residualImpact === 3 && saved.residualAssessedBy === "p-own1", `auditor refused=${!byAud.ok} out-of-range refused=${!bad.ok} no rationale refused=${!noWhy.ok} owner saved=${byOwner.ok}`);

    // T-54 a released pack is frozen in the database: no UPDATE, no DELETE; the Draft to Released update was allowed above
    const tryWrite = (sql: string, args: unknown[]) => pool.query(sql, args).then(() => false, () => true);
    const updBlocked = await tryWrite("UPDATE ac_packs SET snapshot_hash = $1 WHERE id = $2", ["tampered", frozenId]);
    const updStatusBlocked = await tryWrite("UPDATE ac_packs SET status = 'Draft' WHERE id = $1", [frozenId]);
    const delBlocked = await tryWrite("DELETE FROM ac_packs WHERE id = $1", [frozenId]);
    const draftEdit = await pool.query("UPDATE ac_packs SET snapshot_hash = snapshot_hash WHERE id = $1", [packMId]).then(() => true, () => false);
    // Draft -> Released must stay allowed: proven on a throwaway copy inside a transaction that is rolled back.
    const client = await pool.connect();
    let draftToReleased = false;
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO ac_packs SELECT 'pack-uat-rollback', period_from, period_to, 'Draft', generated_by, generated_by_authority, generated_at, snapshot, snapshot_hash, NULL, NULL FROM ac_packs WHERE id = $1", [packMId]);
      draftToReleased = (await client.query("UPDATE ac_packs SET status = 'Released', released_by = 'p-gcae', released_at = 'x' WHERE id = 'pack-uat-rollback'")).rowCount === 1;
    } catch {
      draftToReleased = false;
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
    const [stillThere] = await db.select().from(acPacks).where(eq(acPacks.id, frozenId));
    check("T-54", "Database trigger blocks UPDATE and DELETE of a released pack; a Draft stays editable and Draft to Released was allowed", released.ok && updBlocked && updStatusBlocked && delBlocked && draftEdit && draftToReleased && stillThere?.status === "Released" && stillThere.snapshotHash === before.snapshotHash, `update blocked=${updBlocked} status change blocked=${updStatusBlocked} delete blocked=${delBlocked} draft editable=${draftEdit} draft to released allowed (rolled back)=${draftToReleased}`);

    // T-55 approving a newer version marks the earlier approved version Superseded; a superseded version cannot be edited
    const approveV2 = await approvePlan(gcae, newId, true);
    const [v1b] = await db.select().from(auditPlans).where(eq(auditPlans.id, planId));
    const [v2b] = await db.select().from(auditPlans).where(eq(auditPlans.id, newId));
    const editOld = a1 ? await updatePlanItem(mgr, planId, a1.id, { budgetDays: 99 }) : { ok: true as const };
    const progressOld = deferItem ? await updateItemProgress(gcae, deferItem.id, "Planned", "", null) : { ok: true as const };
    check("T-55", "Approving a newer plan version marks the earlier one Superseded; a superseded version refuses edits and progress", approveV2.ok && v1b.status === "Superseded" && v2b.status === "Approved by GCAE" && editOld.ok === false && progressOld.ok === false, `v1=${v1b?.status} v2=${v2b?.status} edit refused=${!editOld.ok} progress refused=${!progressOld.ok}`);
  } finally {
    await cleanup();
  }
  return cases;
}
