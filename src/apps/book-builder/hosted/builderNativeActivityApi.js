import { newBuilderClientMutationId } from "./builderContentApi.js";
import { normalizeNativeActivityAuthoringVisualValues } from "./nativeActivityAuthoringProjection.js";

const root = "/builder/api/native-activities";
const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,127}$/;

async function payload(response) { return response.json().catch(() => ({})); }

function activityRoot(bookSlug, componentSlug, activityId) {
  for (const value of [bookSlug, componentSlug, activityId]) if (!SAFE_ID.test(String(value || ""))) throw new Error("Invalid native activity identity.");
  return `${root}/books/${encodeURIComponent(bookSlug)}/components/${encodeURIComponent(componentSlug)}/activities/${encodeURIComponent(activityId)}`;
}

function componentRoot(bookSlug, componentSlug) {
  for (const value of [bookSlug, componentSlug]) if (!SAFE_ID.test(String(value || ""))) throw new Error("Invalid native activity component identity.");
  return `${root}/books/${encodeURIComponent(bookSlug)}/components/${encodeURIComponent(componentSlug)}`;
}

export function nativeFontPreviewUrl(bookSlug, componentSlug, assetId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(assetId || ""))) throw new Error("Invalid font asset identity.");
  return `${componentRoot(bookSlug, componentSlug)}/fonts/${encodeURIComponent(assetId)}/preview`;
}

export async function getBuilderFontLibrary({ bookSlug, componentSlug }, { signal } = {}) {
  const response = await fetch(`${componentRoot(bookSlug, componentSlug)}/fonts`, { method: "GET", credentials: "same-origin", cache: "no-store", signal });
  const value = await payload(response);
  if (!response.ok || !Array.isArray(value.fonts)) throw new Error(value.error || "Font library could not be loaded.");
  return value.fonts;
}

export async function uploadBuilderFont({ bookSlug, componentSlug, file }) {
  const base = `${componentRoot(bookSlug, componentSlug)}/fonts`;
  const clientMutationId = newBuilderClientMutationId();
  const preparedResponse = await fetch(`${base}/prepare`, {
    method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, type: file.type || "application/octet-stream", clientMutationId }),
  });
  const prepared = await payload(preparedResponse);
  if (!preparedResponse.ok) throw new Error(prepared.error || "Font upload could not be prepared.");
  const uploaded = await fetch(prepared.authorization.url, { method: "PUT", headers: prepared.authorization.headers, body: file });
  if (!uploaded.ok) throw new Error("Font bytes could not be uploaded.");
  const finalizedResponse = await fetch(`${base}/finalize`, {
    method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadId: prepared.uploadId, clientMutationId }),
  });
  const finalized = await payload(finalizedResponse);
  if (!finalizedResponse.ok) throw new Error(finalized.error || "Font upload could not be finalized.");
  return finalized;
}

export async function createNativeActivity({ bookSlug, componentSlug, kind, pageId, title }) {
  for (const value of [bookSlug, componentSlug, kind, pageId]) if (!SAFE_ID.test(String(value || ""))) throw new Error("Invalid native activity creation identity.");
  const response = await fetch(`${root}/books/${encodeURIComponent(bookSlug)}/components/${encodeURIComponent(componentSlug)}/create`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, pageId, title: String(title || ""), clientMutationId: newBuilderClientMutationId() }),
  });
  const value = await payload(response);
  if (!response.ok) throw new Error(value.error || "Native activity could not be created.");
  return value;
}

export async function getNativeActivityCatalogResult({ bookSlug, componentSlug }, { signal } = {}) {
  for (const value of [bookSlug, componentSlug]) if (!SAFE_ID.test(String(value || ""))) throw new Error("Invalid native activity catalog identity.");
  const response = await fetch(`${root}/books/${encodeURIComponent(bookSlug)}/components/${encodeURIComponent(componentSlug)}/catalog`, { method: "GET", credentials: "same-origin", cache: "no-store", signal });
  const value = await payload(response);
  if (!response.ok || value.schemaVersion !== "1.0" || value.bookSlug !== bookSlug || value.componentSlug !== componentSlug || !Array.isArray(value.activities)) throw new Error(value.error || "Native activity catalog could not be loaded.");
  const invalidActivities = value.invalidActivities || [];
  if (!Array.isArray(invalidActivities) || invalidActivities.some((diagnostic) => !diagnostic || typeof diagnostic !== "object" || Array.isArray(diagnostic)
    || Object.keys(diagnostic).sort().join("\0") !== ["activityId", "kind", "pageId", "code", "stage", "loadable", "ready"].sort().join("\0")
    || ![diagnostic.activityId, diagnostic.kind, diagnostic.pageId].every((item) => SAFE_ID.test(String(item || "")))
    || !/^[a-z][a-z0-9_]{2,63}$/.test(String(diagnostic.code || "")) || !/^[a-z][a-z0-9-]{2,63}$/.test(String(diagnostic.stage || ""))
    || diagnostic.loadable !== false || diagnostic.ready !== false)) throw new Error("Native activity catalog diagnostics are invalid.");
  return { activities: value.activities, invalidActivities };
}

