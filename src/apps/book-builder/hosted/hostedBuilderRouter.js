import { isHostedViewerSafeId, normalizeHostedViewerIntent } from "./hostedViewerPreviewUrl.js";

export const hostedBuilderTools = Object.freeze(["hotspots", "activities", "ui", "publication"]);

export function hostedBuilderHash({ bookSlug, componentSlug, tool } = {}) {
  if (!bookSlug) return "#/books";
  if (!componentSlug) return `#/books/${encodeURIComponent(bookSlug)}`;
  const base = `#/books/${encodeURIComponent(bookSlug)}/components/${encodeURIComponent(componentSlug)}`;
  return tool ? `${base}/${encodeURIComponent(tool)}` : base;
}

const reviewQueryKeys = new Set(["view", "unitNumber", "pageId", "activityId", "releaseId"]);

function strictDecode(value) {
  try {
    return decodeURIComponent(value.replaceAll("+", " "));
  } catch {
    return null;
  }
}

function parseReviewQuery(rawQuery) {
  if (!rawQuery) return null;
  const values = {};
  for (const pair of rawQuery.split("&")) {
    const separator = pair.indexOf("=");
    if (!pair || separator < 1) return null;
    const key = strictDecode(pair.slice(0, separator));
    const value = strictDecode(pair.slice(separator + 1));
    if (key === null || value === null || !reviewQueryKeys.has(key) || Object.hasOwn(values, key)) return null;
    values[key] = value;
  }
  const allowedByView = {
    library: new Set(["view", "releaseId"]),
    page: new Set(["view", "unitNumber", "pageId", "releaseId"]),
    activity: new Set(["view", "activityId", "unitNumber", "pageId", "releaseId"]),
  };
  const allowed = allowedByView[values.view];
  if (!allowed || Object.keys(values).some((key) => !allowed.has(key))) return null;
  if (Object.hasOwn(values, "unitNumber") && !/^(?:[1-9]|[1-9][0-9])$/.test(values.unitNumber)) return null;
  try {
    return normalizeHostedViewerIntent(values);
  } catch {
    return null;
  }
}

export function hostedBuilderReviewHash({ bookSlug, componentSlug, intent } = {}) {
  if (!isHostedViewerSafeId(bookSlug) || !isHostedViewerSafeId(componentSlug)) throw new TypeError("Builder Review identity is invalid.");
  const normalized = normalizeHostedViewerIntent(intent);
  const query = new URLSearchParams();
  query.set("view", normalized.view);
  if (normalized.activityId) query.set("activityId", normalized.activityId);
  if (normalized.unitNumber) query.set("unitNumber", String(normalized.unitNumber));
  if (normalized.pageId) query.set("pageId", normalized.pageId);
  if (normalized.releaseId) query.set("releaseId", normalized.releaseId);
  return `${hostedBuilderHash({ bookSlug, componentSlug })}/review?${query}`;
}

function decode(segment) {
  try { return decodeURIComponent(segment); } catch { return ""; }
}

export function parseHostedBuilderHash(hash = "") {
  const raw = String(hash || "").replace(/^#/, "");
  const queryIndex = raw.indexOf("?");
  const rawPath = queryIndex < 0 ? raw : raw.slice(0, queryIndex);
  const rawQuery = queryIndex < 0 ? "" : raw.slice(queryIndex + 1);
  const segments = rawPath.split("/").filter(Boolean).map(decode);
  if (!segments.length || (segments.length === 1 && segments[0] === "books")) return { kind: "library" };
  if (segments[0] !== "books" || !segments[1]) return { kind: "not-found" };
  if (segments.length === 2) return { kind: "book", bookSlug: segments[1] };
  if (segments[2] !== "components" || !segments[3]) return { kind: "not-found" };
  if (segments.length === 4) return { kind: "workspace", bookSlug: segments[1], componentSlug: segments[3], tool: "hotspots" };
  if (segments.length === 5 && segments[4] === "review") {
    if (!isHostedViewerSafeId(segments[1]) || !isHostedViewerSafeId(segments[3])) return { kind: "not-found" };
    const intent = parseReviewQuery(rawQuery);
    return intent
      ? { kind: "review", bookSlug: segments[1], componentSlug: segments[3], intent }
      : { kind: "not-found" };
  }
  if (segments.length === 5 && hostedBuilderTools.includes(segments[4])) {
    return { kind: "workspace", bookSlug: segments[1], componentSlug: segments[3], tool: segments[4] };
  }
  return { kind: "not-found" };
}

export function navigateHostedBuilder(route, { replace = false } = {}) {
  const hash = typeof route === "string" ? route : hostedBuilderHash(route);
  if (replace) {
    window.history.replaceState(null, "", hash);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = hash.slice(1);
  }
}
