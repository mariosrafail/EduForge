import {
  RELEASE_INTEGRITY_CHECK_NAMES,
  verifyImmutableComponentRelease,
} from "../../../netlify-sites/ultimate-b2-builder/server/_builder-publication-compilers.js";
import { accessiblePackageIds, isValidUuid } from "./shared.js";
import { nativeCompleteSentencesAcceptedTexts, NATIVE_COMPLETE_SENTENCES_EXACT_EVALUATION_MODE } from "../../../src/data/native-activities/nativeCompleteSentences.js";
import { nativeOpenResponseModelAnswerTexts } from "../../../src/data/native-activities/nativeOpenResponse.js";
import { nativeSingleChoiceCorrectOptionIds, nativeSingleChoiceSelectionMode } from "../../../src/data/native-activities/nativeSingleChoice.js";
import { normalizeNativeLineEndings } from "../../../src/data/native-activities/nativePedagogicalText.js";

export const NATIVE_ASSIGNMENT_TARGET_KIND = "published_native";
export const NATIVE_RESPONSE_SCHEMA_VERSION = "native-response.v1";

const MAX_RESPONSE_ITEMS = 50;
const MAX_RESPONSE_TEXT = 10_000;
const MAX_RESPONSE_PAYLOAD = 100_000;

function openResponseQuestions(document = {}) {
  return document.parts?.[0]?.interaction?.questions || [];
}

function normalizeSingleChoice(publicDocument, rawEnvelope) {
  if (!rawEnvelope || typeof rawEnvelope !== "object" || Array.isArray(rawEnvelope)) return { error: "response must be an object" };
  if (rawEnvelope.schemaVersion !== NATIVE_RESPONSE_SCHEMA_VERSION) return { error: `response.schemaVersion must be ${NATIVE_RESPONSE_SCHEMA_VERSION}` };
  if (Object.keys(rawEnvelope).some((key) => !["schemaVersion", "items"].includes(key))) return { error: "response contains unsupported fields" };
  if (!Array.isArray(rawEnvelope.items) || rawEnvelope.items.length > MAX_RESPONSE_ITEMS) return { error: `response.items must be an array with at most ${MAX_RESPONSE_ITEMS} items` };
  if (JSON.stringify(rawEnvelope).length > MAX_RESPONSE_PAYLOAD) return { error: "response payload is too large" };
  const questions = openResponseQuestions(publicDocument);
  const questionById = new Map(questions.map((question) => [String(question.id), question]));
  const seen = new Set(); const values = new Map();
  for (const item of rawEnvelope.items) {
    if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).sort().join(",") !== "id,value") return { error: "Each response item must contain exactly id and value" };
    const id = String(item.id || ""); const question = questionById.get(id);
    if (!question) return { error: `Unexpected response id: ${id}` };
    if (seen.has(id)) return { error: `Duplicate response id: ${id}` };
    if (nativeSingleChoiceSelectionMode(question) === "multiple") {
      if (!Array.isArray(item.value) || !item.value.length || item.value.some((optionId) => typeof optionId !== "string") || new Set(item.value).size !== item.value.length) return { error: `Response ${id} must select unique options belonging to that question` };
      const selected = new Set(item.value);
      if (item.value.some((optionId) => !question.options.some((option) => String(option.id) === optionId))) return { error: `Response ${id} must select unique options belonging to that question` };
      values.set(id, question.options.map((option) => String(option.id)).filter((optionId) => selected.has(optionId)));
    } else {
      const value = String(item.value || "");
      if (typeof item.value !== "string" || !question.options.some((option) => String(option.id) === value)) return { error: `Response ${id} must select an option belonging to that question` };
      values.set(id, value);
    }
    seen.add(id);
  }
  return { schemaVersion: NATIVE_RESPONSE_SCHEMA_VERSION, payload: { schemaVersion: NATIVE_RESPONSE_SCHEMA_VERSION, kind: "single-choice", items: questions.filter((question) => values.has(String(question.id))).map((question) => ({ id: String(question.id), value: values.get(String(question.id)) })) } };
}

