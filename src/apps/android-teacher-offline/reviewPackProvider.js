import manifest from "virtual:ultimate-b2-review-pack-manifest";
import catalog from "../../../android-content-packs/ultimate-b2-students-book/catalog.json";
import activities from "../../../android-content-packs/ultimate-b2-students-book/activities.json";
import assetsManifest from "../../../android-content-packs/ultimate-b2-students-book/assets-manifest.json";

import { BundledReviewContentPackProvider } from "./reviewContentPackProvider.js";
import { ultimateB2StudentsBookPageUnits } from "../../data/ultimate-b2/ultimateB2PageUnits.js";
import { authorizedHostedPreviewPath, hostedReleasePath, HOSTED_VIEWER_RUNTIME_MODES, resolveHostedViewerRuntimeContext } from "./hostedReleasePreview.js";
import { studentsBookPageUnitsFromActivePageIds, studentsBookPageUnitsFromCatalog } from "./studentsBookPageLifecycleProjection.js";
export { interactiveUiManifestProvider } from "./hostedReviewUiManifestProvider.js";
export { interactiveStartupAssets } from "./hostedReviewStartupAssets.js";

export const bundledReviewPack = Object.freeze({
  manifest,
  catalog,
  activities,
  assetsManifest,
});

const bundledProvider = new BundledReviewContentPackProvider(bundledReviewPack);

export const interactiveContentPackProvider = Object.freeze({
  async load({ runtimeContext = resolveHostedViewerRuntimeContext(), fetchImpl = globalThis.fetch, signal } = {}) {
    const pack = await bundledProvider.load({ signal });
    if (runtimeContext.kind === HOSTED_VIEWER_RUNTIME_MODES.RELEASE_PREVIEW) {
      const response = await fetchImpl(hostedReleasePath(runtimeContext, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book" }, "public"), { method: "GET", credentials: "omit", cache: "no-store", signal });
      if (!response?.ok) throw new Error("Students Book release page lifecycle is unavailable.");
      const payload = await response.json();
      const activePageIds = payload?.projection?.activePageIds;
      if (!activePageIds) return pack;
      return Object.freeze({ ...pack, pageUnits: studentsBookPageUnitsFromActivePageIds(ultimateB2StudentsBookPageUnits, activePageIds) });
    }
    if (runtimeContext.kind !== HOSTED_VIEWER_RUNTIME_MODES.BUILDER_PREVIEW) return pack;
    const path = authorizedHostedPreviewPath("/preview/pages/books/ultimate-b2/components/ultimate-b2-students-book", runtimeContext.authorization);
    const response = await fetchImpl(path, { method: "GET", credentials: "omit", cache: "no-store", signal });
    if (!response?.ok) throw new Error("Students Book active-page catalog is unavailable.");
    return Object.freeze({ ...pack, pageUnits: studentsBookPageUnitsFromCatalog(ultimateB2StudentsBookPageUnits, await response.json(), runtimeContext.authorization) });
  },
});
