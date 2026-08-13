import { resolveTeacherOfflineActivityLocation } from "./teacherOfflineActivityLocation.js";

const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,127}$/;
const INVALID_MESSAGE = "The requested Builder preview is invalid or unavailable.";
const ALLOWED_PARAMETERS = Object.freeze({
  library: new Set(["builderPreview", "view"]),
  page: new Set(["builderPreview", "view", "unitNumber", "pageId"]),
  activity: new Set(["builderPreview", "view", "activityId"]),
});

function invalid() {
  return Object.freeze({ kind: "invalid", message: INVALID_MESSAGE });
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

export function resolveHostedViewerPreviewIntent({
  search = "",
  hosted = false,
  activities = [],
  pageUnits = [],
} = {}) {
  if (!hosted) return Object.freeze({ kind: "none" });
  const parameters = new URLSearchParams(search);
  if (!parameters.has("builderPreview")) return Object.freeze({ kind: "none" });
  if (parameters.getAll("builderPreview").length !== 1 || parameters.get("builderPreview") !== "1") return invalid();

  const view = parameters.get("view");
  const allowed = ALLOWED_PARAMETERS[view];
  if (!allowed || !hasExactParameters(parameters, allowed)) return invalid();

  if (view === "library") {
    return Object.freeze({ kind: "valid", view, navigation: Object.freeze({ view: "library" }) });
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
      navigation: Object.freeze({ view: "book", location: Object.freeze({ unitNumber, tab: "pages", pageId }) }),
    });
  }

  const activityId = parameters.get("activityId") || "";
  if (!SAFE_ID.test(activityId)) return invalid();
  const resolved = resolveTeacherOfflineActivityLocation({ activityId, activities, pageUnits });
  if (!resolved) return invalid();
  return Object.freeze({
    kind: "valid",
    view,
    navigation: Object.freeze({ view: "book", location: Object.freeze(resolved.location), activityId }),
  });
}