function scoreSingleChoice(publicDocument, teacherDocument, payload) {
  const questions = openResponseQuestions(publicDocument);
  const responses = new Map((payload.items || []).map((item) => [String(item.id), Array.isArray(item.value) ? item.value.map(String) : [String(item.value)]]));
  const correct = new Map((teacherDocument.parts?.[0]?.solution?.correctAnswers || []).map((answer) => [String(answer.questionId), nativeSingleChoiceCorrectOptionIds(answer).map(String)]));
  const correctCount = questions.filter((question) => {
    const selected = responses.get(String(question.id)) || [];
    const expected = correct.get(String(question.id)) || [];
    return selected.length === expected.length && selected.every((optionId) => expected.includes(optionId));
  }).length;
  const totalCount = questions.length;
  return { status: "submitted", correctCount, totalCount, scorePercent: totalCount ? Math.round((correctCount / totalCount) * 100) : 0 };
}

function singleChoiceReview(publicDocument, teacherDocument, payload = {}) {
  const responses = new Map((payload.items || []).map((item) => [String(item.id), Array.isArray(item.value) ? item.value.map(String) : [String(item.value)]]));
  const correct = new Map((teacherDocument.parts?.[0]?.solution?.correctAnswers || []).map((answer) => [String(answer.questionId), nativeSingleChoiceCorrectOptionIds(answer).map(String)]));
  return openResponseQuestions(publicDocument).map((question) => {
    const selectedOptionIds = responses.get(String(question.id)) || [];
    const correctOptionIds = correct.get(String(question.id)) || [];
    const selectedTexts = question.options.filter((option) => selectedOptionIds.includes(String(option.id))).map((option) => option.text);
    const correctTexts = question.options.filter((option) => correctOptionIds.includes(String(option.id))).map((option) => option.text);
    return {
      questionId: String(question.id), prompt: question.prompt || "",
      answer: selectedTexts.join("; "),
      modelAnswer: correctTexts.join("; "),
      ...(nativeSingleChoiceSelectionMode(question) === "multiple" ? { answers: selectedTexts, modelAnswers: correctTexts } : {}),
      isCorrect: selectedOptionIds.length > 0 && selectedOptionIds.length === correctOptionIds.length && selectedOptionIds.every((optionId) => correctOptionIds.includes(optionId)), feedback: "",
    };
  });
}

function normalizeTextResponses(publicDocument, rawEnvelope, responseKind) {
  if (!rawEnvelope || typeof rawEnvelope !== "object" || Array.isArray(rawEnvelope)) {
    return { error: "response must be an object" };
  }
  if (rawEnvelope.schemaVersion !== NATIVE_RESPONSE_SCHEMA_VERSION) {
    return { error: `response.schemaVersion must be ${NATIVE_RESPONSE_SCHEMA_VERSION}` };
  }
  if (Object.keys(rawEnvelope).some((key) => !["schemaVersion", "items"].includes(key))) {
    return { error: "response contains unsupported fields" };
  }
  if (!Array.isArray(rawEnvelope.items) || rawEnvelope.items.length > MAX_RESPONSE_ITEMS) {
    return { error: `response.items must be an array with at most ${MAX_RESPONSE_ITEMS} items` };
  }
  if (JSON.stringify(rawEnvelope).length > MAX_RESPONSE_PAYLOAD) {
    return { error: "response payload is too large" };
  }
  const questions = openResponseQuestions(publicDocument);
  const allowed = new Set(questions.map((question) => String(question.id)));
  const seen = new Set();
  const values = new Map();
  for (const item of rawEnvelope.items) {
    if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).some((key) => !["id", "value"].includes(key))) {
      return { error: "Each response item must contain only id and value" };
    }
    const id = String(item.id || "");
    if (!allowed.has(id)) return { error: `Unexpected response id: ${id}` };
    if (seen.has(id)) return { error: `Duplicate response id: ${id}` };
    if (typeof item.value !== "string") return { error: `Response ${id} must be text` };
    if (item.value.length > MAX_RESPONSE_TEXT) return { error: `Response ${id} is too long` };
    seen.add(id);
    values.set(id, item.value);
  }
  return {
    schemaVersion: NATIVE_RESPONSE_SCHEMA_VERSION,
    payload: {
      schemaVersion: NATIVE_RESPONSE_SCHEMA_VERSION,
      kind: responseKind,
      items: questions.filter((question) => values.has(String(question.id))).map((question) => ({
        id: String(question.id),
        value: values.get(String(question.id)),
      })),
    },
    status: "awaiting_review",
    scorePercent: null,
    correctCount: null,
    totalCount: null,
  };
}

