const jsonHeaders = { "Content-Type": "application/json" };

function invalidResponse() {
  const error = new Error("Assignments could not be loaded. Refresh and try again.");
  error.code = "invalid_assignment_response";
  return error;
}

async function parseJsonResponse(response) {
  const responseText = await response.text();
  let payload = {};
  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    if (response.ok) throw invalidResponse();
    payload = {};
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    if (response.ok) throw invalidResponse();
    payload = {};
  }
  if (!response.ok) {
    const serverMessage = [payload.detail, payload.details, payload.error].find((value) => typeof value === "string" && value.length > 0 && value.length <= 500)
      || "Assignments API request failed. Try again.";
    const friendlyMessage = response.status === 401
      ? "Sign in required"
      : response.status === 403
        ? "This account does not have access to this area"
        : String(serverMessage).includes("010_assignment_live_flow")
            ? "Run database/010_assignment_live_flow.sql"
            : serverMessage;
    const error = new Error(friendlyMessage);
    error.status = response.status;
    const identity = payload.code || payload.error;
    error.code = typeof identity === "string" && /^[a-z][a-z0-9_-]{0,127}$/.test(identity)
      ? identity : `assignment_http_${response.status}`;
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

export function createAssignmentRequestKey() {
  const id = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `assignment-${id}`;
}

export function createHomeworkRequestKey() {
  const id = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `homework-${id}`;
}

export async function listTeacherAssignments(teacherId) {
  const query = new URLSearchParams({ action: "teacher-assignments" });
  if (teacherId) query.set("teacherId", teacherId);
  const payload = await request(`/.netlify/functions/book-content?${query}`);
  return payload.assignments || [];
}

export async function listAssignmentTargets() {
  const payload = await request("/.netlify/functions/book-content?action=assignment-targets");
  if (!Array.isArray(payload.targets)) throw invalidResponse();
  return payload.targets;
}

export async function listTeacherHomeworks(teacherId) {
  const query = new URLSearchParams({ action: "teacher-homeworks" });
  if (teacherId) query.set("teacherId", teacherId);
  const payload = await request(`/.netlify/functions/book-content?${query}`);
  return payload.homeworks || [];
}

export async function listStudentHomeworks(studentId) {
  const query = new URLSearchParams({ action: "student-homeworks" });
  if (studentId) query.set("studentId", studentId);
  const payload = await request(`/.netlify/functions/book-content?${query}`);
  return payload.homeworks || [];
}

export async function getHomework(homeworkId) {
  const query = new URLSearchParams({ action: "homework", homeworkId });
  const payload = await request(`/.netlify/functions/book-content?${query}`);
  return payload.homework;
}

export async function createHomework(payload) {
  const response = await request("/.netlify/functions/book-content?action=create-homework", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response.homework;
}

export async function updateHomework(payload) {
  const response = await request("/.netlify/functions/book-content?action=update-homework", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response.homework;
}

export async function createAssignment(payload) {
  const response = await request("/.netlify/functions/book-content?action=create-assignment", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response.assignments || (response.assignment ? [response.assignment] : []);
}

export async function deleteAssignment(assignmentId) {
  return request("/.netlify/functions/book-content?action=delete-assignment", {
    method: "POST",
    body: JSON.stringify({ assignmentId }),
  });
}

export async function closeAssignment(assignmentId) {
  const response = await request("/.netlify/functions/book-content?action=close-assignment", {
    method: "POST",
    body: JSON.stringify({ assignmentId }),
  });
  return response.assignment;
}

export async function getAssignmentResults(assignmentId) {
  const query = new URLSearchParams({ action: "assignment-results", assignmentId });
  return request(`/.netlify/functions/book-content?${query}`);
}

export async function getTeacherGradeAnalytics(filters = {}, { signal } = {}) {
  const query = new URLSearchParams({ action: "teacher-grade-analytics" });
  for (const key of ["classId", "assignmentId", "packageId", "componentId", "status", "window"]) {
    if (filters[key]) query.set(key, filters[key]);
  }
  return request(`/.netlify/functions/book-content?${query}`, { signal });
}

export function assignmentResultsToCsv({ assignment = {}, rows = [] } = {}) {
  const headers = ["Student Name", "Email", "Class", "Assignment", "Status", "Score", "Correct Count", "Total Count", "Submitted At", "Due At"];
  const escapeCell = (value) => {
    const text = value === null || value === undefined ? "" : String(value);
    const spreadsheetSafe = /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
    return /[",\r\n]/.test(spreadsheetSafe) ? `"${spreadsheetSafe.replace(/"/g, '""')}"` : spreadsheetSafe;
  };
  const csvRows = rows.map((row) => [
    row.studentName,
    row.email,
    row.className,
    row.assignment || assignment.title,
    row.status,
    row.score ?? "",
    row.correctCount ?? "",
    row.totalCount ?? "",
    row.submittedAt || "",
    row.dueAt || assignment.dueAt || "",
  ]);
  return [headers, ...csvRows].map((row) => row.map(escapeCell).join(",")).join("\n");
}

export function downloadAssignmentResultsCsv(results) {
  const csv = assignmentResultsToCsv(results);
  const assignment = results?.assignment || {};
  const slug = String(assignment.title || "assignment-results")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "assignment-results";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slug}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function exportAssignmentResultsCsv(assignmentId) {
  const results = await getAssignmentResults(assignmentId);
  downloadAssignmentResultsCsv(results);
  return results;
}

export async function listStudentAssignments(studentId) {
  const query = new URLSearchParams({ action: "assignments" });
  if (studentId) query.set("studentId", studentId);
  const payload = await request(`/.netlify/functions/book-content?${query}`);
  return payload.assignments || [];
}

export async function submitStudentAssignment(payload) {
  const response = await request("/.netlify/functions/book-content?action=submit", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response.submission;
}

export async function listStudentGrades(studentId) {
  const query = new URLSearchParams({ action: "grades" });
  if (studentId) query.set("studentId", studentId);
  const payload = await request(`/.netlify/functions/book-content?${query}`);
  return payload.grades || [];
}

export async function listClassStudents(classId) {
  const query = new URLSearchParams({ action: "class-students", classId });
  const payload = await request(`/.netlify/functions/book-content?${query}`);
  return payload.students || [];
}

export async function listTeacherStudents(teacherId) {
  const query = new URLSearchParams({ action: "teacher-students" });
  if (teacherId) query.set("teacherId", teacherId);
  const payload = await request(`/.netlify/functions/book-content?${query}`);
  return payload.students || [];
}

export async function reviewSubmission(payload) {
  const response = await request("/.netlify/functions/book-content?action=review-submission", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response.submission;
}
