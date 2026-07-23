export function normalizePresentationAnswer(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, "\"")
    .replace(/,/g, "")
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ");
}

export function verifiedSolutionQuestionIds(solution) {
  return Object.values(solution?.questions || {})
    .filter((question) => Array.isArray(question.acceptedAnswers) && question.acceptedAnswers.length > 0)
    .map((question) => question.questionId);
}

export function revealPresentationQuestion(currentQuestionIds = [], questionId = "") {
  if (!questionId || currentQuestionIds.includes(questionId)) return currentQuestionIds;
  return [...currentQuestionIds, questionId];
}

export function hidePresentationAnswers() {
  return [];
}

export function resetPresentationAttempt() {
  return {
    answers: {},
    revealedQuestionIds: [],
    checkResults: {},
  };
}

export function checkPresentationAnswers(answers = {}, solution = null) {
  return Object.fromEntries(
    Object.values(solution?.questions || {}).map((question) => {
      const submitted = normalizePresentationAnswer(answers[question.questionId]);
      const accepted = (question.acceptedAnswers || []).map(normalizePresentationAnswer);
      return [question.questionId, submitted ? (accepted.includes(submitted) ? "correct" : "incorrect") : "unanswered"];
    }),
  );
}
