import { badRequest, requestsHiddenPhaseOneComponent, teacherSolutionHeaders, withTeacherSolutionHeaders, teacherSolutionResponse, uuidPattern, isValidUuid, invalidUuidResponse, jsonArray, numericOrNull, studentHiddenAnswerFields, stripStudentAnswerKeys, studentSafeActivityPayload, parseOptionalDeadline, assignmentIdempotencyKey, validateSubmittedAnswers, studentSafePackageTree, normalizeSubmittedAnswer, isSubmittedAnswerCorrect, packageIdForQuery, verifyPackageAccess, supportedBookActivityTypes, supportedBookMediaKinds, supportedHotspotActionTypes, requireText, optionalJson, getUserSchoolId, getUserAccessRow, resolveScopedUserId, getClassAccessRow, getAssignmentAccessRow, getSubmissionAccessRow, canAccessTeacherScopedRow, canAccessStudentScopedRow, verifyClassAccess, verifyAssignmentAccess, verifyStudentAccess, verifyContentEditorReferences, createTeacherClass, enforceInviteRateLimit, findClassByInviteCode, joinClass, listTeacherClasses, publicClassInviteRow, recordInviteAttempt, forbidden, requireAuth, safeServerError, unauthorized, isAdmin, isStudent, isTeacher, requireResourceRole, sameSchool, fetchActivity, fetchBookPackages, fetchPackageTree, databaseNotConfiguredResponse, getSql, isDatabaseNotConfiguredError, json, parseBody, readQuery, getBookAssetAccess, accessiblePackageIds, withAssignmentLifecycleTransaction } from "./shared.js";

import { assignmentRowToUi } from "./assignment-actions.js";
import {
  NATIVE_ASSIGNMENT_TARGET_KIND,
  containsClientTeacherMaterial,
  loadPinnedNativeAssignmentTarget,
  resolveNativeAssignmentTarget,
} from "./native-assignment-runtime.js";

