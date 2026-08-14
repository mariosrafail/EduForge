export const NATIVE_ACTIVITY_KINDS = Object.freeze(["open-response", "image"]);

export const nativeActivityKindLabels = Object.freeze({
  "open-response": "Open Response",
  image: "Image",
});

export function isNativeActivityKind(kind) {
  return NATIVE_ACTIVITY_KINDS.includes(kind);
}
