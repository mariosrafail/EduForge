import { forbidden } from "./_auth-utils.js";

export function isAdmin(user) {
  return user?.role === "admin";
}

export function isTeacher(user) {
  return user?.role === "teacher";
}

export function isStudent(user) {
  return user?.role === "student";
}

export function sameSchool(user, schoolId) {
  return Boolean(user?.school_id && schoolId && String(user.school_id) === String(schoolId));
}

export function requireResourceRole(user, allowedRoles) {
  return user && allowedRoles.includes(user.role) ? null : forbidden();
}

export function canEditOwnedContent(user, resource) {
  if (!user || !resource || !sameSchool(user, resource.school_id)) return false;
  if (isAdmin(user)) return true;
  return isTeacher(user)
    && resource.ownership_type === "custom"
    && String(resource.created_by || "") === String(user.id);
}

export async function accessibleLessonIdsForStudent(sql, user, { courseId = null, lessonId = null } = {}) {
  if (!isStudent(user) || !user.id || !user.school_id) return [];
  const rows = await sql`
    with lesson_scope as (
      select l.id,
             coalesce(l.school_id, c.school_id) as lesson_school_id,
             coalesce(c.book_package_id, bc.book_package_id) as book_package_id
      from lessons l
      left join courses c on c.id = l.course_id
      left join units u on u.id = l.unit_id
      left join book_components bc on bc.id = u.book_component_id
      where (${courseId}::uuid is null or l.course_id = ${courseId})
        and (${lessonId}::uuid is null or l.id = ${lessonId})
    )
    select distinct ls.id
    from lesson_scope ls
    where (ls.lesson_school_id is null or ls.lesson_school_id = ${user.school_id})
      and (
        (ls.book_package_id is not null and exists (
          select 1 from book_access ba
          where ba.user_id = ${user.id} and ba.book_package_id = ls.book_package_id
        ))
        or (ls.book_package_id is not null and exists (
          select 1
          from class_students cs
          join classes cl on cl.id = cs.class_id
          where cs.student_id = ${user.id}
            and coalesce(cs.status, 'active') = 'active'
            and coalesce(cl.status, 'active') = 'active'
            and cl.school_id = ${user.school_id}
            and cl.book_package_id = ls.book_package_id
        ))
        or exists (
          select 1
          from lesson_assignments la
          left join class_students cs
            on cs.class_id = la.class_id
           and cs.student_id = ${user.id}
           and coalesce(cs.status, 'active') = 'active'
          left join classes cl on cl.id = la.class_id
          where la.lesson_id = ls.id
            and la.school_id = ${user.school_id}
            and la.status = 'assigned'
            and (la.student_id = ${user.id} or (
              cs.id is not null and coalesce(cl.status, 'active') = 'active' and cl.school_id = ${user.school_id}
            ))
        )
        or exists (
          select 1
          from activity_assignments aa
          join activities a on a.id = aa.activity_id
          left join class_students cs
            on cs.class_id = aa.class_id
           and cs.student_id = ${user.id}
           and coalesce(cs.status, 'active') = 'active'
          left join classes cl on cl.id = aa.class_id
          where a.lesson_id = ls.id
            and aa.school_id = ${user.school_id}
            and aa.status = 'assigned'
            and (aa.student_id = ${user.id} or (
              cs.id is not null and coalesce(cl.status, 'active') = 'active' and cl.school_id = ${user.school_id}
            ))
        )
      )
  `;
  return rows.map((row) => String(row.id));
}

export async function studentCanAccessLesson(sql, user, lessonId) {
  const ids = await accessibleLessonIdsForStudent(sql, user, { lessonId });
  return ids.includes(String(lessonId));
}

export async function studentCanAccessCourse(sql, user, courseId) {
  return (await accessibleLessonIdsForStudent(sql, user, { courseId })).length > 0;
}
