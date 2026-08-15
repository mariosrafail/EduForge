import { resolveTeacherOfflineActivityLocation } from "./teacherOfflineActivityLocation.js";

const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,127}$/;
const INVALID_MESSAGE = "The requested Builder preview is invalid or unavailable.";
const ALLOWED_PARAMETERS = Object.freeze({
  library: new Set(["builderPreview", "bookSlug", "componentSlug", "view", "previewAuthorization"]),
  page: new Set(["builderPreview", "bookSlug", "componentSlug", "view", "unitNumber", "pageId", "previewAuthorization"]),
  activity: new Set(["builderPreview", "bookSlug", "componentSlug", "view", "activityId", "previewAuthorization"]),
});
const RELEASE_ALLOWED_PARAMETERS = Object.freeze(Object.fromEntries(Object.entries(ALLOWED_PARAMETERS).map(([view, keys]) => [view, new Set([...keys, "releaseId"])])));
const ACTIVITY_LOCATION_PARAMETERS = new Set([...ALLOWED_PARAMETERS.activity, "unitNumber", "pageId"]);
const RELEASE_ACTIVITY_LOCATION_PARAMETERS = new Set([...ACTIVITY_LOCATION_PARAMETERS, "releaseId"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalid() {
  return Object.freeze({ kind: "invalid", message: INVALID_MESSAGE });
}

function unavailable(registration) {
  return Object.freeze({
    kind: "unavailable",
    bookSlug: registration.book.slug,
    componentSlug: registration.component.slug,
    message: `${registration.component.title} is registered but its content is not installed for Teacher Review.`,
  });
}

function hasExactParameters(parameters, allowed) {
  const keys = [...parameters.keys()];
  return keys.length === allowed.size
    && keys.every((key) => allowed.has(key) && parameters.getAll(key).length === 1);
}

export function isHostedViewerPreviewRequest(search, hosted) {
  if (!hosted) return false;
  const parameters = new URLSearchParams(search);
  return parameters.getAll("builderPreview").length === 1
    && parameters.get("builderPreview") === "1";
}

export function resolveHostedViewerComponentRequest({
  search = "",
  hosted = false,
  registry,
} = {}) {
  if (!hosted) return Object.freeze({ kind: "none" });
  const parameters = new URLSearchParams(search);
  if (!parameters.has("builderPreview")) return Object.freeze({ kind: "none" });
  if (parameters.getAll("builderPreview").length !== 1 || parameters.get("builderPreview") !== "1") return invalid();
  const bookSlug = parameters.get("bookSlug") || "";
  const componentSlug = parameters.get("componentSlug") || "";
  if (parameters.getAll("bookSlug").length !== 1 || parameters.getAll("componentSlug").length !== 1
    || !SAFE_ID.test(bookSlug) || !SAFE_ID.test(componentSlug)) return invalid();
  if (!registry?.resolve) return invalid();
  const resolved = registry.resolve(bookSlug, componentSlug);
  if (resolved.kind === "unknown") return invalid();
  if (resolved.kind === "pending") return unavailable(resolved.registration);
  return Object.freeze({ kind: "installed", bookSlug, componentSlug, runtime: resolved.runtime });
}

export function resolveHostedViewerPreviewIntent({
  search = "",
  hosted = false,
  activities = [],
  pageUnits = [],
  registry,
} = {}) {
  if (!hosted) return Object.freeze({ kind: "none" });
  const parameters = new URLSearchParams(search);
  if (!parameters.has("builderPreview")) return Object.freeze({ kind: "none" });
  if (parameters.getAll("builderPreview").length !== 1 || parameters.get("builderPreview") !== "1") return invalid();

  const componentRequest = resolveHostedViewerComponentRequest({ search, hosted, registry });
  if (componentRequest.kind === "invalid" || componentRequest.kind === "unavailable") return componentRequest;
  if (componentRequest.kind !== "installed") return invalid();

  const view = parameters.get("view");
  const releaseId = parameters.get("releaseId");
  const previewAuthorization = parameters.get("previewAuthorization") || "";
  const hasActivityLocation = view === "activity" && (parameters.has("unitNumber") || parameters.has("pageId"));
  const allowed = hasActivityLocation
    ? (releaseId ? RELEASE_ACTIVITY_LOCATION_PARAMETERS : ACTIVITY_LOCATION_PARAMETERS)
    : (releaseId ? RELEASE_ALLOWED_PARAMETERS[view] : ALLOWED_PARAMETERS[view]);
  if (!allowed || !hasExactParameters(parameters, allowed) || !/^v[12]\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(previewAuthorization)) return invalid();
  if (releaseId && !UUID.test(releaseId)) return invalid();

  if (view === "library") {
    return Object.freeze({ kind: "valid", view, bookSlug: componentRequest.bookSlug, componentSlug: componentRequest.componentSlug, ...(releaseId ? { releaseId } : {}), navigation: Object.freeze({ view: "library" }) });
  }

  if (view === "page") {
    const unitValue = parameters.get("unitNumber") || "";
    const pageId = parameters.get("pageId") || "";
    if (!/^[1-9][0-9]?$/.test(unitValue) || !SAFE_ID.test(pageId)) return invalid();
    const unitNumber = Number(unitValue);
    const unit = pageUnits.find((candidate) => Number(candidate.number) === unitNumber);
    if (!unit?.pages?.some((page) => page.id === pageId)) return invalid();
    return Object.freeze({
      kind: "valid",
      view,
      bookSlug: componentRequest.bookSlug,
      componentSlug: componentRequest.componentSlug,
      ...(releaseId ? { releaseId } : {}),
      navigation: Object.freeze({ view: "book", location: Object.freeze({ unitNumber, tab: "pages", pageId }) }),
    });
  }

  const activityId = parameters.get("activityId") || "";
  if (!SAFE_ID.test(activityId)) return invalid();
  const resolved = resolveTeacherOfflineActivityLocation({ activityId, activities, pageUnits });
  let location = resolved?.location || null;
  if (!location && hasActivityLocation) {
    const unitValue = parameters.get("unitNumber") || "";
    const pageId = parameters.get("pageId") || "";
    if (!/^[1-9][0-9]?$/.test(unitValue) || !SAFE_ID.test(pageId)) return invalid();
    const unitNumber = Number(unitValue);
    const unit = pageUnits.find((candidate) => Number(candidate.number) === unitNumber);
    if (!unit?.pages?.some((page) => page.id === pageId)) return invalid();
    location = { unitNumber, tab: "pages", pageId };
  }
  if (!location) return invalid();
  return Object.freeze({
    kind: "valid",
    view,
    bookSlug: componentRequest.bookSlug,
    componentSlug: componentRequest.componentSlug,
    ...(releaseId ? { releaseId } : {}),
    navigation: Object.freeze({ view: "book", location: Object.freeze(location), activityId }),
  });
}
