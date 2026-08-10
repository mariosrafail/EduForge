import {
  createTeacherClass,
  enforceInviteRateLimit,
  findClassByInviteCode,
  joinClass,
  listTeacherClasses,
  publicClassInviteRow,
  recordInviteAttempt,
} from "../_class-utils.js";
import { forbidden, requireAuth, safeServerError, unauthorized } from "../_auth-utils.js";
import { isAdmin, isStudent, isTeacher, requireResourceRole, sameSchool } from "../_resource-access.js";
import {
  fetchActivity,
  fetchBookPackages,
  fetchPackageTree,
  databaseNotConfiguredResponse,
  getSql,
  isDatabaseNotConfiguredError,
  json,
  parseBody,
  readQuery,
} from "../_book-content-utils.js";
import { getBookAssetAccess } from "../_book-asset-access.js";
import { accessiblePackageIds } from "../_book-package-access.js";
import {
  buildUltimateB2TeacherSolutionPayload,
  isUltimateB2PresentationActivityEnabled,
} from "../_ultimate-b2-teacher-solutions.js";
import { randomUUID } from "node:crypto";
import { isPhaseOneComponentVisible } from "../../../src/config/bookCatalogVisibility.js";

export function badRequest(message) {
  return json(400, { error: message });
}

export function requestsHiddenPhaseOneComponent(query = {}) {
  const componentSlug = query.componentSlug || (query.action === "component" ? query.slug : "");
  return Boolean(
    query.packageSlug
    && componentSlug
    && !isPhaseOneComponentVisible(query.packageSlug, componentSlug)
  );
}

export const teacherSolutionHeaders = {
  "Cache-Control": "no-store, private",
  "Pragma": "no-cache",
  "Expires": "0",
  "Vary": "Cookie",
  "X-Content-Type-Options": "nosniff",
};

export function withTeacherSolutionHeaders(response) {
  return {
    ...response,
    headers: { ...(response?.headers || {}), ...teacherSolutionHeaders },
  };
}

export function teacherSolutionResponse(statusCode, body) {
  return json(statusCode, body, teacherSolutionHeaders);
}

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(value) {
  return uuidPattern.test(String(value || ""));
}

export function invalidUuidResponse(fieldName) {
  return badRequest(`${fieldName} must be a valid UUID`);
}

export async function withAssignmentLifecycleTransaction(sql, assignmentId, callback) {
  if (typeof sql.assignmentLifecycleTransaction === "function") {
    return sql.assignmentLifecycleTransaction(assignmentId, callback);
  }
  if (typeof sql.transaction === "function") {
    const results = await sql.transaction((transactionSql) => [
      transactionSql`select pg_advisory_xact_lock(hashtextextended(${"activity-assignment:" + assignmentId}, 0))`,
      callback(transactionSql),
    ]);
    return results[1];
  }
  throw new Error("Assignment lifecycle mutations require transaction-capable PostgreSQL");
}

export function jsonArray(value) {
  return Array.isArray(value) ? value : [];
}

export function numericOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export const studentHiddenAnswerFields = new Set([
  "acceptedAnswers",
  "accepted_answers",
  "answer",
  "answerRecords",
  "correct",
  "correctAnswer",
  "correctOptionId",
  "correctAnswers",
  "correct_answers",
  "correct_answer",
  "correct_option_id",
  "decodedPublisherValue",
  "explicitAnswerEvidence",
  "is_correct",
  "publisherAnswerValue",
  "sourcePath",
  "sourceProvenance",
  "sourceRelativePath",
  "localDevelopmentPath",
  "decodedSourceSelector",
]);

export function stripStudentAnswerKeys(value) {
  if (Array.isArray(value)) return value.map(stripStudentAnswerKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !studentHiddenAnswerFields.has(key))
    .map(([key, child]) => [key, stripStudentAnswerKeys(child)]));
}

export function studentSafeActivityPayload(activity) {
  return stripStudentAnswerKeys(activity);
}

export function parseOptionalDeadline(value) {
  if (value === null || value === undefined || value === "") return { value: null };
  if (typeof value !== "string") return { error: "dueAt must be a valid ISO date-time" };
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return { error: "dueAt must be a valid ISO date-time" };
  return { value: new Date(timestamp).toISOString() };
}