function normalizeOpenResponse(publicDocument, rawEnvelope) { return normalizeTextResponses(publicDocument, rawEnvelope, "open-response"); }
function normalizeListening(publicDocument, rawEnvelope) { return normalizeTextResponses(publicDocument, rawEnvelope, "listening"); }
function normalizeOldschoolListening(publicDocument, rawEnvelope) { return normalizeTextResponses(publicDocument, rawEnvelope, "oldschool-listening"); }

function openResponseReview(publicDocument, teacherDocument, payload = {}) {
  const responses = new Map((payload.items || []).map((item) => [String(item.id), String(item.value ?? "")]));
  const modelAnswers = new Map((teacherDocument?.parts?.[0]?.solution?.modelAnswers || [])
    .map((answer) => [String(answer.questionId), nativeOpenResponseModelAnswerTexts(answer)]));
  return openResponseQuestions(publicDocument).map((question) => ({
    questionId: String(question.id),
    prompt: question.prompt || "",
    answer: responses.get(String(question.id)) || "",
    modelAnswer: modelAnswers.get(String(question.id))?.[0] || "",
    ...(modelAnswers.get(String(question.id))?.length > 1 ? { modelAnswers: modelAnswers.get(String(question.id)) } : {}),
    isCorrect: null,
    feedback: "",
  }));
}

function completeSentenceItems(document = {}) {
  return document.parts?.[0]?.interaction?.items || [];
}

function normalizeCompleteSentences(publicDocument, rawEnvelope) {
  if (!rawEnvelope || typeof rawEnvelope !== "object" || Array.isArray(rawEnvelope)
    || rawEnvelope.schemaVersion !== NATIVE_RESPONSE_SCHEMA_VERSION
    || Object.keys(rawEnvelope).some((key) => !["schemaVersion", "items"].includes(key))
    || !Array.isArray(rawEnvelope.items) || rawEnvelope.items.length > MAX_RESPONSE_ITEMS
    || JSON.stringify(rawEnvelope).length > MAX_RESPONSE_PAYLOAD) return { error: "response is invalid" };
  const items = completeSentenceItems(publicDocument); const allowed = new Set(items.map((item) => String(item.id))); const values = new Map();
  for (const item of rawEnvelope.items) {
    if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).sort().join(",") !== "id,value") return { error: "Each response item must contain exactly id and value" };
    const id = String(item.id || "");
    if (!allowed.has(id) || values.has(id) || typeof item.value !== "string" || item.value.length > MAX_RESPONSE_TEXT) return { error: `Response ${id} is invalid` };
    values.set(id, item.value);
  }
  return { schemaVersion: NATIVE_RESPONSE_SCHEMA_VERSION, payload: { schemaVersion: NATIVE_RESPONSE_SCHEMA_VERSION, kind: "complete-sentences", items: items.filter((item) => values.has(String(item.id))).map((item) => ({ id: String(item.id), value: values.get(String(item.id)) })) }, status: "awaiting_review", scorePercent: null, correctCount: null, totalCount: null };
}

const canonicalTypedAnswer = (value) => normalizeNativeLineEndings(String(value ?? "")).trim();

function scoreCompleteSentences(publicDocument, teacherDocument, payload = {}) {
  const items = completeSentenceItems(publicDocument);
  const responses = new Map((payload.items || []).map((item) => [String(item.id), canonicalTypedAnswer(item.value)]));
  const accepted = new Map((teacherDocument.parts?.[0]?.solution?.answers || []).map((answer) => [String(answer.itemId), nativeCompleteSentencesAcceptedTexts(answer).map(canonicalTypedAnswer)]));
  const correctCount = items.filter((item) => accepted.get(String(item.id))?.includes(responses.get(String(item.id))) === true).length;
  const totalCount = items.length;
  return { status: "submitted", correctCount, totalCount, scorePercent: totalCount ? Math.round(correctCount / totalCount * 100) : 0 };
}

