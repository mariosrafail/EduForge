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
    const serverMessage = payload.detail || payload.details || payload.error || responseText || "Book page hotspots API request failed";
    const message = response.status === 401
      ? "Sign in required"
      : response.status === 403
        ? "This account does not have access to this area"
        : payload.error === "Database is not configured"
      ? "Database is not configured. Hotspots cannot be saved locally until DATABASE_URL is set."
      : `Book page hotspots API request failed (${response.status}): ${serverMessage}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: jsonHeaders,
    ...options,
  });
  return parseJsonResponse(response);
}

function clampPercent(value, min = 0, max = 100) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(Math.max(numeric, min), max);
}

export function hotspotFromApi(row = {}) {
  return {
    id: row.id,
    pageId: row.page_id,
    label: row.label || "Clickable area",
    left: Number(row.left_percent ?? 0),
    top: Number(row.top_percent ?? 0),
    width: Number(row.width_percent ?? 0),
    height: Number(row.height_percent ?? 0),
    actionType: row.action_type || "none",
    actionTargetId: row.action_target_id || null,
    actionPayload: row.action_payload || {},
  };
}

export function hotspotToApi(hotspot = {}) {
  const left = clampPercent(hotspot.left);
  const top = clampPercent(hotspot.top);
  const width = clampPercent(hotspot.width, 0.0001, 100 - left);
  const height = clampPercent(hotspot.height, 0.0001, 100 - top);

  return {
    id: hotspot.id,
    page_id: hotspot.pageId,
    label: hotspot.label || "Clickable area",
    left_percent: left,
    top_percent: top,
    width_percent: width,
    height_percent: height,
    action_type: hotspot.actionType || "none",
    action_target_id: hotspot.actionTargetId || null,
    action_payload: hotspot.actionPayload || {},
  };
}

export async function listBookPageHotspots({ packageSlug, componentSlug, pageId }) {
  const query = new URLSearchParams({
    action: "page-hotspots",
    packageSlug,
    componentSlug,
    pageId,
  });
  const payload = await request(`/.netlify/functions/book-content?${query}`);
  return (payload.hotspots || []).map(hotspotFromApi);
}

export async function saveBookPageHotspots({ packageSlug, componentSlug, pageId, pageNumber = null, hotspots = [], createdBy = null }) {
  const payload = await request("/.netlify/functions/book-content?action=save-page-hotspots", {
    method: "POST",
    body: JSON.stringify({
      packageSlug,
      componentSlug,
      pageId,
      pageNumber,
      createdBy,
      hotspots: hotspots.map(hotspotToApi),
    }),
  });
  return (payload.hotspots || []).map(hotspotFromApi);
}
