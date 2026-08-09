import { getUltimateB2Page5PublisherDisplayAuthoring, resolveUltimateB2Page5Artwork } from "./page5AuthoringData.js";
import fallbackHeadingImage from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-1/obj2/image_2.png";

export const ULTIMATE_B2_UNIT1_EXERCISE2_DISPLAY_ID = "ultimate-b2-sb-u1-p1-o2";

export function getUltimateB2PublisherImageDisplay(activityOrId) {
  const activityId = typeof activityOrId === "string" ? activityOrId : activityOrId?.stableNormalizedId;
  const authoring = getUltimateB2Page5PublisherDisplayAuthoring(activityId);
  return authoring ? Object.freeze({
    ...authoring,
    activityType: "publisher-image-display",
    image: resolveUltimateB2Page5Artwork(authoring.headingArtworkBinding) || fallbackHeadingImage,
    lines: Object.freeze(authoring.bullets.map((bullet) => bullet.text)),
  }) : null;
}

export function isUltimateB2PublisherImageDisplay(activity) {
  return Boolean(
    activity?.activityType === "publisher-image-display"
    && getUltimateB2PublisherImageDisplay(activity),
  );
}
