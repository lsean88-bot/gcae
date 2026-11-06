import { bandFor } from "@/lib/methodology";

/**
 * Proposed planning weights. They are NOT approved. The GCAE edits and approves them on the plan.
 * Score = (w.risk*riskFactor + w.age*ageFactor + w.mandatory*mandatoryFactor) / (w.risk + w.age + w.mandatory), each factor 0..100.
 *  riskFactor     = highest linked risk score (residual if assessed, else inherent) / 25 * 100
 *  ageFactor      = years since last audit, capped at AGE_CAP_YEARS, / AGE_CAP_YEARS * 100. Never audited = 100.
 *  mandatoryFactor= 100 if the entity is flagged mandatory, else 0
 */
export type PlanWeights = { risk: number; age: number; mandatory: number; approved: boolean };
export const DEFAULT_WEIGHTS: PlanWeights = { risk: 50, age: 30, mandatory: 20, approved: false };
export const AGE_CAP_YEARS = 5;

export type EntityInput = {
  entityId: string;
  name: string;
  risks: { inherent: number; residual: number | null }[];
  lastAuditDate: string | null;
  mandatory: boolean;
};

export type RankedEntity = {
  entityId: string;
  name: string;
  score: number;
  riskScore: number | null;
  riskBasis: "residual" | "inherent" | "none";
  riskBand: string;
  yearsSince: number | null;
  mandatory: boolean;
  riskFactor: number;
  ageFactor: number;
  mandatoryFactor: number;
};

export function validWeights(w: PlanWeights): string | null {
  const parts = [w.risk, w.age, w.mandatory];
  if (parts.some((p) => !Number.isFinite(p) || p < 0 || p > 100)) return "Each weight must be a number from 0 to 100.";
  if (parts.reduce((a, b) => a + b, 0) <= 0) return "At least one weight must be above zero.";
  return null;
}

export function yearsSince(lastAudit: string | null, asOf: string): number | null {
  if (!lastAudit) return null;
  const ms = Date.parse(asOf.slice(0, 10)) - Date.parse(lastAudit.slice(0, 10));
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, ms / (365.25 * 86_400_000));
}

/** Pure ranking. Highest score first. Ties: mandatory, then higher risk, then entity id. */
export function rankEntities(entities: EntityInput[], weights: PlanWeights, asOf: string): RankedEntity[] {
  const total = weights.risk + weights.age + weights.mandatory;
  const rows = entities.map((entity): RankedEntity => {
    // Per linked risk, the residual counts if assessed; the entity takes the highest of those.
    const scores = entity.risks.map((r) => ({ score: r.residual ?? r.inherent, basis: r.residual != null ? ("residual" as const) : ("inherent" as const) }));
    const top = scores.reduce<{ score: number; basis: "residual" | "inherent" } | null>((best, s) => (!best || s.score > best.score ? s : best), null);
    const riskFactor = top ? (top.score / 25) * 100 : 0;
    const years = yearsSince(entity.lastAuditDate, asOf);
    const ageFactor = years === null ? 100 : (Math.min(years, AGE_CAP_YEARS) / AGE_CAP_YEARS) * 100;
    const mandatoryFactor = entity.mandatory ? 100 : 0;
    const score = (weights.risk * riskFactor + weights.age * ageFactor + weights.mandatory * mandatoryFactor) / total;
    return {
      entityId: entity.entityId,
      name: entity.name,
      score: Math.round(score * 10) / 10,
      riskScore: top ? top.score : null,
      riskBasis: top ? top.basis : "none",
      riskBand: top ? bandFor(top.score) : "Unscored",
      yearsSince: years === null ? null : Math.round(years * 10) / 10,
      mandatory: entity.mandatory,
      riskFactor,
      ageFactor,
      mandatoryFactor,
    };
  });
  return rows.sort((a, b) => b.score - a.score || Number(b.mandatory) - Number(a.mandatory) || (b.riskScore ?? 0) - (a.riskScore ?? 0) || a.entityId.localeCompare(b.entityId));
}

type CapItem = { budgetDays: number; status: string };
/** Deferred and cancelled items do not use capacity. */
export function capacityCheck(items: CapItem[], capacityDays: number) {
  const allocated = items.filter((i) => i.status !== "Deferred" && i.status !== "Cancelled").reduce((sum, i) => sum + i.budgetDays, 0);
  return { allocated, capacity: capacityDays, over: allocated > capacityDays, delta: allocated - capacityDays };
}

export const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;
export const ITEM_STATUSES = ["Planned", "In progress", "Completed", "Deferred", "Cancelled"] as const;

export function progressByQuarter(items: { quarter: string; status: string }[]) {
  const out: Record<string, Record<string, number>> = {};
  for (const q of QUARTERS) out[q] = { total: 0, Planned: 0, "In progress": 0, Completed: 0, Deferred: 0, Cancelled: 0 };
  for (const item of items) {
    const row = out[item.quarter];
    if (!row) continue;
    row.total += 1;
    row[item.status] = (row[item.status] ?? 0) + 1;
  }
  return out;
}
