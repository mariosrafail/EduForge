const endpoint = "/builder/api/preview-authorization";

export async function createBuilderPreviewAuthorization(intent, { signal } = {}) {
  const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent }), signal });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.token !== "string") throw new Error(payload.error || "Viewer authorization could not be created.");
  return payload;
}
