const jsonHeaders = { "Content-Type": "application/json" };

async function parseJsonResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const serverMessage = payload.error || payload.detail || "Book content API request failed";
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

export async function listTeacherClasses(teacherId) {
  const query = teacherId ? `&teacherId=${encodeURIComponent(teacherId)}` : "";
  const payload = await request(`/.netlify/functions/book-content?action=classes${query}`);
  return payload.classes || [];
}

export async function createTeacherClass(classPayload) {
  const payload = await request("/.netlify/functions/book-content?action=create-class", {
    method: "POST",
    body: JSON.stringify(classPayload),
  });
  return payload.classItem || payload.class;
}

export async function getClassByInvite(inviteCode) {
  const payload = await request(`/.netlify/functions/book-content?action=class-by-invite&inviteCode=${encodeURIComponent(inviteCode)}`);
  return payload.classItem || payload.class;
}

export async function joinClass(joinPayload) {
  return request("/.netlify/functions/book-content?action=join-class", {
    method: "POST",
    body: JSON.stringify(joinPayload),
  });
}
