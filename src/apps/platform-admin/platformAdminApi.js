let unauthorizedHandler = null;
let securityErrorHandler = null;
let sessionInvalid = false;
const activeRequests = new Set();

export function setPlatformUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null;
  };
}

export function resetPlatformApiSession() {
  sessionInvalid = false;
}

export function setPlatformSecurityErrorHandler(handler) {
  securityErrorHandler = handler;
  return () => {
    if (securityErrorHandler === handler) securityErrorHandler = null;
  };
}

function invalidatePlatformSession(currentController) {
  if (sessionInvalid) return;
  sessionInvalid = true;
  for (const controller of activeRequests) {
    if (controller !== currentController) controller.abort();
  }
  unauthorizedHandler?.();
}

async function request(path, options = {}, { notifyUnauthorized = true, notifySecurityError = false } = {}) {
  const controller = new AbortController();
  activeRequests.add(controller);
  try {
    const response = await fetch(path, {
      credentials: "include",
      ...options,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
    let body = {};
    try { body = await response.json(); } catch { body = {}; }
    if (!response.ok) {
      if (response.status === 401 && notifyUnauthorized) invalidatePlatformSession(controller);
      const error = new Error(body.error || "Platform Administration request failed");
      error.status = response.status;
      if (response.status === 403 && notifySecurityError) securityErrorHandler?.(error);
      throw error;
    }
    return body;
  } catch (error) {
    if (error.name === "AbortError") {
      error.platformSessionCancelled = true;
    }
    throw error;
  } finally {
    activeRequests.delete(controller);
  }
}

const query = (values) => new URLSearchParams(
  Object.entries(values).filter(([, value]) => value !== "" && value !== null && value !== undefined),
).toString();

export const platformAuth = {
  me: ({ notifyUnauthorized = false } = {}) => request("/platform-admin/api/auth?action=me", {}, { notifyUnauthorized }),
  login: (credentials) => {
    resetPlatformApiSession();
    return request("/platform-admin/api/auth?action=login", { method: "POST", body: JSON.stringify(credentials) }, { notifyUnauthorized: false });
  },
  logout: () => request("/platform-admin/api/auth?action=logout", { method: "POST", body: "{}" }),
};

export const platformApi = {
  get: (action, filters = {}) => request(`/platform-admin/api/control?${query({ action, ...filters })}`, {}, { notifySecurityError: true }),
  mutate: (action, body) => request(`/platform-admin/api/control?${query({ action })}`, { method: "POST", body: JSON.stringify(body) }, { notifySecurityError: true }),
};
