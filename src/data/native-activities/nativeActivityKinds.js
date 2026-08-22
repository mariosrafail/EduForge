export const NATIVE_ACTIVITY_KINDS = Object.freeze(["open-response", "image", "single-choice", "complete-sentences", "listening"]);

export const nativeActivityKindLabels = Object.freeze({
  "open-response": "Open Response",
  image: "Image",
  "single-choice": "Multiple Choice",
  "complete-sentences": "Complete the Sentences",
  listening: "Listening",
});

export function isNativeActivityKind(kind) {
  return NATIVE_ACTIVITY_KINDS.includes(kind);
}
