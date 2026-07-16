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
    const serverMessage = payload.detail || payload.details || payload.error || responseText || "Assignments API request failed";
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

export async function listTeacherAssignments(teacherId) {
  const query = new URLSearchParams({ action: "teacher-assignments" });
  if (teacherId) query.set("teacherId", teacherId);
  const payload = await request(`/.netlify/functions/book-content?${query}`);
  return payload.assignments || [];
}

export async function createAssignment(payload) {
  const response = await request("/.netlify/functions/book-content?action=create-assignment", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response.assignments || (response.assignment ? [response.assignment] : []);
}

export async function getAssignmentResults(assignmentId) {
  const query = new URLSearchParams({ action: "assignment-results", assignmentId });
  return request(`/.netlify/functions/book-content?${query}`);
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
