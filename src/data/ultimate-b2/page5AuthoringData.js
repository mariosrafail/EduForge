import headingArtwork from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-1/obj2/image_2.png";
import quoteArtwork from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-1/obj1/image_1.png";
import instructionArtwork from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-1/obj1/image_2.png";
import openResponseSource from "./authoring/unit-01-page-5-exercise-1.open-response.json" with { type: "json" };
import publisherDisplaySource from "./authoring/unit-01-page-5-exercise-2.publisher-display.json" with { type: "json" };
import {
  normalizeUltimateB2Page5OpenResponseAuthoring,
  normalizeUltimateB2Page5PublisherDisplayAuthoring,
  ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID,
  ULTIMATE_B2_PAGE5_PUBLISHER_DISPLAY_ID,
} from "./page5AuthoringSchema.js";

const assetsByBinding = Object.freeze({
  "unit1.page5.exercise1.instruction": instructionArtwork,
  "unit1.page5.exercise1.quote": quoteArtwork,
  "unit1.page5.exercise2.heading": headingArtwork,
});

const openResponse = Object.freeze(normalizeUltimateB2Page5OpenResponseAuthoring(openResponseSource));
const publisherDisplay = Object.freeze(normalizeUltimateB2Page5PublisherDisplayAuthoring(publisherDisplaySource));

export function resolveUltimateB2Page5Artwork(binding) {
  return assetsByBinding[binding] || null;
}

export function getUltimateB2Page5OpenResponseAuthoring(activityOrId) {
  const activityId = typeof activityOrId === "string" ? activityOrId : activityOrId?.stableNormalizedId;
  return activityId === ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID ? openResponse : null;
}

export function getUltimateB2Page5PublisherDisplayAuthoring(activityOrId) {
  const activityId = typeof activityOrId === "string" ? activityOrId : activityOrId?.stableNormalizedId;
  return activityId === ULTIMATE_B2_PAGE5_PUBLISHER_DISPLAY_ID ? publisherDisplay : null;
}
