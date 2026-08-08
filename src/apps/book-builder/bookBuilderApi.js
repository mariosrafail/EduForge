const API_ROOT = "/__hhplms/book-builder";
const SESSION_HEADER = "X-HHPLMS-Book-Builder-Session";
const WRITE_HEADER = "X-HHPLMS-Book-Builder-Write-Capability";

let bootstrapPromise = null;
let sessionToken = null;
let writeCapability = null;

async function readPayload(response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "Review Studio request failed.");
    error.code = payload?.error?.code || "request_failed";
    error.status = response.status;
    error.details = payload?.error?.details || null;
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
    writeCapability = payload.writeCapability || null;
    return { ...payload, sessionToken: undefined, writeCapability: undefined };
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

async function decisionMutation(projectId, operation, body, { signal } = {}) {
  if (!sessionToken) await bootstrapReviewStudio({ signal });
  if (!writeCapability) {
    const error = new Error("Local authoring mode is not enabled.");
    error.code = "write_mode_disabled";
    throw error;
  }
  return readPayload(await fetch(apiUrl(`/projects/${encodeURIComponent(projectId)}/decisions/${operation}`), {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: { [SESSION_HEADER]: sessionToken, [WRITE_HEADER]: writeCapability, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  }));
}

async function manualMutation(projectId, resource, operation, body, { signal } = {}) {
  if (!sessionToken) await bootstrapReviewStudio({ signal });
  if (!writeCapability) {
    const error = new Error("Local authoring mode is not enabled.");
    error.code = "write_mode_disabled";
    throw error;
  }
  return readPayload(await fetch(apiUrl(`/projects/${encodeURIComponent(projectId)}/${resource}/${operation}`), {
    method: "POST", cache: "no-store", credentials: "same-origin",
    headers: { [SESSION_HEADER]: sessionToken, [WRITE_HEADER]: writeCapability, "Content-Type": "application/json" },
    body: JSON.stringify(body), signal,
  }));
}

async function teacherProjectMutation(pathname, body, { signal } = {}) {
  if (!sessionToken) await bootstrapReviewStudio({ signal });
  if (!writeCapability) throw Object.assign(new Error("Local editing mode is not enabled."), { code: "write_mode_disabled" });
  return readPayload(await fetch(apiUrl(pathname), {
    method: "POST", cache: "no-store", credentials: "same-origin",
    headers: { [SESSION_HEADER]: sessionToken, [WRITE_HEADER]: writeCapability, "Content-Type": "application/json" },
    body: JSON.stringify(body), signal,
  }));
}

export function requestTeacherProjects(options) {
  return requestReviewStudio("/teacher-projects", options);
}

export function requestTeacherProject(projectId, options) {
  return requestReviewStudio(`/teacher-projects/${encodeURIComponent(projectId)}`, options);
}

export function createTeacherProject(body, options) {
  return teacherProjectMutation("/teacher-projects", body, options);
}

export function saveTeacherProject(projectId, body, options) {
  return teacherProjectMutation(`/teacher-projects/${encodeURIComponent(projectId)}/save`, body, options);
}

export async function importTeacherProjectAsset(projectId, file, descriptor, { signal } = {}) {
  if (!sessionToken) await bootstrapReviewStudio({ signal });
  if (!writeCapability) throw Object.assign(new Error("Local editing mode is not enabled."), { code: "write_mode_disabled" });
  const query = Object.fromEntries(Object.entries(descriptor).filter(([, value]) => value !== null && value !== undefined));
  return readPayload(await fetch(apiUrl(`/teacher-projects/${encodeURIComponent(projectId)}/assets/import`, query), {
    method: "POST", cache: "no-store", credentials: "same-origin",
    headers: { [SESSION_HEADER]: sessionToken, [WRITE_HEADER]: writeCapability, "Content-Type": "application/octet-stream", "X-HHPLMS-Teacher-Asset-Name": file.name },
    body: file, signal,
  }));
}

export async function requestTeacherProjectAsset(projectId, assetId, { signal } = {}) {
  const response = await authorizedFetch(`/teacher-projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/content`, { signal });
  if (!response.ok) await readPayload(response);
  return response.blob();
}

export function removeTeacherProjectAsset(projectId, assetId, expectedRevision, options) {
  return teacherProjectMutation(`/teacher-projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/remove`, { expectedRevision }, options);
}

export function mutateManualActivity(projectId, operation, body, options) {
  return manualMutation(projectId, "manual-activities", operation, body, options);
}

export function prefillManualActivity(projectId, activityCandidateId, options) {
  return manualMutation(projectId, "manual-activities", "prefill", { activityCandidateId }, options);
}

export function updateManualActivitySolution(projectId, body, options) {
  return manualMutation(projectId, "manual-solutions", "update", body, options);
}

export async function requestManualActivitySolution(projectId, activityId, { signal } = {}) {
  if (!sessionToken) await bootstrapReviewStudio({ signal });
  if (!writeCapability) throw Object.assign(new Error("Teacher solutions require local edit mode."), { code: "write_mode_disabled" });
  return readPayload(await fetch(apiUrl(`/projects/${encodeURIComponent(projectId)}/manual-solutions/${encodeURIComponent(activityId)}`), {
    cache: "no-store", credentials: "same-origin", headers: { [SESSION_HEADER]: sessionToken, [WRITE_HEADER]: writeCapability }, signal,
  }));
}

export async function requestManualAssetContent(projectId, assetId, { signal } = {}) {
  if (!sessionToken) await bootstrapReviewStudio({ signal });
  const response = await fetch(apiUrl(`/projects/${encodeURIComponent(projectId)}/manual-assets/${encodeURIComponent(assetId)}/content`), { cache: "no-store", credentials: "same-origin", headers: { [SESSION_HEADER]: sessionToken }, signal });
  if (!response.ok) await readPayload(response);
  return response.blob();
}

export function previewDecision(projectId, decision, options) {
  return decisionMutation(projectId, "preview", decision, options);
}

export function applyDecision(projectId, decision, options) {
  return decisionMutation(projectId, "apply", decision, options);
}

export function removeDecision(projectId, decision, options) {
  return decisionMutation(projectId, "remove", decision, options);
}

export function reapproveDecision(projectId, decision, options) {
  return decisionMutation(projectId, "reapprove", decision, options);
}

export function previewContentOverride(projectId, override, options) {
  return previewDecision(projectId, override, options);
}

export function applyContentOverride(projectId, override, options) {
  return applyDecision(projectId, override, options);
}

export function removeContentOverride(projectId, override, options) {
  return removeDecision(projectId, override, options);
}

export function reapproveContentOverride(projectId, override, options) {
  return reapproveDecision(projectId, override, options);
}
