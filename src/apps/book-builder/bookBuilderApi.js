const API_ROOT = "/__hhplms/book-builder";
const SESSION_HEADER = "X-HHPLMS-Book-Builder-Session";

let bootstrapPromise = null;
let sessionToken = null;

async function readPayload(response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "Review Studio request failed.");
    error.code = payload?.error?.code || "request_failed";
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function bootstrapReviewStudio({ signal, refresh = false } = {}) {
  if (refresh) bootstrapPromise = null;
  bootstrapPromise ||= fetch(`${API_ROOT}/bootstrap`, {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  }).then(readPayload).then((payload) => {
    sessionToken = payload.sessionToken;
    return { ...payload, sessionToken: undefined };
  }).catch((error) => {
    bootstrapPromise = null;
    throw error;
  });
  return bootstrapPromise;
}

export function apiUrl(pathname, query = null) {
  const url = new URL(`${API_ROOT}${pathname}`, window.location.origin);
  if (query) for (const [key, value] of Object.entries(query)) {
    if (value !== "" && value !== null && value !== undefined) url.searchParams.set(key, String(value));
  }
  return `${url.pathname}${url.search}`;
}

async function authorizedFetch(pathname, { signal, query } = {}) {
  if (!sessionToken) await bootstrapReviewStudio({ signal });
  const response = await fetch(apiUrl(pathname, query), {
    cache: "no-store",
    credentials: "same-origin",
    headers: { [SESSION_HEADER]: sessionToken },
    signal,
  });
  return response;
}

export async function requestReviewStudio(pathname, options = {}) {
  return readPayload(await authorizedFetch(pathname, options));
}

export async function requestReviewStudioPreview(projectId, previewId, { signal } = {}) {
  const response = await authorizedFetch(`/projects/${encodeURIComponent(projectId)}/preview/${encodeURIComponent(previewId)}`, { signal });
  if (!response.ok) await readPayload(response);
  return response.blob();
}
