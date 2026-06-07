const jsonHeaders = { "Content-Type": "application/json" };

async function parseJsonResponse(response) {
  const responseText = await response.text();
  let payload = {};
  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const serverMessage = payload.detail || payload.details || payload.error || responseText || "Book media assets API request failed";
    const error = new Error(`Book media assets API request failed (${response.status}): ${serverMessage}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: jsonHeaders,
    ...options,
  });
  return parseJsonResponse(response);
}

export function bookMediaAssetFromApi(row = {}) {
  return {
    id: row.id,
    packageSlug: row.package_slug,
    componentSlug: row.component_slug,
    pageId: row.page_id || null,
    fileName: row.file_name || "",
    originalFileName: row.original_file_name || "",
    mimeType: row.mime_type || "",
    fileSizeBytes: row.file_size_bytes ?? null,
    publicUrl: row.public_url || "",
    storagePath: row.storage_path || null,
    kind: row.kind || "other",
    createdBy: row.created_by || null,
    createdAt: row.created_at || null,
  };
}

export function bookMediaAssetToApi(asset = {}) {
  return {
    packageSlug: asset.packageSlug,
    componentSlug: asset.componentSlug,
    pageId: asset.pageId || null,
    fileName: asset.fileName,
    originalFileName: asset.originalFileName || asset.fileName,
    mimeType: asset.mimeType || "application/octet-stream",
    fileSizeBytes: asset.fileSizeBytes || null,
    publicUrl: asset.publicUrl,
    storagePath: asset.storagePath || null,
    kind: asset.kind || "other",
    createdBy: asset.createdBy || null,
  };
}

export async function listBookMediaAssets({ packageSlug, componentSlug, pageId = "", kind = "" }) {
  const query = new URLSearchParams({
    action: "book-media-assets",
    packageSlug,
    componentSlug,
  });
  if (pageId) query.set("pageId", pageId);
  if (kind) query.set("kind", kind);
  const payload = await request(`/.netlify/functions/book-content?${query}`);
  return (payload.mediaAssets || []).map(bookMediaAssetFromApi);
}

export async function createBookMediaAsset(payload) {
  const response = await request("/.netlify/functions/book-content?action=create-book-media-asset", {
    method: "POST",
    body: JSON.stringify(bookMediaAssetToApi(payload)),
  });
  return bookMediaAssetFromApi(response.mediaAsset);
}

export async function uploadBookMediaAsset() {
  throw new Error("File upload storage is not configured yet. Use a media URL for now.");
}
