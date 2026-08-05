import { nestedCandidateId } from "./activity-candidate-contract.js";
import { collectNamed, geometry, parseActivityXml, plainText, toArray } from "./activity-xml.js";

export function detectSentenceIndexBase(sentences) {
  let zero = true; let one = true;
  for (const sentence of sentences) {
    const value = Number(sentence?.["@_answer"]); const count = toArray(sentence?.choice).length;
    if (!Number.isInteger(value) || count < 1) return "invalid";
    zero &&= value >= 0 && value < count; one &&= value >= 1 && value <= count;
  }
  if (zero && !one) return "zero-based";
  if (one && !zero) return "one-based";
  return zero && one ? "ambiguous" : "invalid";
}

export function parseSentenceMultipleChoice({ xml, activityCandidateId, sourceRelativePath, sourceSha256 }) {
  const sentences = collectNamed(parseActivityXml(xml), "sentence").filter((item) => item?.["@_answer"] !== undefined);
  const indexBase = detectSentenceIndexBase(sentences); const questions = []; const solutions = []; const issues = [];
  sentences.forEach((sentence, sentenceIndex) => {
    const questionId = nestedCandidateId("question", activityCandidateId, sentence?.["@_id"] ?? `sentence-${sentenceIndex + 1}`);
    const options = toArray(sentence.choice).map((choice, optionIndex) => ({ id: nestedCandidateId("option", questionId, choice?.["@_id"] ?? `choice-${optionIndex + 1}`), publisherOptionId: choice?.["@_id"] === undefined ? null : String(choice["@_id"]), text: plainText(choice), textAvailability: plainText(choice) ? "structured" : "raster-only-or-missing", order: optionIndex + 1, geometry: geometry(choice) }));
    const answerIndex = Number(sentence["@_answer"]); const resolvedIndex = indexBase === "zero-based" ? answerIndex : indexBase === "one-based" ? answerIndex - 1 : -1;
    questions.push({ id: questionId, publisherQuestionId: sentence?.["@_id"] === undefined ? null : String(sentence["@_id"]), prompt: plainText(sentence), promptAvailability: plainText(sentence) ? "structured" : "raster-only-or-missing", responseKind: "single-option", options, sourceEvidence: [{ sourceRelativePath, sourceSha256 }] });
    solutions.push({ questionId, solutionType: "publisher-answer-index", publisherAnswerIndex: String(sentence["@_answer"]), answerIndexBase: indexBase, correctOptionIds: options[resolvedIndex] ? [options[resolvedIndex].id] : [], resolutionConfidence: options[resolvedIndex] ? 1 : 0, sourceEvidence: [{ sourceRelativePath, sourceSha256 }] });
    if (!plainText(sentence)) issues.push({ reasonCode: "raster_prompt_missing", questionId, sourceRelativePath });
    for (const option of options.filter((item) => item.textAvailability !== "structured")) issues.push({ reasonCode: "raster_option_text_missing", questionId, optionId: option.id, sourceRelativePath });
  });
  if (["ambiguous", "invalid"].includes(indexBase) && sentences.length) issues.push({ reasonCode: "ambiguous_answer_index_base", questionId: null, sourceRelativePath, evidence: { indexBase } });
  return { questions, solutions, issues, summary: { sentenceCount: sentences.length, optionCount: questions.reduce((sum, item) => sum + item.options.length, 0), indexBase, structuredOptionTextCount: questions.flatMap((item) => item.options).filter((item) => item.textAvailability === "structured").length, rasterOptionCount: questions.flatMap((item) => item.options).filter((item) => item.textAvailability !== "structured").length, structuredPromptCount: questions.filter((item) => item.promptAvailability === "structured").length } };
}
