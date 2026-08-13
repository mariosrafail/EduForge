import publisherCreatedRegistry from "./authoring/publisher-created-activities.json" with { type: "json" };

export const ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID = "ultimate-b2-sb-u1-p1-o1";
export const ULTIMATE_B2_UNIT2_OPENER_OPEN_RESPONSE_ID = "ultimate-b2-sb-u2-p1-o1";
export const ULTIMATE_B2_OPEN_RESPONSE_ACTIVITY_IDS = Object.freeze([
  ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID,
  ULTIMATE_B2_UNIT2_OPENER_OPEN_RESPONSE_ID,
  ...(publisherCreatedRegistry.activities || []).filter((activity) => activity.authoringKind === "open-response").map((activity) => activity.activityId),
]);

export function isUltimateB2ConfigurableOpenResponse(activityOrId) {
  const activityId = typeof activityOrId === "string" ? activityOrId : activityOrId?.stableNormalizedId;
  return ULTIMATE_B2_OPEN_RESPONSE_ACTIVITY_IDS.includes(activityId);
}
