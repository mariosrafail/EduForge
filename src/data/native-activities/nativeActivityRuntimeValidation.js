import { normalizeNativeActivityPublic } from "./nativeActivityPublic.js";
import { normalizeNativeMarkWordsInteraction, normalizeNativeMarkWordsSolution, validateNativeMarkWordsTopology } from "./nativeMarkWords.js";
import { normalizeNativeActivityTeacher, validateNativeActivityDocumentPair } from "./nativeActivityTeacher.js";
import { normalizeNativeImageInteraction } from "./nativeImage.js";
import { normalizeNativeOpenResponseInteraction, normalizeNativeOpenResponseSolution, validateNativeOpenResponseTopology } from "./nativeOpenResponse.js";
import { normalizeNativeSingleChoiceInteraction, normalizeNativeSingleChoiceSolution, validateNativeSingleChoiceTopology } from "./nativeSingleChoice.js";
import { normalizeNativeCompleteSentencesInteraction, normalizeNativeCompleteSentencesSolution, validateNativeCompleteSentencesTopology } from "./nativeCompleteSentences.js";
import { normalizeNativeListeningInteraction, normalizeNativeListeningSolution, validateNativeListeningTopology } from "./nativeListening.js";
import { normalizeNativeOldschoolListeningInteraction, normalizeNativeOldschoolListeningSolution, validateNativeOldschoolListeningTopology } from "./nativeOldschoolListening.js";
import { normalizeNativeDragDropInteraction, normalizeNativeDragDropSolution, validateNativeDragDropTopology } from "./nativeDragDrop.js";

export function normalizeNativeRuntimePublicDocument(document, { activityId, kind }) {
  const normalizeInteraction = kind === "mark-the-words" ? normalizeNativeMarkWordsInteraction : kind === "open-response"
    ? normalizeNativeOpenResponseInteraction
    : kind === "image"
      ? normalizeNativeImageInteraction
      : kind === "single-choice"
        ? normalizeNativeSingleChoiceInteraction
        : kind === "complete-sentences"
          ? normalizeNativeCompleteSentencesInteraction
        : kind === "listening"
          ? normalizeNativeListeningInteraction
        : kind === "oldschool-listening"
          ? normalizeNativeOldschoolListeningInteraction
        : kind === "drag-drop"
          ? normalizeNativeDragDropInteraction
      : null;
  if (!normalizeInteraction) throw new Error("Native runtime kind is unsupported.");
  return normalizeNativeActivityPublic(document, { expectedActivityId: activityId, expectedKind: kind, normalizeInteraction });
}

export function normalizeNativeRuntimeTeacherDocument(document, { activityId, kind, publicDocument }) {
  if (!["open-response", "single-choice", "complete-sentences", "listening", "oldschool-listening", "drag-drop", "mark-the-words"].includes(kind)) throw new Error("Native runtime Teacher document is unsupported.");
  const normalized = normalizeNativeActivityTeacher(document, {
    expectedActivityId: activityId,
    expectedKind: kind,
    normalizeSolution: kind === "mark-the-words" ? normalizeNativeMarkWordsSolution : kind === "open-response" ? normalizeNativeOpenResponseSolution : kind === "single-choice" ? normalizeNativeSingleChoiceSolution : kind === "complete-sentences" ? normalizeNativeCompleteSentencesSolution : kind === "listening" ? normalizeNativeListeningSolution : kind === "oldschool-listening" ? normalizeNativeOldschoolListeningSolution : normalizeNativeDragDropSolution,
  });
  validateNativeActivityDocumentPair(publicDocument, normalized);
  if (kind === "mark-the-words") validateNativeMarkWordsTopology(publicDocument, normalized);
  else if (kind === "open-response") validateNativeOpenResponseTopology(publicDocument, normalized);
  else if (kind === "single-choice") validateNativeSingleChoiceTopology(publicDocument, normalized);
  else if (kind === "complete-sentences") validateNativeCompleteSentencesTopology(publicDocument, normalized);
  else if (kind === "listening") validateNativeListeningTopology(publicDocument, normalized);
  else if (kind === "oldschool-listening") validateNativeOldschoolListeningTopology(publicDocument, normalized);
  else validateNativeDragDropTopology(publicDocument, normalized);
  return normalized;
}
