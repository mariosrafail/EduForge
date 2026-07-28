async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  let body = {};
  try { body = await response.json(); } catch { body = {}; }
  if (!response.ok) {
    const error = new Error(body.error || "Platform Administration request failed");
    error.status = response.status;
    throw error;
  }
  return body;
}

const query = (values) => new URLSearchParams(
  Object.entries(values).filter(([, value]) => value !== "" && value !== null && value !== undefined),
).toString();

export const platformAuth = {
  me: () => request("/platform-admin/api/auth?action=me"),
  login: (credentials) => request("/platform-admin/api/auth?action=login", { method: "POST", body: JSON.stringify(credentials) }),
  logout: () => request("/platform-admin/api/auth?action=logout", { method: "POST", body: "{}" }),
};

export const platformApi = {
  get: (action, filters = {}) => request(`/platform-admin/api/control?${query({ action, ...filters })}`),
  mutate: (action, body) => request(`/platform-admin/api/control?${query({ action })}`, { method: "POST", body: JSON.stringify(body) }),
};
