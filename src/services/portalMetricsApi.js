const endpoint = "/.netlify/functions/book-content?action=dashboard-metrics";

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export async function getPortalDashboardMetrics({ signal } = {}) {
  const response = await fetch(endpoint, {
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  });
  const payload = await readJson(response);
  if (!response.ok) {
    const error = new Error(payload.error || `Dashboard metrics request failed (${response.status})`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}
