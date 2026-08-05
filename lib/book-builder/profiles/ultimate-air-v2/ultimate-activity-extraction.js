import { stableHash } from "../../stable-json.js";
import { assertStudentActivityCandidates, validateTeacherSolutionCandidates } from "./activity-candidate-contract.js";
import { parseDragAndDrop } from "./ultimate-dnd-parser.js";
import { parseSentenceMultipleChoice } from "./ultimate-multiple-choice-parser.js";
import { parseQuestionBank } from "./ultimate-question-bank-parser.js";
import { createReviewItem, createReviewQueue } from "./ultimate-review.js";
import { parseWriteResponses } from "./ultimate-write-parser.js";
import { collectNamed, parseActivityXml } from "./activity-xml.js";

const PARSER_VERSION = "1.0";
function inside(locator, sourcePath) { return sourcePath.startsWith(`${locator}/`); }
function safeIssueReview(issue, locator) {
  return createReviewItem({ category: "activity", locator: issue.questionId || issue.responseFieldId || issue.targetId ? `${locator}/${issue.questionId || issue.responseFieldId || issue.targetId}` : locator, reasonCode: issue.reasonCode, explanation: `Activity extraction requires review: ${issue.reasonCode.replaceAll("_", " ")}.`, suggestedDecisionKind: "activity_extraction_disposition", evidence: issue.evidence ? [issue.evidence] : [] });
}

