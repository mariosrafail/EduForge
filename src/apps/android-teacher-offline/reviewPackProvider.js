import manifest from "virtual:ultimate-b2-review-pack-manifest";
import catalog from "../../../android-content-packs/ultimate-b2-students-book/catalog.json";
import activities from "../../../android-content-packs/ultimate-b2-students-book/activities.json";
import assetsManifest from "../../../android-content-packs/ultimate-b2-students-book/assets-manifest.json";

import { BundledReviewContentPackProvider } from "./reviewContentPackProvider.js";
export { interactiveUiManifestProvider } from "./hostedReviewUiManifestProvider.js";
export { interactiveStartupAssets } from "./hostedReviewStartupAssets.js";

export const bundledReviewPack = Object.freeze({
  manifest,
  catalog,
  activities,
  assetsManifest,
});

export const interactiveContentPackProvider = new BundledReviewContentPackProvider(bundledReviewPack);
