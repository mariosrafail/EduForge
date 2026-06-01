const jsonHeaders = { "Content-Type": "application/json" };

async function parseJsonResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || payload.detail || "Book content API request failed");
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function request(path, options = {}) {
  const response = await fetch(path, {
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

export async function getClassBySlug(slug) {
  const payload = await request(`/.netlify/functions/book-content?action=class-by-slug&slug=${encodeURIComponent(slug)}`);
  return payload.classItem || payload.class;
}

export async function joinClass(joinPayload) {
  return request("/.netlify/functions/book-content?action=join-class", {
    method: "POST",
    body: JSON.stringify(joinPayload),
  });
}
