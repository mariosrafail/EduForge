import { isNativeChildId } from "./nativeChildIdentity.js";
import { removeNativeManagedAssetReferenceIfUnused } from "./nativeActivityPublic.js";

export const NATIVE_IMAGE_LIMITS = Object.freeze({ images: 32, altTextLength: 2_000, contentTextLength: 10_000, surfaceMaximum: 10_000 });
export const NATIVE_IMAGE_DEFAULT_SURFACE = Object.freeze({ width: 1024, height: 582 });
const LEGACY_IMAGE_ID = "img-00000000000040008000000000000000";

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function exactKeys(value, keys, label) {
  const actual = Object.keys(object(value, label)).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} has missing or unknown fields.`);
}

function number(value, label, minimum, maximum) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${label} is invalid.`);
  return Math.round(value * 1_000) / 1_000;
}

function integer(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${label} is invalid.`);
  return value;
}

function text(value, label, maximum) {
  if (typeof value !== "string" || value.length > maximum || /[<>\u0000-\u001f\u007f]/.test(value)) throw new Error(`${label} is invalid.`);
  return value.trim();
}

function multilineText(value, label, maximum) {
  if (typeof value !== "string" || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new Error(`${label} is invalid.`);
  return value.replace(/\r\n?/g, "\n").trim();
}

function surface(input) {
  exactKeys(input, ["width", "height"], "Native Image surface");
  return {
    width: integer(input.width, "Native Image surface width", 1, NATIVE_IMAGE_LIMITS.surfaceMaximum),
    height: integer(input.height, "Native Image surface height", 1, NATIVE_IMAGE_LIMITS.surfaceMaximum),
  };
}

function area(input, label, logicalSurface) {
  exactKeys(input, ["x", "y", "width", "height"], label);
  const value = {
    x: number(input.x, `${label}.x`, 0, logicalSurface.width),
    y: number(input.y, `${label}.y`, 0, logicalSurface.height),
    width: number(input.width, `${label}.width`, 1, logicalSurface.width),
    height: number(input.height, `${label}.height`, 1, logicalSurface.height),
  };
  if (value.x + value.width > logicalSurface.width || value.y + value.height > logicalSurface.height) throw new Error(`${label} must stay inside the logical surface.`);
  return value;
}

function normalizeImage(input, index, logicalSurface, assetSlots) {
  const label = `Native Image images[${index}]`;
  exactKeys(input, ["id", "assetSlot", "area", "order", "altText", "decorative", "fit", "locked"], label);
  if (!isNativeChildId(input.id, "img")) throw new Error(`${label}.id is invalid.`);
  if (!assetSlots.has(input.assetSlot)) throw new Error(`${label}.assetSlot does not reference a managed asset.`);
  if (!Number.isSafeInteger(input.order) || input.order !== index) throw new Error(`${label}.order must match deterministic array order.`);
  if (!["contain", "cover"].includes(input.fit)) throw new Error(`${label}.fit is invalid.`);
  if (typeof input.decorative !== "boolean") throw new Error(`${label}.decorative is invalid.`);
  if (typeof input.locked !== "boolean") throw new Error(`${label}.locked is invalid.`);
  return {
    id: input.id,
    assetSlot: input.assetSlot,
    area: area(input.area, `${label}.area`, logicalSurface),
    order: input.order,
    altText: text(input.altText, `${label}.altText`, NATIVE_IMAGE_LIMITS.altTextLength),
    decorative: input.decorative,
    fit: input.fit,
    locked: input.locked,
  };
}

function normalizeLegacyInteraction(value, assets, commonAssetSlots) {
  exactKeys(value, ["kind", "image", "altText"], "Native Image interaction");
  const altText = text(value.altText, "Native Image alt text", NATIVE_IMAGE_LIMITS.altTextLength);
  if (value.image === null) {
    if (assets.some((asset) => !commonAssetSlots.has(asset.slot))) throw new Error("Blank Native Image drafts cannot retain unused managed assets.");
    return { kind: "image", surface: { ...NATIVE_IMAGE_DEFAULT_SURFACE }, images: [] };
  }
  exactKeys(value.image, ["assetSlot", "fit", "decorative"], "Native Image descriptor");
  const imageAsset = assets.find((asset) => asset.slot === value.image.assetSlot);
  if (!imageAsset || imageAsset.role !== "activity_artwork" || assets.some((asset) => asset !== imageAsset && !commonAssetSlots.has(asset.slot))) throw new Error("Legacy Native Image must map managed activity artwork by slot without unused assets.");
  return normalizeNativeImageInteraction({
    kind: "image",
    surface: { ...NATIVE_IMAGE_DEFAULT_SURFACE },
    images: [{ id: LEGACY_IMAGE_ID, assetSlot: value.image.assetSlot, area: { x: 0, y: 0, ...NATIVE_IMAGE_DEFAULT_SURFACE }, order: 0, altText, decorative: value.image.decorative, fit: value.image.fit, locked: false }],
  }, { assets, commonAssetSlots });
}

export function normalizeNativeImageInteraction(input, { assets = [], commonAssetSlots = new Set() } = {}) {
  const value = structuredClone(object(input, "Native Image interaction"));
  if (value.kind !== "image") throw new Error("Native Image interaction kind is invalid.");
  if (Object.hasOwn(value, "image") || Object.hasOwn(value, "altText")) return normalizeLegacyInteraction(value, assets, commonAssetSlots);
  const hasContentText = Object.hasOwn(value, "contentText");
  exactKeys(value, ["kind", "surface", "images", ...(hasContentText ? ["contentText"] : [])], "Native Image interaction");
  const logicalSurface = surface(value.surface);
  if (!Array.isArray(value.images) || value.images.length > NATIVE_IMAGE_LIMITS.images) throw new Error("Native Image image count is invalid.");
  const assetSlots = new Set(assets.map((asset) => asset.slot));
  const ids = new Set();
  const usedSlots = new Set();
  const images = value.images.map((entry, index) => {
    const normalized = normalizeImage(entry, index, logicalSurface, assetSlots);
    if (ids.has(normalized.id)) throw new Error("Native Image instance identities must be unique.");
    ids.add(normalized.id); usedSlots.add(normalized.assetSlot);
    return normalized;
  });
  if (assets.some((asset) => asset.role !== "activity_artwork" || (!usedSlots.has(asset.slot) && !commonAssetSlots.has(asset.slot)))) throw new Error("Every Native Image managed asset must be used by an image instance or common supporting content.");
  const normalized = { kind: "image", surface: logicalSurface, images };
  if (hasContentText) normalized.contentText = multilineText(value.contentText, "Native Image content text", NATIVE_IMAGE_LIMITS.contentTextLength);
  return normalized;
}

export function duplicateNativeImage(interaction, sourceId, duplicateId) {
  const value = object(interaction, "Native Image interaction");
  if (!Array.isArray(value.images) || value.images.length >= NATIVE_IMAGE_LIMITS.images) throw new Error("Native Image image count is invalid.");
  const source = value.images.find((entry) => entry.id === sourceId);
  if (!source) throw new Error("Native Image source instance does not exist.");
  if (!isNativeChildId(duplicateId, "img") || value.images.some((entry) => entry.id === duplicateId)) throw new Error("Native Image duplicate instance ID is invalid.");
  const logicalSurface = surface(value.surface);
  const duplicate = structuredClone(source);
  duplicate.id = duplicateId;
  duplicate.area.x = Math.min(source.area.x + 16, logicalSurface.width - source.area.width);
  duplicate.area.y = Math.min(source.area.y + 16, logicalSurface.height - source.area.height);
  duplicate.order = value.images.length;
  duplicate.locked = false;
  value.images.push(duplicate);
  return duplicate;
}

export function removeNativeImage(publicDocument, imageId) {
  const value = object(publicDocument, "Native public activity");
  if (!Array.isArray(value.assets) || !Array.isArray(value.parts) || !value.parts[0]?.interaction) throw new Error("Native Image document is invalid.");
  const interaction = value.parts[0].interaction;
  if (!Array.isArray(interaction.images)) throw new Error("Native Image instances are invalid.");
  const removed = interaction.images.find((entry) => entry.id === imageId);
  if (!removed) throw new Error("Native Image instance does not exist.");
  interaction.images = interaction.images.filter((entry) => entry.id !== imageId).map((entry, order) => ({ ...entry, order }));
  removeNativeManagedAssetReferenceIfUnused(value, removed.assetSlot);
  return removed;
}

export function normalizeNativeImageSolution(input) {
  const value = structuredClone(object(input, "Native Image Teacher solution"));
  exactKeys(value, ["kind"], "Native Image Teacher solution");
  if (value.kind !== "image") throw new Error("Native Image Teacher solution kind is invalid.");
  return { kind: "image" };
}

export function assessNativeImageReadiness(publicDocument) {
  const images = publicDocument.parts[0].interaction.images;
  const issues = [];
  if (!images.length) issues.push("Add at least one image.");
  images.forEach((image, index) => { if (!image.decorative && !image.altText.trim()) issues.push(`Image ${index + 1} needs alt text or must be marked decorative.`); });
  return { ready: issues.length === 0, issues };
}
