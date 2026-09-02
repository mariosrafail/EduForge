const endpoint = "/builder/api/preview-authorization";
const NAVIGABLE_MANAGED_COMPONENTS = new Set([
  "ultimate-b1/ultimate-b1-students-book",
  "ultimate-b1/ultimate-b1-workbook",
  "ultimate-b1/ultimate-b1-grammar-book",
  "ultimate-b1-plus/ultimate-b1-plus-students-book",
  "ultimate-b1-plus/ultimate-b1-plus-workbook",
  "ultimate-b1-plus/ultimate-b1-plus-grammar-book",
  "ultimate-b2/ultimate-b2-workbook",
  "ultimate-b2/ultimate-b2-grammar-book",
]);

export function resolveBuilderPreviewAuthorizationIntent({ bookSlug, componentSlug, intent }) {
  const navigableManagedDraft = !intent?.productReleaseId
    && intent?.view === "page"
    && NAVIGABLE_MANAGED_COMPONENTS.has(`${bookSlug}/${componentSlug}`);
  return {
    bookSlug,
    componentSlug,
    view: navigableManagedDraft ? "library" : intent.view,
    pageId: navigableManagedDraft ? null : intent.view === "page" ? intent.pageId : null,
    activityId: intent.view === "activity" ? intent.activityId : null,
    releaseId: null,
    productReleaseId: intent.productReleaseId || null,
  };
}

export async function createBuilderPreviewAuthorization(intent, { signal } = {}) {
  const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent }), signal });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.token !== "string") throw new Error(payload.error || "Viewer authorization could not be created.");
  return payload;
}
