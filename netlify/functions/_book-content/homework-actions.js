import { createHash } from "node:crypto";
import { listTeacherAssignments, normalizeLinks } from "./assignment-actions.js";
import { assembleStudentHomeworks, assembleTeacherHomeworks } from "./homework-presentation.js";
import {
  NATIVE_ASSIGNMENT_TARGET_KIND,
  containsClientTeacherMaterial,
  resolveNativeAssignmentTarget,
} from "./native-assignment-runtime.js";
import {
  badRequest,
  forbidden,
  isAdmin,
  isTeacher,
  isValidUuid,
  json,
  parseOptionalDeadline,
  sameSchool,
  verifyClassAccess,
  verifyPackageAccess,
} from "./shared.js";

export { assembleStudentHomeworks, assembleTeacherHomeworks } from "./homework-presentation.js";

const LEGACY_TARGET_KIND = "legacy_activity";
const MAX_HOMEWORK_ITEMS = 50;
const idempotencyPattern = /^[A-Za-z0-9._:-]{8,128}$/;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalTarget(rawItem = {}) {
  if (rawItem.kind === LEGACY_TARGET_KIND) {
    if (Object.keys(rawItem).some((key) => !["kind", "activityId"].includes(key))) {
      return { error: "Legacy Homework items contain unsupported fields" };
    }
    if (!isValidUuid(rawItem.activityId)) return { error: "Homework item activityId must be a valid UUID" };
    return { kind: LEGACY_TARGET_KIND, activityId: rawItem.activityId };
  }
  if (rawItem.kind === NATIVE_ASSIGNMENT_TARGET_KIND) {
    if (Object.keys(rawItem).some((key) => !["kind", "releaseId", "nativeActivityId"].includes(key))) {
      return { error: "Published-native Homework items contain unsupported fields" };
    }
    if (!isValidUuid(rawItem.releaseId)) return { error: "Homework item releaseId must be a valid UUID" };
    if (!/^[a-z0-9][a-z0-9-]{0,127}$/.test(String(rawItem.nativeActivityId || ""))) {
      return { error: "Homework item nativeActivityId is invalid" };
    }
    return {
      kind: NATIVE_ASSIGNMENT_TARGET_KIND,
      releaseId: rawItem.releaseId,
      nativeActivityId: String(rawItem.nativeActivityId),
    };
  }
  return { error: "Homework item kind must be legacy_activity or published_native" };
}

function targetIdentity(target) {
  return target.kind === LEGACY_TARGET_KIND
    ? `${LEGACY_TARGET_KIND}:${target.activityId}`
    : `${NATIVE_ASSIGNMENT_TARGET_KIND}:${target.releaseId}:${target.nativeActivityId}`;
}

export function normalizeHomeworkCreateBody(body = {}, { teacherId, schoolId } = {}) {
  const title = String(body.title || "").trim();
  const teacherNotes = String(body.teacherNotes || "").trim();
  const worksheetLinks = normalizeLinks(body.worksheetLinks || body.worksheetLink || body.worksheetUrls);
  const due = parseOptionalDeadline(body.dueAt || body.dueDate || null);
  const idempotencyKey = String(body.idempotencyKey || body.requestId || "").trim();
  const classIds = Array.isArray(body.classIds) ? body.classIds.map(String) : body.classId ? [String(body.classId)] : [];
  const rawItems = Array.isArray(body.items) ? body.items : [];

  if (!title) return { error: "Homework title is required" };
  if (title.length > 240) return { error: "Homework title must be at most 240 characters" };
  if (teacherNotes.length > 4_000) return { error: "teacherNotes must be at most 4000 characters" };
  if (due.error) return { error: due.error };
  if (!idempotencyPattern.test(idempotencyKey)) return { error: "idempotencyKey must be 8-128 safe characters" };
  if (!classIds.length) return { error: "At least one classId is required" };
  if (new Set(classIds).size !== classIds.length) return { error: "Duplicate classId values are not allowed" };
  if (classIds.some((classId) => !isValidUuid(classId))) return { error: "classId must be a valid UUID" };
  if (rawItems.length < 2 || rawItems.length > MAX_HOMEWORK_ITEMS) {
    return { error: `Homework items must contain 2-${MAX_HOMEWORK_ITEMS} activities` };
  }

  const items = [];
  for (const rawItem of rawItems) {
    const target = canonicalTarget(rawItem);
    if (target.error) return target;
    items.push(target);
  }
  const identities = items.map(targetIdentity);
  if (new Set(identities).size !== identities.length) return { error: "Duplicate activities are not allowed in one Homework" };

  const canonicalRequest = {
    schoolId,
    teacherId,
    title,
    teacherNotes,
    worksheetLinks,
    dueAt: due.value,
    status: "assigned",
    classIds: [...classIds].sort(),
    items,
  };
  return {
    ...canonicalRequest,
    classIds,
    idempotencyKey,
    requestSha256: sha256(JSON.stringify(canonicalRequest)),
  };
}

