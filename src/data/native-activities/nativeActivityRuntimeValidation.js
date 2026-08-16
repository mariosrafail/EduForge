import { normalizeNativeActivityPublic } from "./nativeActivityPublic.js";
import { normalizeNativeActivityTeacher, validateNativeActivityDocumentPair } from "./nativeActivityTeacher.js";
import { normalizeNativeImageInteraction } from "./nativeImage.js";
import { normalizeNativeOpenResponseInteraction, normalizeNativeOpenResponseSolution, validateNativeOpenResponseTopology } from "./nativeOpenResponse.js";
import { normalizeNativeSingleChoiceInteraction, normalizeNativeSingleChoiceSolution, validateNativeSingleChoiceTopology } from "./nativeSingleChoice.js";

export function normalizeNativeRuntimePublicDocument(document, { activityId, kind }) {
  const normalizeInteraction = kind === "open-response"
    ? normalizeNativeOpenResponseInteraction
    : kind === "image"
      ? normalizeNativeImageInteraction
      : kind === "single-choice"
        ? normalizeNativeSingleChoiceInteraction
      : null;
  if (!normalizeInteraction) throw new Error("Native runtime kind is unsupported.");
  return normalizeNativeActivityPublic(document, { expectedActivityId: activityId, expectedKind: kind, normalizeInteraction });
}

export function normalizeNativeRuntimeTeacherDocument(document, { activityId, kind, publicDocument }) {
  if (!["open-response", "single-choice"].includes(kind)) throw new Error("Native runtime Teacher document is unsupported.");
  const normalized = normalizeNativeActivityTeacher(document, {
    expectedActivityId: activityId,
    expectedKind: kind,
    normalizeSolution: kind === "open-response" ? normalizeNativeOpenResponseSolution : normalizeNativeSingleChoiceSolution,
  });
  validateNativeActivityDocumentPair(publicDocument, normalized);
  if (kind === "open-response") validateNativeOpenResponseTopology(publicDocument, normalized);
  else validateNativeSingleChoiceTopology(publicDocument, normalized);
  return normalized;
}
