import {
  getUltimateB2Page5OpenResponseRuntime,
  resolveUltimateB2Page5RuntimeArtwork,
  ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID,
} from "./page5RuntimeData.js";

const genericAuthoringModules = import.meta.glob(["./authoring/**/*.open-response.json", "!./authoring/unit-01-page-5-exercise-1.open-response.json"], { eager: true, import: "default" });
const genericArtworkModules = import.meta.glob("../../assets/books/ultimate-b2/authoring/open-response/**/*.{png,jpg,jpeg,webp}", { eager: true, query: "?url", import: "default" });

const authoredByActivityId = new Map();
for (const source of Object.values(genericAuthoringModules)) {
  authoredByActivityId.set(source.activityId, Object.freeze(structuredClone(source)));
}
authoredByActivityId.set(ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID, getUltimateB2Page5OpenResponseRuntime(ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID));

function assetModuleKey(repositoryPath) {
  if (!repositoryPath?.startsWith("src/assets/")) return "";
  return `../../assets/${repositoryPath.slice("src/assets/".length)}`;
}

export function getUltimateB2OpenResponseAuthoring(activityOrId) {
  const activityId = typeof activityOrId === "string" ? activityOrId : activityOrId?.stableNormalizedId;
  return authoredByActivityId.get(activityId) || null;
}

export function getUltimateB2OpenResponseArtworkLayers(authoring) {
  if (!authoring) return [];
  if (authoring.schemaVersion === 2) {
    return [
      { id: `${authoring.activityId}-legacy-instruction`, binding: authoring.artwork.instruction.binding, area: authoring.artwork.instruction.area, altText: authoring.instructionImageAlt, legacyRole: "instruction" },
      { id: `${authoring.activityId}-legacy-quote`, binding: authoring.artwork.quote.binding, area: authoring.artwork.quote.area, altText: "Who said it? Film is art, theatre is life and television is furniture — Kenny Leon", legacyRole: "quote" },
    ];
  }
  if (authoring.activityId === ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID) {
    return authoring.artworkLayers.map((layer) => ({
      ...layer,
      legacyRole: layer.sourceFile === "image_2.png" ? "instruction" : layer.sourceFile === "image_1.png" ? "quote" : undefined,
    })).sort((left, right) => (left.legacyRole === "instruction" ? -1 : right.legacyRole === "instruction" ? 1 : left.order - right.order));
  }
  return authoring.artworkLayers;
}

export function resolveUltimateB2OpenResponseArtwork(layer) {
  if (layer?.assetPath?.startsWith("/preview/open-response-assets/")) return layer.assetPath;
  if (layer?.binding?.startsWith("unit1.page5.")) return resolveUltimateB2Page5RuntimeArtwork(layer.binding);
  const bundled = genericArtworkModules[assetModuleKey(layer?.repositoryPath)] || null;
  if (bundled || !import.meta.env.DEV || !layer?.repositoryPath) return bundled;
  const segments = layer.repositoryPath.split("/");
  const activityId = segments.at(-2);
  const filename = segments.at(-1);
  return `/__hhplms/ultimate-b2-open-response-asset?activityId=${encodeURIComponent(activityId)}&file=${encodeURIComponent(filename)}`;
}

export function hasUltimateB2OpenResponseAuthoring(activityOrId) {
  return Boolean(getUltimateB2OpenResponseAuthoring(activityOrId));
}
