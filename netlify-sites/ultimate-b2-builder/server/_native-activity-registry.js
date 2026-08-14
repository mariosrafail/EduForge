import { NATIVE_ACTIVITY_KINDS, nativeActivityKindLabels } from "../../../src/data/native-activities/nativeActivityKinds.js";
import {
  NATIVE_ACTIVITY_PART_ID,
  NATIVE_ACTIVITY_SCHEMA_VERSION,
  normalizeNativeActivityPublic,
} from "../../../src/data/native-activities/nativeActivityPublic.js";
import { normalizeNativeActivityTeacher, validateNativeActivityDocumentPair } from "../../../src/data/native-activities/nativeActivityTeacher.js";
import {
  normalizeNativeOpenResponseInteraction,
  normalizeNativeOpenResponseSolution,
  validateNativeOpenResponseTopology,
} from "../../../src/data/native-activities/nativeOpenResponse.js";

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function exactKeys(value, keys, label) {
  const actual = Object.keys(object(value, label)).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} has missing or unknown fields.`);
}

function integer(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${label} is invalid.`);
  return value;
}

function normalizeBlankImageInteraction(input) {
  const value = structuredClone(object(input, "Native Image interaction"));
  exactKeys(value, ["kind", "image", "altText"], "Native Image interaction");
  if (value.kind !== "image" || value.image !== null || value.altText !== "") throw new Error("Phase 2 Image interaction must remain an empty structural draft.");
  return { kind: "image", image: null, altText: "" };
}

function normalizeBlankImageSolution(input) {
  const value = structuredClone(object(input, "Native Image Teacher solution"));
  exactKeys(value, ["kind"], "Native Image Teacher solution");
  if (value.kind !== "image") throw new Error("Native Image Teacher solution kind is invalid.");
  return { kind: "image" };
}

function definition(kind, normalizeInteraction, normalizeSolution, blankInteraction, blankSolution, validateTopology = null) {
  return Object.freeze({
    kind,
    label: nativeActivityKindLabels[kind],
    createBlankPublic({ activityId, title, placement }) {
      return normalizeNativeActivityPublic({ schemaVersion: NATIVE_ACTIVITY_SCHEMA_VERSION, activityId, kind, metadata: { title, visibleInstructionText: "" }, placement: { pageId: placement.pageId }, assets: [], parts: [{ id: NATIVE_ACTIVITY_PART_ID, interaction: blankInteraction() }] }, { normalizeInteraction, expectedActivityId: activityId, expectedKind: kind });
    },
    createBlankTeacher({ activityId }) {
      return normalizeNativeActivityTeacher({ schemaVersion: NATIVE_ACTIVITY_SCHEMA_VERSION, activityId, kind, parts: [{ id: NATIVE_ACTIVITY_PART_ID, solution: blankSolution() }] }, { normalizeSolution, expectedActivityId: activityId, expectedKind: kind });
    },
    normalizePublic(document, expectedActivityId = null) { return normalizeNativeActivityPublic(document, { normalizeInteraction, expectedActivityId, expectedKind: kind }); },
    normalizeTeacher(document, expectedActivityId = null) { return normalizeNativeActivityTeacher(document, { normalizeSolution, expectedActivityId, expectedKind: kind }); },
    validatePair(publicDocument, teacherDocument) {
      const normalizedPublic = this.normalizePublic(publicDocument);
      const normalizedTeacher = this.normalizeTeacher(teacherDocument);
      validateNativeActivityDocumentPair(normalizedPublic, normalizedTeacher);
      if (validateTopology) validateTopology(normalizedPublic, normalizedTeacher);
      return true;
    },
  });
}

const registry = Object.freeze({
  "open-response": definition("open-response", normalizeNativeOpenResponseInteraction, normalizeNativeOpenResponseSolution, () => ({ kind: "open-response", surface: { width: 1024, height: 582 }, artwork: [], questions: [] }), () => ({ kind: "open-response", modelAnswers: [] }), validateNativeOpenResponseTopology),
  image: definition("image", normalizeBlankImageInteraction, normalizeBlankImageSolution, () => ({ kind: "image", image: null, altText: "" }), () => ({ kind: "image" })),
});

export function resolveNativeActivityKind(kind) { return registry[kind] || null; }
export function normalizeNativeActivityPublicDocument(document, expectedActivityId = null) {
  const entry = resolveNativeActivityKind(document?.kind);
  if (!entry) throw new Error("Native activity kind is not registered.");
  return entry.normalizePublic(document, expectedActivityId);
}
export function normalizeNativeActivityTeacherDocument(document, expectedActivityId = null) {
  const entry = resolveNativeActivityKind(document?.kind);
  if (!entry) throw new Error("Native activity kind is not registered.");
  return entry.normalizeTeacher(document, expectedActivityId);
}
export function validateNativeActivityPair(publicDocument, teacherDocument) {
  if (publicDocument?.kind !== teacherDocument?.kind) throw new Error("Native public and Teacher kinds must match.");
  const entry = resolveNativeActivityKind(publicDocument?.kind);
  if (!entry) throw new Error("Native activity kind is not registered.");
  return entry.validatePair(publicDocument, teacherDocument);
}
export { NATIVE_ACTIVITY_KINDS, registry as nativeActivityKindRegistry };
