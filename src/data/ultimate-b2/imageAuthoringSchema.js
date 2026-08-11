import { normalizeUltimateB2ExerciseVisualCapabilities } from "./exerciseVisualCapabilities.js";
import { normalizeUltimateB2Page5ImageAuthoring, ULTIMATE_B2_PAGE5_IMAGE_ID } from "./page5AuthoringSchema.js";

const activityIdPattern = /^ultimate-b2-sb-u[1-9]\d*-p[1-9]\d*-o[1-9]\d*$/;

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function exactKeys(value, allowed, label) {
  const keys = Object.keys(object(value, label));
  if (keys.some((key) => !allowed.includes(key)) || allowed.some((key) => !keys.includes(key))) throw new Error(`${label} has missing or unknown fields.`);
}

function text(value, label, maximum, allowEmpty = false) {
  if (typeof value !== "string" || value.length > maximum || (!allowEmpty && !value.trim()) || /[<>]/.test(value)) throw new Error(`${label} is invalid.`);
  return value.trim();
}

export function normalizeUltimateB2ImageAuthoring(input, expectedActivityId = input?.activityId) {
  if (input?.schemaVersion === 1 && expectedActivityId === ULTIMATE_B2_PAGE5_IMAGE_ID) return normalizeUltimateB2Page5ImageAuthoring(input);
  const value = structuredClone(object(input, "Image authoring"));
  exactKeys(value, ["schemaVersion", "activityId", "visualCapabilities", "instructionImageAlt", "mainImage", "mainImageAlt"], "Image authoring");
  if (value.schemaVersion !== 2) throw new Error("Unsupported Image authoring schema version.");
  if (value.activityId !== expectedActivityId || !activityIdPattern.test(value.activityId)) throw new Error("Unexpected Image activity ID.");
  const visualCapabilities = normalizeUltimateB2ExerciseVisualCapabilities(value.visualCapabilities, { instructionImages: [], showTextImages: [] });
  if (visualCapabilities.instructionImage || visualCapabilities.showText.enabled) throw new Error("Publisher-created Image activities do not have untrusted auxiliary image bindings.");
  exactKeys(value.mainImage, ["binding", "repositoryPath", "sha256", "mimeType", "naturalSize"], "mainImage");
  const prefix = `src/assets/books/ultimate-b2/authoring/image/${value.activityId}/`;
  const repositoryPath = text(value.mainImage.repositoryPath, "mainImage.repositoryPath", 320);
  const filename = repositoryPath.slice(prefix.length);
  if (!repositoryPath.startsWith(prefix) || !/^[a-f0-9]{64}\.webp$/.test(filename)) throw new Error("Main image path is outside the managed Image activity directory.");
  if (filename !== `${value.mainImage.sha256}.webp`) throw new Error("Main image path does not match its digest.");
  if (value.mainImage.binding !== `image.${value.activityId}.main.${value.mainImage.sha256?.slice(0, 12)}`) throw new Error("Main image binding is invalid.");
  if (!/^[a-f0-9]{64}$/.test(value.mainImage.sha256) || value.mainImage.mimeType !== "image/webp") throw new Error("Main image digest or media type is invalid.");
  exactKeys(value.mainImage.naturalSize, ["width", "height"], "mainImage.naturalSize");
  const { width, height } = value.mainImage.naturalSize;
  if (![width, height].every((dimension) => Number.isSafeInteger(dimension) && dimension >= 16 && dimension <= 8192)) throw new Error("Main image dimensions are invalid.");
  return {
    schemaVersion: 2,
    activityId: value.activityId,
    visualCapabilities,
    instructionImageAlt: text(value.instructionImageAlt, "instructionImageAlt", 1_000, true),
    mainImage: { binding: value.mainImage.binding, repositoryPath, sha256: value.mainImage.sha256, mimeType: "image/webp", naturalSize: { width, height } },
    mainImageAlt: text(value.mainImageAlt, "mainImageAlt", 2_000),
  };
}
