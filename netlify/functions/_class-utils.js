import { randomBytes } from "node:crypto";
import { json } from "./_book-content-utils.js";

const classLevels = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);

function badRequest(message) {
  return json(400, { error: message });
}

export function normalizeClassRow(row = {}) {
  const teacherName = row.teacher_name || "Paris Georgoulakis";
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    level: row.level || "B2",
    teacher: teacherName,
    teacherId: row.teacher_id,
    teacherName,
    schoolId: row.school_id,
    assignedBook: row.assigned_book || "Ultimate B2",
    bookPackageId: row.book_package_id,
    inviteCode: row.invite_code,
    students: Number(row.students || 0),
    completion: Number(row.completion || 0),
    status: row.status || "active",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function publicClassInviteRow(classItem = {}) {
  if (!classItem?.id) return null;
  return {
    id: classItem.id,
    name: classItem.name,
    slug: classItem.slug,
    inviteCode: classItem.inviteCode,
    level: classItem.level,
    assignedBook: classItem.assignedBook,
    teacher: classItem.teacherName || classItem.teacher,
    teacherName: classItem.teacherName || classItem.teacher,
    students: Number(classItem.students || 0),
    status: classItem.status || "active",
  };
}

export function slugifyClassName(name = "") {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createInviteCode() {
  return randomBytes(6).toString("base64url").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 8);
}

export async function ensureUniqueClassSlug(sql, baseSlug) {
  const fallback = baseSlug || `class-${Date.now()}`;
  let candidate = fallback;
  let suffix = 2;

  while (true) {
    const rows = await sql`select id from classes where slug = ${candidate} limit 1`;
    if (!rows.length) return candidate;
    candidate = `${fallback}-${suffix}`;
    suffix += 1;
  }
}

export async function ensureUniqueInviteCode(sql) {
  while (true) {
    const candidate = createInviteCode();
    const rows = await sql`select id from classes where invite_code = ${candidate} limit 1`;
    if (!rows.length) return candidate;
  }
}

export async function fetchClassById(sql, classId) {
  const rows = await sql`
    select c.*,
           u.full_name as teacher_name,
           count(cs.id)::int as students,
           coalesce((
             select round(
               100.0 * count(distinct s.student_id::text || ':' || aa.id::text)
               / nullif(count(distinct cs_expected.student_id::text || ':' || aa.id::text), 0)
             )::int
             from activity_assignments aa
             join class_students cs_expected on cs_expected.class_id = c.id and coalesce(cs_expected.status, 'active') = 'active'
             left join activity_submissions s on s.activity_assignment_id = aa.id and s.student_id = cs_expected.student_id
             where aa.class_id = c.id
           ), 0)::int as completion
    from classes c
    left join app_users u on u.id = c.teacher_id
    left join class_students cs on cs.class_id = c.id and coalesce(cs.status, 'active') = 'active'
    where c.id = ${classId}
    group by c.id, u.full_name
    limit 1
  `;
  return rows[0] ? normalizeClassRow(rows[0]) : null;
}

export async function listTeacherClasses(sql, teacherId = "", schoolId = "") {
  const rows = teacherId
    ? await sql`
        select c.*,
               u.full_name as teacher_name,
               count(cs.id)::int as students,
               coalesce((
                 select round(
                   100.0 * count(distinct s.student_id::text || ':' || aa.id::text)
                   / nullif(count(distinct cs_expected.student_id::text || ':' || aa.id::text), 0)
                 )::int
                 from activity_assignments aa
                 join class_students cs_expected on cs_expected.class_id = c.id and coalesce(cs_expected.status, 'active') = 'active'
                 left join activity_submissions s on s.activity_assignment_id = aa.id and s.student_id = cs_expected.student_id
                 where aa.class_id = c.id
               ), 0)::int as completion
        from classes c
        left join app_users u on u.id = c.teacher_id
        left join class_students cs on cs.class_id = c.id and coalesce(cs.status, 'active') = 'active'
        where c.teacher_id = ${teacherId}
          and (${schoolId || null}::uuid is null or c.school_id = ${schoolId || null})
        group by c.id, u.full_name
        order by c.created_at desc
      `
    : await sql`
        select c.*,
               u.full_name as teacher_name,
               count(cs.id)::int as students,
               coalesce((
                 select round(
                   100.0 * count(distinct s.student_id::text || ':' || aa.id::text)
                   / nullif(count(distinct cs_expected.student_id::text || ':' || aa.id::text), 0)
                 )::int
                 from activity_assignments aa
                 join class_students cs_expected on cs_expected.class_id = c.id and coalesce(cs_expected.status, 'active') = 'active'
                 left join activity_submissions s on s.activity_assignment_id = aa.id and s.student_id = cs_expected.student_id
                 where aa.class_id = c.id
               ), 0)::int as completion
        from classes c
        left join app_users u on u.id = c.teacher_id
        left join class_students cs on cs.class_id = c.id and coalesce(cs.status, 'active') = 'active'
        where (${schoolId || null}::uuid is null or c.school_id = ${schoolId || null})
        group by c.id, u.full_name
        order by c.created_at desc
      `;

  return rows.map(normalizeClassRow);
}

export async function createTeacherClass(sql, body) {
  const name = String(body.name || "").trim();
  const level = String(body.level || "").trim().toUpperCase();
  if (!name) return badRequest("name is required");
  if (!level || !classLevels.has(level)) return badRequest("level must be one of: A1, A2, B1, B2, C1, C2");

  let teacher = null;
  if (body.teacherId) {
    const teacherRows = await sql`
      select id, school_id, full_name
      from app_users
      where id = ${body.teacherId} and role = 'teacher' and status = 'active'
      limit 1
    `;
    teacher = teacherRows[0] || null;
    if (!teacher) return json(404, { error: "Teacher not found" });
  }

  const baseSlug = slugifyClassName(name) || `class-${Date.now()}`;
  const slug = await ensureUniqueClassSlug(sql, baseSlug);
  const inviteCode = await ensureUniqueInviteCode(sql);
  const schoolId = body.schoolId || teacher?.school_id || null;
  if (!schoolId) return badRequest("schoolId is required");
  if (teacher && String(teacher.school_id) !== String(schoolId)) return json(403, { error: "Forbidden" });
  const assignedBook = String(body.assignedBook || "").trim() || null;

  if (body.bookPackageId) {
    const packageRows = await sql`select id from book_packages where id = ${body.bookPackageId} and status = 'active' limit 1`;
    if (!packageRows.length) return json(404, { error: "Book package not found" });
  }

  const rows = await sql`
    insert into classes (teacher_id, school_id, book_package_id, name, slug, level, assigned_book, invite_code, status)
    values (${teacher?.id || null}, ${schoolId}, ${body.bookPackageId || null}, ${name}, ${slug}, ${level}, ${assignedBook}, ${inviteCode}, 'active')
    returning id
  `;
  const classItem = await fetchClassById(sql, rows[0].id);
  return json(200, { classItem, class: classItem });
}

export async function findClassByInviteOrSlug(sql, { classId = "", inviteCode = "", slug = "" } = {}) {
  const lookup = inviteCode || slug;
  const rows = classId
    ? await sql`
        select c.*,
               u.full_name as teacher_name,
               count(cs.id)::int as students,
               coalesce((
                 select round(
                   100.0 * count(distinct s.student_id::text || ':' || aa.id::text)
                   / nullif(count(distinct cs_expected.student_id::text || ':' || aa.id::text), 0)
                 )::int
                 from activity_assignments aa
                 join class_students cs_expected on cs_expected.class_id = c.id and coalesce(cs_expected.status, 'active') = 'active'
                 left join activity_submissions s on s.activity_assignment_id = aa.id and s.student_id = cs_expected.student_id
                 where aa.class_id = c.id
               ), 0)::int as completion
        from classes c
        left join app_users u on u.id = c.teacher_id
        left join class_students cs on cs.class_id = c.id and coalesce(cs.status, 'active') = 'active'
        where c.id = ${classId}
        group by c.id, u.full_name
        limit 1
      `
    : await sql`
        select c.*,
               u.full_name as teacher_name,
               count(cs.id)::int as students,
               coalesce((
                 select round(
                   100.0 * count(distinct s.student_id::text || ':' || aa.id::text)
                   / nullif(count(distinct cs_expected.student_id::text || ':' || aa.id::text), 0)
                 )::int
                 from activity_assignments aa
                 join class_students cs_expected on cs_expected.class_id = c.id and coalesce(cs_expected.status, 'active') = 'active'
                 left join activity_submissions s on s.activity_assignment_id = aa.id and s.student_id = cs_expected.student_id
                 where aa.class_id = c.id
               ), 0)::int as completion
        from classes c
        left join app_users u on u.id = c.teacher_id
        left join class_students cs on cs.class_id = c.id and coalesce(cs.status, 'active') = 'active'
        where c.invite_code = ${lookup} or c.slug = ${lookup}
        group by c.id, u.full_name
        limit 1
      `;

  return rows[0] ? normalizeClassRow(rows[0]) : null;
}

export async function joinClass(sql, body) {
  if (!body.studentId) return badRequest("studentId is required");
  const studentRows = await sql`
    select id, school_id
    from app_users
    where id = ${body.studentId} and role = 'student' and status = 'active'
    limit 1
  `;
  if (!studentRows.length) return json(404, { error: "Student not found" });

  const classItem = await findClassByInviteOrSlug(sql, {
    classId: body.classId || "",
    inviteCode: body.inviteCode || "",
    slug: body.slug || "",
  });
  if (!classItem) return json(404, { error: "Class not found" });
  if (classItem.status !== "active") return json(403, { error: "This class is not active" });
  if (!studentRows[0].school_id || String(studentRows[0].school_id) !== String(classItem.schoolId)) {
    return json(403, { error: "Forbidden" });
  }

  const existingRows = await sql`
    select id, status
    from class_students
    where class_id = ${classItem.id}
      and student_id = ${body.studentId}
    limit 1
  `;
  const alreadyJoined = existingRows.length > 0;

  await sql`
    insert into class_students (class_id, student_id, joined_at, status)
    values (${classItem.id}, ${body.studentId}, now(), 'active')
    on conflict (class_id, student_id) do update
    set status = 'active',
        updated_at = now()
  `;

  return json(200, { success: true, alreadyJoined, classItem, class: classItem });
}
