import { getUltimateB2Page5ImageAuthoring, resolveUltimateB2Page5Artwork } from "./page5AuthoringData.js";

export const ULTIMATE_B2_UNIT1_EXERCISE2_IMAGE_ID = "ultimate-b2-sb-u1-p1-o2";

export function getUltimateB2ImageActivity(activityOrId) {
  const activityId = typeof activityOrId === "string" ? activityOrId : activityOrId?.stableNormalizedId;
  const authoring = getUltimateB2Page5ImageAuthoring(activityId);
  return authoring ? Object.freeze({
    ...authoring,
    activityType: "image",
    instructionImage: resolveUltimateB2Page5Artwork(authoring.visualCapabilities.instructionImage),
    image: resolveUltimateB2Page5Artwork(authoring.mainImage),
  }) : null;
}

export function isUltimateB2ImageActivity(activity) {
  return Boolean(["image", "publisher-image-display"].includes(activity?.activityType) && getUltimateB2ImageActivity(activity));
}
