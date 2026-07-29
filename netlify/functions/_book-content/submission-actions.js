import { badRequest, requestsHiddenPhaseOneComponent, teacherSolutionHeaders, withTeacherSolutionHeaders, teacherSolutionResponse, uuidPattern, isValidUuid, invalidUuidResponse, jsonArray, numericOrNull, studentHiddenAnswerFields, stripStudentAnswerKeys, studentSafeActivityPayload, parseOptionalDeadline, assignmentIdempotencyKey, validateSubmittedAnswers, studentSafePackageTree, normalizeSubmittedAnswer, isSubmittedAnswerCorrect, packageIdForQuery, verifyPackageAccess, supportedBookActivityTypes, supportedBookMediaKinds, supportedHotspotActionTypes, requireText, optionalJson, getUserSchoolId, getUserAccessRow, resolveScopedUserId, getClassAccessRow, getAssignmentAccessRow, getSubmissionAccessRow, canAccessTeacherScopedRow, canAccessStudentScopedRow, verifyClassAccess, verifyAssignmentAccess, verifyStudentAccess, verifyContentEditorReferences, createTeacherClass, enforceInviteRateLimit, findClassByInviteCode, joinClass, listTeacherClasses, publicClassInviteRow, recordInviteAttempt, forbidden, requireAuth, safeServerError, unauthorized, isAdmin, isStudent, isTeacher, requireResourceRole, sameSchool, fetchActivity, fetchBookPackages, fetchPackageTree, databaseNotConfiguredResponse, getSql, isDatabaseNotConfiguredError, json, parseBody, readQuery, getBookAssetAccess, accessiblePackageIds } from "./shared.js";

import { assignmentRowToUi } from "./assignment-actions.js";

export async function submitActivity(sql, body, currentUser = null) {
  if (!body.activityId) return badRequest("activityId is required");
  if (!body.assignmentId) return badRequest("assignmentId is required");
  if (!isValidUuid(body.activityId)) return invalidUuidResponse("activityId");
  if (body.assignmentId && !isValidUuid(body.assignmentId)) return invalidUuidResponse("assignmentId");
  if (!isStudent(currentUser)) return forbidden("Only student accounts can submit assignments");
  const studentId = currentUser.id;
  if (body.studentId && String(body.studentId) !== String(studentId)) return forbidden("Students can only submit their own work");

  if (body.assignmentId) {
    const assignmentRows = await sql`
      select aa.id, aa.activity_id, aa.status, aa.student_id, aa.class_id, aa.school_id, aa.due_at
      from activity_assignments aa
      where aa.id = ${body.assignmentId}
      limit 1
    `;
    const assignment = assignmentRows[0];
    if (!assignment) return json(404, { error: "Assignment not found" });
    if (!sameSchool(currentUser, assignment.school_id)) return forbidden();
    if (assignment.status === "closed") return forbidden("This assignment is closed");
    if (assignment.due_at && new Date(assignment.due_at).getTime() <= Date.now()) {
      return forbidden("The assignment deadline has passed");
    }
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

  const answerValidation = validateSubmittedAnswers(activity, body.answers || body.result?.answers);
  if (answerValidation.error) return badRequest(answerValidation.error);
  const answers = answerValidation.answers;
  const implementationMode = activity.contentJson?.implementationMode || activity.content_json?.implementationMode || "auto-scored";
  const requiresTeacherReview = implementationMode === "teacher-reviewed";
  const unscoredPractice = ["unscored-practice", "reading-content"].includes(implementationMode);
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
      submitted_at,
      submission_slot
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
      now(),
      1
    )
    on conflict (activity_assignment_id, student_id, submission_slot)
      where activity_assignment_id is not null and submission_slot = 1
    do nothing
    returning *
  `;
  if (!submissions.length) return json(409, { error: "This assignment has already been submitted" });
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

export async function getStudentGrades(sql, studentId, currentUser) {
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

export async function getAssignmentResults(sql, assignmentId) {
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
