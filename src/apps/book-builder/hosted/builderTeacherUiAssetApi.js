import { BuilderContentApiError } from "./builderContentApi.js";

const root = "/builder/api/ui-assets";
const operationalMessages = Object.freeze({
  teacher_ui_schema_unavailable: "Teacher interface upload records are unavailable. Contact the hosted Builder operator.",
  teacher_ui_storage_unavailable: "Teacher interface asset storage is unavailable. Contact the hosted Builder operator.",
});

export function teacherUiAssetErrorMessage(code) {
  return operationalMessages[code] || String(code || "");
}

async function responsePayload(response) {
  return response.json().catch(() => ({}));
}

async function request(path, body) {
  const response = await fetch(`${root}/${path}`, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await responsePayload(response);
  if (!response.ok) throw new BuilderContentApiError(response.status, payload?.error ? { ...payload, error: teacherUiAssetErrorMessage(payload.error) } : payload, "Teacher interface authoring failed.");
  return payload;
}

export function prepareTeacherUiAssets({ expectedRevision, clientMutationId, files }) {
  return request("prepare", {
    expectedRevision,
    clientMutationId,
    files: files.map(({ bindingId, file }) => ({ bindingId, name: file.name, size: file.size, type: file.type || "application/octet-stream" })),
  });
}

export function uploadTeacherUiAsset(file, upload, onProgress) {
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

export function finalizeTeacherUiAssets({ uploadId, expectedRevision, clientMutationId }) {
  return request("finalize", { uploadId, expectedRevision, clientMutationId });
}

export function saveTeacherUiDocument({ expectedRevision, clientMutationId, document, candidateUploadIds }) {
  return request("save", { expectedRevision, clientMutationId, document, candidateUploadIds });
}

export { root as builderTeacherUiAssetApiRoot };
