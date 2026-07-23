import { isAdmin, isStudent, isTeacher } from "./_resource-access.js";

export async function accessiblePackageIds(sql, currentUser) {
  if (!currentUser?.id || !currentUser?.school_id) return [];

  if (isAdmin(currentUser)) {
    const rows = await sql`
      select distinct bp.id
      from book_packages bp
      where bp.status = 'active'
        and (
          exists (
            select 1
            from book_access ba
            join app_users u on u.id = ba.user_id
            where ba.user_id = ${currentUser.id}
              and ba.book_package_id = bp.id
              and ba.role_scope = 'school_admin'
              and u.school_id = ${currentUser.school_id}
              and u.status = 'active'
          )
          or exists (
            select 1
            from classes c
            where c.school_id = ${currentUser.school_id}
              and c.book_package_id = bp.id
              and coalesce(c.status, 'active') = 'active'
          )
          or exists (
            select 1
            from activation_code_batches batch
            where batch.school_id = ${currentUser.school_id}
              and batch.book_package_id = bp.id
          )
        )
    `;
    return rows.map((row) => String(row.id));
  }

  if (isTeacher(currentUser)) {
    const rows = await sql`
      select distinct bp.id
      from book_packages bp
      where bp.status = 'active'
        and (
          exists (
            select 1
            from book_access ba
            join app_users u on u.id = ba.user_id
            where ba.user_id = ${currentUser.id}
              and ba.book_package_id = bp.id
              and ba.role_scope = 'teacher'
              and u.school_id = ${currentUser.school_id}
              and u.status = 'active'
          )
          or exists (
            select 1
            from classes c
            where c.teacher_id = ${currentUser.id}
              and c.school_id = ${currentUser.school_id}
              and c.book_package_id = bp.id
              and coalesce(c.status, 'active') = 'active'
          )
        )
    `;
    return rows.map((row) => String(row.id));
  }

  if (!isStudent(currentUser)) return [];
  const rows = await sql`
    select distinct bp.id
    from book_packages bp
    join book_access ba on ba.book_package_id = bp.id
    join app_users u on u.id = ba.user_id
    where bp.status = 'active'
      and ba.user_id = ${currentUser.id}
      and ba.role_scope = 'student'
      and u.school_id = ${currentUser.school_id}
      and u.status = 'active'
  `;
  return rows.map((row) => String(row.id));
}

export async function canAccessBookPackage(sql, currentUser, { packageId = null, packageSlug = null } = {}) {
  const rows = packageId
    ? await sql`select id from book_packages where id = ${packageId} and status = 'active' limit 1`
    : await sql`select id from book_packages where slug = ${packageSlug} and status = 'active' limit 1`;
  const resolvedId = rows[0]?.id;
  if (!resolvedId) return false;
  return (await accessiblePackageIds(sql, currentUser)).includes(String(resolvedId));
}
