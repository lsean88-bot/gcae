import { bandFor } from "@/lib/methodology";

export type ErmRisk = {
  id: string;
  title: string;
  category: string;
  entityId: string | null;
  ownerId: string;
  inherentLikelihood: number;
  inherentImpact: number;
  residualLikelihood: number | null;
  residualImpact: number | null;
  linkedControlIds: string;
};

export type RiskView = "inherent" | "residual";
export const BANDS = ["Critical", "High", "Medium", "Low"] as const;

/** Score for the chosen view. Null means "residual not assessed": the app never fills a residual in. */
export function viewScore(risk: ErmRisk, view: RiskView): number | null {
  if (view === "inherent") return risk.inherentLikelihood * risk.inherentImpact;
  if (risk.residualLikelihood == null || risk.residualImpact == null) return null;
  return risk.residualLikelihood * risk.residualImpact;
}

export function viewPosition(risk: ErmRisk, view: RiskView): { l: number; i: number } | null {
  if (view === "inherent") return { l: risk.inherentLikelihood, i: risk.inherentImpact };
  if (risk.residualLikelihood == null || risk.residualImpact == null) return null;
  return { l: risk.residualLikelihood, i: risk.residualImpact };
}

/** 5x5 grid keyed "L-I". Every risk lands in exactly one cell, or in notAssessed (residual view only). */
export function buildHeat(risks: ErmRisk[], view: RiskView) {
  const cells: Record<string, string[]> = {};
  for (let l = 1; l <= 5; l += 1) for (let i = 1; i <= 5; i += 1) cells[`${l}-${i}`] = [];
  const notAssessed: string[] = [];
  const bands: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  for (const risk of risks) {
    const pos = viewPosition(risk, view);
    if (!pos) {
      notAssessed.push(risk.id);
      continue;
    }
    cells[`${pos.l}-${pos.i}`].push(risk.id);
    bands[bandFor(pos.l * pos.i)] += 1;
  }
  return { cells, notAssessed, bands };
}

/** Highest score first. Ties broken by title so the order is stable. Unassessed residuals are not ranked. */
export function topRisks<T extends ErmRisk>(risks: T[], view: RiskView, n = 10) {
  return risks
    .map((risk) => ({ risk, score: viewScore(risk, view) }))
    .filter((row): row is { risk: T; score: number } => row.score !== null)
    .sort((a, b) => b.score - a.score || a.risk.title.localeCompare(b.risk.title))
    .slice(0, n);
}

/** A risk has a usable control link only if at least one listed id exists in the controls table. */
export function risksWithoutControl<T extends ErmRisk>(risks: T[], controlIds: Set<string>) {
  return risks.filter((risk) => !risk.linkedControlIds.split(",").map((id) => id.trim()).filter(Boolean).some((id) => controlIds.has(id)));
}

export const NOT_ASSESSED = "Residual not assessed";
/** What the screens print for a residual score. A null residual is stated, never guessed or shown as zero. */
export function residualLabel(risk: Pick<ErmRisk, "residualLikelihood" | "residualImpact">): string {
  if (risk.residualLikelihood == null || risk.residualImpact == null) return NOT_ASSESSED;
  return `L${risk.residualLikelihood} x I${risk.residualImpact} = ${risk.residualLikelihood * risk.residualImpact}`;
}