function completeSentencesReview(publicDocument, teacherDocument, payload = {}) {
  const responses = new Map((payload.items || []).map((item) => [String(item.id), String(item.value ?? "")]));
  const solutionAnswers = teacherDocument?.parts?.[0]?.solution?.answers || [];
  const answers = new Map(solutionAnswers.map((answer) => [String(answer.itemId), answer]));
  const exact = publicDocument.parts?.[0]?.interaction?.evaluationMode === NATIVE_COMPLETE_SENTENCES_EXACT_EVALUATION_MODE;
  return completeSentenceItems(publicDocument).map((item) => {
    const authored = answers.get(String(item.id));
    const acceptedTexts = nativeCompleteSentencesAcceptedTexts(authored);
    const response = responses.get(String(item.id)) || "";
    return { questionId: String(item.id), prompt: item.prompt || "", answer: response, modelAnswer: authored?.text || acceptedTexts.join("/"), ...(acceptedTexts.length > 1 ? { acceptedAnswers: acceptedTexts } : {}), isCorrect: exact ? acceptedTexts.map(canonicalTypedAnswer).includes(canonicalTypedAnswer(response)) : null, feedback: "" };
  });
}

function dragDropTargets(document = {}) {
  return (document.parts?.[0]?.interaction?.panels || []).flatMap((panel) => panel.dropTargets || []);
}

function dragDropMappingWordIds(mapping) {
  return Array.isArray(mapping?.wordIds) ? mapping.wordIds.map(String) : typeof mapping?.wordId === "string" ? [String(mapping.wordId)] : [];
}

function dragDropResponseWordIds(value) {
  return Array.isArray(value) ? value.map(String) : typeof value === "string" ? [value] : [];
}

function sameIdSet(left, right) {
  return left.length === right.length && new Set(left).size === left.length && left.every((id) => right.includes(id));
}

function normalizeDragDrop(publicDocument, rawEnvelope) {
  if (!rawEnvelope || typeof rawEnvelope !== "object" || Array.isArray(rawEnvelope)
    || rawEnvelope.schemaVersion !== NATIVE_RESPONSE_SCHEMA_VERSION
    || Object.keys(rawEnvelope).some((key) => !["schemaVersion", "items"].includes(key))
    || !Array.isArray(rawEnvelope.items) || rawEnvelope.items.length > 120
    || JSON.stringify(rawEnvelope).length > MAX_RESPONSE_PAYLOAD) return { error: "response is invalid" };
  const interaction = publicDocument.parts?.[0]?.interaction || {};
  const targets = dragDropTargets(publicDocument);
  const allowedTargets = new Set(targets.map((target) => String(target.id)));
  const wordById = new Map((interaction.words || []).map((word) => [String(word.id), word]));
  const targetById = new Map(targets.map((target) => [String(target.id), target]));
  const values = new Map(); const usedWords = new Set();
  for (const item of rawEnvelope.items) {
    if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).sort().join(",") !== "id,value") return { error: "Each response item must contain exactly id and value" };
    const targetId = String(item.id || ""); const wordIds = dragDropResponseWordIds(item.value); const target = targetById.get(targetId);
    if (!allowedTargets.has(targetId) || !target || !wordIds.length || wordIds.length > (target.capacity || 1) || new Set(wordIds).size !== wordIds.length || values.has(targetId) || wordIds.some((wordId) => !wordById.has(wordId))) return { error: `Drag & Drop response ${targetId} is invalid` };
    for (const wordId of wordIds) {
      const reusable = interaction.layoutMode !== "text" && wordById.get(wordId)?.reusable === true;
      if (!reusable && usedWords.has(wordId)) return { error: `Drag & Drop response ${targetId} is invalid` };
      if (!reusable) usedWords.add(wordId);
    }
    values.set(targetId, wordIds);
  }
  return { schemaVersion: NATIVE_RESPONSE_SCHEMA_VERSION, payload: { schemaVersion: NATIVE_RESPONSE_SCHEMA_VERSION, kind: "drag-drop", items: targets.filter((target) => values.has(String(target.id))).map((target) => ({ id: String(target.id), value: values.get(String(target.id)) })) } };
}

