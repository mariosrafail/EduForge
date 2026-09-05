import { nativeOpenResponseAssetRequirements, normalizeNativeOpenResponseInteraction, normalizeNativeOpenResponseSolution, assessNativeOpenResponseReadiness, validateNativeOpenResponseTopology } from "./nativeOpenResponse.js";
import { normalizeNativeImageInteraction, normalizeNativeImageSolution, assessNativeImageReadiness } from "./nativeImage.js";
import { nativeSingleChoicePresentationAssetRequirements, normalizeNativeSingleChoiceInteraction, normalizeNativeSingleChoiceSolution, assessNativeSingleChoiceReadiness, validateNativeSingleChoiceTopology } from "./nativeSingleChoice.js";
import { nativeCompleteSentencesAssetRequirements, normalizeNativeCompleteSentencesInteraction, normalizeNativeCompleteSentencesSolution, assessNativeCompleteSentencesReadiness, validateNativeCompleteSentencesTopology } from "./nativeCompleteSentences.js";
import { nativeDragDropAssetRequirements, normalizeNativeDragDropInteraction, normalizeNativeDragDropSolution, assessNativeDragDropReadiness, validateNativeDragDropTopology } from "./nativeDragDrop.js";
import { nativeMarkWordsAssetRequirements, normalizeNativeMarkWordsInteraction, normalizeNativeMarkWordsSolution, assessNativeMarkWordsReadiness, validateNativeMarkWordsTopology } from "./nativeMarkWords.js";

export const NATIVE_MULTI_PART_CHILDREN = Object.freeze({
  "open-response": Object.freeze({ normalizeInteraction: normalizeNativeOpenResponseInteraction, requirements: nativeOpenResponseAssetRequirements }),
  "image": Object.freeze({ normalizeInteraction: normalizeNativeImageInteraction }),
  "single-choice": Object.freeze({ normalizeInteraction: normalizeNativeSingleChoiceInteraction, requirements: nativeSingleChoicePresentationAssetRequirements }),
  "complete-sentences": Object.freeze({ normalizeInteraction: normalizeNativeCompleteSentencesInteraction, requirements: nativeCompleteSentencesAssetRequirements }),
  "drag-drop": Object.freeze({ normalizeInteraction: normalizeNativeDragDropInteraction, requirements: nativeDragDropAssetRequirements }),
  "mark-the-words": Object.freeze({ normalizeInteraction: normalizeNativeMarkWordsInteraction, requirements: nativeMarkWordsAssetRequirements }),
});

// Keep private behavior out of the eagerly retained public adapter registry.
export function nativeMultiPartTeacherChild(kind) {
  switch (kind) {
    case "open-response": return { normalizeSolution: normalizeNativeOpenResponseSolution, readiness: assessNativeOpenResponseReadiness, topology: validateNativeOpenResponseTopology };
    case "image": return { normalizeSolution: normalizeNativeImageSolution, readiness: assessNativeImageReadiness, topology: () => true };
    case "single-choice": return { normalizeSolution: normalizeNativeSingleChoiceSolution, readiness: assessNativeSingleChoiceReadiness, topology: validateNativeSingleChoiceTopology };
    case "complete-sentences": return { normalizeSolution: normalizeNativeCompleteSentencesSolution, readiness: assessNativeCompleteSentencesReadiness, topology: validateNativeCompleteSentencesTopology };
    case "drag-drop": return { normalizeSolution: normalizeNativeDragDropSolution, readiness: assessNativeDragDropReadiness, topology: validateNativeDragDropTopology };
    case "mark-the-words": return { normalizeSolution: normalizeNativeMarkWordsSolution, readiness: assessNativeMarkWordsReadiness, topology: validateNativeMarkWordsTopology };
    default: throw new Error("Unsupported Multi-Part Teacher child.");
  }
}
