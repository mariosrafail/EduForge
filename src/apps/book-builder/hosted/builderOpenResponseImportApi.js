import { BuilderContentApiError } from "./builderContentApi.js";

const root = "/builder/api/open-response-import";
const safeActivityId = /^[a-z0-9][a-z0-9-]{1,127}$/;

async function payload(response) {
  return response.json().catch(() => ({}));
}

async function request(path, options) {
  const response = await fetch(`${root}/${path}`, { credentials: "same-origin", cache: "no-store", ...options });
  const body = await payload(response);
  if (!response.ok) throw new BuilderContentApiError(response.status, body, "Publisher source import failed.");
  return body;
}

export function getOpenResponseImportStatus(activityId, { signal } = {}) {
  if (!safeActivityId.test(String(activityId || ""))) throw new Error("Invalid Open Response activity id.");
  return request(`status/${encodeURIComponent(activityId)}`, { method: "GET", signal });
}

export function prepareOpenResponseImport({ activityId, expectedRevision, clientMutationId, files }) {
  return request("prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ activityId, expectedRevision, clientMutationId, files: files.map((file) => ({ name: file.name, size: file.size, type: file.type || "" })) }),
  });
}

export function uploadOpenResponseImportFile(file, upload, onProgress) {
  return new Promise((resolve, reject) => {
    const requestUpload = new XMLHttpRequest();
    requestUpload.open("PUT", upload.authorization.url, true);
    for (const [name, value] of Object.entries(upload.authorization.headers || {})) requestUpload.setRequestHeader(name, value);
    requestUpload.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    });
    requestUpload.addEventListener("load", () => {
      if (requestUpload.status >= 200 && requestUpload.status < 300) { onProgress?.(100); resolve(); }
      else reject(new Error(`Upload failed for ${file.name}.`));
    });
    requestUpload.addEventListener("error", () => reject(new Error(`Upload failed for ${file.name}.`)));
    requestUpload.addEventListener("abort", () => reject(new Error(`Upload was cancelled for ${file.name}.`)));
    requestUpload.send(file);
  });
}

export function finalizeOpenResponseImport({ uploadId, expectedRevision, clientMutationId }) {
  return request("finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadId, expectedRevision, clientMutationId }),
  });
}

export { root as builderOpenResponseImportApiRoot };
