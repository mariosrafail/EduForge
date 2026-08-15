const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function currentHostedReleaseId(search = globalThis.location?.search || "") {
  const parameters = new URLSearchParams(search);
  const values = parameters.getAll("releaseId");
  return values.length === 1 && UUID.test(values[0]) ? values[0].toLowerCase() : null;
}

export function currentHostedPreviewAuthorization(search = globalThis.location?.search || "") {
  const values = new URLSearchParams(search).getAll("previewAuthorization");
  return values.length === 1 && /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(values[0]) ? values[0] : null;
}

export function authorizedHostedPreviewPath(path, authorization = currentHostedPreviewAuthorization()) {
  if (!path.startsWith("/preview/") || !authorization) return path;
  const url = new URL(path, "https://viewer.invalid");
  url.searchParams.set("previewAuthorization", authorization);
  return `${url.pathname}${url.search}`;
}

export function hostedReleasePath(releaseId, suffix) {
  if (!UUID.test(String(releaseId || "")) || !/^(?:public|teacher-ui|teacher-solution\/[a-z0-9][a-z0-9-]{0,127}|native-teacher\/[a-z0-9][a-z0-9-]{0,127}|assets\/[a-f0-9]{64}\.(?:png|jpg|webp))$/.test(suffix)) throw new Error("Invalid hosted release preview path.");
  return authorizedHostedPreviewPath(`/preview/releases/books/ultimate-b2/components/ultimate-b2-students-book/${releaseId}/${suffix}`);
}
