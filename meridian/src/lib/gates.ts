export type GateInput = {
  stage: number;
  objective: string;
  scope: string;
  period: string;
  evidenceCount: number;
  materialityApproved: boolean;
  testCount: number;
  openExceptionTests: number;
  linkedExceptionFindings: number;
  materialTestsWithoutQa: number;
};

export function gateBlockers(input: GateInput) {
  const missing: string[] = [];
  if (!input.objective.trim() || !input.scope.trim() || !input.period.trim()) {
    missing.push("Objective, scope, and period must be recorded before the engagement can move.");
  }
  if (input.stage === 1 && input.evidenceCount === 0) {
    missing.push("Register evidence, with source, custodian, and hash, before moving to evidence intelligence.");
  }
  if (input.stage === 2 && input.evidenceCount === 0) {
    missing.push("The evidence register is empty.");
  }
  if (input.stage >= 3 && !input.materialityApproved) {
    missing.push("The GCAE has not approved materiality and the exception thresholds.");
  }
  if (input.stage === 4 && input.testCount === 0) {
    missing.push("Run at least one approved procedure and keep the workpaper.");
  }
  if (input.stage === 5 && input.openExceptionTests > input.linkedExceptionFindings) {
    missing.push("Every exception test needs a linked finding, or a documented false-positive note. Gaps cannot be dropped.");
  }
  if (input.stage === 6 && input.materialTestsWithoutQa > 0) {
    missing.push("Independent QA has not re-performed every material test.");
  }
  if (input.stage >= 7) {
    missing.push("Stage 7 is the last stage. Issuance is a separate GCAE decision, not an automatic advance.");
  }
  return missing;
}

export function canAdvance(input: GateInput) {
  if (input.stage >= 7 || input.stage < 1) return false;
  return gateBlockers(input).length === 0;
}
