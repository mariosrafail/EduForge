const builderContentApiRoot = "/builder/api/content";
const routeIdentityPattern = /^[a-z0-9][a-z0-9-]{1,79}$/;

function contentPath(bookSlug, componentSlug, resource, documentKey = "") {
  for (const value of [bookSlug, componentSlug, resource, ...(documentKey ? [documentKey] : [])]) {
    if (!routeIdentityPattern.test(String(value || ""))) throw new Error("Invalid Builder content route identity.");
  }
  return `${builderContentApiRoot}/books/${encodeURIComponent(bookSlug)}/components/${encodeURIComponent(componentSlug)}/${encodeURIComponent(resource)}${documentKey ? `/${encodeURIComponent(documentKey)}` : ""}`;
}

export class BuilderContentApiError extends Error {
  constructor(status, payload, fallback) {
    super(payload?.error || fallback);
    this.name = "BuilderContentApiError";
    this.status = status;
    this.payload = payload || {};
  }
}

async function responsePayload(response) {
  return response.json().catch(() => ({}));
}

export async function getBuilderContent({ bookSlug, componentSlug, resource, documentKey }, { signal } = {}) {
  const response = await fetch(contentPath(bookSlug, componentSlug, resource, documentKey), {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  const payload = await responsePayload(response);
  if (!response.ok) throw new BuilderContentApiError(response.status, payload, "Builder content could not be loaded.");
  return payload;
}

export async function saveBuilderContent({
  bookSlug,
  componentSlug,
  resource,
  documentKey,
  expectedRevision,
  clientMutationId,
  document,
}) {
  const response = await fetch(contentPath(bookSlug, componentSlug, resource, documentKey), {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expectedRevision, clientMutationId, document }),
  });
  const payload = await responsePayload(response);
  if (!response.ok) throw new BuilderContentApiError(response.status, payload, "Builder content could not be saved.");
  return payload;
}

export function newBuilderClientMutationId() {
  if (!globalThis.crypto?.randomUUID) throw new Error("Secure mutation identity is unavailable in this browser.");
  return globalThis.crypto.randomUUID();
}

export { builderContentApiRoot };
