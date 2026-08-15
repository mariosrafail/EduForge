import { normalizeNativeActivityPublic } from "./nativeActivityPublic.js";
import { normalizeNativeActivityTeacher, validateNativeActivityDocumentPair } from "./nativeActivityTeacher.js";
import { normalizeNativeImageInteraction } from "./nativeImage.js";
import { normalizeNativeOpenResponseInteraction, normalizeNativeOpenResponseSolution, validateNativeOpenResponseTopology } from "./nativeOpenResponse.js";

export function normalizeNativeRuntimePublicDocument(document, { activityId, kind }) {
  const normalizeInteraction = kind === "open-response"
    ? normalizeNativeOpenResponseInteraction
    : kind === "image"
      ? normalizeNativeImageInteraction
      : null;
  if (!normalizeInteraction) throw new Error("Native runtime kind is unsupported.");
  return normalizeNativeActivityPublic(document, { expectedActivityId: activityId, expectedKind: kind, normalizeInteraction });
}

export function normalizeNativeRuntimeTeacherDocument(document, { activityId, kind, publicDocument }) {
  if (kind !== "open-response") throw new Error("Native runtime Teacher document is unsupported.");
  const normalized = normalizeNativeActivityTeacher(document, {
    expectedActivityId: activityId,
    expectedKind: kind,
    normalizeSolution: normalizeNativeOpenResponseSolution,
  });
  validateNativeActivityDocumentPair(publicDocument, normalized);
  validateNativeOpenResponseTopology(publicDocument, normalized);
  return normalized;
}
