export function normalizedCorrectOptionIds(activity, question) {
  const records = (question.answerRecordIds || [])
    .map((id) => activity.answerRecords.find((record) => record.id === id))
    .filter(Boolean);
  return [...new Set(records.flatMap((record) => record.optionIds || []))];
}

export function scoreNormalizedStudentsBookActivity(activity, answers = {}) {
  return (activity?.questions || []).map((question) => {
    const submitted = answers[question.id];
    const submittedIds = Array.isArray(submitted) ? submitted : [submitted].filter(Boolean);
    const correctIds = normalizedCorrectOptionIds(activity, question);
    const orderingSignificant = (question.answerRecordIds || []).some((id) => (
      activity.answerRecords.find((record) => record.id === id)?.orderingSignificant
    ));
    const correct = orderingSignificant
      ? JSON.stringify(submittedIds) === JSON.stringify(correctIds)
      : submittedIds.length === correctIds.length && submittedIds.every((id) => correctIds.includes(id));
    return { id: question.id, question: question.prompt, studentAnswer: submittedIds, answer: correctIds, correct };
  });
}

export function buildNormalizedSubmissionAnswers(activity, answers = {}) {
  const submission = {};
  (activity?.questions || []).forEach((question, index) => {
    const selected = Array.isArray(answers[question.id]) ? answers[question.id][0] : answers[question.id];
    submission[String(question.number ?? index + 1)] = question.options.find((option) => option.id === selected)?.value || "";
  });
  return submission;
}

export function createNormalizedActivityAttempt() {
  return { answers: {}, submittedRows: null };
}

export function resetNormalizedActivityAttempt() {
  return createNormalizedActivityAttempt();
}