async function resolveHomeworkTeacher(sql, body, currentUser) {
  if (isTeacher(currentUser)) {
    if (body.teacherId && String(body.teacherId) !== String(currentUser.id)) return { error: forbidden() };
    return { teacherId: currentUser.id };
  }
  if (!isAdmin(currentUser)) return { error: forbidden() };
  if (!isValidUuid(body.teacherId)) return { error: badRequest("teacherId must be a valid UUID") };
  const rows = await sql`
    select id, school_id, role
    from app_users
    where id = ${body.teacherId} and role = 'teacher'
    limit 1
  `;
  if (!rows[0]) return { error: json(404, { error: "Teacher not found" }) };
  if (!sameSchool(currentUser, rows[0].school_id)) return { error: forbidden() };
  return { teacherId: rows[0].id };
}

async function resolveHomeworkTargets(sql, currentUser, items) {
  const resolved = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item.kind === LEGACY_TARGET_KIND) {
      const rows = await sql`
        select id, title, is_assignable, content_json
        from activities
        where id = ${item.activityId}
        limit 1
      `;
      const activity = rows[0];
      if (!activity) return { error: json(404, { error: "Activity not found" }) };
      if (
        activity.is_assignable === false
        || activity.content_json?.implementationMode === "unsupported-disabled"
        || activity.content_json?.implementationStatus === "disabled-editorial-only"
      ) return { error: forbidden("This activity is not assignable") };
      const accessError = await verifyPackageAccess(sql, currentUser, { activityId: item.activityId });
      if (accessError) return { error: accessError };
      resolved.push({
        position: index + 1,
        target_kind: LEGACY_TARGET_KIND,
        activity_id: item.activityId,
        native_release_id: null,
        native_activity_id: null,
        title: activity.title,
      });
      continue;
    }
    const target = await resolveNativeAssignmentTarget(sql, currentUser, {
      kind: NATIVE_ASSIGNMENT_TARGET_KIND,
      releaseId: item.releaseId,
      nativeActivityId: item.nativeActivityId,
    }, { requireActive: true });
    if (target.error) return { error: json(target.statusCode || 400, { error: target.error }) };
    if (!target.capability?.assignable) return { error: forbidden("This published native activity is not assignable") };
    resolved.push({
      position: index + 1,
      target_kind: NATIVE_ASSIGNMENT_TARGET_KIND,
      activity_id: null,
      native_release_id: target.row.id,
      native_activity_id: target.nativeActivityId,
      title: target.publicEntry.document?.metadata?.title || target.nativeActivityId,
    });
  }
  return { items: resolved };
}