export async function getNativeActivityCatalog(identity, options) {
  return (await getNativeActivityCatalogResult(identity, options)).activities;
}

export async function saveNativeActivityPair({ bookSlug, componentSlug, activityId, expectedPublicRevision, expectedTeacherRevision, publicDocument, teacherDocument }) {
  const normalizedPublicDocument = normalizeNativeActivityAuthoringVisualValues(publicDocument);
  const response = await fetch(`${activityRoot(bookSlug, componentSlug, activityId)}/save`, {
    method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expectedPublicRevision, expectedTeacherRevision, publicDocument: normalizedPublicDocument, teacherDocument, clientMutationId: newBuilderClientMutationId() }),
  });
  const value = await payload(response);
  if (!response.ok) {
    const error = new Error(value.error || "Native activity could not be saved.");
    error.status = response.status; error.payload = value; throw error;
  }
  return value;
}

export async function getActivityLifecycle({ bookSlug, componentSlug }, { signal } = {}) {
  for (const value of [bookSlug, componentSlug]) if (!SAFE_ID.test(String(value || ""))) throw new Error("Invalid activity lifecycle identity.");
  const response = await fetch(`${root}/books/${encodeURIComponent(bookSlug)}/components/${encodeURIComponent(componentSlug)}/lifecycle`, { method: "GET", credentials: "same-origin", cache: "no-store", signal });
  const value = await payload(response);
  if (!response.ok || value.schemaVersion !== "1.0" || !value.document || typeof value.document !== "object") throw new Error(value.error || "Activity lifecycle could not be loaded.");
  return value;
}

export async function deleteNativeActivity({ bookSlug, componentSlug, activityId }) {
  const response = await fetch(`${activityRoot(bookSlug, componentSlug, activityId)}/delete`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientMutationId: newBuilderClientMutationId() }),
  });
  const value = await payload(response);
  if (!response.ok) {
    const error = new Error(value.error || "Native activity could not be deleted.");
    error.status = response.status;
    error.payload = value;
    throw error;
  }
  return value;
}

async function mutateActivity({ bookSlug, componentSlug, activityId, action, sourcePageId, destinationPageId }) {
  if (!SAFE_ID.test(String(sourcePageId || "")) || (action === "move" && !SAFE_ID.test(String(destinationPageId || "")))) throw new Error("Invalid activity placement.");
  const body = { sourcePageId, ...(action === "move" ? { destinationPageId } : {}), clientMutationId: newBuilderClientMutationId() };
  const response = await fetch(`${activityRoot(bookSlug, componentSlug, activityId)}/${action}`, {
    method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const value = await payload(response);
  if (!response.ok) {
    const error = new Error(value.error || `Activity ${action} failed.`);
    error.status = response.status; error.payload = value; throw error;
  }
  return value;
}

export function retireCanonicalActivity(input) { return mutateActivity({ ...input, action: "retire" }); }

export function moveActivity(input) { return mutateActivity({ ...input, action: "move" }); }

export async function getActivityOrder({ bookSlug, componentSlug }, { signal } = {}) {
  const response = await fetch(`${root}/books/${encodeURIComponent(bookSlug)}/components/${encodeURIComponent(componentSlug)}/order`, { credentials: "same-origin", cache: "no-store", signal });
  const value = await payload(response);
  if (!response.ok || !value.pages || ![value.indexRevision, value.lifecycleRevision].every((revision) => Number.isSafeInteger(revision) && revision >= 0)) throw new Error("Activity order could not be loaded.");
  return value;
}

export async function reorderActivity({ bookSlug, componentSlug, ...input }) {
  const response = await fetch(`${root}/books/${encodeURIComponent(bookSlug)}/components/${encodeURIComponent(componentSlug)}/reorder`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, clientMutationId: newBuilderClientMutationId() }) });
  const value = await payload(response);
  if (!response.ok) throw new Error(response.status === 409 ? "Activity order changed in another session. Reload the list before moving again." : value.error || "Activity order could not be saved.");
  return value;
}

export async function uploadNativeActivityAsset({ bookSlug, componentSlug, activityId, assetSlot, file, purpose = "native-asset" }) {
  const base = activityRoot(bookSlug, componentSlug, activityId);
  const clientMutationId = newBuilderClientMutationId();
  const preparedResponse = await fetch(`${base}/assets/prepare`, {
    method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, type: file.type, assetSlot, purpose, clientMutationId }),
  });
  const prepared = await payload(preparedResponse);
  if (!preparedResponse.ok) throw new Error(prepared.error || "Artwork upload could not be prepared.");
  const uploaded = await fetch(prepared.authorization.url, { method: "PUT", headers: prepared.authorization.headers, body: file });
  if (!uploaded.ok) throw new Error("Artwork bytes could not be uploaded.");
  const finalizedResponse = await fetch(`${base}/assets/finalize`, {
    method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadId: prepared.uploadId, clientMutationId }),
  });
  const finalized = await payload(finalizedResponse);
  if (!finalizedResponse.ok) throw new Error(finalized.error || "Artwork upload could not be finalized.");
  return finalized;
}

export const uploadNativeActivityArtwork = uploadNativeActivityAsset;
