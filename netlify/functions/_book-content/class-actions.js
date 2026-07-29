import { badRequest, requestsHiddenPhaseOneComponent, teacherSolutionHeaders, withTeacherSolutionHeaders, teacherSolutionResponse, uuidPattern, isValidUuid, invalidUuidResponse, jsonArray, numericOrNull, studentHiddenAnswerFields, stripStudentAnswerKeys, studentSafeActivityPayload, parseOptionalDeadline, assignmentIdempotencyKey, validateSubmittedAnswers, studentSafePackageTree, normalizeSubmittedAnswer, isSubmittedAnswerCorrect, packageIdForQuery, verifyPackageAccess, supportedBookActivityTypes, supportedBookMediaKinds, supportedHotspotActionTypes, requireText, optionalJson, getUserSchoolId, getUserAccessRow, resolveScopedUserId, getClassAccessRow, getAssignmentAccessRow, getSubmissionAccessRow, canAccessTeacherScopedRow, canAccessStudentScopedRow, verifyClassAccess, verifyAssignmentAccess, verifyStudentAccess, verifyContentEditorReferences, createTeacherClass, enforceInviteRateLimit, findClassByInviteCode, joinClass, listTeacherClasses, publicClassInviteRow, recordInviteAttempt, forbidden, requireAuth, safeServerError, unauthorized, isAdmin, isStudent, isTeacher, requireResourceRole, sameSchool, fetchActivity, fetchBookPackages, fetchPackageTree, databaseNotConfiguredResponse, getSql, isDatabaseNotConfiguredError, json, parseBody, readQuery, getBookAssetAccess, accessiblePackageIds } from "./shared.js";

export function studentProgressRow(row = {}) {
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

export async function listClassStudents(sql, classId) {
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

export async function listTeacherStudents(sql, teacherId, currentUser = null) {
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

export async function reviewSubmission(sql, body, currentUser = null) {
  const submissionId = body.submissionId;
  const teacherFeedback = String(body.teacherFeedback || "").trim();
  const scorePercent = numericOrNull(body.scorePercent ?? body.score);
  if (!submissionId) return badRequest("submissionId is required");
  if (!isValidUuid(submissionId)) return invalidUuidResponse("submissionId");
  if (!currentUser?.id) return unauthorized();
  if (teacherFeedback.length > 4_000) return badRequest("teacherFeedback must be at most 4000 characters");
  if (scorePercent !== null && (scorePercent < 0 || scorePercent > 100)) {
    return badRequest("scorePercent must be between 0 and 100");
  }

  const existingRows = await sql`
    select status, score_percent
    from activity_submissions
    where id = ${submissionId}
      and school_id = ${currentUser.school_id}
    limit 1
  `;
  const existing = existingRows[0];
  if (!existing) return json(404, { error: "Submission not found" });
  if (existing.status === "awaiting_review" && scorePercent === null) {
    return badRequest("scorePercent is required to complete teacher review");
  }

  const rows = await sql`
    update activity_submissions
    set teacher_feedback = ${teacherFeedback},
        score = coalesce(${scorePercent}, score),
        score_percent = coalesce(${scorePercent}, score_percent),
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
    returning id, teacher_feedback, score_percent, reviewed_at, reviewed_by, status
  `;

  if (!rows.length) return json(404, { error: "Submission not found" });
  const submission = rows[0];
  return json(200, {
    submission: {
      id: submission.id,
      teacherFeedback: submission.teacher_feedback || "",
      scorePercent: numericOrNull(submission.score_percent),
      reviewedAt: submission.reviewed_at,
      reviewedBy: submission.reviewed_by,
      status: submission.status,
    },
  });
}

export async function getSchoolMetrics(sql, currentUser) {
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
      (select count(distinct ba.book_package_id)::int
       from book_access ba
       join app_users u on u.id = ba.user_id
       join book_packages bp on bp.id = ba.book_package_id
       where u.school_id = ${schoolId} and bp.status = 'active') as active_book_packages,
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
