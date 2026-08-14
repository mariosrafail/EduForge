export const ultimateB2HotspotPreviewRoute = "/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/hotspots";
import { currentHostedReleaseId, hostedReleasePath } from "../../apps/android-teacher-offline/hostedReleasePreview.js";

const envelopeKeys = Object.freeze([
  "bookSlug",
  "componentSlug",
  "resource",
  "schemaVersion",
  "revision",
  "source",
  "document",
]);
const documentKeys = Object.freeze(["schemaVersion", "packageSlug", "componentSlug", "pages"]);

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function validPages(pages) {
  return pages && typeof pages === "object" && !Array.isArray(pages)
    && Object.values(pages).every((hotspots) => (
      Array.isArray(hotspots)
      && hotspots.every((hotspot) => hotspot && typeof hotspot === "object" && !Array.isArray(hotspot))
    ));
}

export function validateUltimateB2HotspotPreviewEnvelope(value) {
  if (!exactKeys(value, envelopeKeys)) throw new Error("Live preview response is invalid.");
  if (
    value.bookSlug !== "ultimate-b2"
    || value.componentSlug !== "ultimate-b2-students-book"
    || value.resource !== "hotspots"
    || value.schemaVersion !== "1.0"
    || !Number.isSafeInteger(value.revision)
    || value.revision < 0
    || !["repository", "database"].includes(value.source)
    || (value.source === "repository" && value.revision !== 0)
    || (value.source === "database" && value.revision < 1)
    || !exactKeys(value.document, documentKeys)
    || value.document.schemaVersion !== "1.0"
    || value.document.packageSlug !== "ultimate-b2"
    || value.document.componentSlug !== "students-book"
    || !validPages(value.document.pages)
  ) throw new Error("Live preview response is invalid.");
  return value;
}

function unavailable() {
  const error = new Error("Live preview content could not be loaded. Refresh and try again.");
  error.code = "LIVE_PREVIEW_UNAVAILABLE";
  return error;
}

export function ultimateB2StudentsBookHotspotToAction(hotspot) {
  if (!hotspot || hotspot.actionType !== "normalized_activity" || !hotspot.activityKey) return null;
  return {
    id: hotspot.id,
    label: hotspot.label,
    ariaLabel: hotspot.label || "Open Students Book activity",
    target: "normalized-activity",
    classification: "activity",
    availability: "enabled",
    activityKey: hotspot.activityKey,
    authoredHotspot: true,
    top: `${hotspot.top}%`,
    left: `${hotspot.left}%`,
    width: `${hotspot.width}%`,
    height: `${hotspot.height}%`,
  };
}

export function getUltimateB2AuthoredHotspotActivityKey(action) {
  if (!action?.authoredHotspot || action.target !== "normalized-activity" || !action.activityKey) return null;
  return String(action.activityKey);
}

export function createHostedReviewHotspotRuntime(initialManifest) {
  let currentManifest = initialManifest;

  function getHotspots({ pageId, pageNumber, unitNumber } = {}) {
    const hotspots = currentManifest.pages?.[String(pageId || "")] || [];
    return hotspots.filter((hotspot) => (
      (!Number.isFinite(Number(pageNumber)) || Number(hotspot.pageNumber) === Number(pageNumber))
      && (!Number.isFinite(Number(unitNumber)) || Number(hotspot.unitNumber) === Number(unitNumber))
    ));
  }

  return Object.freeze({
    currentManifest: () => currentManifest,
    getHotspots,
    getActions(identity = {}) {
      return getHotspots(identity).map(ultimateB2StudentsBookHotspotToAction).filter(Boolean);
    },
    async prepare({ fetchImpl = globalThis.fetch } = {}) {
      if (typeof fetchImpl !== "function") throw unavailable();
      try {
        const releaseId = currentHostedReleaseId();
        const response = await fetchImpl(releaseId ? hostedReleasePath(releaseId, "public") : ultimateB2HotspotPreviewRoute, {
          cache: "no-store",
          credentials: "omit",
        });
        if (!response?.ok) throw unavailable();
        const payload = await response.json();
        if (releaseId) {
          currentManifest = structuredClone(payload?.projection?.hotspots);
          return { revision: 0, source: "release", releaseId };
        }
        const envelope = validateUltimateB2HotspotPreviewEnvelope(payload);
        currentManifest = structuredClone(envelope.document);
        return { revision: envelope.revision, source: envelope.source };
      } catch {
        throw unavailable();
      }
    },
  });
}
