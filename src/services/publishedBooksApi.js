const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const publishedTargetKey = (target) => target ? `${target.kind}:${target.releaseId}:${target.nativeActivityId}` : "";

async function read(action, params = {}, signal) {
  const response = await fetch(`/.netlify/functions/book-content?${new URLSearchParams({ action, ...params })}`, { credentials: "same-origin", cache: "no-store", signal });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) {
    const error = new Error(response.status === 401 ? "Sign in required." : response.status === 403 ? "This book is not available for this account." : payload?.detail || "Published content is unavailable. Refresh and try again.");
    error.status = response.status;
    error.code = payload?.error || "publication_response_invalid";
    throw error;
  }
  return payload;
}

export async function listPublishedBooks({ signal } = {}) {
  const payload = await read("published-books", {}, signal);
  if (!Array.isArray(payload.books) || payload.books.some((book) => !UUID.test(book.releaseId) || !Array.isArray(book.pages) || !Array.isArray(book.activities))) throw new Error("Published book response is invalid.");
  return payload.books;
}

export async function getPublishedBookActivity(book, activityId, { signal } = {}) {
  const { target } = await read("published-book-activity", { bookSlug: book.bookSlug, componentSlug: book.componentSlug, releaseId: book.releaseId, activityId }, signal);
  if (target?.releaseId !== book.releaseId || target.nativeActivityId !== activityId || target.entry?.document?.activityId !== activityId) throw new Error("Published activity identity does not match the selected book.");
  return target;
}

export async function getStudentAssignment(assignmentId, { signal } = {}) {
  const { assignment } = await read("student-assignment", { assignmentId }, signal);
  if (assignment?.assignmentId !== assignmentId) throw new Error("This assignment is not available.");
  return assignment;
}

export function publishedBookAssetPath(book, asset) {
  return `/.netlify/functions/book-content?${new URLSearchParams({ action: "published-release-asset", bookSlug: book.bookSlug, componentSlug: book.componentSlug, releaseId: book.releaseId, sha256: asset.sha256, extension: asset.extension })}`;
}
