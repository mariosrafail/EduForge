import {
  RELEASE_INTEGRITY_CHECK_NAMES,
  verifyImmutableComponentRelease,
} from "../../../netlify-sites/ultimate-b2-builder/server/_builder-publication-compilers.js";
import { accessiblePackageIds, isValidUuid } from "./shared.js";

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
    const id = String(item.id || ""); const value = String(item.value || ""); const question = questionById.get(id);
    if (!question) return { error: `Unexpected response id: ${id}` };
    if (seen.has(id)) return { error: `Duplicate response id: ${id}` };
    if (typeof item.value !== "string" || !question.options.some((option) => String(option.id) === value)) return { error: `Response ${id} must select an option belonging to that question` };
    seen.add(id); values.set(id, value);
  }
  return { schemaVersion: NATIVE_RESPONSE_SCHEMA_VERSION, payload: { schemaVersion: NATIVE_RESPONSE_SCHEMA_VERSION, kind: "single-choice", items: questions.filter((question) => values.has(String(question.id))).map((question) => ({ id: String(question.id), value: values.get(String(question.id)) })) } };
}

function scoreSingleChoice(publicDocument, teacherDocument, payload) {
  const questions = openResponseQuestions(publicDocument);
  const responses = new Map((payload.items || []).map((item) => [String(item.id), String(item.value)]));
  const correct = new Map((teacherDocument.parts?.[0]?.solution?.correctAnswers || []).map((answer) => [String(answer.questionId), String(answer.correctOptionId)]));
  const correctCount = questions.filter((question) => responses.get(String(question.id)) === correct.get(String(question.id))).length;
  const totalCount = questions.length;
  return { status: "submitted", correctCount, totalCount, scorePercent: totalCount ? Math.round((correctCount / totalCount) * 100) : 0 };
}

function singleChoiceReview(publicDocument, teacherDocument, payload = {}) {
  const responses = new Map((payload.items || []).map((item) => [String(item.id), String(item.value)]));
  const correct = new Map((teacherDocument.parts?.[0]?.solution?.correctAnswers || []).map((answer) => [String(answer.questionId), String(answer.correctOptionId)]));
  return openResponseQuestions(publicDocument).map((question) => {
    const selectedOptionId = responses.get(String(question.id)) || null;
    const correctOptionId = correct.get(String(question.id));
    return {
      questionId: String(question.id), prompt: question.prompt || "",
      answer: question.options.find((option) => option.id === selectedOptionId)?.text || "",
      modelAnswer: question.options.find((option) => option.id === correctOptionId)?.text || "",
      isCorrect: selectedOptionId !== null && selectedOptionId === correctOptionId, feedback: "",
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

function openResponseReview(publicDocument, teacherDocument, payload = {}) {
  const responses = new Map((payload.items || []).map((item) => [String(item.id), String(item.value ?? "")]));
  const modelAnswers = new Map((teacherDocument?.parts?.[0]?.solution?.modelAnswers || [])
    .map((answer) => [String(answer.questionId), String(answer.text ?? "")]));
  return openResponseQuestions(publicDocument).map((question) => ({
    questionId: String(question.id),
    prompt: question.prompt || "",
    answer: responses.get(String(question.id)) || "",
    modelAnswer: modelAnswers.get(String(question.id)) || "",
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

function completeSentencesReview(publicDocument, teacherDocument, payload = {}) {
  const responses = new Map((payload.items || []).map((item) => [String(item.id), String(item.value ?? "")]));
  const answers = new Map((teacherDocument?.parts?.[0]?.solution?.answers || []).map((answer) => [String(answer.itemId), String(answer.text ?? "")]));
  return completeSentenceItems(publicDocument).map((item) => ({ questionId: String(item.id), prompt: item.prompt || "", answer: responses.get(String(item.id)) || "", modelAnswer: answers.get(String(item.id)) || "", isCorrect: null, feedback: "" }));
}

function dragDropTargets(document = {}) {
  return (document.parts?.[0]?.interaction?.panels || []).flatMap((panel) => panel.dropTargets || []);
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
  const allowedWords = new Set((interaction.words || []).map((word) => String(word.id)));
  const values = new Map(); const usedWords = new Set();
  for (const item of rawEnvelope.items) {
    if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).sort().join(",") !== "id,value") return { error: "Each response item must contain exactly id and value" };
    const targetId = String(item.id || ""); const wordId = String(item.value || "");
    if (!allowedTargets.has(targetId) || !allowedWords.has(wordId) || values.has(targetId) || usedWords.has(wordId)) return { error: `Drag & Drop response ${targetId} is invalid` };
    values.set(targetId, wordId); usedWords.add(wordId);
  }
  return { schemaVersion: NATIVE_RESPONSE_SCHEMA_VERSION, payload: { schemaVersion: NATIVE_RESPONSE_SCHEMA_VERSION, kind: "drag-drop", items: targets.filter((target) => values.has(String(target.id))).map((target) => ({ id: String(target.id), value: values.get(String(target.id)) })) } };
}

function scoreDragDrop(publicDocument, teacherDocument, payload = {}) {
  const targets = dragDropTargets(publicDocument);
  const responses = new Map((payload.items || []).map((item) => [String(item.id), String(item.value)]));
  const correct = new Map((teacherDocument.parts?.[0]?.solution?.mappings || []).map((mapping) => [String(mapping.targetId), String(mapping.wordId)]));
  const correctCount = targets.filter((target) => responses.get(String(target.id)) === correct.get(String(target.id))).length;
  const totalCount = targets.length;
  return { status: "submitted", correctCount, totalCount, scorePercent: totalCount ? Math.round(correctCount / totalCount * 100) : 0 };
}

function dragDropReview(publicDocument, teacherDocument, payload = {}) {
  const words = new Map((publicDocument.parts?.[0]?.interaction?.words || []).map((word) => [String(word.id), word.text]));
  const responses = new Map((payload.items || []).map((item) => [String(item.id), String(item.value)]));
  const correct = new Map((teacherDocument.parts?.[0]?.solution?.mappings || []).map((mapping) => [String(mapping.targetId), String(mapping.wordId)]));
  return dragDropTargets(publicDocument).map((target) => {
    const selectedWordId = responses.get(String(target.id)) || null;
    const correctWordId = correct.get(String(target.id)) || null;
    return { questionId: String(target.id), prompt: target.accessibleLabel || "", answer: words.get(selectedWordId) || "", modelAnswer: words.get(correctWordId) || "", isCorrect: selectedWordId !== null && selectedWordId === correctWordId, feedback: "" };
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

export function nativeAssignmentCapability(kind) {
  return capabilities[String(kind || "")] || null;
}

export function containsClientTeacherMaterial(value) {
  if (Array.isArray(value)) return value.some(containsClientTeacherMaterial);
  if (!value || typeof value !== "object") return false;
  const forbidden = new Set(["modelAnswer", "modelAnswers", "correctOptionId", "correctAnswers", "mappings", "solution", "teacherDocument", "teacherProjection"]);
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
  return { row, verified, publicEntry, teacherEntry, capability: nativeAssignmentCapability(publicEntry.kind) };
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
      const capability = nativeAssignmentCapability(publicEntry.kind);
      targets.push({
        target: { kind: NATIVE_ASSIGNMENT_TARGET_KIND, releaseId: row.id, nativeActivityId },
        title: publicEntry.document?.metadata?.title || nativeActivityId,
        nativeKind: publicEntry.kind,
        source: "Published native",
        packageTitle: row.package_title,
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
