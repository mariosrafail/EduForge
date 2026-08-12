import imageInstructionArtwork from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-1/obj2/image_2.png";
import imageMainArtwork from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-1/obj2/discussion-prompts.svg";
import quoteArtwork from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-1/obj1/image_1.png";
import openResponseInstructionArtwork from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-1/obj1/image_2.png";
import openResponseSource from "./runtime/unit-01-page-5-exercise-1.open-response.json" with { type: "json" };
import imageSource from "./runtime/unit-01-page-5-exercise-2.image.json" with { type: "json" };

export const ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID = "ultimate-b2-sb-u1-p1-o1";
export const ULTIMATE_B2_PAGE5_IMAGE_ID = "ultimate-b2-sb-u1-p1-o2";

const assetsByBinding = Object.freeze({
  "unit1.page5.exercise1.instruction": openResponseInstructionArtwork,
  "unit1.page5.exercise1.quote": quoteArtwork,
  "unit1.page5.exercise2.instruction": imageInstructionArtwork,
  "unit1.page5.exercise2.main-content": imageMainArtwork,
});

const openResponse = Object.freeze(structuredClone(openResponseSource));
const imageActivity = Object.freeze(structuredClone(imageSource));

export function resolveUltimateB2Page5RuntimeArtwork(binding) {
  return assetsByBinding[binding] || null;
}

export function getUltimateB2Page5OpenResponseRuntime(activityOrId) {
  const activityId = typeof activityOrId === "string" ? activityOrId : activityOrId?.stableNormalizedId;
  return activityId === ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID ? openResponse : null;
}

export function getUltimateB2Page5ImageRuntime(activityOrId) {
  const activityId = typeof activityOrId === "string" ? activityOrId : activityOrId?.stableNormalizedId;
  return activityId === ULTIMATE_B2_PAGE5_IMAGE_ID ? imageActivity : null;
}
