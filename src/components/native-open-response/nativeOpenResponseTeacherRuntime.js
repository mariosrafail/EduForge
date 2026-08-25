export function updateNativeOpenResponseReveals(current, questionIds, commandType) {
  if (commandType === "reset-activity") return new Set();
  if (commandType === "show-all") return new Set(questionIds);
  if (commandType === "show-next") {
    const nextQuestionId = questionIds.find((questionId) => !current.has(questionId));
    return nextQuestionId ? new Set(current).add(nextQuestionId) : current;
  }
  return current;
}

export function nextNativeOpenResponseReveal(current, questionIds, panels) {
  const questionId = questionIds.find((candidate) => !current.has(candidate)) || null;
  return {
    questionId,
    panelIndex: questionId ? panels.findIndex((panel) => (panel.responseQuestionIds || panel.questionIds || []).includes(questionId)) : -1,
  };
}
