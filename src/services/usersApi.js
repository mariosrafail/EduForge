export const roleOptions = ["School Admin", "Teacher", "Student"];
export const statusOptions = ["Active", "Invited", "Paused"];

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "User API request failed");
  }

  return payload;
}

export function roleToDb(role) {
  if (String(role).toLowerCase() === "school admin") return "admin";
  return String(role).toLowerCase();
}

export function roleToLabel(role) {
  const normalized = String(role ?? "").toLowerCase();
  if (normalized === "admin") return "School Admin";
  return normalized ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}` : "Student";
}

export function userToUi(user) {
  const id = user.id ?? `mock-${user.name ?? user.full_name}`;

  return {
    id,
    name: user.full_name ?? user.name,
    email: user.email ?? "",
    role: roleToLabel(user.role),
    level: user.level ?? "",
    status: roleToLabel(user.status),
    source: user.id ? "database" : "mock",
  };
}

export async function listUsers() {
  const payload = await fetchJson("/.netlify/functions/users");
  return payload.users.map(userToUi);
}

export async function createUser(user) {
  const payload = await fetchJson("/.netlify/functions/users", {
    method: "POST",
    body: JSON.stringify({
      full_name: user.name,
      email: user.email,
      password: user.password,
      role: roleToDb(user.role),
      level: user.level,
      status: roleToDb(user.status),
    }),
  });

  return userToUi(payload.user);
}

export async function updateUser(id, updates) {
  const payload = await fetchJson(`/.netlify/functions/user?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });

  return userToUi(payload.user);
}

export async function deleteUser(id) {
  await fetchJson(`/.netlify/functions/user?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
