export const ULTIMATE_B2_UNIT1_OPENER_ACTIVITY_ID = "ultimate-b2-sb-u1-p1-o1";

export function isUltimateB2Unit1LegacyOpener(activity) {
  return Boolean(
    activity
    && activity.stableNormalizedId === ULTIMATE_B2_UNIT1_OPENER_ACTIVITY_ID
    && activity.unitNumber === 1
    && activity.partNumber === 1,
  );
}
