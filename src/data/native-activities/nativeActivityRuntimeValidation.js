import { normalizeNativeActivityPublic } from "./nativeActivityPublic.js";
import { normalizeNativeActivityTeacher, validateNativeActivityDocumentPair } from "./nativeActivityTeacher.js";
import { normalizeNativeImageInteraction } from "./nativeImage.js";
import { normalizeNativeOpenResponseInteraction, normalizeNativeOpenResponseSolution, validateNativeOpenResponseTopology } from "./nativeOpenResponse.js";
import { normalizeNativeSingleChoiceInteraction, normalizeNativeSingleChoiceSolution, validateNativeSingleChoiceTopology } from "./nativeSingleChoice.js";
import { normalizeNativeCompleteSentencesInteraction, normalizeNativeCompleteSentencesSolution, validateNativeCompleteSentencesTopology } from "./nativeCompleteSentences.js";
import { normalizeNativeListeningInteraction, normalizeNativeListeningSolution, validateNativeListeningTopology } from "./nativeListening.js";

export function normalizeNativeRuntimePublicDocument(document, { activityId, kind }) {
  const normalizeInteraction = kind === "open-response"
    ? normalizeNativeOpenResponseInteraction
    : kind === "image"
      ? normalizeNativeImageInteraction
      : kind === "single-choice"
        ? normalizeNativeSingleChoiceInteraction
        : kind === "complete-sentences"
          ? normalizeNativeCompleteSentencesInteraction
        : kind === "listening"
          ? normalizeNativeListeningInteraction
      : null;
  if (!normalizeInteraction) throw new Error("Native runtime kind is unsupported.");
  return normalizeNativeActivityPublic(document, { expectedActivityId: activityId, expectedKind: kind, normalizeInteraction });
}

export function normalizeNativeRuntimeTeacherDocument(document, { activityId, kind, publicDocument }) {
  if (!["open-response", "single-choice", "complete-sentences", "listening"].includes(kind)) throw new Error("Native runtime Teacher document is unsupported.");
  const normalized = normalizeNativeActivityTeacher(document, {
    expectedActivityId: activityId,
    expectedKind: kind,
    normalizeSolution: kind === "open-response" ? normalizeNativeOpenResponseSolution : kind === "single-choice" ? normalizeNativeSingleChoiceSolution : kind === "complete-sentences" ? normalizeNativeCompleteSentencesSolution : normalizeNativeListeningSolution,
  });
  validateNativeActivityDocumentPair(publicDocument, normalized);
  if (kind === "open-response") validateNativeOpenResponseTopology(publicDocument, normalized);
  else if (kind === "single-choice") validateNativeSingleChoiceTopology(publicDocument, normalized);
  else if (kind === "complete-sentences") validateNativeCompleteSentencesTopology(publicDocument, normalized);
  else validateNativeListeningTopology(publicDocument, normalized);
  return normalized;
}
