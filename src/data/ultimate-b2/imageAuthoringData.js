import { normalizeUltimateB2ImageAuthoring } from "./imageAuthoringSchema.js";
import { getUltimateB2Page5ImageAuthoring, resolveUltimateB2Page5Artwork } from "./page5AuthoringData.js";
import { ULTIMATE_B2_PAGE5_IMAGE_ID } from "./page5AuthoringSchema.js";

const authoringModules = import.meta.glob("./authoring/**/*.image.json", { eager: true, import: "default" });
const assetModules = import.meta.glob("../../assets/books/ultimate-b2/authoring/image/**/*.webp", { eager: true, query: "?url", import: "default" });
const authoredById = new Map();

for (const source of Object.values(authoringModules)) {
  const authoring = normalizeUltimateB2ImageAuthoring(source, source.activityId);
  authoredById.set(authoring.activityId, Object.freeze(authoring));
}

function assetKey(repositoryPath) {
  return repositoryPath?.startsWith("src/assets/") ? `../../assets/${repositoryPath.slice("src/assets/".length)}` : "";
}

export function getUltimateB2ImageAuthoring(activityOrId) {
  const activityId = typeof activityOrId === "string" ? activityOrId : activityOrId?.stableNormalizedId;
  if (activityId === ULTIMATE_B2_PAGE5_IMAGE_ID) return getUltimateB2Page5ImageAuthoring(activityId);
  return authoredById.get(activityId) || null;
}

export function resolveUltimateB2ImageAuthoringAsset(authoring) {
  if (!authoring) return null;
  if (authoring.schemaVersion === 1) return resolveUltimateB2Page5Artwork(authoring.mainImage);
  const bundled = assetModules[assetKey(authoring.mainImage.repositoryPath)] || null;
  if (bundled || !import.meta.env.DEV) return bundled;
  return `/__hhplms/ultimate-b2-image-asset?activityId=${encodeURIComponent(authoring.activityId)}&file=${encodeURIComponent(authoring.mainImage.repositoryPath.split("/").at(-1))}`;
}

export function getUltimateB2ImageActivity(activityOrId) {
  const authoring = getUltimateB2ImageAuthoring(activityOrId);
  if (!authoring) return null;
  return Object.freeze({
    ...authoring,
    activityType: "image",
    instructionImage: authoring.schemaVersion === 1 ? resolveUltimateB2Page5Artwork(authoring.visualCapabilities.instructionImage) : null,
    image: resolveUltimateB2ImageAuthoringAsset(authoring),
  });
}

export function isUltimateB2ImageActivity(activity) {
  return Boolean(["image", "publisher-image-display"].includes(activity?.activityType) && getUltimateB2ImageActivity(activity));
}