export async function createHomework(sql, body, currentUser) {
  if (containsClientTeacherMaterial(body)) return badRequest("Teacher/model-answer material is not accepted from clients");
  const teacherScope = await resolveHomeworkTeacher(sql, body, currentUser);
  if (teacherScope.error) return teacherScope.error;
  const input = normalizeHomeworkCreateBody(body, {
    teacherId: teacherScope.teacherId,
    schoolId: currentUser.school_id,
  });
  if (input.error) return badRequest(input.error);

  const existingRows = await sql`
    select id, request_sha256
    from homeworks
    where school_id = ${currentUser.school_id}
      and teacher_id = ${teacherScope.teacherId}
      and idempotency_key = ${input.idempotencyKey}
    limit 1
  `;
  if (existingRows[0]) {
    if (existingRows[0].request_sha256 !== input.requestSha256) {
      return json(409, { error: "idempotencyKey was already used for different Homework content", conflict: "idempotency-key-reuse" });
    }
    const homework = await getTeacherHomework(sql, existingRows[0].id, teacherScope.teacherId, currentUser);
    return json(200, { homework, idempotent: true });
  }

  for (const classId of input.classIds) {
    const accessError = await verifyClassAccess(sql, currentUser, classId);
    if (accessError) return accessError;
  }
  const classRows = await sql`
    select id, status
    from classes
    where id = any(${input.classIds}::uuid[])
      and school_id = ${currentUser.school_id}
  `;
  if (classRows.length !== input.classIds.length || classRows.some((row) => row.status !== "active")) {
    return forbidden("Homework can only target active permitted classes");
  }
  const targets = await resolveHomeworkTargets(sql, currentUser, input.items);
  if (targets.error) return targets.error;

  const rows = await sql`
    with item_input as materialized (
      select *
      from jsonb_to_recordset(${JSON.stringify(targets.items)}::jsonb) as input(
        position integer,
        target_kind text,
        activity_id uuid,
        native_release_id uuid,
        native_activity_id text,
        title text
      )
    ), upserted_homework as (
      insert into homeworks (
        school_id, teacher_id, title, teacher_notes, worksheet_links, due_at,
        status, idempotency_key, request_sha256
      ) values (
        ${currentUser.school_id}, ${teacherScope.teacherId}, ${input.title},
        ${input.teacherNotes}, ${JSON.stringify(input.worksheetLinks)}::jsonb,
        ${input.dueAt}, 'assigned', ${input.idempotencyKey}, ${input.requestSha256}
      )
      on conflict (school_id, teacher_id, idempotency_key)
      do update set idempotency_key = excluded.idempotency_key
      where homeworks.request_sha256 = excluded.request_sha256
      returning *
    ), upserted_items as (
      insert into homework_items (
        homework_id, position, target_kind, activity_id, native_release_id, native_activity_id
      )
      select homework.id, input.position, input.target_kind, input.activity_id,
             input.native_release_id, input.native_activity_id
      from upserted_homework homework
      cross join item_input input
      on conflict (homework_id, position)
      do update set position = excluded.position
      returning *
    ), upserted_assignments as (
      insert into activity_assignments (
        school_id, activity_id, target_kind, native_release_id, native_activity_id,
        teacher_id, class_id, student_id, due_at, status, title, teacher_notes,
        worksheet_links, attached_files, idempotency_key, homework_id, homework_item_id
      )
      select homework.school_id, item.activity_id, item.target_kind,
             item.native_release_id, item.native_activity_id, homework.teacher_id,
             class_id, null, homework.due_at, 'assigned', input.title,
             homework.teacher_notes, homework.worksheet_links, '[]'::jsonb,
             'homework:' || homework.id || ':' || item.position || ':class:' || class_id,
             homework.id, item.id
      from upserted_homework homework
      join upserted_items item on item.homework_id = homework.id
      join item_input input on input.position = item.position
      cross join unnest(${input.classIds}::uuid[]) class_id
      on conflict (school_id, teacher_id, idempotency_key)
        where idempotency_key is not null
      do update set idempotency_key = excluded.idempotency_key
      returning id
    )
    select (select id from upserted_homework limit 1) as homework_id,
           (select count(*)::int from upserted_items) as item_count,
           (select count(*)::int from upserted_assignments) as assignment_count
  `;
  if (!rows[0]?.homework_id) {
    return json(409, { error: "idempotencyKey was already used for different Homework content", conflict: "idempotency-key-reuse" });
  }
  const homework = await getTeacherHomework(sql, rows[0].homework_id, teacherScope.teacherId, currentUser);
  return json(201, { homework, idempotent: false });
}

