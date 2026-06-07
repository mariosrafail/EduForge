import {
  createTeacherClass,
  findClassByInviteOrSlug,
  joinClass,
  listTeacherClasses,
} from "./_class-utils.js";
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

function badRequest(message) {
  return json(400, { error: message });
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

async function activateBookCode(sql, body) {
  const code = String(body.code || "").trim();
  if (!code) return badRequest("code is required");

  const rows = await sql`
    select ac.*, bp.title as package_title
    from activation_codes ac
    join book_packages bp on bp.id = ac.book_package_id
    where ac.code = ${code}
    limit 1
  `;
  const activationCode = rows[0];
  if (!activationCode) return json(404, { error: "Activation code not found" });
  if (activationCode.status !== "active") return badRequest("Activation code is not active");
  if (activationCode.max_uses !== null && activationCode.used_count >= activationCode.max_uses) return badRequest("Activation code usage limit reached");

  if (body.userId) {
    const userRows = await sql`select id, role from app_users where id = ${body.userId} limit 1`;
    const user = userRows[0];
    if (!user) return json(404, { error: "User not found" });
    const roleScope = user.role === "admin" ? "school_admin" : user.role;

    await sql`
      insert into book_access (user_id, book_package_id, activation_code_id, role_scope)
      values (${user.id}, ${activationCode.book_package_id}, ${activationCode.id}, ${roleScope})
      on conflict (user_id, book_package_id, role_scope) do update
      set activation_code_id = excluded.activation_code_id,
          granted_at = now()
    `;
  }

  await sql`
    update activation_codes
    set used_count = used_count + 1
    where id = ${activationCode.id}
  `;

  return json(200, {
    activated: true,
    bookPackageId: activationCode.book_package_id,
    bookPackageTitle: activationCode.package_title,
  });
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

async function assignActivityToClass(sql, body) {
  if (!body.activityId) return badRequest("activityId is required");
  if (!body.teacherId && !body.classId && !body.studentId) return badRequest("teacherId, classId, or studentId is required");

  const rows = await sql`
    insert into activity_assignments (activity_id, teacher_id, class_id, student_id, due_at, status)
    values (${body.activityId}, ${body.teacherId || null}, ${body.classId || null}, ${body.studentId || null}, ${body.dueAt || null}, 'assigned')
    returning *
  `;

  return json(200, { assignment: rows[0] });
}

async function listAssignmentsForStudent(sql, studentId) {
  if (!studentId) return [];
  const rows = await sql`
    select aa.id, aa.assigned_at, aa.due_at, aa.status,
           a.id as activity_id, a.title as activity_title, a.slug as activity_slug, a.activity_type,
           l.title as lesson_title, u.title as unit_title, bc.title as component_title, bp.title as package_title
    from activity_assignments aa
    join activities a on a.id = aa.activity_id
    left join lessons l on l.id = a.lesson_id
    left join units u on u.id = l.unit_id
    left join book_components bc on bc.id = u.book_component_id
    left join book_packages bp on bp.id = bc.book_package_id
    where aa.student_id = ${studentId}
       or aa.class_id in (select class_id from class_students where student_id = ${studentId})
    order by aa.assigned_at desc
  `;

  return rows.map((row) => ({
    id: row.id,
    assignedAt: row.assigned_at,
    dueAt: row.due_at,
    status: row.status,
    activity: {
      id: row.activity_id,
      title: row.activity_title,
      slug: row.activity_slug,
      activityType: row.activity_type,
    },
    lessonTitle: row.lesson_title,
    unitTitle: row.unit_title,
    componentTitle: row.component_title,
    packageTitle: row.package_title,
  }));
}

async function submitActivity(sql, body) {
  if (!body.activityId) return badRequest("activityId is required");
  if (!body.studentId) return badRequest("studentId is required");

  const activity = await fetchActivity(sql, { activityId: body.activityId });
  if (!activity) return json(404, { error: "Activity not found" });

  const answers = body.answers || {};
  const rows = activity.questions.map((question) => {
    const answer = answers[question.id] ?? answers[question.questionNumber] ?? "";
    const correctText = question.answer || "";
    const isCorrect = String(answer).trim().toLowerCase() === String(correctText).trim().toLowerCase();
    return { question, answer, correctText, isCorrect };
  });
  const correctCount = rows.filter((row) => row.isCorrect).length;
  const totalCount = rows.length;
  const scorePercent = totalCount ? Math.round((correctCount / totalCount) * 100) : null;

  const submissions = await sql`
    insert into activity_submissions (
      activity_assignment_id,
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
      ${body.activityId},
      ${body.studentId},
      ${JSON.stringify(answers)}::jsonb,
      ${scorePercent},
      ${scorePercent},
      ${correctCount},
      ${totalCount},
      'submitted',
      now()
    )
    returning *
  `;
  const submission = submissions[0];

  for (const row of rows) {
    await sql`
      insert into student_answers (submission_id, question_id, answer_text, is_correct, feedback_text)
      values (${submission.id}, ${row.question.id}, ${String(row.answer)}, ${row.isCorrect}, ${row.isCorrect ? "Correct" : `Correct answer: ${row.correctText}`})
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

async function getStudentGrades(sql, studentId) {
  if (!studentId) return [];
  const rows = await sql`
    select s.id, s.submitted_at, s.score_percent, s.correct_count, s.total_count, s.status,
           a.title as activity_title, a.slug as activity_slug, bc.title as component_title, bp.title as package_title
    from activity_submissions s
    join activities a on a.id = s.activity_id
    left join lessons l on l.id = a.lesson_id
    left join units u on u.id = l.unit_id
    left join book_components bc on bc.id = u.book_component_id
    left join book_packages bp on bp.id = bc.book_package_id
    where s.student_id = ${studentId}
    order by s.submitted_at desc
  `;

  return rows.map((row) => ({
    id: row.id,
    submittedAt: row.submitted_at,
    scorePercent: row.score_percent,
    correctCount: row.correct_count,
    totalCount: row.total_count,
    status: row.status,
    activityTitle: row.activity_title,
    activitySlug: row.activity_slug,
    componentTitle: row.component_title,
    packageTitle: row.package_title,
  }));
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

async function listPageHotspots(sql, query) {
  if (!query.packageSlug) return badRequest("packageSlug is required");
  if (!query.componentSlug) return badRequest("componentSlug is required");
  if (!query.pageId) return badRequest("pageId is required");

  const rows = await sql`
    select *
    from book_page_hotspots
    where package_slug = ${query.packageSlug}
      and component_slug = ${query.componentSlug}
      and page_id = ${query.pageId}
    order by created_at asc, id asc
  `;

  return json(200, { hotspots: rows.map(pageHotspotRowToUi) });
}

async function savePageHotspots(sql, body) {
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

  await sql`
    delete from book_page_hotspots
    where package_slug = ${packageSlug}
      and component_slug = ${componentSlug}
      and page_id = ${pageId}
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
        created_by
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
        ${createdBy}
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

async function listBookActivities(sql, query) {
  if (!query.packageSlug) return badRequest("packageSlug is required");
  if (!query.componentSlug) return badRequest("componentSlug is required");

  const rows = await sql`
    select *
    from book_activities
    where package_slug = ${query.packageSlug}
      and component_slug = ${query.componentSlug}
      and (${query.pageId || null}::text is null or page_id = ${query.pageId || null})
      and (${query.status || null}::text is null or status = ${query.status || null})
    order by coalesce(page_number, 999999) asc, created_at asc, title asc
  `;

  return json(200, { activities: rows.map(bookActivityRowToUi) });
}

async function getBookActivity(sql, query) {
  if (!query.activityId) return badRequest("activityId is required");
  const rows = await sql`select * from book_activities where id = ${query.activityId} limit 1`;
  const activity = rows[0];
  return activity ? json(200, { activity: bookActivityRowToUi(activity) }) : json(404, { error: "Book activity not found" });
}

async function createBookActivity(sql, body) {
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
      created_by
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
      ${activity.createdBy}
    )
    returning *
  `;

  return json(200, { activity: bookActivityRowToUi(rows[0]) });
}

async function updateBookActivity(sql, body) {
  const id = body.id || body.activityId || body.activity_id;
  if (!id) return badRequest("activityId is required");

  const existingRows = await sql`select * from book_activities where id = ${id} limit 1`;
  const existing = existingRows[0];
  if (!existing) return json(404, { error: "Book activity not found" });

  let activity;
  try {
    activity = normalizeBookActivityPayload(body, existing);
  } catch (error) {
    return badRequest(error.message);
  }

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
    where id = ${id}
    returning *
  `;

  return json(200, { activity: bookActivityRowToUi(rows[0]) });
}

async function deleteBookActivity(sql, body) {
  const id = body.id || body.activityId || body.activity_id;
  if (!id) return badRequest("activityId is required");
  await sql`delete from book_activities where id = ${id}`;
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

async function listBookMediaAssets(sql, query) {
  if (!query.packageSlug) return badRequest("packageSlug is required");
  if (!query.componentSlug) return badRequest("componentSlug is required");

  const rows = await sql`
    select *
    from book_media_assets
    where package_slug = ${query.packageSlug}
      and component_slug = ${query.componentSlug}
      and (${query.pageId || null}::text is null or page_id = ${query.pageId || null})
      and (${query.kind || null}::text is null or kind = ${query.kind || null})
    order by created_at desc, file_name asc
  `;

  return json(200, { mediaAssets: rows.map(bookMediaAssetRowToUi) });
}

async function createBookMediaAsset(sql, body) {
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
      created_by
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
      ${body.createdBy || body.created_by || null}
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

    if (event.httpMethod === "GET") {
      if (query.action === "list") return json(200, { bookPackages: await fetchBookPackages(sql) });
      if (query.action === "activity") {
        const activity = await fetchActivity(sql, query);
        return activity ? json(200, { activity }) : json(404, { error: "Activity not found" });
      }
      if (query.action === "component") {
        const tree = await fetchPackageTree(sql, query);
        const component = tree?.components.find((item) => item.id === query.componentId || item.slug === query.slug);
        return component ? json(200, { component }) : json(404, { error: "Component not found" });
      }
      if (query.action === "access") return json(200, { bookAccess: await listUserBookAccess(sql, query.userId) });
      if (query.action === "assignments") return json(200, { assignments: await listAssignmentsForStudent(sql, query.studentId) });
      if (query.action === "grades") return json(200, { grades: await getStudentGrades(sql, query.studentId) });
      if (query.action === "page-hotspots") return listPageHotspots(sql, query);
      if (query.action === "book-activities") return listBookActivities(sql, query);
      if (query.action === "book-activity") return getBookActivity(sql, query);
      if (query.action === "book-media-assets") return listBookMediaAssets(sql, query);
      if (query.action === "classes") return json(200, { classes: await listTeacherClasses(sql, query.teacherId) });
      if (query.action === "class-by-invite") {
        const classItem = await findClassByInviteOrSlug(sql, { inviteCode: query.inviteCode });
        return classItem ? json(200, { classItem, class: classItem }) : json(404, { error: "Class not found" });
      }
      if (query.action === "class-by-slug") {
        const classItem = await findClassByInviteOrSlug(sql, { slug: query.slug });
        return classItem ? json(200, { classItem, class: classItem }) : json(404, { error: "Class not found" });
      }

      const tree = await fetchPackageTree(sql, query);
      return tree ? json(200, { bookPackage: tree }) : json(404, { error: "Book package not found. Run database/006_book_content_platform.sql." });
    }

    if (event.httpMethod === "POST") {
      const body = parseBody(event);
      if (query.action === "activate") return activateBookCode(sql, body);
      if (query.action === "assign") return assignActivityToClass(sql, body);
      if (query.action === "submit") return submitActivity(sql, body);
      if (query.action === "create-class") return createTeacherClass(sql, body);
      if (query.action === "join-class") return joinClass(sql, body);
      if (query.action === "save-page-hotspots") return savePageHotspots(sql, body);
      if (query.action === "create-book-activity") return createBookActivity(sql, body);
      if (query.action === "update-book-activity") return updateBookActivity(sql, body);
      if (query.action === "delete-book-activity") return deleteBookActivity(sql, body);
      if (query.action === "create-book-media-asset") return createBookMediaAsset(sql, body);
      return badRequest("Unsupported POST action");
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    if (isDatabaseNotConfiguredError(error)) return databaseNotConfiguredResponse();
    return json(500, { error: "Book content API failed", detail: error.message });
  }
}
