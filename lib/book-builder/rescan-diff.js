import { invalidateDecisions } from "./decisions.js";

export function diffDetectedFacts(previousFacts = [], nextFacts = []) {
  const previous = new Map(previousFacts.map((fact) => [fact.id, fact]));
  const next = new Map(nextFacts.map((fact) => [fact.id, fact]));
  const result = { added: [], changed: [], removed: [], unchanged: [] };
  for (const [id, fact] of next) {
    const oldFact = previous.get(id);
    if (!oldFact) result.added.push(fact);
    else if (oldFact.evidenceHash !== fact.evidenceHash) result.changed.push({ id, before: oldFact, after: fact });
    else result.unchanged.push(fact);
  }
  for (const [id, fact] of previous) if (!next.has(id)) result.removed.push(fact);
  for (const key of Object.keys(result)) result[key].sort((left, right) => (left.id || left.after.id).localeCompare(right.id || right.after.id));
  return result;
}

export function applyRescan({ previousFacts = [], nextFacts = [], approvedDecisions = [] }) {
  const diff = diffDetectedFacts(previousFacts, nextFacts);
  const decisions = invalidateDecisions(approvedDecisions, nextFacts);
  return {
    facts: [...nextFacts].sort((left, right) => left.id.localeCompare(right.id)),
    decisions,
    diff,
    staleDecisionIds: decisions.filter((decision) => decision.stale).map((decision) => decision.id).sort(),
  };
}
