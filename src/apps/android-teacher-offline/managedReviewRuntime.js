import { authorizedHostedPreviewPath, hostedReleasePath, HOSTED_VIEWER_RUNTIME_MODES, resolveHostedViewerRuntimeContext } from "./hostedReleasePreview.js";
import { createHostedStartupAssets } from "./interactiveStartupAssets.js";
import { hostedTeacherUiAssetPath } from "../../data/ultimate-b2/hostedTeacherUiDocument.js";

const COMPONENTS = new Set(["ultimate-b2-workbook", "ultimate-b2-grammar-book"]);
const emptyUnits = () => Array.from({ length: 10 }, (_, index) => Object.freeze({ id: `unit-${index + 1}`, number: index + 1, title: `Unit ${index + 1}`, pages: Object.freeze([]) }));

export const managedHostedStartupAssets = createHostedStartupAssets(Object.freeze({
  uiAssetUrls(uiManifest) {
    return Object.values(uiManifest?.assets || {}).map(hostedTeacherUiAssetPath);
  },
}));

function assertComponent(componentSlug) {
  if (!COMPONENTS.has(componentSlug)) throw new Error("Managed review component is unsupported.");
}

function previewContext(runtimeContext = resolveHostedViewerRuntimeContext()) {
  const context = runtimeContext;
  if (![HOSTED_VIEWER_RUNTIME_MODES.BUILDER_PREVIEW, HOSTED_VIEWER_RUNTIME_MODES.RELEASE_PREVIEW].includes(context.kind)) {
    const error = new Error("Managed components require authorized Review.");
    error.code = "LIVE_PREVIEW_UNAVAILABLE";
    throw error;
  }
  return context;
}

async function loadManagedReleaseProjection(context, componentSlug, fetchImpl, signal) {
  const response = await fetchImpl(hostedReleasePath(context, { bookSlug: "ultimate-b2", componentSlug }, "public"), { method: "GET", credentials: "omit", cache: "no-store", signal });
  if (!response?.ok) throw new Error("Managed release projection is unavailable.");
  const payload = await response.json();
  if (payload?.releaseId !== context.releaseId || payload?.projection?.bookSlug !== "ultimate-b2" || payload.projection.componentSlug !== componentSlug
    || !Array.isArray(payload.projection.units) || !Array.isArray(payload.projection.pages)) throw new Error("Managed release projection identity is invalid.");
  return payload.projection;
}

export function managedPageUnitsFromRelease(projection, componentSlug, context) {
  assertComponent(componentSlug);
  const pagesByUnit = new Map(projection.units.map((unit) => [unit.id, []]));
  for (const page of projection.pages) {
    if (!pagesByUnit.has(page.unitId) || !page.image?.sha256 || !page.image?.extension) throw new Error("Managed release page topology is invalid.");
    const image = hostedReleasePath(context, { bookSlug: "ultimate-b2", componentSlug }, `assets/${page.image.sha256}.${page.image.extension}`);
    pagesByUnit.get(page.unitId).push(Object.freeze({ id: page.id, title: page.label, pageNumber: null, spreadNumber: page.printedLabel || page.label, pageNumbers: Object.freeze([]), images: Object.freeze([image]), activities: Object.freeze([]), actions: Object.freeze([]), sortOrder: page.sortOrder }));
  }
  return Object.freeze(projection.units.map((unit) => Object.freeze({ id: unit.slug, number: unit.unitNumber, title: unit.title, pages: Object.freeze(pagesByUnit.get(unit.id).sort((left, right) => left.sortOrder - right.sortOrder)) })));
}

export function managedPageUnitsFromCatalog(payload, componentSlug) {
  assertComponent(componentSlug);
  if (payload?.component?.bookSlug !== "ultimate-b2" || payload.component.componentSlug !== componentSlug || payload.component.kind !== "managed" || !Array.isArray(payload.units) || !Array.isArray(payload.pages)) throw new Error("Managed page catalog identity is invalid.");
  const pagesByUnit = new Map(payload.units.map((unit) => [unit.id, []]));
  for (const page of payload.pages) {
    if (!page?.id || !page.unitId || !pagesByUnit.has(page.unitId) || page.componentSlug !== componentSlug || page.image?.source !== "managed" || !page.image.url) throw new Error("Managed page catalog contains an invalid page.");
    const imageUrl = new URL(page.image.url, "https://viewer.invalid");
    imageUrl.searchParams.delete("previewAuthorization");
    const imagePath = `${imageUrl.pathname}${imageUrl.search}`;
    pagesByUnit.get(page.unitId).push(Object.freeze({ id: page.id, title: page.label, pageNumber: null, spreadNumber: page.printedLabel || page.label, pageNumbers: Object.freeze([]), images: Object.freeze([imagePath]), activities: Object.freeze([]), actions: Object.freeze([]), sortOrder: page.sortOrder }));
  }
  return Object.freeze(payload.units.map((unit) => Object.freeze({ id: unit.slug, number: unit.unitNumber, title: unit.title, pages: Object.freeze(pagesByUnit.get(unit.id).sort((left, right) => left.sortOrder - right.sortOrder)) })));
}

