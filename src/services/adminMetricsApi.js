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
    const serverMessage = payload.detail || payload.details || payload.error || responseText || "School metrics could not be loaded";
    const friendlyMessage = response.status === 401
      ? "Sign in required"
      : response.status === 403
        ? "This account does not have access to this area"
        : response.status === 503
          ? "Database not configured, showing demo data"
          : String(serverMessage).includes("010_assignment_live_flow")
            ? "Run database/010_assignment_live_flow.sql"
            : serverMessage;
    const error = new Error(friendlyMessage);
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

export async function getSchoolMetrics() {
  const payload = await request("/.netlify/functions/book-content?action=school-metrics");
  return payload.metrics || null;
}
