import { BuilderContentApiError, newBuilderClientMutationId } from "./builderContentApi.js";

const root = "/builder/api/unit-extras";

async function payload(response) { return response.json().catch(() => ({})); }

function path({ bookSlug, componentSlug, unitSlug = "", itemId = "" }, action) {
  const base = `${root}/books/${encodeURIComponent(bookSlug)}/components/${encodeURIComponent(componentSlug)}`;
  return unitSlug ? `${base}/units/${encodeURIComponent(unitSlug)}/videos/${encodeURIComponent(itemId)}/assets/${action}` : `${base}/${action}`;
}

async function post(url, body) {
  const response = await fetch(url, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const bodyPayload = await payload(response);
  if (!response.ok) throw new BuilderContentApiError(response.status, bodyPayload, "Unit Extras authoring failed.");
  return bodyPayload;
}

export async function saveUnitExtrasDocument({ bookSlug, componentSlug, expectedRevision, document }) {
  return post(path({ bookSlug, componentSlug }, "save"), { expectedRevision, clientMutationId: newBuilderClientMutationId(), document });
}

export async function uploadUnitExtraVideo({ bookSlug, componentSlug, unitSlug, itemId, expectedRevision, file, onProgress }) {
  const clientMutationId = newBuilderClientMutationId();
  const identity = { bookSlug, componentSlug, unitSlug, itemId };
  const prepared = await post(path(identity, "prepare"), { expectedRevision, clientMutationId, file: { name: file.name, size: file.size, type: file.type, assetSlot: itemId } });
  await new Promise((resolve, reject) => {
    const upload = new XMLHttpRequest();
    upload.open("PUT", prepared.authorization.url, true);
    for (const [name, value] of Object.entries(prepared.authorization.headers || {})) upload.setRequestHeader(name, value);
    upload.upload.addEventListener("progress", (event) => { if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100)); });
    upload.addEventListener("load", () => upload.status >= 200 && upload.status < 300 ? resolve() : reject(new Error(`Upload failed for ${file.name}.`)));
    upload.addEventListener("error", () => reject(new Error(`Upload failed for ${file.name}.`)));
    upload.addEventListener("abort", () => reject(new Error(`Upload was cancelled for ${file.name}.`)));
    upload.send(file);
  });
  return post(path(identity, "finalize"), { uploadId: prepared.uploadId, expectedRevision, clientMutationId });
}

export { root as builderUnitExtrasApiRoot };