export function assignmentIdempotencyKey(body, teacherId, activityId, targetType, targetId, dueAt, title, teacherNotes) {
  const supplied = String(body.idempotencyKey || body.requestId || "").trim();
  if (supplied && !/^[A-Za-z0-9._:-]{8,128}$/.test(supplied)) {
    return { error: "idempotencyKey must be 8-128 safe characters" };
  }
  // Idempotency identifies one create request, not the assignment content. Two
  // intentional assignments may legitimately have byte-identical metadata.
  const requestIdentity = supplied || randomUUID();
  return { value: `request:${requestIdentity}:${targetType}:${targetId}` };
}

export function validateSubmittedAnswers(activity = {}, rawAnswers) {
  if (!rawAnswers || typeof rawAnswers !== "object" || Array.isArray(rawAnswers)) {
    return { error: "answers must be an object" };
  }
  const questions = Array.isArray(activity.questions) ? activity.questions : [];
  const allowedKeys = new Map();
  for (const question of questions) {
    allowedKeys.set(String(question.id), question);
    allowedKeys.set(String(question.questionNumber), question);
  }
  const canonicalAnswers = {};
  for (const [key, value] of Object.entries(rawAnswers)) {
    const question = allowedKeys.get(String(key));
    if (!question) return { error: `Unexpected question id: ${key}` };
    if (!["string", "number", "boolean"].includes(typeof value)) {
      return { error: `Answer for question ${key} must be text or a scalar value` };
    }
    const answer = String(value).trim();
    if (answer.length > 10_000) return { error: `Answer for question ${key} is too long` };
    canonicalAnswers[String(question.id)] = answer;
  }
  if (questions.length) {
    const missing = questions.find((question) => !canonicalAnswers[String(question.id)]);
    if (missing) return { error: `Answer is required for question ${missing.questionNumber}` };
  }
  return { answers: canonicalAnswers };
}

export function studentSafePackageTree(tree) {
  if (!tree) return tree;
  return {
    ...tree,
    components: (tree.components || []).map((component) => ({
      ...component,
      units: (component.units || []).map((unit) => ({
        ...unit,
        lessons: (unit.lessons || []).map((lesson) => ({
          ...lesson,
          exercises: (lesson.exercises || []).map(studentSafeActivityPayload),
        })),
      })),
    })),
  };
}

export function normalizeSubmittedAnswer(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[â€™â€˜]/g, "'")
    .replace(/[â€œâ€]/g, '"')
    .replace(/,/g, "")
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ");
}

export function isSubmittedAnswerCorrect(question = {}, submittedAnswer = "") {
  const feedback = question.feedbackJson || question.feedback_json || {};
  const content = question.contentJson || question.content_json || {};
  const accepted = [
    question.answer,
    ...(Array.isArray(feedback.acceptedAnswers) ? feedback.acceptedAnswers : []),
    ...(Array.isArray(feedback.accepted_answers) ? feedback.accepted_answers : []),
    ...(Array.isArray(content.acceptedAnswers) ? content.acceptedAnswers : []),
    ...(Array.isArray(content.accepted_answers) ? content.accepted_answers : []),
  ].filter((value) => value !== null && value !== undefined && String(value).trim());
  const normalizedSubmitted = normalizeSubmittedAnswer(submittedAnswer);
  return accepted.some((value) => normalizeSubmittedAnswer(value) === normalizedSubmitted);
}

export async function packageIdForQuery(sql, query = {}) {
  if (query.packageId) {
    if (!isValidUuid(query.packageId)) return null;
    const rows = await sql`select id from book_packages where id = ${query.packageId} and status = 'active' limit 1`;
    return rows[0]?.id || null;
  }
  if (query.packageSlug || query.slug) {
    const rows = await sql`select id from book_packages where slug = ${query.packageSlug || query.slug} and status = 'active' limit 1`;
    if (rows[0]) return rows[0].id;
  }
  if (query.componentId) {
    if (!isValidUuid(query.componentId)) return null;
    const rows = await sql`
      select bp.id, bp.slug as package_slug, bc.slug as component_slug
      from book_components bc join book_packages bp on bp.id = bc.book_package_id
      where bc.id = ${query.componentId} and bp.status = 'active'
      limit 1
    `;
    return rows[0] && isPhaseOneComponentVisible(rows[0].package_slug, rows[0].component_slug) ? rows[0].id : null;
  }
  if (query.componentSlug) {
    const rows = await sql`
      select bp.id, bp.slug as package_slug, bc.slug as component_slug
      from book_components bc join book_packages bp on bp.id = bc.book_package_id
      where bc.slug = ${query.componentSlug}
        and bp.status = 'active'
        and (${query.packageSlug || null}::text is null or bp.slug = ${query.packageSlug || null})
      limit 1
    `;
    return rows[0] && isPhaseOneComponentVisible(rows[0].package_slug, rows[0].component_slug) ? rows[0].id : null;
  }
  if (query.activityId || query.activitySlug) {
    const rows = query.activityId
      ? await sql`
          select bp.id, bp.slug as package_slug, bc.slug as component_slug
          from activities a join lessons l on l.id = a.lesson_id join units u on u.id = l.unit_id
          join book_components bc on bc.id = u.book_component_id join book_packages bp on bp.id = bc.book_package_id
          where a.id = ${query.activityId} and bp.status = 'active' limit 1
        `
      : await sql`
          select bp.id, bp.slug as package_slug, bc.slug as component_slug
          from activities a join lessons l on l.id = a.lesson_id join units u on u.id = l.unit_id
          join book_components bc on bc.id = u.book_component_id join book_packages bp on bp.id = bc.book_package_id
          where a.slug = ${query.activitySlug} and bp.status = 'active' limit 1
        `;
    return rows[0] && isPhaseOneComponentVisible(rows[0].package_slug, rows[0].component_slug) ? rows[0].id : null;
  }
  return null;
}

