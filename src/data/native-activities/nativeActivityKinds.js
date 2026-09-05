export const NATIVE_ACTIVITY_KINDS = Object.freeze(["multi-part", "open-response", "image", "single-choice", "complete-sentences", "listening", "oldschool-listening", "drag-drop", "mark-the-words"]);

export const NATIVE_SUPPLEMENTAL_AUDIO_KINDS = Object.freeze(["multi-part", "image", "open-response", "single-choice", "complete-sentences", "listening", "drag-drop", "mark-the-words"]);

export const nativeActivityKindLabels = Object.freeze({
  "multi-part": "Multi-Part",
  "open-response": "Open Response",
  image: "Image",
  "single-choice": "Multiple Choice",
  "complete-sentences": "Complete the Sentences",
  listening: "Listening",
  "oldschool-listening": "Oldschool Listening",
  "drag-drop": "Drag & Drop",
  "mark-the-words": "Mark the Words",
});

export function isNativeActivityKind(kind) {
  return NATIVE_ACTIVITY_KINDS.includes(kind);
}

export function supportsNativeSupplementalAudio(kind) {
  return NATIVE_SUPPLEMENTAL_AUDIO_KINDS.includes(kind);
}
