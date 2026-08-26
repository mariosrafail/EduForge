import { BuilderContentApiError } from "./builderContentApi.js";

const root = "/builder/api/pages";

async function payload(response) {
  return response.json().catch(() => ({}));
}

async function request(path, { method = "GET", body, signal } = {}) {
  const response = await fetch(`${root}/${path}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    signal,
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const result = await payload(response);
  if (!response.ok) throw new BuilderContentApiError(response.status, result, "Page library request failed.");
  return result;
}

const scope = ({ bookSlug, componentSlug }) => `books/${encodeURIComponent(bookSlug)}/components/${encodeURIComponent(componentSlug)}`;

export function getBuilderPages(identity, options = {}) {
  return request(scope(identity), options);
}

export function prepareBuilderPage(identity, input) {
  return request(`${scope(identity)}/assets/prepare`, { method: "POST", body: { ...input, file: { name: input.file.name, size: input.file.size, type: input.file.type } } });
}

export function uploadBuilderPage(file, authorization, onProgress) {
  return new Promise((resolve, reject) => {
    const upload = new XMLHttpRequest();
    upload.open("PUT", authorization.url, true);
    for (const [name, value] of Object.entries(authorization.headers || {})) upload.setRequestHeader(name, value);
    upload.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    });
    upload.addEventListener("load", () => upload.status >= 200 && upload.status < 300 ? resolve() : reject(new Error(`Upload failed for ${file.name}.`)));
    upload.addEventListener("error", () => reject(new Error(`Upload failed for ${file.name}.`)));
    upload.send(file);
  });
}

export function finalizeBuilderPage(identity, input) {
  return request(`${scope(identity)}/assets/finalize`, { method: "POST", body: input });
}

export function mutateBuilderPage(identity, pageId, action, input) {
  return request(`${scope(identity)}/pages/${encodeURIComponent(pageId)}/${action}`, { method: "POST", body: input });
}
