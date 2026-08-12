import { getUltimateB2Page5OpenResponseRuntime, resolveUltimateB2Page5RuntimeArtwork } from "./page5RuntimeData.js";

const authoring = getUltimateB2Page5OpenResponseRuntime("ultimate-b2-sb-u1-p1-o1");

export const ultimateB2Unit1LegacyOpenerImages = Object.freeze({
  quoteArtwork: resolveUltimateB2Page5RuntimeArtwork(authoring.quoteArtworkBinding),
  instructionArtwork: resolveUltimateB2Page5RuntimeArtwork(authoring.visualCapabilities.instructionImage),
});

export { ULTIMATE_B2_UNIT1_OPENER_ACTIVITY_ID, isUltimateB2Unit1LegacyOpener } from "./unit1Part1LegacyOpener.js";
