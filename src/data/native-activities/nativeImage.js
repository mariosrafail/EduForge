export const NATIVE_IMAGE_ALT_TEXT_LIMIT = 2_000;

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function exactKeys(value, keys, label) {
  const actual = Object.keys(object(value, label)).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} has missing or unknown fields.`);
}

function text(value, label, maximum) {
  if (typeof value !== "string" || value.length > maximum || /[<>\u0000-\u001f\u007f]/.test(value)) throw new Error(`${label} is invalid.`);
  return value.trim();
}

export function normalizeNativeImageInteraction(input, { assets = [] } = {}) {
  const value = structuredClone(object(input, "Native Image interaction"));
  exactKeys(value, ["kind", "image", "altText"], "Native Image interaction");
  if (value.kind !== "image") throw new Error("Native Image interaction kind is invalid.");
  const altText = text(value.altText, "Native Image alt text", NATIVE_IMAGE_ALT_TEXT_LIMIT);
  if (value.image === null) {
    if (assets.length) throw new Error("Blank Native Image drafts cannot retain managed assets.");
    return { kind: "image", image: null, altText };
  }
  exactKeys(value.image, ["assetSlot", "fit", "decorative"], "Native Image descriptor");
  if (typeof value.image.assetSlot !== "string" || !/^[a-z0-9][a-z0-9-]{0,127}$/.test(value.image.assetSlot)) throw new Error("Native Image asset slot is invalid.");
  if (!["contain", "cover"].includes(value.image.fit)) throw new Error("Native Image fit is invalid.");
  if (typeof value.image.decorative !== "boolean") throw new Error("Native Image decorative state is invalid.");
  if (assets.length !== 1 || assets[0].slot !== value.image.assetSlot || assets[0].role !== "activity_artwork") throw new Error("Native Image must map exactly one managed activity artwork asset by slot.");
  return { kind: "image", image: { assetSlot: value.image.assetSlot, fit: value.image.fit, decorative: value.image.decorative }, altText };
}

export function normalizeNativeImageSolution(input) {
  const value = structuredClone(object(input, "Native Image Teacher solution"));
  exactKeys(value, ["kind"], "Native Image Teacher solution");
  if (value.kind !== "image") throw new Error("Native Image Teacher solution kind is invalid.");
  return { kind: "image" };
}

export function assessNativeImageReadiness(publicDocument) {
  const interaction = publicDocument.parts[0].interaction;
  const issues = [];
  if (!interaction.image) issues.push("Upload an image.");
  else if (!interaction.image.decorative && !interaction.altText.trim()) issues.push("Add alt text or mark the image decorative.");
  return { ready: issues.length === 0, issues };
}