async function teacherHomeworkRows(sql, teacherId, currentUser) {
  const headers = await sql`
    select *
    from homeworks
    where school_id = ${currentUser.school_id}
      and (${teacherId || null}::uuid is null or teacher_id = ${teacherId || null})
    order by created_at desc, id
  `;
  if (!headers.length) return { headers, items: [], assignments: [], progress: [] };
  const homeworkIds = headers.map((row) => row.id);
  const [items, allAssignments, progress] = await Promise.all([
    sql`
      select item.*, coalesce(activity.title, native_public.value->'document'->'metadata'->>'title', item.native_activity_id) as title,
             activity.slug as activity_slug,
             coalesce(activity.activity_type, native_public.value->>'kind') as activity_type,
             coalesce(component.title, native_component.title) as component_title,
             coalesce(package.title, native_package.title) as package_title
      from homework_items item
      left join activities activity on activity.id = item.activity_id
      left join lessons lesson on lesson.id = activity.lesson_id
      left join units unit_record on unit_record.id = lesson.unit_id
      left join book_components component on component.id = unit_record.book_component_id
      left join book_packages package on package.id = component.book_package_id
      left join book_component_releases release on release.id = item.native_release_id
      left join book_components native_component on native_component.id = release.book_component_id
      left join book_packages native_package on native_package.id = release.book_package_id
      left join lateral jsonb_each(release.public_projection->'nativeActivities') native_public
        on native_public.key = item.native_activity_id
      where item.homework_id = any(${homeworkIds}::uuid[])
      order by item.homework_id, item.position
    `,
    listTeacherAssignments(sql, teacherId, currentUser),
    sql`
      with eligible_assignments as (
        select assignment.homework_id, assignment.homework_item_id, assignment.id as assignment_id, membership.student_id
        from activity_assignments assignment
        join homework_items item on item.id = assignment.homework_item_id and item.homework_id = assignment.homework_id
        left join activities activity on activity.id = item.activity_id
        left join lessons lesson on lesson.id = activity.lesson_id
        left join units unit_record on unit_record.id = lesson.unit_id
        left join book_components component on component.id = unit_record.book_component_id
        left join book_component_releases release on release.id = item.native_release_id
        join class_students membership on membership.class_id = assignment.class_id
          and coalesce(membership.status, 'active') = 'active'
        join book_access access on access.user_id = membership.student_id
          and access.book_package_id = coalesce(component.book_package_id, release.book_package_id)
          and access.role_scope = 'student'
        join book_packages entitled_package on entitled_package.id = access.book_package_id
          and entitled_package.status = 'active'
        where assignment.homework_id = any(${homeworkIds}::uuid[])
        union all
        select assignment.homework_id, assignment.homework_item_id, assignment.id, assignment.student_id
        from activity_assignments assignment
        join homework_items item on item.id = assignment.homework_item_id and item.homework_id = assignment.homework_id
        left join activities activity on activity.id = item.activity_id
        left join lessons lesson on lesson.id = activity.lesson_id
        left join units unit_record on unit_record.id = lesson.unit_id
        left join book_components component on component.id = unit_record.book_component_id
        left join book_component_releases release on release.id = item.native_release_id
        join book_access access on access.user_id = assignment.student_id
          and access.book_package_id = coalesce(component.book_package_id, release.book_package_id)
          and access.role_scope = 'student'
        join book_packages entitled_package on entitled_package.id = access.book_package_id
          and entitled_package.status = 'active'
        where assignment.homework_id = any(${homeworkIds}::uuid[])
          and assignment.student_id is not null
      ), eligible_pairs as (
        select distinct homework_id, homework_item_id, student_id
        from eligible_assignments
      ), latest_submissions as (
        select distinct on (eligible.homework_id, eligible.homework_item_id, eligible.student_id)
               eligible.homework_id, eligible.homework_item_id, eligible.student_id,
               submission.id, submission.status
        from eligible_assignments eligible
        join activity_submissions submission
          on submission.activity_assignment_id = eligible.assignment_id
         and submission.student_id = eligible.student_id
        order by eligible.homework_id, eligible.homework_item_id, eligible.student_id,
                 submission.submitted_at desc, submission.id desc
      )
      select eligible.homework_id,
             count(*)::int as expected_count,
             count(latest.id)::int as submitted_count,
             count(latest.id) filter (where latest.status = 'awaiting_review')::int as awaiting_review_count,
             count(latest.id) filter (where latest.status = 'reviewed')::int as reviewed_count,
             count(latest.id) filter (where latest.status in ('submitted', 'completed'))::int as auto_scored_count
      from eligible_pairs eligible
      left join latest_submissions latest
        on latest.homework_id = eligible.homework_id
       and latest.homework_item_id = eligible.homework_item_id
       and latest.student_id = eligible.student_id
      group by eligible.homework_id
    `,
  ]);
  return {
    headers,
    items,
    assignments: allAssignments.filter((assignment) => assignment.homeworkId && homeworkIds.includes(assignment.homeworkId)),
    progress,
  };
}

