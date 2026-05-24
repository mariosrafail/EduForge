async function authFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Authentication request failed");
  }

  return payload;
}

export async function getCurrentUser() {
  const response = await fetch("/.netlify/functions/auth-me", {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });

  if (response.status === 401) {
    return null;
  }

  const payload = await response.json();

  if (!response.ok) {
    throw new Error("Failed to check auth session");
  }

  return payload.user || null;
}

export async function signIn(credentials) {
  const payload = await authFetch("/.netlify/functions/auth-signin", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
  return payload.user;
}

export async function createSchoolAccount(account) {
  const payload = await authFetch("/.netlify/functions/auth-signup", {
    method: "POST",
    body: JSON.stringify(account),
  });
  return payload.user;
}

export async function signOut() {
  await authFetch("/.netlify/functions/auth-signout", {
    method: "POST",
    body: JSON.stringify({}),
  });
}
