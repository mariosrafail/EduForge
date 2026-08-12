export const COMPLETE_SENTENCES_STUDENT_RESPONSE_SCHEMA_VERSION = 1;

export function completeSentencesWordBank(runtime) {
  return (runtime?.wordBank || []).map((word) => ({ id: word.id, text: word.text }));
}

export function moveCompleteSentencesWord(answers, runtime, wordId, targetQuestionId = null) {
  const words = completeSentencesWordBank(runtime);
  const word = words.find((candidate) => candidate.id === wordId);
  const questionIds = new Set((runtime?.sentences || []).map((sentence) => sentence.questionId));
  if (!word || (targetQuestionId && !questionIds.has(targetQuestionId))) return { ...(answers || {}) };
  const next = { ...(answers || {}) };
  for (const questionId of questionIds) if (next[questionId] === word.text) delete next[questionId];
  if (targetQuestionId) next[targetQuestionId] = word.text;
  return next;
}

export function completeSentencesProgress(answers, runtime) {
  const questionIds = (runtime?.sentences || []).map((sentence) => sentence.questionId);
  const answered = questionIds.filter((questionId) => String(answers?.[questionId] || "").trim()).length;
  return { answered, total: questionIds.length, complete: questionIds.length > 0 && answered === questionIds.length };
}