export async function listTeacherHomeworks(sql, teacherId, currentUser) {
  return assembleTeacherHomeworks(await teacherHomeworkRows(sql, teacherId, currentUser));
}

export async function getTeacherHomework(sql, homeworkId, teacherId, currentUser) {
  if (!isValidUuid(homeworkId)) return null;
  return (await listTeacherHomeworks(sql, teacherId, currentUser))
    .find((homework) => String(homework.id) === String(homeworkId)) || null;
}

export async function listStudentHomeworks(sql, studentId, currentUser) {
  if (!studentId) return [];
  const rows = await sql`
    select homework.id as homework_id, homework.title as homework_title,
           homework.teacher_notes, homework.worksheet_links, homework.due_at,
           homework.status as homework_status, teacher.full_name as teacher_name,
           item.id as homework_item_id, item.position, item.target_kind,
           item.activity_id, item.native_release_id, item.native_activity_id,
           assignment.id as assignment_id, assignment.status,
           class_record.name as class_name,
           coalesce(activity.title, native_public.value->'document'->'metadata'->>'title', item.native_activity_id) as activity_title,
           coalesce(component.title, native_component.title) as component_title,
           coalesce(package.title, native_package.title) as package_title,
           latest.id as submission_id, latest.status as submission_status,
           latest.submitted_at, latest.score_percent
    from homeworks homework
    join homework_items item on item.homework_id = homework.id
    join activity_assignments assignment
      on assignment.homework_id = homework.id and assignment.homework_item_id = item.id
    left join classes class_record on class_record.id = assignment.class_id
    left join app_users teacher on teacher.id = homework.teacher_id
    left join activities activity on activity.id = item.activity_id
    left join lessons lesson on lesson.id = activity.lesson_id
    left join units unit_record on unit_record.id = lesson.unit_id
    left join book_components component on component.id = unit_record.book_component_id
    left join book_packages package on package.id = component.book_package_id
    left join book_component_releases release on release.id = item.native_release_id
    left join book_components native_component on native_component.id = release.book_component_id
    left join book_packages native_package on native_package.id = release.book_package_id
    left join lateral jsonb_each(release.public_projection->'nativeActivities') native_public
      on native_public.key = item.native_activity_id
    left join lateral (
      select submission.id, submission.status, submission.submitted_at, submission.score_percent
      from activity_submissions submission
      where submission.activity_assignment_id = assignment.id
        and submission.student_id = ${studentId}
      order by submission.submitted_at desc, submission.id desc
      limit 1
    ) latest on true
    where homework.school_id = ${currentUser.school_id}
      and assignment.school_id = ${currentUser.school_id}
      and coalesce(package.status, native_package.status) = 'active'
      and exists (
        select 1
        from book_access access
        where access.user_id = ${studentId}
          and access.book_package_id = coalesce(package.id, native_package.id)
          and access.role_scope = 'student'
      )
      and (
        assignment.student_id = ${studentId}
        or exists (
          select 1 from class_students membership
          where membership.class_id = assignment.class_id
            and membership.student_id = ${studentId}
            and coalesce(membership.status, 'active') = 'active'
        )
      )
    order by homework.created_at desc, homework.id, item.position, assignment.id
  `;
  return assembleStudentHomeworks(rows);
}
