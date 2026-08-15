import { NATIVE_ACTIVITY_KINDS, nativeActivityKindLabels } from "../../../src/data/native-activities/nativeActivityKinds.js";
import {
  NATIVE_ACTIVITY_PART_ID,
  NATIVE_ACTIVITY_SCHEMA_VERSION,
  normalizeNativeActivityPublic,
} from "../../../src/data/native-activities/nativeActivityPublic.js";
import { normalizeNativeActivityTeacher, validateNativeActivityDocumentPair } from "../../../src/data/native-activities/nativeActivityTeacher.js";
import { normalizeNativeImageInteraction, normalizeNativeImageSolution } from "../../../src/data/native-activities/nativeImage.js";
import { assessNativeImageReadiness } from "../../../src/data/native-activities/nativeImage.js";
import {
  normalizeNativeOpenResponseInteraction,
  normalizeNativeOpenResponseSolution,
  validateNativeOpenResponseTopology,
  assessNativeOpenResponseReadiness,
} from "../../../src/data/native-activities/nativeOpenResponse.js";

function definition(kind, normalizeInteraction, normalizeSolution, blankInteraction, blankSolution, validateTopology = null, assessReadiness = null) {
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
    assessReadiness(publicDocument, teacherDocument) {
      this.validatePair(publicDocument, teacherDocument);
      return assessReadiness ? assessReadiness(publicDocument, teacherDocument) : { ready: true, issues: [] };
    },
  });
}

const registry = Object.freeze({
  "open-response": definition("open-response", normalizeNativeOpenResponseInteraction, normalizeNativeOpenResponseSolution, () => ({ kind: "open-response", surface: { width: 1024, height: 582 }, artwork: [], questions: [] }), () => ({ kind: "open-response", modelAnswers: [] }), validateNativeOpenResponseTopology, assessNativeOpenResponseReadiness),
  image: definition("image", normalizeNativeImageInteraction, normalizeNativeImageSolution, () => ({ kind: "image", surface: { width: 1024, height: 582 }, images: [] }), () => ({ kind: "image" }), null, assessNativeImageReadiness),
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