function scoreDragDrop(publicDocument, teacherDocument, payload = {}) {
  const targets = dragDropTargets(publicDocument);
  const responses = new Map((payload.items || []).map((item) => [String(item.id), dragDropResponseWordIds(item.value)]));
  const correct = new Map((teacherDocument.parts?.[0]?.solution?.mappings || []).map((mapping) => [String(mapping.targetId), dragDropMappingWordIds(mapping)]));
  const correctCount = targets.filter((target) => {
    const expected = correct.get(String(target.id)) || [];
    return expected.length > 0 && sameIdSet(responses.get(String(target.id)) || [], expected);
  }).length;
  const totalCount = targets.length;
  return { status: "submitted", correctCount, totalCount, scorePercent: totalCount ? Math.round(correctCount / totalCount * 100) : 0 };
}

function dragDropReview(publicDocument, teacherDocument, payload = {}) {
  const words = new Map((publicDocument.parts?.[0]?.interaction?.words || []).map((word) => [String(word.id), word]));
  const responses = new Map((payload.items || []).map((item) => [String(item.id), dragDropResponseWordIds(item.value)]));
  const correct = new Map((teacherDocument.parts?.[0]?.solution?.mappings || []).map((mapping) => [String(mapping.targetId), dragDropMappingWordIds(mapping)]));
  return dragDropTargets(publicDocument).map((target) => {
    const selectedWordIds = responses.get(String(target.id)) || [];
    const correctWordIds = correct.get(String(target.id)) || [];
    const selectedTexts = selectedWordIds.map((id) => words.get(id)?.text).filter(Boolean);
    const correctTexts = correctWordIds.map((id) => words.get(id)?.text).filter(Boolean);
    const textMode = publicDocument.parts?.[0]?.interaction?.layoutMode === "text";
    return {
      questionId: String(target.id), prompt: target.accessibleLabel || "",
      answer: selectedTexts.join("; "), modelAnswer: correctTexts.join("; "), answers: selectedTexts, modelAnswers: correctTexts,
      ...(textMode ? { answerLabels: selectedWordIds.map((id) => words.get(id)?.shortLabel).filter(Boolean), modelAnswerLabels: correctWordIds.map((id) => words.get(id)?.shortLabel).filter(Boolean) } : {}),
      isCorrect: selectedWordIds.length > 0 && sameIdSet(selectedWordIds, correctWordIds), feedback: "",
    };
  });
}

const capabilities = Object.freeze({
  "open-response": Object.freeze({
    kind: "open-response",
    assignable: true,
    submittable: true,
    reviewMode: "teacher-reviewed",
    responseSchemaVersion: NATIVE_RESPONSE_SCHEMA_VERSION,
    normalizeResponse: normalizeOpenResponse,
    teacherReviewProjection: openResponseReview,
  }),
  "single-choice": Object.freeze({
    kind: "single-choice",
    assignable: true,
    submittable: true,
    reviewMode: "auto-scored",
    responseSchemaVersion: NATIVE_RESPONSE_SCHEMA_VERSION,
    normalizeResponse: normalizeSingleChoice,
    evaluateResponse: scoreSingleChoice,
    teacherReviewProjection: singleChoiceReview,
  }),
  "complete-sentences": Object.freeze({
    kind: "complete-sentences",
    assignable: true,
    submittable: true,
    reviewMode: "teacher-reviewed",
    responseSchemaVersion: NATIVE_RESPONSE_SCHEMA_VERSION,
    normalizeResponse: normalizeCompleteSentences,
    teacherReviewProjection: completeSentencesReview,
  }),
  listening: Object.freeze({
    kind: "listening",
    assignable: true,
    submittable: true,
    reviewMode: "teacher-reviewed",
    responseSchemaVersion: NATIVE_RESPONSE_SCHEMA_VERSION,
    normalizeResponse: normalizeListening,
    teacherReviewProjection: openResponseReview,
  }),
  "oldschool-listening": Object.freeze({
    kind: "oldschool-listening",
    assignable: true,
    submittable: true,
    reviewMode: "teacher-reviewed",
    responseSchemaVersion: NATIVE_RESPONSE_SCHEMA_VERSION,
    normalizeResponse: normalizeOldschoolListening,
    teacherReviewProjection: openResponseReview,
  }),
  "drag-drop": Object.freeze({
    kind: "drag-drop",
    assignable: true,
    submittable: true,
    reviewMode: "auto-scored",
    responseSchemaVersion: NATIVE_RESPONSE_SCHEMA_VERSION,
    normalizeResponse: normalizeDragDrop,
    evaluateResponse: scoreDragDrop,
    teacherReviewProjection: dragDropReview,
  }),
  image: Object.freeze({
    kind: "image",
    assignable: false,
    submittable: false,
    reviewMode: "display-only",
    responseSchemaVersion: null,
  }),
});

