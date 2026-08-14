export const HOSTED_VIEWER_ORIGIN = "https://hhplms-viewer.netlify.app";

const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,127}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredSafeId(value, label) {
  const normalized = String(value || "");
  if (!SAFE_ID.test(normalized)) throw new TypeError(`${label} is invalid.`);
  return normalized;
}

export function createHostedViewerPreviewUrl(intent) {
  const url = new URL(HOSTED_VIEWER_ORIGIN);
  url.searchParams.set("builderPreview", "1");
  url.searchParams.set("bookSlug", requiredSafeId(intent?.bookSlug, "Viewer book slug"));
  url.searchParams.set("componentSlug", requiredSafeId(intent?.componentSlug, "Viewer component slug"));
  if (intent?.releaseId) {
    if (!UUID.test(String(intent.releaseId))) throw new TypeError("Viewer release ID is invalid.");
    url.searchParams.set("releaseId", String(intent.releaseId).toLowerCase());
  }
  if (intent?.view === "library") {
    url.searchParams.set("view", "library");
  } else if (intent?.view === "page") {
    const unitNumber = Number(intent.unitNumber);
    if (!Number.isInteger(unitNumber) || unitNumber < 1 || unitNumber > 99) {
      throw new TypeError("Viewer unit number is invalid.");
    }
    url.searchParams.set("view", "page");
    url.searchParams.set("unitNumber", String(unitNumber));
    url.searchParams.set("pageId", requiredSafeId(intent.pageId, "Viewer page id"));
  } else if (intent?.view === "activity") {
    url.searchParams.set("view", "activity");
    url.searchParams.set("activityId", requiredSafeId(intent.activityId, "Viewer activity id"));
  } else {
    throw new TypeError("Viewer preview intent is unsupported.");
  }
  return url.toString();
}
