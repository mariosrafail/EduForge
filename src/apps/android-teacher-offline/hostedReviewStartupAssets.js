import { ultimateB2StudentsBookCover } from "virtual:ultimate-b2-cover-assets";
import { ultimateB2Unit1Part2LegacyAudio } from "virtual:ultimate-b2-unit1-part2-legacy-pilot-audio";

import {
  getUltimateB2ImageActivity,
} from "../../data/ultimate-b2/imageAuthoringData.js";
import {
  getUltimateB2OpenResponseArtworkLayers,
  getUltimateB2OpenResponseAuthoring,
  resolveUltimateB2OpenResponseArtwork,
} from "../../data/ultimate-b2/openResponseAuthoringData.js";
import { ultimateB2TeacherAppAuthoring } from "../../data/ultimate-b2/teacherAppAuthoring.js";
import { resolveUltimateB2AuthoredAssetUrl } from "../../data/ultimate-b2/ultimateB2AuthoredAssetUrls.js";
import { ultimateB2StudentsBookMedia } from "../../data/ultimate-b2/ultimateB2MediaAssets.teacher-offline.js";
import { ultimateB2Unit1Part2LegacyImages } from "../../data/ultimate-b2/unit1Part2LegacyPilotAssets.js";
import { legacyClassroomAssets } from "./legacyClassroomAssets.js";
import {
  collectRuntimeAssetUrls,
  createHostedStartupAssets,
} from "./interactiveStartupAssets.js";

const pageAssetUrls = Object.fromEntries([
  ["ultimate-b2.students-book.cover", ultimateB2StudentsBookCover],
  ...ultimateB2TeacherAppAuthoring.pages.map((page) => [
    page.logicalAssetIdentity,
    resolveUltimateB2AuthoredAssetUrl(page.image),
  ]),
]);

function activityAssetUrls(pack) {
  const urls = collectRuntimeAssetUrls(ultimateB2Unit1Part2LegacyAudio);
  for (const activity of pack?.activities?.activities || []) {
    collectRuntimeAssetUrls(ultimateB2Unit1Part2LegacyImages[activity.stableNormalizedId], urls);
    const openResponse = getUltimateB2OpenResponseAuthoring(activity);
    for (const layer of getUltimateB2OpenResponseArtworkLayers(openResponse)) {
      collectRuntimeAssetUrls(resolveUltimateB2OpenResponseArtwork(layer), urls);
    }
    const imageActivity = getUltimateB2ImageActivity(activity);
    collectRuntimeAssetUrls(imageActivity?.instructionImage, urls);
    collectRuntimeAssetUrls(imageActivity?.image, urls);
  }
  return urls;
}

export const hostedReviewAssetInventory = Object.freeze({
  pageAssetUrls: Object.freeze(pageAssetUrls),
  mediaAssetUrls: ultimateB2StudentsBookMedia,
  // This walks the deliberately wired runtime surface, not the broader Vite glob
  // used internally by the authored-asset resolver.
  uiAssetUrls: Object.freeze(collectRuntimeAssetUrls(legacyClassroomAssets)),
  activityAssetUrls,
});

export const interactiveStartupAssets = createHostedStartupAssets(hostedReviewAssetInventory);