async function submitNativeAssignment(sql, body, currentUser, assignment) {
  if (containsClientTeacherMaterial(body)) return badRequest("Teacher/model-answer material is not accepted from clients");
  if (["score", "scorePercent", "correctCount", "totalCount"].some((key) => Object.hasOwn(body, key))) return badRequest("Client-supplied score fields are not accepted for published native assignments");
  if (body.activityId) return badRequest("activityId is not valid for a published native assignment");
  if (body.target && (
    body.target.kind !== NATIVE_ASSIGNMENT_TARGET_KIND
    || String(body.target.releaseId) !== String(assignment.native_release_id)
    || String(body.target.nativeActivityId) !== String(assignment.native_activity_id)
  )) return badRequest("Submitted target does not match the assignment target");

  const resolved = await resolveNativeAssignmentTarget(sql, currentUser, {
    kind: NATIVE_ASSIGNMENT_TARGET_KIND,
    releaseId: assignment.native_release_id,
    nativeActivityId: assignment.native_activity_id,
  }, { requireActive: false });
  if (resolved.error) return json(resolved.statusCode || 400, { error: resolved.error });
  if (!resolved.capability?.submittable || typeof resolved.capability.normalizeResponse !== "function") {
    return badRequest("This published native activity is display-only and cannot be submitted");
  }
  const normalized = resolved.capability.normalizeResponse(resolved.publicEntry.document, body.response || body.responsePayload);
  if (normalized.error) return badRequest(normalized.error);
  const evaluated = typeof resolved.capability.evaluateResponse === "function"
    ? resolved.capability.evaluateResponse(resolved.publicEntry.document, resolved.teacherEntry.document, normalized.payload)
    : { status: normalized.status, scorePercent: normalized.scorePercent, correctCount: normalized.correctCount, totalCount: normalized.totalCount };

  if (evaluated.sectionResults) normalized.payload.sectionResults = evaluated.sectionResults;

  const stateRows = await withAssignmentLifecycleTransaction(sql, body.assignmentId, (transactionSql) => transactionSql`
    with assignment_state as materialized (
      select aa.id, aa.status, aa.due_at, aa.target_kind, aa.native_release_id, aa.native_activity_id
      from activity_assignments aa
      where aa.id = ${body.assignmentId}
        and aa.school_id = ${currentUser.school_id}
      for key share of aa
    ), inserted as (
      insert into activity_submissions (
        activity_assignment_id, school_id, activity_id, student_id, answers,
        response_schema_version, response_payload, score, score_percent,
        correct_count, total_count, status, submitted_at, submission_slot
      )
      select assignment_state.id, ${currentUser.school_id}, null, ${currentUser.id}, '{}'::jsonb,
             ${normalized.schemaVersion}, ${JSON.stringify(normalized.payload)}::jsonb,
             ${evaluated.scorePercent}, ${evaluated.scorePercent}, ${evaluated.correctCount}, ${evaluated.totalCount}, ${evaluated.status}, now(), 1
      from assignment_state
      where assignment_state.status = 'assigned'
        and (assignment_state.due_at is null or assignment_state.due_at > now())
        and assignment_state.target_kind = ${NATIVE_ASSIGNMENT_TARGET_KIND}
        and assignment_state.native_release_id = ${assignment.native_release_id}
        and assignment_state.native_activity_id = ${assignment.native_activity_id}
      on conflict (activity_assignment_id, student_id, submission_slot)
        where activity_assignment_id is not null and submission_slot = 1
      do nothing
      returning *
    )
    select exists(select 1 from assignment_state) as assignment_exists,
           (select status from assignment_state) as assignment_status,
           (select due_at from assignment_state) as due_at,
           (select row_to_json(inserted) from inserted) as submission
  `);
  const locked = stateRows[0];
  if (!locked?.assignment_exists) return json(404, { error: "This assignment is no longer available." });
  if (locked.assignment_status === "closed") return json(409, { error: "This assignment has been closed and can no longer be submitted." });
  if (locked.due_at && new Date(locked.due_at).getTime() <= Date.now()) return forbidden("The assignment deadline has passed");
  if (!locked.submission) return json(409, { error: "This assignment has already been submitted" });
  return json(200, {
    submission: {
      id: locked.submission.id,
      status: locked.submission.status,
      scorePercent: evaluated.scorePercent,
      correctCount: evaluated.correctCount,
      totalCount: evaluated.totalCount,
    },
  });
}

