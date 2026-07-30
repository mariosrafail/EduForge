async function authFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  let payload = {};
  try { payload = await response.json(); } catch { payload = {}; }

  if (!response.ok) {
    throw new Error(payload.error || payload.message || (response.status === 429 ? "Too many requests. Try again later." : "Authentication request failed"));
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

export async function createStudentAccount(account) {
  return authFetch("/.netlify/functions/auth-student-signup", {
    method: "POST",
    body: JSON.stringify(account),
  });
}

export async function signOut() {
  await authFetch("/.netlify/functions/auth-signout", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export const requestPasswordReset = (email) => authFetch("/.netlify/functions/auth-forgot-password", { method: "POST", body: JSON.stringify({ email }) });
export const checkAccountToken = (token, purpose) => authFetch("/.netlify/functions/account-token-check", { method: "POST", body: JSON.stringify({ token, purpose }) });
export const acceptInvitation = (token, password) => authFetch("/.netlify/functions/account-set-password", { method: "POST", body: JSON.stringify({ token, password }) });
export const resetPassword = (token, password) => authFetch("/.netlify/functions/auth-reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
export const changePassword = (currentPassword, newPassword) => authFetch("/.netlify/functions/auth-change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
export const revokeSessions = (userId) => authFetch("/.netlify/functions/auth-revoke-sessions", { method: "POST", body: JSON.stringify(userId ? { userId } : {}) });
