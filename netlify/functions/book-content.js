import {
  createTeacherClass,
  enforceInviteRateLimit,
  findClassByInviteCode,
  joinClass,
  listTeacherClasses,
  publicClassInviteRow,
  recordInviteAttempt,
} from "./_class-utils.js";
import { forbidden, requireAuth, safeServerError, unauthorized } from "./_auth-utils.js";
import { isAdmin, isStudent, isTeacher, requireResourceRole, sameSchool } from "./_resource-access.js";
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
} from "./_book-content-utils.js";
import { getBookAssetAccess } from "./_book-asset-access.js";

function badRequest(message) {
  return json(400, { error: message });
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value) {
  return uuidPattern.test(String(value || ""));
}

function invalidUuidResponse(fieldName) {
  return badRequest(`${fieldName} must be a valid UUID`);
}

function jsonArray(value) {
  return Array.isArray(value) ? value : [];
}

function numericOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

const studentHiddenAnswerFields = new Set([
  "acceptedAnswers",
  "accepted_answers",
  "answer",
  "answerRecords",
  "correct",
  "correctAnswer",
  "correctOptionId",
  "correct_answer",
  "correct_option_id",
  "decodedPublisherValue",
  "explicitAnswerEvidence",
  "is_correct",
  "publisherAnswerValue",
]);

export function stripStudentAnswerKeys(value) {
  if (Array.isArray(value)) return value.map(stripStudentAnswerKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !studentHiddenAnswerFields.has(key))
    .map(([key, child]) => [key, stripStudentAnswerKeys(child)]));
}

function isRecoveredStudentsBookActivity(activity = {}) {
  const content = activity.contentJson || activity.content_json || {};
  return ["auto-scored", "teacher-reviewed", "unscored-practice"].includes(content.implementationMode)
    && /^ultimate-b2-sb-u(?:1|2)-/.test(String(content.publisherSourceActivityId || activity.slug || ""));
}

export function studentSafeActivityPayload(activity) {
  return isRecoveredStudentsBookActivity(activity) ? stripStudentAnswerKeys(activity) : activity;
}

