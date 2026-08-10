export const COMPLETE_SENTENCES_STUDENT_RESPONSE_SCHEMA_VERSION = 1;

export function completeSentencesWordBank(authoring) {
  const sentenceById = new Map((authoring?.sentences || []).map((sentence) => [sentence.id, sentence]));
  return (authoring?.blanks || []).map((blank) => ({
    id: blank.id,
    text: blank.revealedWord,
    questionId: sentenceById.get(blank.sentenceId)?.questionId || "",
  }));
}

export function moveCompleteSentencesWord(answers, authoring, wordId, targetQuestionId = null) {
  const words = completeSentencesWordBank(authoring);
  const word = words.find((candidate) => candidate.id === wordId);
  if (!word || (targetQuestionId && !words.some((candidate) => candidate.questionId === targetQuestionId))) return { ...(answers || {}) };
  const next = { ...(answers || {}) };
  for (const candidate of words) {
    if (next[candidate.questionId] === word.text) delete next[candidate.questionId];
  }
  if (targetQuestionId) next[targetQuestionId] = word.text;
  return next;
}

export function completeSentencesProgress(answers, authoring) {
  const words = completeSentencesWordBank(authoring);
  const answered = words.filter(({ questionId }) => String(answers?.[questionId] || "").trim()).length;
  return { answered, total: words.length, complete: words.length > 0 && answered === words.length };
}
