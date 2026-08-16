export const NATIVE_ACTIVITY_KINDS = Object.freeze(["open-response", "image", "single-choice"]);

export const nativeActivityKindLabels = Object.freeze({
  "open-response": "Open Response",
  image: "Image",
  "single-choice": "Multiple Choice",
});

export function isNativeActivityKind(kind) {
  return NATIVE_ACTIVITY_KINDS.includes(kind);
}