export function nativeAssignmentCapability(kind, publicDocument = null) {
  const capability = capabilities[String(kind || "")] || null;
  if (kind === "complete-sentences" && publicDocument?.parts?.[0]?.interaction?.evaluationMode === NATIVE_COMPLETE_SENTENCES_EXACT_EVALUATION_MODE) {
    return Object.freeze({ ...capability, reviewMode: "auto-scored", evaluateResponse: scoreCompleteSentences });
  }
  return capability;
}

export function containsClientTeacherMaterial(value) {
  if (Array.isArray(value)) return value.some(containsClientTeacherMaterial);
  if (!value || typeof value !== "object") return false;
  const forbidden = new Set(["acceptedAnswers", "acceptedTexts", "modelAnswer", "modelAnswers", "modelAnswerTexts", "correctOptionId", "correctOptionIds", "correctAnswers", "mappings", "solution", "teacherDocument", "teacherProjection"]);
  return Object.entries(value).some(([key, child]) => forbidden.has(key) || containsClientTeacherMaterial(child));
}

async function releaseRow(sql, { releaseId, requireActive = false }) {
  const rows = await sql`
    select release.*, package.slug as package_slug, package.title as package_title,
           component.slug as component_slug, component.title as component_title
    from book_component_releases release
    join book_packages package on package.id = release.book_package_id and package.status = 'active'
    join book_components component on component.id = release.book_component_id and component.book_package_id = package.id
    where release.id = ${releaseId}
      and exists (
        select 1 from book_component_publication_events event
        where event.release_id = release.id and event.book_component_id = release.book_component_id
      )
      and (${requireActive} = false or exists (
        select 1 from book_component_publication_heads head
        where head.book_component_id = release.book_component_id and head.release_id = release.id
      ))
    limit 1
  `;
  return rows[0] || null;
}

function verifiedNative(row, nativeActivityId) {
  if (!row) return null;
  const verified = verifyImmutableComponentRelease(row);
  const publicEntry = verified.publicProjection?.nativeActivities?.[nativeActivityId];
  const teacherEntry = verified.teacherProjection?.nativeActivities?.[nativeActivityId];
  if (!publicEntry || !teacherEntry || publicEntry.kind !== teacherEntry.kind) return null;
  return { row, verified, publicEntry, teacherEntry, capability: nativeAssignmentCapability(publicEntry.kind, publicEntry.document) };
}

export async function resolveNativeAssignmentTarget(sql, currentUser, rawTarget, { requireActive = true } = {}) {
  if (!rawTarget || rawTarget.kind !== NATIVE_ASSIGNMENT_TARGET_KIND) return { error: "target.kind must be published_native" };
  if (Object.keys(rawTarget).some((key) => !["kind", "releaseId", "nativeActivityId"].includes(key))) return { error: "target contains unsupported fields" };
  if (!isValidUuid(rawTarget.releaseId)) return { error: "target.releaseId must be a valid UUID" };
  const nativeActivityId = String(rawTarget.nativeActivityId || "");
  if (!/^[a-z0-9][a-z0-9-]{0,127}$/.test(nativeActivityId)) return { error: "target.nativeActivityId is invalid" };
  const row = await releaseRow(sql, { releaseId: rawTarget.releaseId, requireActive });
  const target = verifiedNative(row, nativeActivityId);
  if (!target) return { error: "Published native activity not found", statusCode: 404 };
  const allowed = await accessiblePackageIds(sql, currentUser);
  if (!allowed.includes(String(row.book_package_id))) return { error: "This account cannot access the published activity", statusCode: 403 };
  return { ...target, nativeActivityId };
}

export async function loadPinnedNativeAssignmentTarget(sql, assignment) {
  const row = await releaseRow(sql, { releaseId: assignment.native_release_id, requireActive: false });
  return verifiedNative(row, String(assignment.native_activity_id || ""));
}

