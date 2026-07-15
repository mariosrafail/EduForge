export function classifyQaCleanupState(actualEntries, expectedEntries, deterministicRootCount) {
  const actual = new Set(actualEntries);
  const expected = new Set(expectedEntries);
  if (!actual.size && Number(deterministicRootCount) === 0) return "already-clean";
  if (actual.size !== expected.size || [...actual].some((entry) => !expected.has(entry))) {
    throw new Error("QA registry does not exactly match the expected staging seed");
  }
  if (Number(deterministicRootCount) === 0) {
    throw new Error("QA registry exists but deterministic QA roots are missing");
  }
  return "ready";
}
