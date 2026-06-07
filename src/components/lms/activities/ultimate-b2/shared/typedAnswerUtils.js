export function normalizeTypedAnswer(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[â€™â€˜]/g, "'")
    .replace(/[â€œâ€]/g, '"')
    .replace(/\s+/g, " ");
}

export function isTypedAnswerCorrect(studentAnswer, item) {
  const normalizedStudentAnswer = normalizeTypedAnswer(studentAnswer).replace(/,/g, "");
  const acceptedAnswers = item.acceptedAnswers?.length ? item.acceptedAnswers : [item.answer];

  return acceptedAnswers.some((accepted) => {
    const normalizedAccepted = normalizeTypedAnswer(accepted);
    return normalizedStudentAnswer === normalizedAccepted || normalizedStudentAnswer === normalizedAccepted.replace(/,/g, "");
  });
}

export function normalizeSentenceAnswer(value = "") {
  return normalizeTypedAnswer(value)
    .replace(/[.!?]+$/g, "")
    .replace(/\s*([,;:])\s*/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isSentenceAnswerCorrect(studentAnswer, expectedAnswer) {
  return normalizeSentenceAnswer(studentAnswer) === normalizeSentenceAnswer(expectedAnswer);
}
