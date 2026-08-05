import { nestedCandidateId } from "./activity-candidate-contract.js";
import { parseActivityXml, plainText, toArray } from "./activity-xml.js";

export function parseQuestionBank({ xml, activityCandidateId, sourceRelativePath, sourceSha256 }) {
  const document = parseActivityXml(xml); const sourceQuestions = toArray(document?.questions?.question);
  const questions = []; const solutions = []; const issues = [];
  sourceQuestions.forEach((question, questionIndex) => {
    const publisherQuestionId = question?.["@_id"] === undefined ? null : String(question["@_id"]);
    const sourceIdentity = publisherQuestionId || `question-${questionIndex + 1}`;
    const questionId = nestedCandidateId("question", activityCandidateId, sourceIdentity);
    const options = toArray(question?.answer).map((answer, optionIndex) => ({
      id: nestedCandidateId("option", questionId, answer?.["@_id"] ?? `option-${optionIndex + 1}`),
      publisherOptionId: answer?.["@_id"] === undefined ? null : String(answer["@_id"]), text: plainText(answer), textAvailability: plainText(answer) ? "structured" : "raster-only-or-missing", order: optionIndex + 1,
    }));
    const correctValue = plainText(question?.correct); const exact = options.filter((option) => option.text === correctValue);
    const normalizedValue = correctValue?.normalize("NFKC").replaceAll(/\s+/g, " ").trim();
    const normalizedMatches = options.filter((option) => option.text?.normalize("NFKC").replaceAll(/\s+/g, " ").trim() === normalizedValue);
    questions.push({ id: questionId, publisherQuestionId, prompt: plainText(question), promptAvailability: plainText(question) ? "structured" : "raster-only-or-missing", responseKind: "single-option", options, sourceEvidence: [{ sourceRelativePath, sourceSha256 }] });
    solutions.push({ questionId, solutionType: "publisher-correct-value", publisherCorrectValue: correctValue, correctOptionIds: exact.length === 1 ? [exact[0].id] : [], resolutionConfidence: exact.length === 1 ? 1 : 0, sourceEvidence: [{ sourceRelativePath, sourceSha256 }], normalizedMatchCount: normalizedMatches.length });
    if (exact.length === 0) issues.push({ reasonCode: "correct_value_option_mismatch", questionId, sourceRelativePath, evidence: { exactMatchCount: 0, normalizedMatchCount: normalizedMatches.length } });
    if (exact.length > 1) issues.push({ reasonCode: "multiple_correct_option_matches", questionId, sourceRelativePath, evidence: { exactMatchCount: exact.length } });
  });
  return { questions, solutions, issues, summary: { questionCount: questions.length, optionCount: questions.reduce((sum, item) => sum + item.options.length, 0), correctValueCount: solutions.filter((item) => item.publisherCorrectValue !== null).length, unmatchedCount: issues.filter((item) => item.reasonCode === "correct_value_option_mismatch").length, multipleMatchCount: issues.filter((item) => item.reasonCode === "multiple_correct_option_matches").length } };
}
