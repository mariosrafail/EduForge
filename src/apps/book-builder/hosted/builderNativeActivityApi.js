import { newBuilderClientMutationId } from "./builderContentApi.js";

const root = "/builder/api/native-activities";
const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,127}$/;

async function payload(response) { return response.json().catch(() => ({})); }

function activityRoot(bookSlug, componentSlug, activityId) {
  for (const value of [bookSlug, componentSlug, activityId]) if (!SAFE_ID.test(String(value || ""))) throw new Error("Invalid native activity identity.");
  return `${root}/books/${encodeURIComponent(bookSlug)}/components/${encodeURIComponent(componentSlug)}/activities/${encodeURIComponent(activityId)}`;
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

export async function getNativeActivityCatalog({ bookSlug, componentSlug }, { signal } = {}) {
  for (const value of [bookSlug, componentSlug]) if (!SAFE_ID.test(String(value || ""))) throw new Error("Invalid native activity catalog identity.");
  const response = await fetch(`${root}/books/${encodeURIComponent(bookSlug)}/components/${encodeURIComponent(componentSlug)}/catalog`, { method: "GET", credentials: "same-origin", cache: "no-store", signal });
  const value = await payload(response);
  if (!response.ok || value.schemaVersion !== "1.0" || !Array.isArray(value.activities)) throw new Error(value.error || "Native activity catalog could not be loaded.");
  return value.activities;
}

export async function saveNativeActivityPair({ bookSlug, componentSlug, activityId, expectedPublicRevision, expectedTeacherRevision, publicDocument, teacherDocument }) {
  const response = await fetch(`${activityRoot(bookSlug, componentSlug, activityId)}/save`, {
    method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expectedPublicRevision, expectedTeacherRevision, publicDocument, teacherDocument, clientMutationId: newBuilderClientMutationId() }),
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
