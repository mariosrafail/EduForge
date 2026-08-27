const endpoint = "/builder/api/preview-authorization";
const NAVIGABLE_MANAGED_COMPONENTS = new Set(["ultimate-b2-workbook", "ultimate-b2-grammar-book"]);

export function resolveBuilderPreviewAuthorizationIntent({ bookSlug, componentSlug, intent }) {
  const navigableManagedDraft = !intent?.releaseId
    && bookSlug === "ultimate-b2"
    && intent?.view === "page"
    && NAVIGABLE_MANAGED_COMPONENTS.has(componentSlug);
  return {
    bookSlug,
    componentSlug,
    view: navigableManagedDraft ? "library" : intent.view,
    pageId: navigableManagedDraft ? null : intent.view === "page" ? intent.pageId : null,
    activityId: intent.view === "activity" ? intent.activityId : null,
    releaseId: intent.releaseId || null,
  };
}

export async function createBuilderPreviewAuthorization(intent, { signal } = {}) {
  const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent }), signal });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.token !== "string") throw new Error(payload.error || "Viewer authorization could not be created.");
  return payload;
}
