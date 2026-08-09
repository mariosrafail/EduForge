import { getUltimateB2Page5OpenResponseAuthoring, resolveUltimateB2Page5Artwork } from "./page5AuthoringData.js";

const authoring = getUltimateB2Page5OpenResponseAuthoring("ultimate-b2-sb-u1-p1-o1");

export const ultimateB2Unit1LegacyOpenerImages = Object.freeze({
  quoteArtwork: resolveUltimateB2Page5Artwork(authoring.quoteArtworkBinding),
  instructionArtwork: resolveUltimateB2Page5Artwork(authoring.instructionArtworkBinding),
});

export { ULTIMATE_B2_UNIT1_OPENER_ACTIVITY_ID, isUltimateB2Unit1LegacyOpener } from "./unit1Part1LegacyOpener.js";
