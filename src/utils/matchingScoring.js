export function scoreLineMatching(activity, matches = {}) {
  const total = activity.leftItems.length;
  const lineStates = {};
  const mistakes = [];
  let correctCount = 0;

  activity.leftItems.forEach((leftItem) => {
    const actual = matches[leftItem.id] || "";
    const expected = activity.correctPairs[leftItem.id];
    const accepted = Array.isArray(expected) ? expected : [expected].filter(Boolean);
    const correct = accepted.includes(actual);

    if (correct) {
      correctCount += 1;
    } else {
      mistakes.push(leftItem.id);
    }

    if (actual) {
      lineStates[leftItem.id] = correct ? "correct" : "incorrect";
    }
  });

  return {
    scorePercent: total ? Math.round((correctCount / total) * 100) : 0,
    correctCount,
    total,
    mistakes,
    revisionGuidance: activity.revisionGuidance || "Review the matching items before trying again.",
    lineStates,
  };
}