export function buildActivityExtraction({ signatures, iwbIndex, internalDocuments }) {
  const iwbByPath = new Map(iwbIndex.documents.map((item) => [item.sourceRelativePath, item]));
  const studentCandidates = []; const teacherCandidates = []; const evidenceRecords = []; const reviewItems = [];
  const totals = { questionBankFiles: 0, questions: 0, options: 0, questionBankAnswerNodes: 0, publisherAnswerNodes: 0, correctValues: 0, unmatchedCorrectValues: 0, multipleCorrectMatches: 0, sentenceOccurrences: 0, sentenceOptions: 0, draggables: 0, targets: 0, dndMappings: 0, multiTargetMappings: 0, responseFields: 0, textAnswerOccurrences: 0, explicitResponses: 0, emptyResponses: 0, objectAnswerOccurrences: 0, publisherExerciseTypeCounts: {} };
  for (const record of iwbIndex.documents) {
    for (const [type, count] of Object.entries(record.exerciseTypeCounts || {})) totals.publisherExerciseTypeCounts[type] = (totals.publisherExerciseTypeCounts[type] || 0) + count;
    totals.publisherAnswerNodes += record.tagNameSummary?.answer || 0;
    if (record.family === "questions_params.iwb") totals.questionBankAnswerNodes += record.tagNameSummary?.answer || 0;
  }
  for (const signature of signatures.records) {
    const documents = [...internalDocuments.entries()].filter(([sourcePath]) => inside(signature.sourceObjectLocator, sourcePath)).sort(([a], [b]) => a.localeCompare(b));
    const content = { questions: [], draggables: [], targets: [], responseFields: [] };
    const solutions = { questions: [], dragDropMappings: [], responses: [], imageObjectAnswers: [] };
    const localIssues = []; const documentEvidence = [];
    for (const [sourceRelativePath, xml] of documents) {
      const record = iwbByPath.get(sourceRelativePath); const sourceSha256 = record?.sourceSha256 || null;
      const common = { xml, activityCandidateId: signature.activityCandidateId, sourceRelativePath, sourceSha256 };
      if (record?.family === "questions_params.iwb") {
        const parsed = parseQuestionBank(common); content.questions.push(...parsed.questions); solutions.questions.push(...parsed.solutions); localIssues.push(...parsed.issues);
        totals.questionBankFiles += 1; totals.questions += parsed.summary.questionCount; totals.options += parsed.summary.optionCount; totals.correctValues += parsed.summary.correctValueCount; totals.unmatchedCorrectValues += parsed.summary.unmatchedCount; totals.multipleCorrectMatches += parsed.summary.multipleMatchCount;
      }
      if (/<sentence\b[^>]*\banswer\s*=/i.test(xml)) {
        const parsed = parseSentenceMultipleChoice(common); content.questions.push(...parsed.questions); solutions.questions.push(...parsed.solutions); localIssues.push(...parsed.issues);
        totals.sentenceOccurrences += parsed.summary.sentenceCount; totals.sentenceOptions += parsed.summary.optionCount;
      }
      if (/<drop\b[^>]*\banswers\s*=/i.test(xml)) {
        const parsed = parseDragAndDrop(common); content.draggables.push(...parsed.draggables); content.targets.push(...parsed.targets); solutions.dragDropMappings.push(...parsed.mappings); localIssues.push(...parsed.issues);
        totals.draggables += parsed.summary.draggableCount; totals.targets += parsed.summary.targetCount; totals.dndMappings += parsed.summary.mappingCount; totals.multiTargetMappings += parsed.summary.multiTargetCount;
      }
      if (/<text\b[^>]*\banswers\s*=/i.test(xml)) {
        const parsed = parseWriteResponses(common); content.responseFields.push(...parsed.responseFields); solutions.responses.push(...parsed.solutions); localIssues.push(...parsed.issues);
        totals.responseFields += parsed.summary.responseFieldCount; totals.textAnswerOccurrences += parsed.summary.explicitAnswerCount + parsed.summary.emptyAnswerCount; totals.explicitResponses += parsed.summary.explicitAnswerCount; totals.emptyResponses += parsed.summary.emptyAnswerCount;
      }
      for (const object of collectNamed(parseActivityXml(xml), "object").filter((item) => item?.["@_answer"] !== undefined)) {
        solutions.imageObjectAnswers.push({ publisherRawValue: String(object["@_answer"]), solutionType: "unresolved-image-object-answer", sourceEvidence: [{ sourceRelativePath, sourceSha256 }] });
        totals.objectAnswerOccurrences += 1;
      }
      documentEvidence.push({ sourceRelativePath, sourceSha256, schemaFingerprint: record?.schemaFingerprint || null, publisherExerciseTypes: record?.exerciseTypeNames || [], answerBearing: Boolean(record?.answerBearing), answerEvidenceCounts: record?.answerEvidence || {}, geometryBearing: Boolean(record?.geometryBearing), mediaBearing: Boolean(record?.mediaBearing) });
    }
    if (solutions.imageObjectAnswers.length) localIssues.push({ reasonCode: "unresolved_image_object_answer", sourceRelativePath: signature.sourceObjectLocator, evidence: { occurrenceCount: solutions.imageObjectAnswers.length } });
    if (signature.disposition.disposition === "teacher-reveal-only") localIssues.push({ reasonCode: "teacher_reveal_only", sourceRelativePath: signature.sourceObjectLocator });
    if (signature.disposition.disposition === "unsupported-publisher-interaction") localIssues.push({ reasonCode: signature.disposition.normalizedCandidateType === "legacy-game-question-bank" ? "legacy_game_shell_unsupported" : "unsupported_activity_runtime", sourceRelativePath: signature.sourceObjectLocator });
    if (signature.disposition.reviewRequired && !localIssues.length) localIssues.push({ reasonCode: signature.disposition.disposition === "structured-activity-with-raster-gaps" ? "raster_prompt_missing" : "ambiguous_activity_type", sourceRelativePath: signature.sourceObjectLocator });
    const activityReviews = localIssues.map((issue) => safeIssueReview(issue, signature.sourceObjectLocator)); reviewItems.push(...activityReviews);
    const candidate = { schemaVersion: "1.0", activityCandidateId: signature.activityCandidateId, sourceObjectLocator: signature.sourceObjectLocator, componentCandidateId: `component:${signature.componentSourceDirectory}`, unit: signature.unit, part: signature.part, object: signature.object,
      displayTitle: null, displayTitleAvailability: "raster-only-or-missing", instructions: null, instructionAvailability: "raster-only-or-missing",
      publisherExerciseTypes: signature.publisherExerciseTypes, normalizedCandidateType: signature.disposition.normalizedCandidateType, disposition: signature.disposition.disposition, runtimeSupportStatus: signature.disposition.runtimeSupportStatus,
      contentCompleteness: signature.disposition.disposition === "structured-activity-candidate" ? "structured" : signature.disposition.disposition === "structured-activity-with-raster-gaps" ? "raster-gaps" : "classified-only",
      ...content, mediaCandidateIds: signature.mediaCandidateIds, hotspotCandidateIds: signature.hotspotCandidateIds, pageCandidateId: signature.pageCandidateId,
      sourceEvidenceDigests: signature.sourceFiles, contentEvidenceHash: signature.contentEvidenceHash, confidence: signature.disposition.confidence, reviewItemIds: activityReviews.map((item) => item.id).sort() };
    if (signature.disposition.disposition !== "non-exercise") studentCandidates.push(candidate);
    const solutionCount = solutions.questions.length + solutions.dragDropMappings.length + solutions.responses.length + solutions.imageObjectAnswers.length;
    if (solutionCount || signature.disposition.disposition === "teacher-reveal-only") teacherCandidates.push({ schemaVersion: "1.0", audience: "teacher-only-internal", classification: "local-only", activityCandidateId: signature.activityCandidateId, solutionAvailability: solutionCount ? "publisher-evidence-present" : "reveal-review-required", solutionType: signature.disposition.normalizedCandidateType, ...solutions, confidence: solutionCount ? 0.9 : 0.5, unresolvedMappings: localIssues.filter((item) => /unresolved|ambiguous|mismatch/.test(item.reasonCode)).map((item) => item.reasonCode), sourceEvidence: documentEvidence.map(({ sourceRelativePath, sourceSha256 }) => ({ sourceRelativePath, sourceSha256 })) });
    evidenceRecords.push({ activityCandidateId: signature.activityCandidateId, sourceObjectLocator: signature.sourceObjectLocator, structuralSignatureHash: signature.structuralSignatureHash, contentEvidenceHash: signature.contentEvidenceHash, publisherExerciseTypes: signature.publisherExerciseTypes, disposition: signature.disposition.disposition, contentAvailability: { questionCount: content.questions.length, optionCount: content.questions.reduce((sum, item) => sum + item.options.length, 0), draggableCount: content.draggables.length, targetCount: content.targets.length, responseFieldCount: content.responseFields.length }, solutionEvidenceCounts: { questionSolutions: solutions.questions.length, dragDropMappings: solutions.dragDropMappings.length, responseSolutions: solutions.responses.length, imageObjectAnswers: solutions.imageObjectAnswers.length }, documents: documentEvidence, diagnostics: localIssues.map((item) => item.reasonCode).sort() });
  }
  studentCandidates.sort((a, b) => a.activityCandidateId.localeCompare(b.activityCandidateId)); teacherCandidates.sort((a, b) => a.activityCandidateId.localeCompare(b.activityCandidateId)); evidenceRecords.sort((a, b) => a.activityCandidateId.localeCompare(b.activityCandidateId));
  const studentArtifact = assertStudentActivityCandidates({ schemaVersion: "1.0", parserId: "ultimate-air-v2-activity-projection", parserVersion: PARSER_VERSION, audience: "student-safe-authoring", summary: { candidateCount: studentCandidates.length, questionCount: studentCandidates.reduce((sum, item) => sum + item.questions.length, 0), optionCount: studentCandidates.reduce((sum, item) => sum + item.questions.reduce((inner, q) => inner + q.options.length, 0), 0) }, candidates: studentCandidates });
  const teacherArtifact = { schemaVersion: "1.0", parserId: "ultimate-air-v2-activity-solutions", parserVersion: PARSER_VERSION, audience: "teacher-only-internal", classification: "local-only", summary: { candidateCount: teacherCandidates.length, questionSolutionCount: teacherCandidates.reduce((sum, item) => sum + item.questions.length, 0), responseSolutionCount: teacherCandidates.reduce((sum, item) => sum + item.responses.length, 0), dragDropMappingCount: teacherCandidates.reduce((sum, item) => sum + item.dragDropMappings.length, 0) }, candidates: teacherCandidates };
  const teacherValidation = validateTeacherSolutionCandidates(teacherArtifact); if (!teacherValidation.valid) throw new Error(`Unsafe Teacher activity candidates: ${teacherValidation.errors.join("; ")}`);
  const activityReviewQueue = createReviewQueue([...new Map(reviewItems.map((item) => [item.id, item])).values()]);
  const summary = { schemaVersion: "1.0", parserId: "ultimate-air-v2-activity-extraction", parserVersion: PARSER_VERSION, objectCount: signatures.records.length, signatureClusterCount: new Set(signatures.records.map((item) => item.structuralSignatureHash)).size, studentCandidateCount: studentCandidates.length, teacherCandidateCount: teacherCandidates.length, reviewItemCount: activityReviewQueue.summary.total,
    dispositionCounts: Object.fromEntries([...new Set(signatures.records.map((item) => item.disposition.disposition))].sort().map((name) => [name, signatures.records.filter((item) => item.disposition.disposition === name).length])), ...totals };
  return { summary, studentArtifact, teacherArtifact, evidenceArtifact: { schemaVersion: "1.0", parserId: "ultimate-air-v2-activity-evidence", parserVersion: PARSER_VERSION, summary: { recordCount: evidenceRecords.length, aggregateDigest: stableHash(evidenceRecords) }, records: evidenceRecords }, answerEvidenceIndex: { schemaVersion: "1.0", audience: "teacher-only-internal", classification: "local-only", parserId: "ultimate-air-v2-answer-evidence-index", parserVersion: PARSER_VERSION, summary: { activityCount: teacherCandidates.length, ...totals }, records: evidenceRecords.map((item) => ({ activityCandidateId: item.activityCandidateId, contentEvidenceHash: item.contentEvidenceHash, solutionEvidenceCounts: item.solutionEvidenceCounts })) }, activityReviewQueue };
}

export function activityExtractionReport(summary) {
  return `# Ultimate AIR activity extraction\n\n- Objects: ${summary.objectCount}\n- Structural clusters: ${summary.signatureClusterCount}\n- Student-safe candidates: ${summary.studentCandidateCount}\n- Local Teacher solution candidates: ${summary.teacherCandidateCount}\n- Question banks/questions/structured options: ${summary.questionBankFiles}/${summary.questions}/${summary.options}\n- Raw question-bank answer nodes: ${summary.questionBankAnswerNodes}\n- Sentence answer occurrences: ${summary.sentenceOccurrences}\n- DnD mappings: ${summary.dndMappings}\n- Text answer occurrences: ${summary.textAnswerOccurrences}\n- Review items: ${summary.reviewItemCount}\n\nDecoded XML stayed in memory. Answer values are excluded from Student candidates, facts, reviews, reports, and ordinary CLI output. No activity was published and no scoring contract was inferred.\n`;
}
