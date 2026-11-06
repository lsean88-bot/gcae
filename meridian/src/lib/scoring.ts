import type { ImpactMap } from "@/db/schema";
import { bandFor } from "@/lib/methodology";

export function scoreImpacts(likelihood: number, impacts: ImpactMap) {
  const relevant = Object.entries(impacts).filter(([, cell]) => cell.relevant && cell.score > 0);
  if (!likelihood || relevant.length === 0) {
    return {
      highest: 0,
      highestDimension: "",
      score: 0,
      band: "Unscored",
      missingRationale: relevant.filter(([, cell]) => !cell.note.trim()).map(([id]) => id),
    };
  }
  const top = relevant.reduce((best, entry) => (entry[1].score > best[1].score ? entry : best));
  const score = likelihood * top[1].score;
  return {
    highest: top[1].score,
    highestDimension: top[0],
    score,
    band: bandFor(score),
    missingRationale: relevant.filter(([, cell]) => !cell.note.trim()).map(([id]) => id),
  };
}

export function emptyImpacts(): ImpactMap {
  const ids = ["financial", "operational", "compliance", "fraud", "technology", "customer", "strategic"];
  return Object.fromEntries(ids.map((id) => [id, { score: 0, note: "", relevant: false }]));
}

export function riskProduct(likelihood: number, impact: number) {
  return likelihood * impact;
}

export function appetitePosition(residual: number, tolerance: number) {
  if (residual > tolerance + 2) return "Outside";
  if (residual > tolerance) return "Approaching";
  return "Within";
}
