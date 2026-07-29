import { badRequest, requestsHiddenPhaseOneComponent, teacherSolutionHeaders, withTeacherSolutionHeaders, teacherSolutionResponse, uuidPattern, isValidUuid, invalidUuidResponse, jsonArray, numericOrNull, studentHiddenAnswerFields, stripStudentAnswerKeys, studentSafeActivityPayload, parseOptionalDeadline, assignmentIdempotencyKey, validateSubmittedAnswers, studentSafePackageTree, normalizeSubmittedAnswer, isSubmittedAnswerCorrect, packageIdForQuery, verifyPackageAccess, supportedBookActivityTypes, supportedBookMediaKinds, supportedHotspotActionTypes, requireText, optionalJson, getUserSchoolId, getUserAccessRow, resolveScopedUserId, getClassAccessRow, getAssignmentAccessRow, getSubmissionAccessRow, canAccessTeacherScopedRow, canAccessStudentScopedRow, verifyClassAccess, verifyAssignmentAccess, verifyStudentAccess, verifyContentEditorReferences, createTeacherClass, enforceInviteRateLimit, findClassByInviteCode, joinClass, listTeacherClasses, publicClassInviteRow, recordInviteAttempt, forbidden, requireAuth, safeServerError, unauthorized, isAdmin, isStudent, isTeacher, requireResourceRole, sameSchool, fetchActivity, fetchBookPackages, fetchPackageTree, databaseNotConfiguredResponse, getSql, isDatabaseNotConfiguredError, json, parseBody, readQuery, getBookAssetAccess, accessiblePackageIds } from "./shared.js";
import {
  buildUltimateB2TeacherSolutionPayload,
  isUltimateB2PresentationActivityEnabled,
} from "../_ultimate-b2-teacher-solutions.js";

export function bookActivityRowToUi(row) {
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

export async function getTeacherActivitySolutions(sql, currentUser, query = {}) {
  const roleError = requireResourceRole(currentUser, ["teacher", "admin"]);
  if (roleError) return withTeacherSolutionHeaders(roleError);

  const stableActivityId = String(query.stableActivityId || query.activitySlug || "").trim();
  if (!/^ultimate-b2-sb-u[12]-p\d+-o\d+$/.test(stableActivityId)) {
    return teacherSolutionResponse(404, { error: "Activity not found" });
  }

  const solution = buildUltimateB2TeacherSolutionPayload(stableActivityId);
  if (!solution || !isUltimateB2PresentationActivityEnabled(stableActivityId)) {
    return teacherSolutionResponse(404, { error: "Activity not found" });
  }

  const rows = await sql`
    select bp.id as package_id, bp.slug as package_slug, bp.status as package_status,
           bc.component_type
    from book_packages bp
    join book_components bc on bc.book_package_id = bp.id
    where bp.slug = 'ultimate-b2'
      and bc.component_type = 'students_book'
    limit 1
  `;
  const packageComponent = rows[0];
  if (!packageComponent || packageComponent.package_status !== "active") {
    return teacherSolutionResponse(404, { error: "Activity not found" });
  }

  const allowedPackageIds = await accessiblePackageIds(sql, currentUser);
  if (!allowedPackageIds.includes(String(packageComponent.package_id))) {
    return withTeacherSolutionHeaders(forbidden());
  }

  return teacherSolutionResponse(200, { solution });
}

export function browserSafeBookActivityPayload(activity) {
  return stripStudentAnswerKeys(activity);
}

export function scoreBookActivityRecord(row = {}, responses = {}) {
  const type = row.type;
  const content = row.content || {};
  const answerKey = row.correct_answers || {};
  if (type === "multiple_choice") {
    const questions = jsonArray(content.questions);
    const correctCount = questions.filter((question) => normalizeSubmittedAnswer(responses[question.id]) === normalizeSubmittedAnswer(answerKey[question.id])).length;
    return { status: "submitted", correctCount, totalCount: questions.length, scorePercent: questions.length ? Math.round((correctCount / questions.length) * 100) : null };
  }
  if (type === "typed_gap_fill") {
    const items = jsonArray(content.items);
    const correctCount = items.filter((item) => {
      const accepted = jsonArray(answerKey[item.id]).length ? jsonArray(answerKey[item.id]) : jsonArray(item.acceptedAnswers);
      return accepted.some((value) => normalizeSubmittedAnswer(value) === normalizeSubmittedAnswer(responses[item.id]));
    }).length;
    return { status: "submitted", correctCount, totalCount: items.length, scorePercent: items.length ? Math.round((correctCount / items.length) * 100) : null };
  }
  if (type === "open_answer") {
    const accepted = jsonArray(answerKey.acceptedAnswers).length ? jsonArray(answerKey.acceptedAnswers) : jsonArray(content.acceptedAnswers);
    if (!accepted.length) return { status: "awaiting_review", correctCount: null, totalCount: null, scorePercent: null };
    const correctCount = accepted.some((value) => normalizeSubmittedAnswer(value) === normalizeSubmittedAnswer(responses.answer)) ? 1 : 0;
    return { status: "submitted", correctCount, totalCount: 1, scorePercent: correctCount * 100 };
  }
  return { status: "completed", correctCount: null, totalCount: null, scorePercent: null };
}

export function normalizeBookActivityPayload(body = {}, existing = {}) {
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

export async function listBookActivities(sql, query, currentUser) {
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

  return json(200, { activities: rows.map((row) => browserSafeBookActivityPayload(bookActivityRowToUi(row))) });
}

export async function getBookActivity(sql, query, currentUser) {
  if (!query.activityId) return badRequest("activityId is required");
  if (!isValidUuid(query.activityId)) return invalidUuidResponse("activityId");
  const rows = await sql`select * from book_activities where id = ${query.activityId} and school_id = ${currentUser.school_id} limit 1`;
  const activity = rows[0];
  if (!activity) return json(404, { error: "Book activity not found" });
  const accessError = await verifyPackageAccess(sql, currentUser, { packageSlug: activity.package_slug });
  return accessError || json(200, { activity: browserSafeBookActivityPayload(bookActivityRowToUi(activity)) });
}

export async function scoreBookActivity(sql, body, currentUser) {
  if (!isStudent(currentUser)) return forbidden("Only student accounts can submit activity responses");
  if (!body.activityId) return badRequest("activityId is required");
  if (!isValidUuid(body.activityId)) return invalidUuidResponse("activityId");
  const rows = await sql`select * from book_activities where id = ${body.activityId} and school_id = ${currentUser.school_id} limit 1`;
  const activity = rows[0];
  if (!activity) return json(404, { error: "Book activity not found" });
  const accessError = await verifyPackageAccess(sql, currentUser, { packageSlug: activity.package_slug });
  return accessError || json(200, { result: scoreBookActivityRecord(activity, optionalJson(body.responses)) });
}

export async function createBookActivity(sql, body, currentUser) {
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

  return json(200, { activity: browserSafeBookActivityPayload(bookActivityRowToUi(rows[0])) });
}

export async function updateBookActivity(sql, body, currentUser) {
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

  return json(200, { activity: browserSafeBookActivityPayload(bookActivityRowToUi(rows[0])) });
}

export async function deleteBookActivity(sql, body, currentUser) {
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