function studentSafePackageTree(tree) {
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

function normalizeSubmittedAnswer(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
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

async function accessiblePackageIds(sql, currentUser) {
  if (isAdmin(currentUser)) {
    const rows = await sql`select id from book_packages where status = 'active'`;
    return rows.map((row) => String(row.id));
  }
  if (isTeacher(currentUser)) {
    const rows = await sql`
      select distinct package_id as id
      from (
        select ba.book_package_id as package_id
        from book_access ba
        where ba.user_id = ${currentUser.id}
        union
        select c.book_package_id as package_id
        from classes c
        where c.teacher_id = ${currentUser.id}
          and c.school_id = ${currentUser.school_id}
          and c.book_package_id is not null
          and coalesce(c.status, 'active') = 'active'
      ) access
    `;
    return rows.map((row) => String(row.id));
  }
  const rows = await sql`
    select distinct ba.book_package_id as id
    from book_access ba
    join app_users u on u.id=ba.user_id
    where ba.user_id=${currentUser.id} and u.school_id=${currentUser.school_id} and ba.role_scope='student'
  `;
  return rows.map((row) => String(row.id));
}

async function packageIdForQuery(sql, query = {}) {
  if (query.packageId) {
    if (!isValidUuid(query.packageId)) return null;
    const rows = await sql`select id from book_packages where id = ${query.packageId} limit 1`;
    return rows[0]?.id || null;
  }
  if (query.packageSlug || query.slug) {
    const rows = await sql`select id from book_packages where slug = ${query.packageSlug || query.slug} limit 1`;
    if (rows[0]) return rows[0].id;
  }
  if (query.componentId) {
    if (!isValidUuid(query.componentId)) return null;
    const rows = await sql`select book_package_id as id from book_components where id = ${query.componentId} limit 1`;
    return rows[0]?.id || null;
  }
  if (query.componentSlug) {
    const rows = await sql`
      select bp.id
      from book_components bc join book_packages bp on bp.id = bc.book_package_id
      where bc.slug = ${query.componentSlug}
        and (${query.packageSlug || null}::text is null or bp.slug = ${query.packageSlug || null})
      limit 1
    `;
    return rows[0]?.id || null;
  }
  if (query.activityId || query.activitySlug) {
    const rows = query.activityId
      ? await sql`
          select bp.id
          from activities a join lessons l on l.id = a.lesson_id join units u on u.id = l.unit_id
          join book_components bc on bc.id = u.book_component_id join book_packages bp on bp.id = bc.book_package_id
          where a.id = ${query.activityId} limit 1
        `
      : await sql`
          select bp.id
          from activities a join lessons l on l.id = a.lesson_id join units u on u.id = l.unit_id
          join book_components bc on bc.id = u.book_component_id join book_packages bp on bp.id = bc.book_package_id
          where a.slug = ${query.activitySlug} limit 1
        `;
    return rows[0]?.id || null;
  }
  return null;
}

async function verifyPackageAccess(sql, currentUser, query) {
  const packageId = await packageIdForQuery(sql, query);
  if (!packageId) return json(404, { error: "Book package not found" });
  const allowed = await accessiblePackageIds(sql, currentUser);
  return allowed.includes(String(packageId)) ? null : forbidden();
}

const supportedBookActivityTypes = new Set([
  "multiple_choice",
  "open_answer",
  "typed_gap_fill",
  "media_video",
  "media_audio",
  "text_panel",
  "external_link",
  "existing_activity_link",
]);

const supportedBookMediaKinds = new Set(["video", "audio", "image", "document", "other"]);

const supportedHotspotActionTypes = new Set([
  "none",
  "activity",
  "media_video",
  "media_audio",
  "text_panel",
  "external_url",
  "existing_activity",
]);

function requireText(value, fieldName) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${fieldName} is required`);
  return text;
}

function optionalJson(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

async function getUserSchoolId(sql, userId) {
  if (!userId || !isValidUuid(userId)) return null;
  const rows = await sql`select school_id from app_users where id = ${userId} limit 1`;
  return rows[0]?.school_id || null;
}

async function getUserAccessRow(sql, userId) {
  if (!userId || !isValidUuid(userId)) return null;
  const rows = await sql`
    select id, school_id, role, status
    from app_users
    where id = ${userId}
    limit 1
  `;
  return rows[0] || null;
}

async function resolveScopedUserId(sql, currentUser, requestedUserId = "") {
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

async function getClassAccessRow(sql, classId) {
  if (!classId || !isValidUuid(classId)) return null;
  const rows = await sql`
    select c.id, c.teacher_id, c.school_id
    from classes c
    where c.id = ${classId}
    limit 1
  `;
  return rows[0] || null;
}

async function getAssignmentAccessRow(sql, assignmentId) {
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

async function getSubmissionAccessRow(sql, submissionId) {
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

async function verifyClassAccess(sql, currentUser, classId) {
  if (!classId) return badRequest("classId is required");
  if (!isValidUuid(classId)) return invalidUuidResponse("classId");
  const classRow = await getClassAccessRow(sql, classId);
  if (!classRow) return json(404, { error: "Class not found" });
  return canAccessTeacherScopedRow(currentUser, classRow) ? null : forbidden();
}

async function verifyAssignmentAccess(sql, currentUser, assignmentId) {
  if (!assignmentId) return badRequest("assignmentId is required");
  if (!isValidUuid(assignmentId)) return invalidUuidResponse("assignmentId");
  const assignmentRow = await getAssignmentAccessRow(sql, assignmentId);
  if (!assignmentRow) return json(404, { error: "Assignment not found" });
  return canAccessTeacherScopedRow(currentUser, assignmentRow) ? null : forbidden();
}

async function verifyStudentAccess(sql, currentUser, studentId) {
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

async function verifyContentEditorReferences(sql, currentUser, body = {}) {
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

async function listUserBookAccess(sql, userId) {
  if (!userId) return [];
  const rows = await sql`
    select ba.id, ba.role_scope, ba.granted_at, bp.id as book_package_id, bp.title, bp.slug, bp.level, p.name as publisher
    from book_access ba
    join book_packages bp on bp.id = ba.book_package_id
    join publishers p on p.id = bp.publisher_id
    where ba.user_id = ${userId}
    order by ba.granted_at desc
  `;
  return rows.map((row) => ({
    id: row.id,
    roleScope: row.role_scope,
    grantedAt: row.granted_at,
    bookPackage: {
      id: row.book_package_id,
      title: row.title,
      slug: row.slug,
      level: row.level,
      publisher: row.publisher,
    },
  }));
}

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return [value];
}

function normalizeLinks(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value || "")
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function assignmentRowToUi(row = {}) {
  const total = Number(row.total_students || row.total || 0);
  const submitted = Number(row.submitted_count || row.submitted || 0);
  const averageScoreValue = numericOrNull(row.average_score);
  const averageScore = averageScoreValue === null ? null : Math.round(averageScoreValue);

  return {
    id: row.id,
    activityId: row.activity_id,
    teacherId: row.teacher_id,
    classId: row.class_id,
    studentId: row.student_id,
    title: row.assignment_title || row.title || row.activity_title || "Untitled assignment",
    activityTitle: row.activity_title,
    activitySlug: row.activity_slug,
    activityType: row.activity_type,
    assignedAt: row.assigned_at,
    dueAt: row.due_at,
    dueDate: row.due_at,
    status: row.status || "assigned",
    teacherNotes: row.teacher_notes || "",
    worksheetLinks: jsonArray(row.worksheet_links),
    attachedFiles: jsonArray(row.attached_files),
    className: row.class_name || (row.student_id ? "Individual" : "Class assignment"),
    teacherName: row.teacher_name || "",
    lessonTitle: row.lesson_title || "",
    unitTitle: row.unit_title || "",
    component: row.component_title || row.component || "",
    componentTitle: row.component_title || row.component || "",
    packageTitle: row.package_title || "",
    total,
    totalStudents: total,
    submitted,
    submittedCount: submitted,
    missing: Math.max(total - submitted, 0),
    missingCount: Math.max(total - submitted, 0),
    averageScore,
    latestSubmittedAt: row.latest_submitted_at || null,
    completionPercent: total ? Math.round((submitted / total) * 100) : 0,
  };
}

async function createAssignment(sql, body, currentUser = null) {
  const activityId = body.activityId || body.bookActivityId;
  let teacherId = isTeacher(currentUser) ? currentUser.id : body.teacherId;
  const classIds = toArray(body.classIds || body.classId);
  const studentIds = toArray(body.studentIds || body.studentId);
  const dueAt = body.dueAt || body.dueDate || null;
  const status = body.status || "assigned";
  const teacherNotes = String(body.teacherNotes || "").trim();
  const worksheetLinks = normalizeLinks(body.worksheetLinks || body.worksheetLink || body.worksheetUrls);
  const attachedFiles = Array.isArray(body.attachedFiles) ? body.attachedFiles : [];
  const title = String(body.title || "").trim() || null;

  if (!activityId) return badRequest("activityId is required");
  if (!isValidUuid(activityId)) return invalidUuidResponse("activityId");
  if (isTeacher(currentUser) && body.teacherId && String(body.teacherId) !== String(currentUser.id)) return forbidden();
  if (isAdmin(currentUser)) {
    if (!teacherId) return badRequest("teacherId is required for admin assignment creation");
    if (!isValidUuid(teacherId)) return invalidUuidResponse("teacherId");
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
  if (!teacherId) return badRequest("teacherId is required");
  if (!isValidUuid(teacherId)) return invalidUuidResponse("teacherId");
  if (!classIds.length && !studentIds.length) return badRequest("classId or studentId is required");
  const invalidClassId = classIds.find((classId) => !isValidUuid(classId));
  if (invalidClassId) return invalidUuidResponse("classId");
  const invalidStudentId = studentIds.find((studentId) => !isValidUuid(studentId));
  if (invalidStudentId) return invalidUuidResponse("studentId");
  if (!["assigned", "closed"].includes(status)) return badRequest("status must be assigned or closed");

  for (const classId of classIds) {
    const accessError = await verifyClassAccess(sql, currentUser, classId);
    if (accessError) return accessError;
  }
  if (studentIds.length && !isAdmin(currentUser)) return forbidden("Only admins can create direct student assignments in this MVP");
  for (const studentId of studentIds) {
    if (isAdmin(currentUser)) {
      const accessError = await verifyStudentAccess(sql, currentUser, studentId);
      if (accessError) return accessError;
    }
  }

  const activityRows = await sql`select id, title from activities where id = ${activityId} limit 1`;
  const activity = activityRows[0];
  if (!activity) return json(404, { error: "Activity not found" });
  const packageError = await verifyPackageAccess(sql, currentUser, { activityId });
  if (packageError) return packageError;

  const inserted = [];
  for (const classId of classIds) {
    const rows = await sql`
      insert into activity_assignments (
        school_id,
        activity_id,
        teacher_id,
        class_id,
        student_id,
        due_at,
        status,
        title,
        teacher_notes,
        worksheet_links,
        attached_files
      )
      values (
        ${currentUser.school_id},
        ${activityId},
        ${teacherId},
        ${classId},
        null,
        ${dueAt},
        ${status},
        ${title || activity.title},
        ${teacherNotes},
        ${JSON.stringify(worksheetLinks)}::jsonb,
        ${JSON.stringify(attachedFiles)}::jsonb
      )
      returning *
    `;
    inserted.push(rows[0]);
  }

  for (const studentId of studentIds) {
    const rows = await sql`
      insert into activity_assignments (
        school_id,
        activity_id,
        teacher_id,
        class_id,
        student_id,
        due_at,
        status,
        title,
        teacher_notes,
        worksheet_links,
        attached_files
      )
      values (
        ${currentUser.school_id},
        ${activityId},
        ${teacherId},
        null,
        ${studentId},
        ${dueAt},
        ${status},
        ${title || activity.title},
        ${teacherNotes},
        ${JSON.stringify(worksheetLinks)}::jsonb,
        ${JSON.stringify(attachedFiles)}::jsonb
      )
      returning *
    `;
    inserted.push(rows[0]);
  }

  return json(200, { assignments: inserted.map(assignmentRowToUi), assignment: assignmentRowToUi(inserted[0]) });
}

async function listTeacherAssignments(sql, teacherId = "", currentUser = null) {
  const rows = await sql`
    select aa.id, aa.activity_id, aa.teacher_id, aa.class_id, aa.student_id, aa.assigned_at, aa.due_at, aa.status,
           aa.title as assignment_title, aa.teacher_notes, aa.worksheet_links, aa.attached_files,
           a.title as activity_title, a.slug as activity_slug, a.activity_type,
           l.title as lesson_title, u.title as unit_title, bc.title as component_title, bp.title as package_title,
           c.name as class_name, teacher.full_name as teacher_name,
           case
             when aa.class_id is not null then (
               select count(*)::int
               from class_students cs
               where cs.class_id = aa.class_id and coalesce(cs.status, 'active') = 'active'
             )
             when aa.student_id is not null then 1
             else 0
           end as total_students,
           count(distinct s.student_id)::int as submitted_count,
           avg(s.score_percent) as average_score,
           max(s.submitted_at) as latest_submitted_at
    from activity_assignments aa
    join activities a on a.id = aa.activity_id
    left join lessons l on l.id = a.lesson_id
    left join units u on u.id = l.unit_id
    left join book_components bc on bc.id = u.book_component_id
    left join book_packages bp on bp.id = bc.book_package_id
    left join classes c on c.id = aa.class_id
    left join app_users teacher on teacher.id = aa.teacher_id
    left join activity_submissions s on s.activity_assignment_id = aa.id
    where (${teacherId || null}::uuid is null or aa.teacher_id = ${teacherId || null})
      and aa.school_id = ${currentUser.school_id}
    group by aa.id, a.id, l.title, u.title, bc.title, bp.title, c.name, teacher.full_name
    order by aa.assigned_at desc
  `;

  return rows.map(assignmentRowToUi);
}

async function listAssignmentsForStudent(sql, studentId, currentUser) {
  if (!studentId) return [];
  const rows = await sql`
    select aa.id, aa.assigned_at, aa.due_at, aa.status,
           aa.title as assignment_title, aa.teacher_notes, aa.worksheet_links, aa.attached_files,
           a.id as activity_id, a.title as activity_title, a.slug as activity_slug, a.activity_type,
           a.content_json, a.timer_seconds, a.estimated_minutes,
           l.title as lesson_title, u.title as unit_title, bc.title as component_title, bp.title as package_title,
           c.name as class_name, teacher.full_name as teacher_name,
           latest.id as submission_id, latest.score_percent, latest.correct_count, latest.total_count, latest.status as submission_status, latest.submitted_at
    from activity_assignments aa
    join activities a on a.id = aa.activity_id
    left join lessons l on l.id = a.lesson_id
    left join units u on u.id = l.unit_id
    left join book_components bc on bc.id = u.book_component_id
    left join book_packages bp on bp.id = bc.book_package_id
    left join classes c on c.id = aa.class_id
    left join app_users teacher on teacher.id = aa.teacher_id
    left join lateral (
      select s.*
      from activity_submissions s
      where s.activity_assignment_id = aa.id and s.student_id = ${studentId}
      order by s.submitted_at desc
      limit 1
    ) latest on true
    where aa.school_id = ${currentUser.school_id}
      and (aa.student_id = ${studentId}
       or aa.class_id in (select class_id from class_students where student_id = ${studentId} and coalesce(status, 'active') = 'active'))
    order by aa.assigned_at desc
  `;

  const activityIds = [...new Set(rows.map((row) => String(row.activity_id)))];
  const hydratedActivities = new Map();
  for (const activityId of activityIds) {
    const activity = await fetchActivity(sql, { activityId });
    if (activity) hydratedActivities.set(activityId, isStudent(currentUser) ? studentSafeActivityPayload(activity) : activity);
  }

  return rows.map((row) => ({
    id: row.id,
    assignmentId: row.id,
    assignedAt: row.assigned_at,
    dueAt: row.due_at,
    status: row.status,
    title: row.assignment_title || row.activity_title,
    teacherNotes: row.teacher_notes || "",
    worksheetLinks: jsonArray(row.worksheet_links),
    attachedFiles: jsonArray(row.attached_files),
    className: row.class_name || "Individual",
    teacherName: row.teacher_name || "",
    completionStatus: row.submission_id ? "Submitted" : "Not started",
    submittedAt: row.submitted_at || null,
    scorePercent: numericOrNull(row.score_percent),
    correctCount: row.correct_count,
    totalCount: row.total_count,
    activity: hydratedActivities.get(String(row.activity_id)) || {
      id: row.activity_id,
      title: row.activity_title,
      slug: row.activity_slug,
      activityType: row.activity_type,
      timerSeconds: row.timer_seconds,
      estimatedMinutes: row.estimated_minutes,
      contentJson: row.content_json || {},
      content_json: row.content_json || {},
      demoActivityKey: row.content_json?.demoActivityKey || row.activity_slug,
      questions: [],
    },
    lessonTitle: row.lesson_title,
    unitTitle: row.unit_title,
    componentTitle: row.component_title,
    packageTitle: row.package_title,
  }));
}

async function submitActivity(sql, body, currentUser = null) {
  if (!body.activityId) return badRequest("activityId is required");
  if (!body.assignmentId) return badRequest("assignmentId is required");
  if (!isValidUuid(body.activityId)) return invalidUuidResponse("activityId");
  if (body.assignmentId && !isValidUuid(body.assignmentId)) return invalidUuidResponse("assignmentId");
  if (!isStudent(currentUser)) return forbidden("Only student accounts can submit assignments");
  const studentId = currentUser.id;
  if (body.studentId && String(body.studentId) !== String(studentId)) return forbidden("Students can only submit their own work");

  if (body.assignmentId) {
    const assignmentRows = await sql`
      select aa.id, aa.activity_id, aa.status, aa.student_id, aa.class_id, aa.school_id
      from activity_assignments aa
      where aa.id = ${body.assignmentId}
      limit 1
    `;
    const assignment = assignmentRows[0];
    if (!assignment) return json(404, { error: "Assignment not found" });
    if (!sameSchool(currentUser, assignment.school_id)) return forbidden();
    if (assignment.status === "closed") return forbidden("This assignment is closed");
    if (String(assignment.activity_id) !== String(body.activityId)) return badRequest("assignmentId does not match activityId");
    if (assignment.student_id && String(assignment.student_id) !== String(studentId)) return forbidden("This assignment is not assigned to this student");
    if (assignment.class_id) {
      const enrollmentRows = await sql`
        select id
        from class_students
        where class_id = ${assignment.class_id}
          and student_id = ${studentId}
          and coalesce(status, 'active') = 'active'
        limit 1
      `;
      if (!enrollmentRows.length) return forbidden("This assignment is not assigned to this student");
    }
  }

  const activity = await fetchActivity(sql, { activityId: body.activityId });
  if (!activity) return json(404, { error: "Activity not found" });

  const answers = body.answers || body.result?.answers || {};
  const implementationMode = activity.contentJson?.implementationMode || activity.content_json?.implementationMode || "auto-scored";
  const requiresTeacherReview = implementationMode === "teacher-reviewed";
  const unscoredPractice = implementationMode === "unscored-practice";
  const rows = activity.questions.map((question) => {
    const answer = answers[question.id] ?? answers[question.questionNumber] ?? "";
    const correctText = question.answer || "";
    const isCorrect = requiresTeacherReview || unscoredPractice ? null : isSubmittedAnswerCorrect(question, answer);
    return { question, answer, correctText, isCorrect };
  });
  const correctCount = requiresTeacherReview || unscoredPractice ? null : rows.filter((row) => row.isCorrect).length;
  const totalCount = requiresTeacherReview || unscoredPractice ? null : rows.length;
  const scorePercent = !requiresTeacherReview && !unscoredPractice && totalCount ? Math.round((correctCount / totalCount) * 100) : null;
  const submissionStatus = requiresTeacherReview ? "awaiting_review" : unscoredPractice ? "completed" : "submitted";

  const submissions = await sql`
    insert into activity_submissions (
      activity_assignment_id,
      school_id,
      activity_id,
      student_id,
      answers,
      score,
      score_percent,
      correct_count,
      total_count,
      status,
      submitted_at
    )
    values (
      ${body.assignmentId || null},
      ${currentUser.school_id},
      ${body.activityId},
      ${studentId},
      ${JSON.stringify(answers)}::jsonb,
      ${scorePercent},
      ${scorePercent},
      ${correctCount},
      ${totalCount},
      ${submissionStatus},
      now()
    )
    returning *
  `;
  const submission = submissions[0];

  for (const row of rows) {
    await sql`
      insert into student_answers (submission_id, question_id, answer_text, is_correct, feedback_text)
      values (${submission.id}, ${row.question.id}, ${String(row.answer)}, ${row.isCorrect}, ${requiresTeacherReview ? "Awaiting teacher review" : unscoredPractice ? "Saved" : row.isCorrect ? "Correct" : "Incorrect"})
      on conflict (submission_id, question_id) do update
      set answer_text = excluded.answer_text,
          is_correct = excluded.is_correct,
          feedback_text = excluded.feedback_text
    `;
  }

  return json(200, {
    submission: {
      id: submission.id,
      status: submission.status,
      scorePercent,
      correctCount,
      totalCount,
    },
  });
}

async function getStudentGrades(sql, studentId, currentUser) {
  if (!studentId) return [];
  const rows = await sql`
    select s.id, s.submitted_at, s.score_percent, s.correct_count, s.total_count, s.status, s.answers,
           aa.id as assignment_id, aa.title as assignment_title, aa.teacher_notes, s.teacher_feedback,
           a.title as activity_title, a.slug as activity_slug, bc.title as component_title, bp.title as package_title,
           c.name as class_name
    from activity_submissions s
    join activities a on a.id = s.activity_id
    left join activity_assignments aa on aa.id = s.activity_assignment_id
    left join classes c on c.id = aa.class_id
    left join lessons l on l.id = a.lesson_id
    left join units u on u.id = l.unit_id
    left join book_components bc on bc.id = u.book_component_id
    left join book_packages bp on bp.id = bc.book_package_id
    where s.student_id = ${studentId} and s.school_id = ${currentUser.school_id}
    order by s.submitted_at desc
  `;

  return rows.map((row) => ({
    id: row.id,
    assignmentId: row.assignment_id,
    submittedAt: row.submitted_at,
    scorePercent: numericOrNull(row.score_percent),
    correctCount: row.correct_count,
    totalCount: row.total_count,
    status: row.status,
    title: row.assignment_title || row.activity_title,
    activityTitle: row.activity_title,
    activitySlug: row.activity_slug,
    componentTitle: row.component_title,
    packageTitle: row.package_title,
    className: row.class_name || "",
    teacherFeedback: row.teacher_feedback || "",
    teacherNotes: row.teacher_notes || "",
    answers: row.answers || {},
  }));
}

async function getAssignmentResults(sql, assignmentId) {
  if (!assignmentId) return badRequest("assignmentId is required");
  const assignmentRows = await sql`
    select aa.id, aa.activity_id, aa.teacher_id, aa.class_id, aa.student_id, aa.assigned_at, aa.due_at, aa.status,
           aa.title as assignment_title, aa.teacher_notes, aa.worksheet_links, aa.attached_files,
           a.title as activity_title, a.slug as activity_slug, a.activity_type,
           bc.title as component_title, bp.title as package_title, c.name as class_name
    from activity_assignments aa
    join activities a on a.id = aa.activity_id
    left join lessons l on l.id = a.lesson_id
    left join units u on u.id = l.unit_id
    left join book_components bc on bc.id = u.book_component_id
    left join book_packages bp on bp.id = bc.book_package_id
    left join classes c on c.id = aa.class_id
    where aa.id = ${assignmentId}
    limit 1
  `;
  const assignment = assignmentRows[0];
  if (!assignment) return json(404, { error: "Assignment not found" });

  const rows = await sql`
    with target_students as (
      select distinct u.id, u.full_name, u.email, c.name as class_name
      from activity_assignments aa
      join app_users u on (
        (aa.student_id is not null and u.id = aa.student_id)
        or
        (aa.class_id is not null and u.id in (
          select cs.student_id from class_students cs where cs.class_id = aa.class_id and coalesce(cs.status, 'active') = 'active'
        ))
      )
      left join classes c on c.id = aa.class_id
      where aa.id = ${assignmentId}
    ),
    latest_submissions as (
      select distinct on (s.student_id) s.*
      from activity_submissions s
      where s.activity_assignment_id = ${assignmentId}
      order by s.student_id, s.submitted_at desc
    )
    select ts.id as student_id, ts.full_name, ts.email, ts.class_name,
           s.id as submission_id, s.score_percent, s.correct_count, s.total_count, s.status as submission_status,
           s.submitted_at, s.answers, s.teacher_feedback, s.reviewed_at, s.reviewed_by,
           coalesce((
             select jsonb_agg(jsonb_build_object(
               'questionId', q.id,
               'prompt', q.prompt,
               'answer', sa.answer_text,
               'isCorrect', sa.is_correct,
               'feedback', sa.feedback_text
             ) order by q.sort_order, q.question_number)
             from student_answers sa
             join questions q on q.id = sa.question_id
             where sa.submission_id = s.id
           ), '[]'::jsonb) as answer_details
    from target_students ts
    left join latest_submissions s on s.student_id = ts.id
    order by ts.full_name asc
  `;

  const resultRows = rows.map((row) => ({
    studentId: row.student_id,
    studentName: row.full_name || "Unnamed student",
    email: row.email || "",
    className: row.class_name || assignment.class_name || "Individual",
    assignment: assignment.assignment_title || assignment.activity_title,
    status: row.submission_id
      ? row.submission_status === "awaiting_review"
        ? "Awaiting teacher review"
        : row.submission_status === "reviewed"
          ? "Reviewed"
          : "Submitted"
      : "Missing",
    submissionStatus: row.submission_status || null,
    score: numericOrNull(row.score_percent),
    scorePercent: numericOrNull(row.score_percent),
    correctCount: row.correct_count,
    totalCount: row.total_count,
    submittedAt: row.submitted_at || null,
    answers: row.answers || {},
    answerDetails: jsonArray(row.answer_details),
    teacherFeedback: row.teacher_feedback || "",
    reviewedAt: row.reviewed_at || null,
    reviewedBy: row.reviewed_by || null,
    dueAt: assignment.due_at,
    submissionId: row.submission_id,
  }));
  const submitted = resultRows.filter((row) => row.submissionId).length;
  const scoredRows = resultRows.filter((row) => row.scorePercent !== null);
  const averageScore = scoredRows.length
    ? Math.round(scoredRows.reduce((sum, row) => sum + Number(row.scorePercent || 0), 0) / scoredRows.length)
    : null;

  return json(200, {
    assignment: assignmentRowToUi({
      ...assignment,
      total_students: resultRows.length,
      submitted_count: submitted,
      average_score: averageScore,
      latest_submitted_at: resultRows.map((row) => row.submittedAt).filter(Boolean).sort().slice(-1)[0] || null,
    }),
    summary: {
      totalStudents: resultRows.length,
      submittedCount: submitted,
      missingCount: Math.max(resultRows.length - submitted, 0),
      averageScore,
      latestSubmittedAt: resultRows.map((row) => row.submittedAt).filter(Boolean).sort().slice(-1)[0] || null,
    },
    rows: resultRows,
  });
}

function studentProgressRow(row = {}) {
  const assignedCount = Number(row.assigned_count || 0);
  const submittedCount = Number(row.submitted_count || 0);
  const averageScore = numericOrNull(row.average_score);
  return {
    studentId: row.student_id,
    id: row.student_id,
    name: row.full_name || "Unnamed student",
    email: row.email || "",
    className: row.class_name || "",
    level: row.level || "",
    joinedAt: row.joined_at || null,
    status: row.status || "active",
    assignedCount,
    submittedCount,
    completionPercent: assignedCount ? Math.round((submittedCount / assignedCount) * 100) : 0,
    averageScore: averageScore === null ? 0 : Math.round(averageScore),
    latestWork: row.latest_work || "",
    latestSubmittedAt: row.latest_submitted_at || null,
  };
}

async function listClassStudents(sql, classId) {
  if (!classId) return badRequest("classId is required");
  if (!isValidUuid(classId)) return invalidUuidResponse("classId");

  const rows = await sql`
    with latest_submissions as (
      select distinct on (s.student_id, s.activity_assignment_id)
             s.student_id, s.activity_assignment_id, s.score_percent, s.submitted_at
      from activity_submissions s
      order by s.student_id, s.activity_assignment_id, s.submitted_at desc
    ),
    latest_work as (
      select distinct on (s.student_id)
             s.student_id, a.title as latest_work, s.submitted_at as latest_submitted_at
      from activity_submissions s
      join activity_assignments aa on aa.id = s.activity_assignment_id
      join activities a on a.id = aa.activity_id
      where aa.class_id = ${classId}
      order by s.student_id, s.submitted_at desc
    )
    select u.id as student_id, u.full_name, u.email, c.name as class_name, c.level,
           cs.joined_at, cs.status,
           count(distinct aa.id)::int as assigned_count,
           count(distinct ls.activity_assignment_id)::int as submitted_count,
           avg(ls.score_percent) as average_score,
           lw.latest_work, lw.latest_submitted_at
    from class_students cs
    join app_users u on u.id = cs.student_id
    join classes c on c.id = cs.class_id
    left join activity_assignments aa on aa.class_id = cs.class_id
    left join latest_submissions ls on ls.activity_assignment_id = aa.id and ls.student_id = u.id
    left join latest_work lw on lw.student_id = u.id
    where cs.class_id = ${classId}
      and coalesce(cs.status, 'active') = 'active'
    group by u.id, u.full_name, u.email, c.name, c.level, cs.joined_at, cs.status, lw.latest_work, lw.latest_submitted_at
    order by u.full_name asc
  `;

  return json(200, { students: rows.map(studentProgressRow) });
}

async function listTeacherStudents(sql, teacherId, currentUser = null) {
  if (teacherId && !isValidUuid(teacherId)) return invalidUuidResponse("teacherId");

  const rows = await sql`
    with latest_submissions as (
      select distinct on (s.student_id, s.activity_assignment_id)
             s.student_id, s.activity_assignment_id, s.score_percent, s.submitted_at
      from activity_submissions s
      order by s.student_id, s.activity_assignment_id, s.submitted_at desc
    ),
    latest_work as (
      select distinct on (s.student_id, aa.class_id)
             s.student_id, aa.class_id, a.title as latest_work, s.submitted_at as latest_submitted_at
      from activity_submissions s
      join activity_assignments aa on aa.id = s.activity_assignment_id
      join activities a on a.id = aa.activity_id
      order by s.student_id, aa.class_id, s.submitted_at desc
    )
    select u.id as student_id, u.full_name, u.email, c.name as class_name, c.level,
           cs.joined_at, cs.status,
           count(distinct aa.id)::int as assigned_count,
           count(distinct ls.activity_assignment_id)::int as submitted_count,
           avg(ls.score_percent) as average_score,
           lw.latest_work, lw.latest_submitted_at
    from classes c
    join class_students cs on cs.class_id = c.id and coalesce(cs.status, 'active') = 'active'
    join app_users u on u.id = cs.student_id
    left join activity_assignments aa on aa.class_id = c.id
    left join latest_submissions ls on ls.activity_assignment_id = aa.id and ls.student_id = u.id
    left join latest_work lw on lw.student_id = u.id and lw.class_id = c.id
    where (${teacherId || null}::uuid is null or c.teacher_id = ${teacherId || null})
      and (${isAdmin(currentUser) ? currentUser.school_id : null}::uuid is null or c.school_id = ${isAdmin(currentUser) ? currentUser.school_id : null})
    group by u.id, u.full_name, u.email, c.name, c.level, cs.joined_at, cs.status, lw.latest_work, lw.latest_submitted_at
    order by c.name asc, u.full_name asc
  `;

  return json(200, { students: rows.map(studentProgressRow) });
}

async function reviewSubmission(sql, body, currentUser = null) {
  const submissionId = body.submissionId;
  const teacherFeedback = String(body.teacherFeedback || "").trim();
  if (!submissionId) return badRequest("submissionId is required");
  if (!isValidUuid(submissionId)) return invalidUuidResponse("submissionId");
  if (!currentUser?.id) return unauthorized();

  const rows = await sql`
    update activity_submissions
    set teacher_feedback = ${teacherFeedback},
        status = case when status = 'awaiting_review' then 'reviewed' else status end,
        reviewed_at = now(),
        reviewed_by = ${currentUser.id}
    where id = ${submissionId}
      and school_id = ${currentUser.school_id}
      and exists (
        select 1 from activity_assignments aa
        where aa.id = activity_submissions.activity_assignment_id
          and aa.school_id = ${currentUser.school_id}
          and (${isAdmin(currentUser)} or aa.teacher_id = ${currentUser.id})
      )
    returning id, teacher_feedback, reviewed_at, reviewed_by
  `;

  if (!rows.length) return json(404, { error: "Submission not found" });
  const submission = rows[0];
  return json(200, {
    submission: {
      id: submission.id,
      teacherFeedback: submission.teacher_feedback || "",
      reviewedAt: submission.reviewed_at,
      reviewedBy: submission.reviewed_by,
      status: "reviewed",
    },
  });
}

async function getSchoolMetrics(sql, currentUser) {
  if (!isAdmin(currentUser)) return forbidden("Admin access required");
  const schoolId = currentUser.school_id;
  if (!schoolId) return json(200, {
    metrics: {
      activeUsers: 0,
      teacherCount: 0,
      studentCount: 0,
      activeClasses: 0,
      activeBookPackages: 0,
      activeAssignments: 0,
      submittedWorkCount: 0,
    },
  });

  const rows = await sql`
    select
      (select count(*)::int from app_users where school_id = ${schoolId} and coalesce(status, 'active') = 'active') as active_users,
      (select count(*)::int from app_users where school_id = ${schoolId} and role = 'teacher') as teacher_count,
      (select count(*)::int from app_users where school_id = ${schoolId} and role = 'student') as student_count,
      (select count(*)::int from classes where school_id = ${schoolId} and coalesce(status, 'active') = 'active') as active_classes,
      (select count(distinct book_package_id)::int from book_access ba join app_users u on u.id = ba.user_id where u.school_id = ${schoolId}) as active_book_packages,
      (
        select count(*)::int
        from activity_assignments aa
        left join classes c on c.id = aa.class_id
        left join app_users teacher on teacher.id = aa.teacher_id
        where coalesce(c.school_id, teacher.school_id) = ${schoolId}
          and coalesce(aa.status, 'assigned') = 'assigned'
      ) as active_assignments,
      (
        select count(*)::int
        from activity_submissions s
        join app_users u on u.id = s.student_id
        where u.school_id = ${schoolId}
      ) as submitted_work_count
  `;
  const row = rows[0] || {};
  return json(200, {
    metrics: {
      activeUsers: Number(row.active_users || 0),
      teacherCount: Number(row.teacher_count || 0),
      studentCount: Number(row.student_count || 0),
      activeClasses: Number(row.active_classes || 0),
      activeBookPackages: Number(row.active_book_packages || 0),
      activeAssignments: Number(row.active_assignments || 0),
      submittedWorkCount: Number(row.submitted_work_count || 0),
    },
  });
}

function normalizePercent(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(numeric, 0), 100);
}

function normalizeHotspotPayload(hotspot = {}) {
  const left = normalizePercent(hotspot.left ?? hotspot.left_percent);
  const top = normalizePercent(hotspot.top ?? hotspot.top_percent);
  const width = normalizePercent(hotspot.width ?? hotspot.width_percent);
  const height = normalizePercent(hotspot.height ?? hotspot.height_percent);
  const safeWidth = Math.min(Math.max(width, 0.0001), 100 - left);
  const safeHeight = Math.min(Math.max(height, 0.0001), 100 - top);

  if (safeWidth <= 0 || safeHeight <= 0 || left + safeWidth > 100 || top + safeHeight > 100) {
    throw new Error("Invalid hotspot coordinates");
  }

  return {
    label: String(hotspot.label || "Clickable area").trim() || "Clickable area",
    left,
    top,
    width: safeWidth,
    height: safeHeight,
    actionType: String(hotspot.actionType || hotspot.action_type || "none").trim() || "none",
    actionTargetId: hotspot.actionTargetId || hotspot.action_target_id || null,
    actionPayload: hotspot.actionPayload || hotspot.action_payload || {},
  };
}

function pageHotspotRowToUi(row) {
  return {
    id: row.id,
    package_slug: row.package_slug,
    component_slug: row.component_slug,
    page_id: row.page_id,
    page_number: row.page_number,
    label: row.label,
    left_percent: Number(row.left_percent),
    top_percent: Number(row.top_percent),
    width_percent: Number(row.width_percent),
    height_percent: Number(row.height_percent),
    action_type: row.action_type,
    action_target_id: row.action_target_id,
    action_payload: row.action_payload || {},
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function listPageHotspots(sql, query, currentUser) {
  if (!query.packageSlug) return badRequest("packageSlug is required");
  if (!query.componentSlug) return badRequest("componentSlug is required");
  if (!query.pageId) return badRequest("pageId is required");

  const rows = await sql`
    select *
    from book_page_hotspots
    where package_slug = ${query.packageSlug}
      and component_slug = ${query.componentSlug}
      and page_id = ${query.pageId}
      and school_id = ${currentUser.school_id}
    order by created_at asc, id asc
  `;

  return json(200, { hotspots: rows.map(pageHotspotRowToUi) });
}

async function savePageHotspots(sql, body, currentUser) {
  const packageSlug = String(body.packageSlug || body.package_slug || "").trim();
  const componentSlug = String(body.componentSlug || body.component_slug || "").trim();
  const pageId = String(body.pageId || body.page_id || "").trim();
  const pageNumber = body.pageNumber ?? body.page_number ?? null;
  const createdBy = body.createdBy || body.created_by || null;
  const hotspots = Array.isArray(body.hotspots) ? body.hotspots : [];

  if (!packageSlug) return badRequest("packageSlug is required");
  if (!componentSlug) return badRequest("componentSlug is required");
  if (!pageId) return badRequest("pageId is required");

  const normalizedHotspots = hotspots.map(normalizeHotspotPayload);
  const invalidHotspot = normalizedHotspots.find((hotspot) => !supportedHotspotActionTypes.has(hotspot.actionType));
  if (invalidHotspot) return badRequest(`Unsupported hotspot action type: ${invalidHotspot.actionType}`);

  if (isTeacher(currentUser)) {
    const foreignRows = await sql`
      select id from book_page_hotspots
      where package_slug = ${packageSlug} and component_slug = ${componentSlug} and page_id = ${pageId}
        and school_id = ${currentUser.school_id} and created_by is distinct from ${currentUser.id}
      limit 1
    `;
    if (foreignRows.length) return forbidden("Teachers can only modify their own page hotspots");
  }

  await sql`
    delete from book_page_hotspots
    where package_slug = ${packageSlug}
      and component_slug = ${componentSlug}
      and page_id = ${pageId}
      and school_id = ${currentUser.school_id}
      and (${isAdmin(currentUser)} or created_by = ${currentUser.id})
  `;

  const inserted = [];
  for (const hotspot of normalizedHotspots) {
    const rows = await sql`
      insert into book_page_hotspots (
        package_slug,
        component_slug,
        page_id,
        page_number,
        label,
        left_percent,
        top_percent,
        width_percent,
        height_percent,
        action_type,
        action_target_id,
        action_payload,
        created_by,
        school_id
      )
      values (
        ${packageSlug},
        ${componentSlug},
        ${pageId},
        ${pageNumber ? Number(pageNumber) : null},
        ${hotspot.label},
        ${hotspot.left},
        ${hotspot.top},
        ${hotspot.width},
        ${hotspot.height},
        ${hotspot.actionType},
        ${hotspot.actionTargetId},
        ${JSON.stringify(hotspot.actionPayload)}::jsonb,
        ${createdBy},
        ${currentUser.school_id}
      )
      returning *
    `;
    inserted.push(pageHotspotRowToUi(rows[0]));
  }

  return json(200, { hotspots: inserted });
}

function bookActivityRowToUi(row) {
  return {
    id: row.id,
    package_slug: row.package_slug,
    component_slug: row.component_slug,
    page_id: row.page_id,
    page_number: row.page_number,
    title: row.title,
    type: row.type,
    instructions: row.instructions || "",
    content: row.content || {},
    correct_answers: row.correct_answers || {},
    feedback: row.feedback || {},
    media_id: row.media_id,
    status: row.status,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeBookActivityPayload(body = {}, existing = {}) {
  const packageSlug = requireText(body.packageSlug ?? body.package_slug ?? existing.package_slug, "packageSlug");
  const componentSlug = requireText(body.componentSlug ?? body.component_slug ?? existing.component_slug, "componentSlug");
  const title = requireText(body.title ?? existing.title, "title");
  const type = String(body.type ?? existing.type ?? "").trim();
  const status = String(body.status ?? existing.status ?? "published").trim() || "published";

  if (!supportedBookActivityTypes.has(type)) throw new Error(`Unsupported activity type: ${type}`);
  if (!["draft", "published"].includes(status)) throw new Error(`Unsupported activity status: ${status}`);

  return {
    packageSlug,
    componentSlug,
    pageId: body.pageId ?? body.page_id ?? existing.page_id ?? null,
    pageNumber: body.pageNumber ?? body.page_number ?? existing.page_number ?? null,
    title,
    type,
    instructions: body.instructions ?? existing.instructions ?? "",
    content: optionalJson(body.content ?? existing.content),
    correctAnswers: optionalJson(body.correctAnswers ?? body.correct_answers ?? existing.correct_answers),
    feedback: optionalJson(body.feedback ?? existing.feedback),
    mediaId: body.mediaId ?? body.media_id ?? existing.media_id ?? null,
    status,
    createdBy: body.createdBy ?? body.created_by ?? existing.created_by ?? null,
  };
}

async function listBookActivities(sql, query, currentUser) {
  if (!query.packageSlug) return badRequest("packageSlug is required");
  if (!query.componentSlug) return badRequest("componentSlug is required");

  const rows = await sql`
    select *
    from book_activities
    where package_slug = ${query.packageSlug}
      and component_slug = ${query.componentSlug}
      and (${query.pageId || null}::text is null or page_id = ${query.pageId || null})
      and (${query.status || null}::text is null or status = ${query.status || null})
      and school_id = ${currentUser.school_id}
    order by coalesce(page_number, 999999) asc, created_at asc, title asc
  `;

  return json(200, { activities: rows.map(bookActivityRowToUi) });
}

async function getBookActivity(sql, query, currentUser) {
  if (!query.activityId) return badRequest("activityId is required");
  if (!isValidUuid(query.activityId)) return invalidUuidResponse("activityId");
  const rows = await sql`select * from book_activities where id = ${query.activityId} and school_id = ${currentUser.school_id} limit 1`;
  const activity = rows[0];
  if (!activity) return json(404, { error: "Book activity not found" });
  const accessError = await verifyPackageAccess(sql, currentUser, { packageSlug: activity.package_slug });
  return accessError || json(200, { activity: bookActivityRowToUi(activity) });
}

async function createBookActivity(sql, body, currentUser) {
  let activity;
  try {
    activity = normalizeBookActivityPayload(body);
  } catch (error) {
    return badRequest(error.message);
  }

  const rows = await sql`
    insert into book_activities (
      package_slug,
      component_slug,
      page_id,
      page_number,
      title,
      type,
      instructions,
      content,
      correct_answers,
      feedback,
      media_id,
      status,
      created_by,
      school_id
    )
    values (
      ${activity.packageSlug},
      ${activity.componentSlug},
      ${activity.pageId},
      ${activity.pageNumber ? Number(activity.pageNumber) : null},
      ${activity.title},
      ${activity.type},
      ${activity.instructions},
      ${JSON.stringify(activity.content)}::jsonb,
      ${JSON.stringify(activity.correctAnswers)}::jsonb,
      ${JSON.stringify(activity.feedback)}::jsonb,
      ${activity.mediaId},
      ${activity.status},
      ${activity.createdBy},
      ${currentUser.school_id}
    )
    returning *
  `;

  return json(200, { activity: bookActivityRowToUi(rows[0]) });
}

async function updateBookActivity(sql, body, currentUser) {
  const id = body.id || body.activityId || body.activity_id;
  if (!id) return badRequest("activityId is required");

  if (!isValidUuid(id)) return invalidUuidResponse("activityId");
  const existingRows = await sql`
    select * from book_activities
    where id = ${id} and school_id = ${currentUser.school_id}
      and (${isAdmin(currentUser)} or created_by = ${currentUser.id})
    limit 1
  `;
  const existing = existingRows[0];
  if (!existing) return json(404, { error: "Book activity not found" });

  let activity;
  try {
    activity = normalizeBookActivityPayload(body, existing);
  } catch (error) {
    return badRequest(error.message);
  }

  const accessError = await verifyPackageAccess(sql, currentUser, { packageSlug: activity.packageSlug });
  if (accessError) return accessError;

  const rows = await sql`
    update book_activities
    set package_slug = ${activity.packageSlug},
        component_slug = ${activity.componentSlug},
        page_id = ${activity.pageId},
        page_number = ${activity.pageNumber ? Number(activity.pageNumber) : null},
        title = ${activity.title},
        type = ${activity.type},
        instructions = ${activity.instructions},
        content = ${JSON.stringify(activity.content)}::jsonb,
        correct_answers = ${JSON.stringify(activity.correctAnswers)}::jsonb,
        feedback = ${JSON.stringify(activity.feedback)}::jsonb,
        media_id = ${activity.mediaId},
        status = ${activity.status},
        created_by = ${activity.createdBy}
    where id = ${id} and school_id = ${currentUser.school_id}
      and (${isAdmin(currentUser)} or created_by = ${currentUser.id})
    returning *
  `;

  return json(200, { activity: bookActivityRowToUi(rows[0]) });
}

async function deleteBookActivity(sql, body, currentUser) {
  const id = body.id || body.activityId || body.activity_id;
  if (!id) return badRequest("activityId is required");
  if (!isValidUuid(id)) return invalidUuidResponse("activityId");
  const existingRows = await sql`
    select id, package_slug
    from book_activities
    where id = ${id} and school_id = ${currentUser.school_id}
      and (${isAdmin(currentUser)} or created_by = ${currentUser.id})
    limit 1
  `;
  const existing = existingRows[0];
  if (!existing) return json(404, { error: "Book activity not found" });

  const accessError = await verifyPackageAccess(sql, currentUser, { packageSlug: existing.package_slug });
  if (accessError) return accessError;

  const rows = await sql`
    delete from book_activities
    where id = ${id} and school_id = ${currentUser.school_id}
      and (${isAdmin(currentUser)} or created_by = ${currentUser.id})
    returning id
  `;
  if (!rows.length) return json(404, { error: "Book activity not found" });
  return json(200, { deleted: true });
}

function bookMediaAssetRowToUi(row) {
  return {
    id: row.id,
    package_slug: row.package_slug,
    component_slug: row.component_slug,
    page_id: row.page_id,
    file_name: row.file_name,
    original_file_name: row.original_file_name,
    mime_type: row.mime_type,
    file_size_bytes: row.file_size_bytes,
    public_url: row.public_url,
    storage_path: row.storage_path,
    kind: row.kind,
    created_by: row.created_by,
    created_at: row.created_at,
  };
}

async function listBookMediaAssets(sql, query, currentUser) {
  if (!query.packageSlug) return badRequest("packageSlug is required");
  if (!query.componentSlug) return badRequest("componentSlug is required");

  const rows = await sql`
    select *
    from book_media_assets
    where package_slug = ${query.packageSlug}
      and component_slug = ${query.componentSlug}
      and (${query.pageId || null}::text is null or page_id = ${query.pageId || null})
      and (${query.kind || null}::text is null or kind = ${query.kind || null})
      and school_id = ${currentUser.school_id}
    order by created_at desc, file_name asc
  `;

  return json(200, { mediaAssets: rows.map(bookMediaAssetRowToUi) });
}

async function createBookMediaAsset(sql, body, currentUser) {
  const packageSlug = String(body.packageSlug || body.package_slug || "").trim();
  const componentSlug = String(body.componentSlug || body.component_slug || "").trim();
  const publicUrl = String(body.publicUrl || body.public_url || "").trim();
  const kind = String(body.kind || "other").trim();

  if (!packageSlug) return badRequest("packageSlug is required");
  if (!componentSlug) return badRequest("componentSlug is required");
  if (!publicUrl) return badRequest("publicUrl is required");
  if (!supportedBookMediaKinds.has(kind)) return badRequest(`Unsupported media kind: ${kind}`);

  const fileName = String(body.fileName || body.file_name || publicUrl.split("/").pop() || "media").trim();
  const rows = await sql`
    insert into book_media_assets (
      package_slug,
      component_slug,
      page_id,
      file_name,
      original_file_name,
      mime_type,
      file_size_bytes,
      public_url,
      storage_path,
      kind,
      created_by,
      school_id
    )
    values (
      ${packageSlug},
      ${componentSlug},
      ${body.pageId || body.page_id || null},
      ${fileName},
      ${body.originalFileName || body.original_file_name || fileName},
      ${body.mimeType || body.mime_type || "application/octet-stream"},
      ${body.fileSizeBytes || body.file_size_bytes || null},
      ${publicUrl},
      ${body.storagePath || body.storage_path || null},
      ${kind},
      ${body.createdBy || body.created_by || null},
      ${currentUser.school_id}
    )
    returning *
  `;

  return json(200, { mediaAsset: bookMediaAssetRowToUi(rows[0]) });
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { "Content-Type": "application/json" }, body: "" };

  try {
    const sql = getSql();
    const query = readQuery(event);

    if (event.httpMethod === "GET" && query.action === "class-by-slug") {
      return json(404, { error: "Class not found" });
    }

    if (event.httpMethod === "GET" && query.action === "class-by-invite") {
      const rateLimitError = await enforceInviteRateLimit(sql, event);
      if (rateLimitError) return rateLimitError;
      const classItem = await findClassByInviteCode(sql, query.inviteCode);
      await recordInviteAttempt(sql, event, Boolean(classItem));
      const publicClassItem = publicClassInviteRow(classItem);
      return publicClassItem ? json(200, { classItem: publicClassItem, class: publicClassItem }) : json(404, { error: "Class not found" });
    }

    const auth = await requireAuth(event, sql);
    if (auth.error) return auth.error;
    const currentUser = auth.currentUser;

    if (event.httpMethod === "GET") {
      if (query.action === "asset-access") return getBookAssetAccess(sql, currentUser, query);
      if (query.action === "list") {
        const allowedIds = await accessiblePackageIds(sql, currentUser);
        const packages = await fetchBookPackages(sql);
        return json(200, { bookPackages: packages.filter((item) => allowedIds.includes(String(item.id))) });
      }
      if (query.action === "activity") {
        const accessError = await verifyPackageAccess(sql, currentUser, { activityId: query.activityId, activitySlug: query.activitySlug || query.slug });
        if (accessError) return accessError;
        const activity = await fetchActivity(sql, query);
        return activity ? json(200, { activity: isStudent(currentUser) ? studentSafeActivityPayload(activity) : activity }) : json(404, { error: "Activity not found" });
      }
      if (query.action === "component") {
        const accessError = await verifyPackageAccess(sql, currentUser, { packageId: query.packageId, packageSlug: query.packageSlug });
        if (accessError) return accessError;
        const tree = await fetchPackageTree(sql, query);
        const visibleTree = isStudent(currentUser) ? studentSafePackageTree(tree) : tree;
        const component = visibleTree?.components.find((item) => item.id === query.componentId || item.slug === query.slug);
        return component ? json(200, { component }) : json(404, { error: "Component not found" });
      }
      if (query.action === "access") {
        const userScope = await resolveScopedUserId(sql, currentUser, query.userId);
        return userScope.error || json(200, { bookAccess: await listUserBookAccess(sql, userScope.userId) });
      }
      if (query.action === "school-metrics") {
        const roleError = requireResourceRole(currentUser, ["admin"]);
        return roleError || getSchoolMetrics(sql, currentUser);
      }
      if (query.action === "teacher-assignments") {
        const roleError = requireResourceRole(currentUser, ["teacher", "admin"]);
        if (roleError) return roleError;
        if (query.teacherId && !isValidUuid(query.teacherId)) return invalidUuidResponse("teacherId");
        if (isTeacher(currentUser) && query.teacherId && String(query.teacherId) !== String(currentUser.id)) return forbidden();
        const teacherId = isTeacher(currentUser) ? currentUser.id : query.teacherId || "";
        return json(200, { assignments: await listTeacherAssignments(sql, teacherId, currentUser) });
      }
      if (query.action === "assignments") {
        const roleError = requireResourceRole(currentUser, ["student", "admin"]);
        if (roleError) return roleError;
        const studentId = isStudent(currentUser) ? currentUser.id : query.studentId;
        const accessError = await verifyStudentAccess(sql, currentUser, studentId);
        return accessError || json(200, { assignments: await listAssignmentsForStudent(sql, studentId, currentUser) });
      }
      if (query.action === "grades") {
        const roleError = requireResourceRole(currentUser, ["student", "admin"]);
        if (roleError) return roleError;
        const studentId = isStudent(currentUser) ? currentUser.id : query.studentId;
        const accessError = await verifyStudentAccess(sql, currentUser, studentId);
        return accessError || json(200, { grades: await getStudentGrades(sql, studentId, currentUser) });
      }
      if (query.action === "assignment-results") {
        const roleError = requireResourceRole(currentUser, ["teacher", "admin"]);
        if (roleError) return roleError;
        if (!query.assignmentId) return badRequest("assignmentId is required");
        if (!isValidUuid(query.assignmentId)) return invalidUuidResponse("assignmentId");
        const accessError = await verifyAssignmentAccess(sql, currentUser, query.assignmentId);
        return accessError || getAssignmentResults(sql, query.assignmentId);
      }
      if (query.action === "class-students") {
        const roleError = requireResourceRole(currentUser, ["teacher", "admin"]);
        if (roleError) return roleError;
        const accessError = await verifyClassAccess(sql, currentUser, query.classId);
        return accessError || listClassStudents(sql, query.classId);
      }
      if (query.action === "teacher-students") {
        const roleError = requireResourceRole(currentUser, ["teacher", "admin"]);
        if (roleError) return roleError;
        if (query.teacherId && !isValidUuid(query.teacherId)) return invalidUuidResponse("teacherId");
        if (isTeacher(currentUser) && query.teacherId && String(query.teacherId) !== String(currentUser.id)) return forbidden();
        const teacherId = isTeacher(currentUser) ? currentUser.id : query.teacherId || "";
        return listTeacherStudents(sql, teacherId, currentUser);
      }
      if (query.action === "page-hotspots") {
        const accessError = await verifyPackageAccess(sql, currentUser, { packageSlug: query.packageSlug });
        return accessError || listPageHotspots(sql, query, currentUser);
      }
      if (query.action === "book-activities") {
        const accessError = await verifyPackageAccess(sql, currentUser, { packageSlug: query.packageSlug });
        return accessError || listBookActivities(sql, query, currentUser);
      }
      if (query.action === "book-activity") return getBookActivity(sql, query, currentUser);
      if (query.action === "book-media-assets") {
        const accessError = await verifyPackageAccess(sql, currentUser, { packageSlug: query.packageSlug });
        return accessError || listBookMediaAssets(sql, query, currentUser);
      }
      if (query.action === "classes") {
        const roleError = requireResourceRole(currentUser, ["teacher", "admin"]);
        if (roleError) return roleError;
        if (query.teacherId && !isValidUuid(query.teacherId)) return invalidUuidResponse("teacherId");
        if (isTeacher(currentUser) && query.teacherId && String(query.teacherId) !== String(currentUser.id)) return forbidden();
        return json(200, { classes: await listTeacherClasses(sql, isTeacher(currentUser) ? currentUser.id : query.teacherId, isAdmin(currentUser) ? currentUser.school_id : "") });
      }
      const accessError = await verifyPackageAccess(sql, currentUser, { packageId: query.packageId, packageSlug: query.slug || query.packageSlug || "ultimate-b2" });
      if (accessError) return accessError;
      const tree = await fetchPackageTree(sql, query);
      return tree ? json(200, { bookPackage: isStudent(currentUser) ? studentSafePackageTree(tree) : tree }) : json(404, { error: "Book package not found. Run database/006_book_content_platform.sql." });
    }

    if (event.httpMethod === "POST") {
      const body = parseBody(event);
      if (query.action === "activate") return json(410, { error: "Use the signed-in book licensing redemption endpoint" });
      if (query.action === "assign") {
        const roleError = requireResourceRole(currentUser, ["teacher", "admin"]);
        if (roleError) return roleError;
        return createAssignment(sql, body, currentUser);
      }
      if (query.action === "create-assignment") {
        const roleError = requireResourceRole(currentUser, ["teacher", "admin"]);
        if (roleError) return roleError;
        return createAssignment(sql, body, currentUser);
      }
      if (query.action === "submit") {
        const roleError = requireResourceRole(currentUser, ["student"]);
        if (roleError) return roleError;
        return submitActivity(sql, body, currentUser);
      }
      if (query.action === "review-submission") {
        const roleError = requireResourceRole(currentUser, ["teacher", "admin"]);
        if (roleError) return roleError;
        if (!body.submissionId) return badRequest("submissionId is required");
        if (!isValidUuid(body.submissionId)) return invalidUuidResponse("submissionId");
        const submission = await getSubmissionAccessRow(sql, body.submissionId);
        if (!submission) return json(404, { error: "Submission not found" });
        if (!canAccessTeacherScopedRow(currentUser, submission)) return forbidden();
        return reviewSubmission(sql, body, currentUser);
      }
      if (query.action === "create-class") {
        const roleError = requireResourceRole(currentUser, ["teacher", "admin"]);
        if (roleError) return roleError;
        if (isTeacher(currentUser) && body.teacherId && String(body.teacherId) !== String(currentUser.id)) return forbidden();
        return createTeacherClass(sql, {
          ...body,
          teacherId: isTeacher(currentUser) ? currentUser.id : body.teacherId,
          schoolId: currentUser.school_id || body.schoolId || null,
        });
      }
      if (query.action === "join-class") {
        const roleError = requireResourceRole(currentUser, ["student"]);
        if (roleError) return roleError;
        if (body.studentId && String(body.studentId) !== String(currentUser.id)) return forbidden("Students can only join classes for their own account");
        if (body.classId || body.slug) return badRequest("A valid class invite code is required");
        const rateLimitError = await enforceInviteRateLimit(sql, event);
        if (rateLimitError) return rateLimitError;
        const response = await joinClass(sql, { inviteCode: body.inviteCode, studentId: currentUser.id });
        await recordInviteAttempt(sql, event, response.statusCode === 200);
        return response;
      }
      if (query.action === "save-page-hotspots") {
        const roleError = requireResourceRole(currentUser, ["teacher", "admin"]);
        const packageError = roleError || await verifyPackageAccess(sql, currentUser, { packageSlug: body.packageSlug || body.package_slug });
        const referenceError = packageError || await verifyContentEditorReferences(sql, currentUser, body);
        return referenceError || savePageHotspots(sql, { ...body, createdBy: currentUser.id, created_by: currentUser.id }, currentUser);
      }
      if (query.action === "create-book-activity") {
        const roleError = requireResourceRole(currentUser, ["teacher", "admin"]);
        const packageError = roleError || await verifyPackageAccess(sql, currentUser, { packageSlug: body.packageSlug || body.package_slug });
        const referenceError = packageError || await verifyContentEditorReferences(sql, currentUser, body);
        return referenceError || createBookActivity(sql, { ...body, createdBy: currentUser.id, created_by: currentUser.id }, currentUser);
      }
      if (query.action === "update-book-activity") {
        const roleError = requireResourceRole(currentUser, ["teacher", "admin"]);
        const referenceError = roleError || await verifyContentEditorReferences(sql, currentUser, body);
        return referenceError || updateBookActivity(sql, { ...body, createdBy: currentUser.id, created_by: currentUser.id }, currentUser);
      }
      if (query.action === "delete-book-activity") {
        const roleError = requireResourceRole(currentUser, ["teacher", "admin"]);
        const referenceError = roleError || await verifyContentEditorReferences(sql, currentUser, body);
        return referenceError || deleteBookActivity(sql, body, currentUser);
      }
      if (query.action === "create-book-media-asset") {
        const roleError = requireResourceRole(currentUser, ["teacher", "admin"]);
        const packageError = roleError || await verifyPackageAccess(sql, currentUser, { packageSlug: body.packageSlug || body.package_slug });
        const referenceError = packageError || await verifyContentEditorReferences(sql, currentUser, body);
        return referenceError || createBookMediaAsset(sql, { ...body, createdBy: currentUser.id, created_by: currentUser.id }, currentUser);
      }
      return badRequest("Unsupported POST action");
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    if (isDatabaseNotConfiguredError(error)) return databaseNotConfiguredResponse();
    if (error?.code === "42703") {
      return json(500, {
        error: "Assignment database migration is missing",
        migration: "database/010_assignment_live_flow.sql",
      });
    }
    return safeServerError(error, "Book content API failed");
  }
}