export function nativeTargetToStudent(target, nativeActivityId) {
  return {
    kind: NATIVE_ASSIGNMENT_TARGET_KIND,
    releaseId: target.row.id,
    nativeActivityId,
    nativeKind: target.publicEntry.kind,
    capability: {
      assignable: Boolean(target.capability?.assignable),
      submittable: Boolean(target.capability?.submittable),
      reviewMode: target.capability?.reviewMode || "unsupported",
      responseSchemaVersion: target.capability?.responseSchemaVersion || null,
    },
    entry: target.publicEntry,
    publication: {
      kind: "published",
      releaseId: target.row.id,
      releaseNumber: Number(target.row.release_number),
      bookSlug: target.row.package_slug,
      componentSlug: target.row.component_slug,
      projection: { assets: target.verified.publicProjection.assets || [] },
    },
  };
}

function releaseVerificationDiagnostic(row, error) {
  const integrityChecks = error?.code === "release_integrity_failed" && error.integrityChecks
    ? Object.fromEntries(RELEASE_INTEGRITY_CHECK_NAMES.map((name) => [name, error.integrityChecks[name] === true]))
    : null;
  return {
    releaseId: String(row.id),
    bookPackageId: String(row.book_package_id),
    bookPackageSlug: String(row.package_slug),
    componentId: String(row.book_component_id),
    componentSlug: String(row.component_slug),
    releaseNumber: Number(row.release_number),
    compilerId: String(row.compiler_id),
    releaseSchemaVersion: String(row.release_schema_version),
    integrityChecks,
    failedIntegrityChecks: integrityChecks
      ? Object.entries(integrityChecks).filter(([, matches]) => !matches).map(([name]) => name)
      : [],
    ...(typeof error?.storedCompatibilityReleaseHashMatches === "boolean"
      ? { storedCompatibilityReleaseHashMatches: error.storedCompatibilityReleaseHashMatches }
      : {}),
  };
}

export async function listPublishedNativeAssignmentTargets(sql, currentUser) {
  const allowed = new Set((await accessiblePackageIds(sql, currentUser)).map(String));
  const rows = await sql`
    select release.*, package.slug as package_slug, package.title as package_title,
           component.slug as component_slug, component.title as component_title
    from book_component_publication_heads head
    join book_component_releases release on release.id = head.release_id and release.book_component_id = head.book_component_id
    join book_packages package on package.id = release.book_package_id and package.status = 'active'
    join book_components component on component.id = release.book_component_id and component.book_package_id = package.id
    where exists (
      select 1 from book_component_publication_events event
      where event.release_id = release.id and event.book_component_id = release.book_component_id
    )
    order by package.title, component.title, release.release_number desc
  `;
  const targets = [];
  for (const row of rows) {
    if (!allowed.has(String(row.book_package_id))) continue;
    let verified;
    try {
      verified = verifyImmutableComponentRelease(row);
    } catch (error) {
      console.error(releaseVerificationDiagnostic(row, error));
      throw error;
    }
    for (const [nativeActivityId, publicEntry] of Object.entries(verified.publicProjection?.nativeActivities || {})) {
      const teacherEntry = verified.teacherProjection?.nativeActivities?.[nativeActivityId];
      if (!teacherEntry || teacherEntry.kind !== publicEntry.kind) continue;
      const capability = nativeAssignmentCapability(publicEntry.kind, publicEntry.document);
      targets.push({
        target: { kind: NATIVE_ASSIGNMENT_TARGET_KIND, releaseId: row.id, nativeActivityId },
        title: publicEntry.document?.metadata?.title || nativeActivityId,
        nativeKind: publicEntry.kind,
        source: "Published native",
        packageId: row.book_package_id,
        packageSlug: row.package_slug,
        packageTitle: row.package_title,
        componentId: row.book_component_id,
        componentSlug: row.component_slug,
        componentTitle: row.component_title,
        releaseNumber: Number(row.release_number),
        assignable: Boolean(capability?.assignable),
        submittable: Boolean(capability?.submittable),
        reviewMode: capability?.reviewMode || "unsupported",
      });
    }
  }
  return targets;
}
