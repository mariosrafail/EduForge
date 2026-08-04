import { sortJsonValue } from "./stable-json.js";

export const DECISION_STATES = new Set(["approved", "draft"]);

export function normalizeApprovedDecisions(decisions = [], facts = []) {
  const factsById = new Map(facts.map((fact) => [fact.id, fact]));
  const ids = new Set();
  return decisions.map((decision) => {
    if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(String(decision.id || ""))) throw new Error("Decision IDs must be safe identifiers");
    if (ids.has(decision.id)) throw new Error(`Duplicate approved decision: ${decision.id}`);
    ids.add(decision.id);
    if (!decision.kind || typeof decision.kind !== "string") throw new Error(`Decision ${decision.id} requires a kind`);
    if (!DECISION_STATES.has(decision.approvalState)) throw new Error(`Decision ${decision.id} has an invalid approval state`);
    const dependencyFactIds = [...new Set(decision.dependencyFactIds || [])].sort();
    const dependencyEvidenceHashes = {};
    for (const factId of dependencyFactIds) {
      const supplied = decision.dependencyEvidenceHashes?.[factId];
      const current = factsById.get(factId)?.evidenceHash;
      if (!supplied && !current) throw new Error(`Decision ${decision.id} has no evidence hash for ${factId}`);
      dependencyEvidenceHashes[factId] = supplied || current;
    }
    return {
      id: decision.id,
      kind: decision.kind,
      value: sortJsonValue(decision.value),
      dependencyFactIds,
      dependencyEvidenceHashes,
      approvalState: decision.approvalState,
      stale: Boolean(decision.stale),
      staleReasons: [...new Set(decision.staleReasons || [])].map(String).sort(),
      editorNote: String(decision.editorNote || ""),
      createdAt: decision.createdAt,
      updatedAt: decision.updatedAt,
    };
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