export async function submitActivity(sql, body, currentUser = null) {
  if (!body.assignmentId) return badRequest("assignmentId is required");
  const submittedResponse = body.response || body.responsePayload;
  if (submittedResponse?.schemaVersion === "native-multi-response.v1" && Buffer.byteLength(JSON.stringify(submittedResponse), "utf8") > 100000) return badRequest("Multi-Part response payload is too large");
  if (containsClientTeacherMaterial(body)) return badRequest("Teacher/model-answer material is not accepted from clients");
  const scoreFields = ["score", "scorePercent", "correctCount", "totalCount"];
  if (scoreFields.some((key) => Object.hasOwn(body, key) || (body.result && Object.hasOwn(body.result, key)))) {
    return badRequest("Client-supplied score fields are not accepted");
  }
  if (body.activityId && !isValidUuid(body.activityId)) return invalidUuidResponse("activityId");
  if (body.assignmentId && !isValidUuid(body.assignmentId)) return invalidUuidResponse("assignmentId");
  if (!isStudent(currentUser)) return forbidden("Only student accounts can submit assignments");
  const studentId = currentUser.id;
  if (body.studentId && String(body.studentId) !== String(studentId)) return forbidden("Students can only submit their own work");

  if (body.assignmentId) {
    const assignmentRows = await sql`
      select aa.id, aa.target_kind, aa.activity_id, aa.native_release_id, aa.native_activity_id,
             aa.status, aa.student_id, aa.class_id, aa.school_id, aa.due_at
      from activity_assignments aa
      where aa.id = ${body.assignmentId}
      limit 1
    `;
    const assignment = assignmentRows[0];
    if (!assignment) return json(404, { error: "This assignment is no longer available." });
    if (!sameSchool(currentUser, assignment.school_id)) return forbidden();
    if (assignment.status === "closed") return json(409, { error: "This assignment has been closed and can no longer be submitted." });
    if (assignment.due_at && new Date(assignment.due_at).getTime() <= Date.now()) {
      return forbidden("The assignment deadline has passed");
    }
    if ((assignment.target_kind || "legacy_activity") === "legacy_activity" && !body.activityId) return badRequest("activityId is required");
    if ((assignment.target_kind || "legacy_activity") === "legacy_activity" && String(assignment.activity_id) !== String(body.activityId)) return badRequest("assignmentId does not match activityId");
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
    if (assignment.target_kind === NATIVE_ASSIGNMENT_TARGET_KIND) {
      return submitNativeAssignment(sql, body, currentUser, assignment);
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

  const submissionState = await withAssignmentLifecycleTransaction(sql, body.assignmentId, (transactionSql) => transactionSql`
    with assignment_state as materialized (
      select aa.id, aa.status, aa.due_at, aa.activity_id
      from activity_assignments aa
      where aa.id = ${body.assignmentId}
        and aa.school_id = ${currentUser.school_id}
      for key share of aa
    ), inserted as (
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
      select assignment_state.id,
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
      from assignment_state
      where assignment_state.status = 'assigned'
        and (assignment_state.due_at is null or assignment_state.due_at > now())
        and assignment_state.activity_id = ${body.activityId}
      on conflict (activity_assignment_id, student_id, submission_slot)
        where activity_assignment_id is not null and submission_slot = 1
      do nothing
      returning *
    )
    select exists(select 1 from assignment_state) as assignment_exists,
           (select status from assignment_state) as assignment_status,
           (select due_at from assignment_state) as due_at,
           (select activity_id from assignment_state) as assignment_activity_id,
           (select row_to_json(inserted) from inserted) as submission
  `);
  const lockedState = submissionState[0];
  if (!lockedState?.assignment_exists) return json(404, { error: "This assignment is no longer available." });
  if (lockedState.assignment_status === "closed") return json(409, { error: "This assignment has been closed and can no longer be submitted." });
  if (lockedState.due_at && new Date(lockedState.due_at).getTime() <= Date.now()) return forbidden("The assignment deadline has passed");
  if (String(lockedState.assignment_activity_id) !== String(body.activityId)) return badRequest("assignmentId does not match activityId");
  if (!lockedState.submission) return json(409, { error: "This assignment has already been submitted" });
  const submission = lockedState.submission;

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
           s.response_schema_version, s.response_payload,
           aa.id as assignment_id, aa.target_kind, aa.native_release_id, aa.native_activity_id,
           aa.title as assignment_title, aa.teacher_notes, s.teacher_feedback,
           coalesce(a.title, aa.title) as activity_title, a.slug as activity_slug,
           coalesce(bc.title, native_component.title) as component_title,
           coalesce(bp.title, native_package.title) as package_title,
           c.name as class_name
    from activity_submissions s
    left join activities a on a.id = s.activity_id
    left join activity_assignments aa on aa.id = s.activity_assignment_id
    left join classes c on c.id = aa.class_id
    left join lessons l on l.id = a.lesson_id
    left join units u on u.id = l.unit_id
    left join book_components bc on bc.id = u.book_component_id
    left join book_packages bp on bp.id = bc.book_package_id
    left join book_component_releases native_release on native_release.id = aa.native_release_id
    left join book_components native_component on native_component.id = native_release.book_component_id
    left join book_packages native_package on native_package.id = native_release.book_package_id
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
    targetKind: row.target_kind || "legacy_activity",
    responsePayload: row.response_payload || null,
  }));
}