export function createManagedReviewContentPackProvider(componentSlug) {
  assertComponent(componentSlug);
  return Object.freeze({
    async load({ runtimeContext, fetchImpl = globalThis.fetch, signal } = {}) {
      const context = previewContext(runtimeContext);
      if (context.kind === HOSTED_VIEWER_RUNTIME_MODES.RELEASE_PREVIEW) {
        const projection = await loadManagedReleaseProjection(context, componentSlug, fetchImpl, signal);
        return Object.freeze({
          manifest: Object.freeze({ packageId: componentSlug, componentId: componentSlug.replace("ultimate-b2-", ""), schemaVersion: 1 }),
          catalog: Object.freeze({ schemaVersion: 1, packageId: componentSlug, componentId: componentSlug.replace("ultimate-b2-", ""), title: componentSlug === "ultimate-b2-workbook" ? "Ultimate B2 Workbook" : "Ultimate B2 Grammar Book", units: Object.freeze([]) }),
          activities: Object.freeze({ schemaVersion: 1, packageId: componentSlug, activities: Object.freeze(Object.values(projection.nativeActivities || {}).map((entry) => Object.freeze({ id: entry.document.activityId, stableActivityId: entry.document.activityId, title: entry.document.metadata.title, activityType: entry.kind, availability: "enabled" }))) }),
          assetsManifest: Object.freeze({ schemaVersion: 1, resolver: "authorized-release-assets", assets: Object.freeze(projection.assets || []) }),
          pageUnits: managedPageUnitsFromRelease(projection, componentSlug, context),
        });
      }
      const path = authorizedHostedPreviewPath(`/preview/pages/books/ultimate-b2/components/${componentSlug}`, context.authorization);
      const response = await fetchImpl(path, { method: "GET", credentials: "omit", cache: "no-store", signal });
      if (!response?.ok) throw new Error("Managed page catalog is unavailable.");
      const pageUnits = managedPageUnitsFromCatalog(await response.json(), componentSlug);
      return Object.freeze({
        manifest: Object.freeze({ packageId: componentSlug, componentId: componentSlug.replace("ultimate-b2-", ""), schemaVersion: 1 }),
        catalog: Object.freeze({ schemaVersion: 1, packageId: componentSlug, componentId: componentSlug.replace("ultimate-b2-", ""), title: componentSlug === "ultimate-b2-workbook" ? "Ultimate B2 Workbook" : "Ultimate B2 Grammar Book", units: Object.freeze([]) }),
        activities: Object.freeze({ schemaVersion: 1, packageId: componentSlug, activities: Object.freeze([]) }),
        assetsManifest: Object.freeze({ schemaVersion: 1, resolver: "authorized-builder-pages", assets: Object.freeze([]) }),
        pageUnits,
      });
    },
  });
}

function hotspotToAction(hotspot) {
  return hotspot?.actionType === "normalized_activity" && hotspot.activityKey ? { id: hotspot.id, label: hotspot.label, ariaLabel: hotspot.label || "Open activity", target: "normalized-activity", classification: "activity", availability: "enabled", activityKey: hotspot.activityKey, authoredHotspot: true, top: `${hotspot.top}%`, left: `${hotspot.left}%`, width: `${hotspot.width}%`, height: `${hotspot.height}%` } : null;
}

export function createManagedReviewHotspotProvider(componentSlug) {
  assertComponent(componentSlug);
  let document = { schemaVersion: "1.0", packageSlug: "ultimate-b2", componentSlug, pages: {} };
  return Object.freeze({
    async prepare({ runtimeContext, fetchImpl = globalThis.fetch, signal } = {}) {
      const context = previewContext(runtimeContext);
      if (context.kind === HOSTED_VIEWER_RUNTIME_MODES.RELEASE_PREVIEW) {
        const projection = await loadManagedReleaseProjection(context, componentSlug, fetchImpl, signal);
        document = structuredClone(projection.hotspots);
        return;
      }
      const path = authorizedHostedPreviewPath(`/preview/content/books/ultimate-b2/components/${componentSlug}/hotspots`, context.authorization);
      const response = await fetchImpl(path, { method: "GET", credentials: "omit", cache: "no-store", signal });
      if (!response?.ok) throw new Error("Managed hotspot document is unavailable.");
      const payload = await response.json();
      if (payload?.bookSlug !== "ultimate-b2" || payload.componentSlug !== componentSlug || payload.document?.componentSlug !== componentSlug || typeof payload.document.pages !== "object") throw new Error("Managed hotspot preview identity is invalid.");
      document = structuredClone(payload.document);
    },
    getActions({ pageId } = {}) { return (document.pages?.[pageId] || []).map(hotspotToAction).filter(Boolean); },
    getActivityKey(action) { return action?.authoredHotspot && action.target === "normalized-activity" ? String(action.activityKey || "") : null; },
  });
}

export function authorizeManagedReviewPageUnits(pageUnits, authorization) {
  return Object.freeze((pageUnits || []).map((unit) => Object.freeze({
    ...unit,
    pages: Object.freeze((unit.pages || []).map((page) => Object.freeze({
      ...page,
      images: Object.freeze((page.images || []).map((path) => authorizedHostedPreviewPath(path, authorization))),
    }))),
  })));
}

export function createManagedReviewDescriptor(componentSlug) {
  assertComponent(componentSlug);
  return Object.freeze({
    bookSlug: "ultimate-b2", componentSlug, installationScope: "hosted-builder-review",
    contentPackProvider: createManagedReviewContentPackProvider(componentSlug), pageUnits: Object.freeze(emptyUnits()),
    hotspotProvider: createManagedReviewHotspotProvider(componentSlug), solutionProvider: Object.freeze({ get: () => null }),
    startupAssets: managedHostedStartupAssets, uiManifestProvider: Object.freeze({ load: async () => null }),
    authorizePageUnits: authorizeManagedReviewPageUnits,
  });
}
