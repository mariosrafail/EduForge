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
    const serverMessage = payload.detail || payload.details || payload.error || responseText || "Book activities API request failed";
    const friendlyMessage = response.status === 401
      ? "Sign in required"
      : response.status === 403
        ? "This account does not have access to this area"
        : `Book activities API request failed (${response.status}): ${serverMessage}`;
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

export function bookActivityFromApi(row = {}) {
  return {
    id: row.id,
    packageSlug: row.package_slug,
    componentSlug: row.component_slug,
    pageId: row.page_id || null,
    pageNumber: row.page_number ?? null,
    title: row.title || "Untitled activity",
    type: row.type,
    instructions: row.instructions || "",
    content: row.content || {},
    correctAnswers: row.correct_answers || {},
    feedback: row.feedback || {},
    mediaId: row.media_id || null,
    status: row.status || "draft",
    createdBy: row.created_by || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export function bookActivityToApi(activity = {}) {
  return {
    packageSlug: activity.packageSlug,
    componentSlug: activity.componentSlug,
    pageId: activity.pageId || null,
    pageNumber: activity.pageNumber || null,
    title: activity.title,
    type: activity.type,
    instructions: activity.instructions || "",
    content: activity.content || {},
    correctAnswers: activity.correctAnswers || {},
    feedback: activity.feedback || {},
    mediaId: activity.mediaId || null,
    status: activity.status || "published",
    createdBy: activity.createdBy || null,
  };
}

export async function listBookActivities({ packageSlug, componentSlug, pageId = "", status = "" }) {
  const query = new URLSearchParams({
    action: "book-activities",
    packageSlug,
    componentSlug,
  });
  if (pageId) query.set("pageId", pageId);
  if (status) query.set("status", status);
  const payload = await request(`/.netlify/functions/book-content?${query}`);
  return (payload.activities || []).map(bookActivityFromApi);
}

export async function getBookActivity(activityId) {
  const query = new URLSearchParams({
    action: "book-activity",
    activityId,
  });
  const payload = await request(`/.netlify/functions/book-content?${query}`);
  return bookActivityFromApi(payload.activity);
}

export async function createBookActivity(payload) {
  const response = await request("/.netlify/functions/book-content?action=create-book-activity", {
    method: "POST",
    body: JSON.stringify(bookActivityToApi(payload)),
  });
  return bookActivityFromApi(response.activity);
}

export async function updateBookActivity(activityId, patch) {
  const response = await request("/.netlify/functions/book-content?action=update-book-activity", {
    method: "POST",
    body: JSON.stringify({ id: activityId, ...bookActivityToApi(patch) }),
  });
  return bookActivityFromApi(response.activity);
}

export async function deleteBookActivity(activityId) {
  return request("/.netlify/functions/book-content?action=delete-book-activity", {
    method: "POST",
    body: JSON.stringify({ id: activityId }),
  });
}
