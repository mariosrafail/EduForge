const builderAuthEndpoint = "/builder/api/auth";

async function request(action, { method = "GET", body, signal } = {}) {
  const response = await fetch(`${builderAuthEndpoint}?action=${encodeURIComponent(action)}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

export async function getBuilderSession(options = {}) {
  const { response, payload } = await request("me", options);
  if (response.status === 401) return { authenticated: false, builderUser: null };
  if (!response.ok) throw new Error(payload.error || "Builder session check failed");
  return payload;
}

export async function loginBuilder(email, password) {
  const { response, payload } = await request("login", {
    method: "POST",
    body: { email, password },
  });
  if (!response.ok) {
    const error = new Error(payload.error || "Builder sign-in failed");
    error.status = response.status;
    error.retryAfter = response.headers.get("Retry-After");
    throw error;
  }
  return payload;
}

export async function logoutBuilder() {
  const { response, payload } = await request("logout", { method: "POST" });
  if (!response.ok) throw new Error(payload.error || "Builder sign-out failed");
  return payload;
}
