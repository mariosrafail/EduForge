export function buildScoredAssignmentResult({ activityKey, activityId = null, answers = {}, rows = [] } = {}) {
  const total = rows.length;
  const correct = rows.filter((row) => row.correct).length;
  return {
    activityKey,
    ...(activityId ? { activityId } : {}),
    score: total ? Math.round((correct / total) * 100) : null,
    answers: { ...answers },
  };
}
