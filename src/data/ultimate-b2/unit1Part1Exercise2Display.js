import headingImage from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-1/obj2/image_2.png";

export const ULTIMATE_B2_UNIT1_EXERCISE2_DISPLAY_ID = "ultimate-b2-sb-u1-p1-o2";

const display = Object.freeze({
  activityId: ULTIMATE_B2_UNIT1_EXERCISE2_DISPLAY_ID,
  activityType: "publisher-image-display",
  image: headingImage,
  imageAlt: "Have your say! Exercise 2: How do you feel about film, theatre and TV? Discuss these ideas in small groups.",
  lines: Object.freeze([
    "your favourite form of entertainment",
    "how often you watch films, plays and TV programmes",
    "where you watch them",
  ]),
});

export function getUltimateB2PublisherImageDisplay(activityOrId) {
  const activityId = typeof activityOrId === "string" ? activityOrId : activityOrId?.stableNormalizedId;
  return activityId === ULTIMATE_B2_UNIT1_EXERCISE2_DISPLAY_ID ? display : null;
}

export function isUltimateB2PublisherImageDisplay(activity) {
  return Boolean(
    activity?.activityType === "publisher-image-display"
    && getUltimateB2PublisherImageDisplay(activity),
  );
}
