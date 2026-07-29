import { badRequest, requestsHiddenPhaseOneComponent, teacherSolutionHeaders, withTeacherSolutionHeaders, teacherSolutionResponse, uuidPattern, isValidUuid, invalidUuidResponse, jsonArray, numericOrNull, studentHiddenAnswerFields, stripStudentAnswerKeys, studentSafeActivityPayload, parseOptionalDeadline, assignmentIdempotencyKey, validateSubmittedAnswers, studentSafePackageTree, normalizeSubmittedAnswer, isSubmittedAnswerCorrect, packageIdForQuery, verifyPackageAccess, supportedBookActivityTypes, supportedBookMediaKinds, supportedHotspotActionTypes, requireText, optionalJson, getUserSchoolId, getUserAccessRow, resolveScopedUserId, getClassAccessRow, getAssignmentAccessRow, getSubmissionAccessRow, canAccessTeacherScopedRow, canAccessStudentScopedRow, verifyClassAccess, verifyAssignmentAccess, verifyStudentAccess, verifyContentEditorReferences, createTeacherClass, enforceInviteRateLimit, findClassByInviteCode, joinClass, listTeacherClasses, publicClassInviteRow, recordInviteAttempt, forbidden, requireAuth, safeServerError, unauthorized, isAdmin, isStudent, isTeacher, requireResourceRole, sameSchool, fetchActivity, fetchBookPackages, fetchPackageTree, databaseNotConfiguredResponse, getSql, isDatabaseNotConfiguredError, json, parseBody, readQuery, getBookAssetAccess, accessiblePackageIds } from "./shared.js";

export async function listUserBookAccess(sql, userId) {
  if (!userId) return [];
  const rows = await sql`
    select ba.id, ba.role_scope, ba.granted_at, bp.id as book_package_id, bp.title, bp.slug, bp.level, p.name as publisher
    from book_access ba
    join book_packages bp on bp.id = ba.book_package_id
    join publishers p on p.id = bp.publisher_id
    where ba.user_id = ${userId} and bp.status = 'active'
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

export function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return [value];
}

export function normalizeLinks(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value || "")
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function assignmentRowToUi(row = {}) {
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

export async function createAssignment(sql, body, currentUser = null) {
  const activityId = body.activityId || body.bookActivityId;
  let teacherId = isTeacher(currentUser) ? currentUser.id : body.teacherId;
  const classIds = toArray(body.classIds || body.classId);
  const studentIds = toArray(body.studentIds || body.studentId);
  const deadline = parseOptionalDeadline(body.dueAt || body.dueDate || null);
  if (deadline.error) return badRequest(deadline.error);
  const dueAt = deadline.value;
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
  if (title && title.length > 240) return badRequest("title must be at most 240 characters");
  if (teacherNotes.length > 4_000) return badRequest("teacherNotes must be at most 4000 characters");

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

  const activityRows = await sql`
    select id, title, is_assignable, content_json
    from activities
    where id = ${activityId}
    limit 1
  `;
  const activity = activityRows[0];
  if (!activity) return json(404, { error: "Activity not found" });
  if (
    activity.is_assignable === false
    || activity.content_json?.implementationMode === "unsupported-disabled"
    || activity.content_json?.implementationStatus === "disabled-editorial-only"
  ) return forbidden("This activity is not assignable");
  const packageError = await verifyPackageAccess(sql, currentUser, { activityId });
  if (packageError) return packageError;

  const inserted = [];
  for (const classId of classIds) {
    const idempotency = assignmentIdempotencyKey(body, teacherId, activityId, "class", classId, dueAt, title, teacherNotes);
    if (idempotency.error) return badRequest(idempotency.error);
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
        attached_files,
        idempotency_key
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
        ${JSON.stringify(attachedFiles)}::jsonb,
        ${idempotency.value}
      )
      on conflict (school_id, teacher_id, idempotency_key)
        where idempotency_key is not null
      do update set idempotency_key = excluded.idempotency_key
      returning *
    `;
    inserted.push(rows[0]);
  }

  for (const studentId of studentIds) {
    const idempotency = assignmentIdempotencyKey(body, teacherId, activityId, "student", studentId, dueAt, title, teacherNotes);
    if (idempotency.error) return badRequest(idempotency.error);
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
        attached_files,
        idempotency_key
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
        ${JSON.stringify(attachedFiles)}::jsonb,
        ${idempotency.value}
      )
      on conflict (school_id, teacher_id, idempotency_key)
        where idempotency_key is not null
      do update set idempotency_key = excluded.idempotency_key
      returning *
    `;
    inserted.push(rows[0]);
  }

  return json(200, { assignments: inserted.map(assignmentRowToUi), assignment: assignmentRowToUi(inserted[0]) });
}

export async function listTeacherAssignments(sql, teacherId = "", currentUser = null) {
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

export async function listAssignmentsForStudent(sql, studentId, currentUser) {
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
    completionStatus: row.submission_id
      ? row.submission_status === "awaiting_review"
        ? "Pending teacher review"
        : row.submission_status === "reviewed"
          ? "Reviewed"
          : row.submission_status === "completed"
            ? "Completed"
            : "Automatically graded"
      : row.due_at && new Date(row.due_at).getTime() <= Date.now()
        ? "Late"
        : "Assigned",
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
