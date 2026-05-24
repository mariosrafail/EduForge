import { scoreLineMatching } from "./matchingScoring.js";

export function scoreGapFill(activity, answers = {}) {
  return activity.items.map((item) => ({
    id: item.id,
    correct: answers[item.id] === item.answer,
    expected: item.answer,
    actual: answers[item.id] || "",
  }));
}

export function scoreMatching(activity, answers = {}) {
  if (activity.type === "line-matching") {
    const score = scoreLineMatching(activity, answers);
    return activity.leftItems.map((leftItem) => ({
      id: leftItem.id,
      correct: score.lineStates[leftItem.id] === "correct",
      expected: activity.correctPairs[leftItem.id],
      actual: answers[leftItem.id] || "",
      guidance: score.revisionGuidance,
    }));
  }

  return activity.pairs.map((pair) => ({
    id: pair.id,
    correct: answers[pair.id] === pair.right,
    expected: pair.right,
    actual: answers[pair.id] || "",
  }));
}

export function scoreMultipleChoice(activity, answers = {}) {
  return activity.questions.map((question) => ({
    id: question.id,
    correct: answers[question.id] === question.answer,
    expected: question.answer,
    actual: answers[question.id] || "",
  }));
}

export function scoreWordSearch(activity, answers = {}) {
  return (activity.words || []).map((entry) => ({
    id: entry.id,
    correct: Boolean(answers[entry.id]),
    expected: true,
    actual: Boolean(answers[entry.id]),
  }));
}

export function scoreActivity(activity, answers = {}) {
  if (activity.type === "gap-fill") return scoreGapFill(activity, answers);
  if (activity.type === "matching" || activity.type === "line-matching") return scoreMatching(activity, answers);
  if (activity.type === "multiple-choice") return scoreMultipleChoice(activity, answers);
  if (activity.type === "word-search") return scoreWordSearch(activity, answers);
  return [];
}

export function scoreLesson(lesson, answersByActivity = {}) {
  const activityResults = lesson.activities.map((activity) => ({
    activityId: activity.id,
    type: activity.type,
    title: activity.title,
    results: scoreActivity(activity, answersByActivity[activity.id]),
  }));

  const total = activityResults.reduce((sum, activity) => sum + activity.results.length, 0);
  const correct = activityResults.reduce(
    (sum, activity) => sum + activity.results.filter((result) => result.correct).length,
    0,
  );

  return {
    total,
    correct,
    percent: total ? Math.round((correct / total) * 100) : 0,
    activityResults,
  };
}

export function getResultMap(score) {
  const map = {};
  score?.activityResults?.forEach((activity) => {
    map[activity.activityId] = Object.fromEntries(activity.results.map((result) => [result.id, result]));
  });
  return map;
}