export async function verifyPackageAccess(sql, currentUser, query) {
  const packageId = await packageIdForQuery(sql, query);
  if (!packageId) return json(404, { error: "Book package not found" });
  const allowed = await accessiblePackageIds(sql, currentUser);
  return allowed.includes(String(packageId)) ? null : forbidden();
}

export const supportedBookActivityTypes = new Set([
  "multiple_choice",
  "open_answer",
  "typed_gap_fill",
  "media_video",
  "media_audio",
  "text_panel",
  "external_link",
  "existing_activity_link",
]);

export const supportedBookMediaKinds = new Set(["video", "audio", "image", "document", "other"]);

export const supportedHotspotActionTypes = new Set([
  "none",
  "activity",
  "media_video",
  "media_audio",
  "text_panel",
  "external_url",
  "existing_activity",
]);

export function requireText(value, fieldName) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${fieldName} is required`);
  return text;
}

export function optionalJson(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

export async function getUserSchoolId(sql, userId) {
  if (!userId || !isValidUuid(userId)) return null;
  const rows = await sql`select school_id from app_users where id = ${userId} limit 1`;
  return rows[0]?.school_id || null;
}

export async function getUserAccessRow(sql, userId) {
  if (!userId || !isValidUuid(userId)) return null;
  const rows = await sql`
    select id, school_id, role, status
    from app_users
    where id = ${userId}
    limit 1
  `;
  return rows[0] || null;
}

export async function resolveScopedUserId(sql, currentUser, requestedUserId = "") {
  const roleError = requireResourceRole(currentUser, ["student", "teacher", "admin"]);
  if (roleError) return { error: roleError };
  const userId = requestedUserId || currentUser.id;
  if (!userId) return { error: badRequest("userId is required") };
  if (!isValidUuid(userId)) return { error: invalidUuidResponse("userId") };
  if (!isAdmin(currentUser) && String(userId) !== String(currentUser.id)) {
    return { error: forbidden("This account can only manage its own book access") };
  }
  if (isAdmin(currentUser)) {
    const targetUser = await getUserAccessRow(sql, userId);
    if (!targetUser) return { error: json(404, { error: "User not found" }) };
    if (!sameSchool(currentUser, targetUser.school_id)) return { error: forbidden() };
  }
  return { userId };
}

export async function getClassAccessRow(sql, classId) {
  if (!classId || !isValidUuid(classId)) return null;
  const rows = await sql`
    select c.id, c.teacher_id, c.school_id
    from classes c
    where c.id = ${classId}
    limit 1
  `;
  return rows[0] || null;
}

export async function getAssignmentAccessRow(sql, assignmentId) {
  if (!assignmentId || !isValidUuid(assignmentId)) return null;
  const rows = await sql`
    select aa.id, aa.teacher_id, aa.class_id, aa.student_id, aa.status,
           coalesce(aa.school_id, c.school_id, teacher.school_id, student.school_id) as school_id
    from activity_assignments aa
    left join classes c on c.id = aa.class_id
    left join app_users teacher on teacher.id = aa.teacher_id
    left join app_users student on student.id = aa.student_id
    where aa.id = ${assignmentId}
    limit 1
  `;
  return rows[0] || null;
}

export async function getSubmissionAccessRow(sql, submissionId) {
  if (!submissionId || !isValidUuid(submissionId)) return null;
  const rows = await sql`
    select s.id, s.student_id, s.activity_assignment_id,
           aa.teacher_id, aa.class_id,
           coalesce(c.school_id, teacher.school_id, student.school_id) as school_id
    from activity_submissions s
    left join activity_assignments aa on aa.id = s.activity_assignment_id
    left join classes c on c.id = aa.class_id
    left join app_users teacher on teacher.id = aa.teacher_id
    left join app_users student on student.id = s.student_id
    where s.id = ${submissionId}
    limit 1
  `;
  return rows[0] || null;
}

export function canAccessTeacherScopedRow(currentUser, row) {
  if (!currentUser || !row) return false;
  if (isTeacher(currentUser)) return sameSchool(currentUser, row.school_id) && String(row.teacher_id || "") === String(currentUser.id);
  if (isAdmin(currentUser)) return sameSchool(currentUser, row.school_id);
  return false;
}

export function canAccessStudentScopedRow(currentUser, row) {
  if (!currentUser || !row) return false;
  if (isStudent(currentUser)) return sameSchool(currentUser, row.school_id) && String(row.student_id || "") === String(currentUser.id);
  if (isAdmin(currentUser)) return sameSchool(currentUser, row.school_id);
  return false;
}

export async function verifyClassAccess(sql, currentUser, classId) {
  if (!classId) return badRequest("classId is required");
  if (!isValidUuid(classId)) return invalidUuidResponse("classId");
  const classRow = await getClassAccessRow(sql, classId);
  if (!classRow) return json(404, { error: "Class not found" });
  return canAccessTeacherScopedRow(currentUser, classRow) ? null : forbidden();
}

export async function verifyAssignmentAccess(sql, currentUser, assignmentId) {
  if (!assignmentId) return badRequest("assignmentId is required");
  if (!isValidUuid(assignmentId)) return invalidUuidResponse("assignmentId");
  const assignmentRow = await getAssignmentAccessRow(sql, assignmentId);
  if (!assignmentRow) return json(404, { error: "Assignment not found" });
  return canAccessTeacherScopedRow(currentUser, assignmentRow) ? null : forbidden();
}

export async function verifyStudentAccess(sql, currentUser, studentId) {
  if (!studentId) return badRequest("studentId is required");
  if (!isValidUuid(studentId)) return invalidUuidResponse("studentId");
  if (isStudent(currentUser)) return String(studentId) === String(currentUser.id) ? null : forbidden("Students can only access their own work");
  if (isAdmin(currentUser)) {
    const user = await getUserAccessRow(sql, studentId);
    if (!user || user.role !== "student") return json(404, { error: "Student not found" });
    return sameSchool(currentUser, user.school_id) ? null : forbidden();
  }
  return forbidden();
}

export async function verifyContentEditorReferences(sql, currentUser, body = {}) {
  const classId = body.classId || body.class_id || "";
  const teacherId = body.teacherId || body.teacher_id || "";
  if (classId) {
    const classError = await verifyClassAccess(sql, currentUser, classId);
    if (classError) return classError;
  }
  if (teacherId) {
    if (!isValidUuid(teacherId)) return invalidUuidResponse("teacherId");
    if (isTeacher(currentUser) && String(teacherId) !== String(currentUser.id)) return forbidden();
    if (isAdmin(currentUser)) {
      const teacherRows = await sql`
        select id, school_id, role
        from app_users
        where id = ${teacherId} and role = 'teacher'
        limit 1
      `;
      const teacher = teacherRows[0];
      if (!teacher) return json(404, { error: "Teacher not found" });
      if (!sameSchool(currentUser, teacher.school_id)) return forbidden();
    }
  }
  return null;
}

export {
  createTeacherClass,
  enforceInviteRateLimit,
  findClassByInviteCode,
  joinClass,
  listTeacherClasses,
  publicClassInviteRow,
  recordInviteAttempt,
  forbidden,
  requireAuth,
  safeServerError,
  unauthorized,
  isAdmin,
  isStudent,
  isTeacher,
  requireResourceRole,
  sameSchool,
  fetchActivity,
  fetchBookPackages,
  fetchPackageTree,
  databaseNotConfiguredResponse,
  getSql,
  isDatabaseNotConfiguredError,
  json,
  parseBody,
  readQuery,
  getBookAssetAccess,
  accessiblePackageIds,
};
