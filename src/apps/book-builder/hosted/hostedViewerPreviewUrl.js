export const HOSTED_VIEWER_ORIGIN = "https://hhplms-viewer.netlify.app";

const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,127}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isHostedViewerSafeId(value) {
  return SAFE_ID.test(String(value || ""));
}

function requiredSafeId(value, label) {
  const normalized = String(value || "");
  if (!isHostedViewerSafeId(normalized)) throw new TypeError(`${label} is invalid.`);
  return normalized;
}

export function normalizeHostedViewerIntent(intent) {
  const normalized = {};
  if (intent?.releaseId) {
    if (!UUID.test(String(intent.releaseId))) throw new TypeError("Viewer release ID is invalid.");
    normalized.releaseId = String(intent.releaseId).toLowerCase();
  }
  if (intent?.view === "library") {
    normalized.view = "library";
  } else if (intent?.view === "page") {
    const unitNumber = Number(intent.unitNumber);
    if (!Number.isInteger(unitNumber) || unitNumber < 1 || unitNumber > 99) {
      throw new TypeError("Viewer unit number is invalid.");
    }
    normalized.view = "page";
    normalized.unitNumber = unitNumber;
    normalized.pageId = requiredSafeId(intent.pageId, "Viewer page id");
  } else if (intent?.view === "activity") {
    normalized.view = "activity";
    normalized.activityId = requiredSafeId(intent.activityId, "Viewer activity id");
    const hasPageId = intent.pageId !== undefined && intent.pageId !== null && intent.pageId !== "";
    const hasUnitNumber = intent.unitNumber !== undefined && intent.unitNumber !== null && intent.unitNumber !== "";
    if (hasPageId !== hasUnitNumber) throw new TypeError("Viewer activity page context is incomplete.");
    if (hasPageId) {
      const unitNumber = Number(intent.unitNumber);
      if (!Number.isInteger(unitNumber) || unitNumber < 1 || unitNumber > 99) throw new TypeError("Viewer unit number is invalid.");
      normalized.unitNumber = unitNumber;
      normalized.pageId = requiredSafeId(intent.pageId, "Viewer page id");
    }
  } else {
    throw new TypeError("Viewer preview intent is unsupported.");
  }
  return normalized;
}

export function createHostedViewerPreviewUrl(intent) {
  const url = new URL(HOSTED_VIEWER_ORIGIN);
  if (!/^v[12]\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(String(intent?.previewAuthorization || ""))) throw new TypeError("Viewer preview authorization is required.");
  const normalized = normalizeHostedViewerIntent(intent);
  url.searchParams.set("builderPreview", "1");
  url.searchParams.set("bookSlug", requiredSafeId(intent?.bookSlug, "Viewer book slug"));
  url.searchParams.set("componentSlug", requiredSafeId(intent?.componentSlug, "Viewer component slug"));
  url.searchParams.set("previewAuthorization", intent.previewAuthorization);
  if (normalized.releaseId) url.searchParams.set("releaseId", normalized.releaseId);
  url.searchParams.set("view", normalized.view);
  if (normalized.unitNumber) url.searchParams.set("unitNumber", String(normalized.unitNumber));
  if (normalized.pageId) url.searchParams.set("pageId", normalized.pageId);
  if (normalized.activityId) url.searchParams.set("activityId", normalized.activityId);
  return url.toString();
}
