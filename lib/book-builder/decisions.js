import { DECISION_APPROVAL_STATES, normalizeDecision } from "./decision-contracts.js";

export const DECISION_STATES = DECISION_APPROVAL_STATES;

export function normalizeApprovedDecisions(decisions = [], facts = []) {
  const ids = new Set();
  return decisions.map((decision) => {
    const normalized = normalizeDecision(decision, facts);
    if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(String(normalized.id || ""))) throw new Error("Decision IDs must be safe identifiers");
    if (ids.has(normalized.id)) throw new Error(`Duplicate approved decision: ${normalized.id}`);
    ids.add(normalized.id);
    return normalized;
  }).sort((left, right) => left.id.localeCompare(right.id));
}
export function invalidateDecisions(decisions, nextFacts) {
  const nextById = new Map(nextFacts.map((fact) => [fact.id, fact]));
  return decisions.map((decision) => {
    const staleReasons = new Set(decision.staleReasons || []);
    for (const factId of decision.dependencyFactIds || []) {
      const fact = nextById.get(factId);
      if (!fact) staleReasons.add(`dependency_removed:${factId}`);
      else if (fact.evidenceHash !== decision.dependencyEvidenceHashes?.[factId]) staleReasons.add(`dependency_changed:${factId}`);
    }
    return {
      ...decision,
      stale: Boolean(decision.stale) || staleReasons.size > 0,
      staleReasons: [...staleReasons].sort(),
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
}
