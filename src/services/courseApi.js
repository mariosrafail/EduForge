const jsonHeaders = { "Content-Type": "application/json" };

async function parseJsonResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || payload.detail || "Course API request failed");
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

export async function getCourse() {
  const payload = await request("/.netlify/functions/course");
  if (!payload.course) {
    throw new Error("Course API did not return course data");
  }
  return payload.course;
}

export async function updateCourse(coursePatch) {
  const payload = await request("/.netlify/functions/course", {
    method: "PATCH",
    body: JSON.stringify(coursePatch),
  });
  return payload.course;
}

export async function updateLesson(lessonId, patch) {
  const payload = await request(`/.netlify/functions/lesson?id=${encodeURIComponent(lessonId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return payload.course;
}

export async function updateActivity(activityId, patch) {
  const payload = await request(`/.netlify/functions/activity?id=${encodeURIComponent(activityId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return payload.course;
}

export async function submitLesson(payload) {
  return request("/.netlify/functions/lesson-submit", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