export async function getAssignmentResults(sql, assignmentId) {
  if (!assignmentId) return badRequest("assignmentId is required");
  const assignmentRows = await sql`
    select aa.id, aa.target_kind, aa.activity_id, aa.native_release_id, aa.native_activity_id,
           aa.teacher_id, aa.class_id, aa.student_id, aa.assigned_at, aa.due_at, aa.status,
           aa.title as assignment_title, aa.teacher_notes, aa.worksheet_links, aa.attached_files,
           coalesce(a.title, aa.title) as activity_title, a.slug as activity_slug,
           coalesce(a.activity_type, native_public.value->>'kind') as activity_type,
           a.content_json->>'implementationMode' as implementation_mode,
           coalesce(bc.title, native_component.title) as component_title,
           coalesce(bp.title, native_package.title) as package_title, c.name as class_name
    from activity_assignments aa
    left join activities a on a.id = aa.activity_id
    left join lessons l on l.id = a.lesson_id
    left join units u on u.id = l.unit_id
    left join book_components bc on bc.id = u.book_component_id
    left join book_packages bp on bp.id = bc.book_package_id
    left join book_component_releases native_release on native_release.id = aa.native_release_id
    left join book_components native_component on native_component.id = native_release.book_component_id
    left join book_packages native_package on native_package.id = native_release.book_package_id
    left join lateral jsonb_each(native_release.public_projection->'nativeActivities') native_public on native_public.key = aa.native_activity_id
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
           s.submitted_at, s.answers, s.response_schema_version, s.response_payload,
           s.teacher_feedback, s.reviewed_at, s.reviewed_by,
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

  let nativeTarget = null;
  if (assignment.target_kind === NATIVE_ASSIGNMENT_TARGET_KIND) {
    nativeTarget = await loadPinnedNativeAssignmentTarget(sql, assignment);
    if (!nativeTarget?.capability) return json(409, { error: "Assigned published native activity is unavailable" });
  }
  const implementationMode = nativeTarget?.capability?.reviewMode || assignment.implementation_mode || "auto-scored";

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
    answers: assignment.target_kind === NATIVE_ASSIGNMENT_TARGET_KIND
      ? Object.fromEntries((row.response_payload?.items || []).map((item) => [item.id, item.value]))
      : row.answers || {},
    responsePayload: row.response_payload || null,
    answerDetails: assignment.target_kind === NATIVE_ASSIGNMENT_TARGET_KIND && row.submission_id
      ? nativeTarget.capability.teacherReviewProjection(
          nativeTarget.publicEntry.document,
          nativeTarget.teacherEntry.document,
          row.response_payload || {},
        )
      : jsonArray(row.answer_details),
    teacherFeedback: row.teacher_feedback || "",
    reviewedAt: row.reviewed_at || null,
    reviewedBy: row.reviewed_by || null,
    dueAt: assignment.due_at,
    submissionId: row.submission_id,
    implementationMode,
    targetKind: assignment.target_kind || "legacy_activity",
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
      implementation_mode: implementationMode,
    }),
    summary: {
      totalStudents: resultRows.length,
      submittedCount: submitted,
      missingCount: Math.max(resultRows.length - submitted, 0),
      averageScore,
      latestSubmittedAt: resultRows.map((row) => row.submittedAt).filter(Boolean).sort().slice(-1)[0] || null,
      awaitingReviewCount: resultRows.filter((row) => row.submissionStatus === "awaiting_review").length,
      reviewedCount: resultRows.filter((row) => row.submissionStatus === "reviewed").length,
      autoScoredCount: resultRows.filter((row) => row.submissionStatus === "submitted").length,
      completedCount: resultRows.filter((row) => row.submissionStatus === "completed").length,
    },
    rows: resultRows,
  });
}
