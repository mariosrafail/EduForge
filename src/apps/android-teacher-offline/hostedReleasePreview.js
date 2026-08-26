const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^v[12]\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/;

export const HOSTED_VIEWER_RUNTIME_MODES = Object.freeze({
  BARE: "bare",
  BUILDER_PREVIEW: "builder-preview",
  RELEASE_PREVIEW: "release-preview",
  INVALID: "invalid",
});

export function resolveHostedViewerRuntimeContext(search = globalThis.location?.search || "") {
  const parameters = new URLSearchParams(search);
  const builderPreview = parameters.getAll("builderPreview");
  const authorizations = parameters.getAll("previewAuthorization");
  const releaseIds = parameters.getAll("releaseId");
  const hasPreviewState = builderPreview.length || authorizations.length || releaseIds.length;
  if (!hasPreviewState) return Object.freeze({ kind: HOSTED_VIEWER_RUNTIME_MODES.BARE, teacherPreview: false });
  if (builderPreview.length !== 1 || builderPreview[0] !== "1" || authorizations.length !== 1 || !TOKEN.test(authorizations[0]) || releaseIds.length > 1) {
    return Object.freeze({ kind: HOSTED_VIEWER_RUNTIME_MODES.INVALID, teacherPreview: false });
  }
  if (!releaseIds.length) {
    return Object.freeze({ kind: HOSTED_VIEWER_RUNTIME_MODES.BUILDER_PREVIEW, teacherPreview: true, authorization: authorizations[0] });
  }
  if (!UUID.test(releaseIds[0])) return Object.freeze({ kind: HOSTED_VIEWER_RUNTIME_MODES.INVALID, teacherPreview: false });
  return Object.freeze({
    kind: HOSTED_VIEWER_RUNTIME_MODES.RELEASE_PREVIEW,
    teacherPreview: true,
    authorization: authorizations[0],
    releaseId: releaseIds[0].toLowerCase(),
  });
}

export function currentHostedReleaseId(search = globalThis.location?.search || "") {
  const context = resolveHostedViewerRuntimeContext(search);
  return context.kind === HOSTED_VIEWER_RUNTIME_MODES.RELEASE_PREVIEW ? context.releaseId : null;
}

export function currentHostedPreviewAuthorization(search = globalThis.location?.search || "") {
  const context = resolveHostedViewerRuntimeContext(search);
  return context.teacherPreview ? context.authorization : null;
}

export function authorizedHostedPreviewPath(path, authorization = currentHostedPreviewAuthorization()) {
  if (!path.startsWith("/preview/") || !TOKEN.test(String(authorization || ""))) throw new Error("Authorized Viewer preview context is required.");
  const url = new URL(path, "https://viewer.invalid");
  url.searchParams.set("previewAuthorization", authorization);
  return `${url.pathname}${url.search}`;
}

export async function exchangeHostedPreviewComponentAuthorization({ sourceBookSlug, sourceComponentSlug, targetBookSlug, targetComponentSlug, fetchImpl = globalThis.fetch, signal } = {}) {
  const context = resolveHostedViewerRuntimeContext();
  if (context.kind !== HOSTED_VIEWER_RUNTIME_MODES.BUILDER_PREVIEW || typeof fetchImpl !== "function") throw new Error("Authorized Builder Review is required for component switching.");
  const response = await fetchImpl(authorizedHostedPreviewPath("/preview/authorization/exchange", context.authorization), {
    method: "POST",
    credentials: "omit",
    cache: "no-store",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: { bookSlug: sourceBookSlug, componentSlug: sourceComponentSlug },
      intent: { bookSlug: targetBookSlug, componentSlug: targetComponentSlug, view: "library", pageId: null, activityId: null, releaseId: null },
    }),
  });
  if (!response?.ok) throw new Error("The selected component could not be authorized for Builder Review.");
  const payload = await response.json();
  if (!TOKEN.test(String(payload?.token || "")) || !Number.isFinite(Date.parse(payload?.expiresAt || ""))) throw new Error("Component switch authorization is invalid.");
  return Object.freeze({ token: payload.token, expiresAt: payload.expiresAt });
}

export function hostedReleasePath(releaseId, suffix) {
  if (!UUID.test(String(releaseId || "")) || !/^(?:public|teacher-ui|teacher-solution\/[a-z0-9][a-z0-9-]{0,127}|native-teacher\/[a-z0-9][a-z0-9-]{0,127}|assets\/[a-f0-9]{64}\.(?:png|jpg|webp|mp3|mp4|pdf))$/.test(suffix)) throw new Error("Invalid hosted release preview path.");
  return authorizedHostedPreviewPath(`/preview/releases/books/ultimate-b2/components/ultimate-b2-students-book/${releaseId}/${suffix}`);
}
