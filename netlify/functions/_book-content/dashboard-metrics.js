import {
  accessiblePackageIds,
  badRequest,
  forbidden,
  isStudent,
  isTeacher,
  json,
} from "./shared.js";

export const dashboardMetricsHeaders = {
  "Cache-Control": "private, no-store",
  "Pragma": "no-cache",
  "Expires": "0",
  "Vary": "Cookie",
  "X-Content-Type-Options": "nosniff",
};

export function withDashboardMetricsHeaders(response) {
  return {
    ...response,
    headers: { ...(response?.headers || {}), ...dashboardMetricsHeaders },
  };
}

function count(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableRoundedScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

export function teacherDashboardPayload(row = {}) {
  return {
    role: "teacher",
    metrics: {
      activeBookPackages: count(row.active_book_packages),
      activeBookComponents: count(row.active_book_components),
      activeClasses: count(row.active_classes),
      activeStudents: count(row.active_students),
      activeAssignments: count(row.active_assignments),
    },
  };
}

export function studentDashboardPayload(row = {}) {
  const classNames = Array.isArray(row.class_names)
    ? [...new Set(row.class_names.filter(Boolean).map(String))]
    : [];
  return {
    role: "student",
    metrics: {
      activeBookPackages: count(row.active_book_packages),
      activeBookComponents: count(row.active_book_components),
      pendingAssignments: count(row.pending_assignments),
      completedAssignments: count(row.completed_assignments),
      scoredAssignments: count(row.scored_assignments),
      averageScore: nullableRoundedScore(row.average_score),
    },
    profile: {
      schoolName: row.school_name || "",
      classNames,
      primaryClassName: row.primary_class_name || null,
      level: row.level || null,
    },
  };
}

export function rejectsDashboardIdentityParameters(query = {}) {
  return ["teacherId", "studentId", "schoolId", "teacher_id", "student_id", "school_id"]
    .some((key) => Object.prototype.hasOwnProperty.call(query, key));
}

async function teacherMetrics(sql, currentUser, packageIds) {
  const rows = await sql`
    with accessible_packages as (
      select unnest(${packageIds}::uuid[]) as id
    ),
    active_classes as (
      select c.id
      from classes c
      where c.teacher_id = ${currentUser.id}
        and c.school_id = ${currentUser.school_id}
        and coalesce(c.status, 'active') = 'active'
    )
    select
      (select count(distinct ap.id) from accessible_packages ap)::int as active_book_packages,
      (
        select count(distinct bc.id)
        from book_components bc
        join accessible_packages ap on ap.id = bc.book_package_id
      )::int as active_book_components,
      (select count(*) from active_classes)::int as active_classes,
      (
        select count(distinct student.id)
        from active_classes owned
        join class_students membership on membership.class_id = owned.id
        join app_users student on student.id = membership.student_id
        where coalesce(membership.status, 'active') = 'active'
          and student.school_id = ${currentUser.school_id}
          and student.role = 'student'
          and student.status = 'active'
      )::int as active_students,
      (
        select count(distinct assignment.id)
        from activity_assignments assignment
        where assignment.teacher_id = ${currentUser.id}
          and assignment.school_id = ${currentUser.school_id}
          and assignment.status = 'assigned'
      )::int as active_assignments
  `;
  return teacherDashboardPayload(rows[0]);
}

async function studentMetrics(sql, currentUser, packageIds) {
  const rows = await sql`
    with accessible_packages as (
      select unnest(${packageIds}::uuid[]) as id
    ),
    active_student_classes as (
      select c.id, c.name, c.level, c.created_at
      from class_students membership
      join classes c on c.id = membership.class_id
      where membership.student_id = ${currentUser.id}
        and coalesce(membership.status, 'active') = 'active'
        and coalesce(c.status, 'active') = 'active'
        and c.school_id = ${currentUser.school_id}
    ),
    distinct_class_names as (
      select distinct on (name) name, level, created_at, id::text as id
      from active_student_classes
      order by name, created_at, id
    ),
    ordered_classes as (
      select name, level, row_number() over (order by lower(name), name, created_at, id) as position
      from distinct_class_names
    ),
    visible_assignments as (
      select distinct assignment.id, assignment.status
      from activity_assignments assignment
      where assignment.school_id = ${currentUser.school_id}
        and (
          assignment.student_id = ${currentUser.id}
          or assignment.class_id in (select id from active_student_classes)
        )
    ),
    ranked_submissions as (
      select submission.activity_assignment_id, submission.score_percent,
             row_number() over (
               partition by submission.activity_assignment_id
               order by submission.submitted_at desc, submission.id desc
             ) as position
      from activity_submissions submission
      join visible_assignments visible on visible.id = submission.activity_assignment_id
      where submission.student_id = ${currentUser.id}
        and submission.school_id = ${currentUser.school_id}
    ),
    latest_submissions as (
      select activity_assignment_id, score_percent
      from ranked_submissions
      where position = 1
    )
    select
      (select count(distinct ap.id) from accessible_packages ap)::int as active_book_packages,
      (
        select count(distinct bc.id)
        from book_components bc
        join accessible_packages ap on ap.id = bc.book_package_id
      )::int as active_book_components,
      (
        select count(*)
        from visible_assignments visible
        where visible.status = 'assigned'
          and not exists (
            select 1 from ranked_submissions submission
            where submission.activity_assignment_id = visible.id
          )
      )::int as pending_assignments,
      (
        select count(*)
        from visible_assignments visible
        where exists (
          select 1 from ranked_submissions submission
          where submission.activity_assignment_id = visible.id
        )
      )::int as completed_assignments,
      (select count(*) from latest_submissions where score_percent is not null)::int as scored_assignments,
      (select round(avg(score_percent)) from latest_submissions where score_percent is not null) as average_score,
      (select name from schools where id = ${currentUser.school_id} limit 1) as school_name,
      coalesce((select array_agg(name order by position) from ordered_classes), array[]::text[]) as class_names,
      (select name from ordered_classes where position = 1) as primary_class_name,
      coalesce(
        (select level from ordered_classes where position = 1),
        (select level from app_users where id = ${currentUser.id} limit 1)
      ) as level
  `;
  return studentDashboardPayload(rows[0]);
}

export async function getDashboardMetrics(sql, currentUser, query = {}) {
  if (!isTeacher(currentUser) && !isStudent(currentUser)) {
    return withDashboardMetricsHeaders(forbidden("Dashboard metrics are available only to teacher and student accounts"));
  }
  if (rejectsDashboardIdentityParameters(query)) {
    return withDashboardMetricsHeaders(badRequest("Dashboard metrics use the authenticated session identity"));
  }

  const packageIds = await accessiblePackageIds(sql, currentUser);
  const payload = isTeacher(currentUser)
    ? await teacherMetrics(sql, currentUser, packageIds)
    : await studentMetrics(sql, currentUser, packageIds);
  return withDashboardMetricsHeaders(json(200, payload));
}
