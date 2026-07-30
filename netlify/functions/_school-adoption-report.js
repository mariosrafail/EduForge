function integer(value) {
  return Number.parseInt(value ?? 0, 10) || 0;
}

function score(value) {
  return value === null || value === undefined ? null : integer(value);
}

function timestamp(value) {
  return value ? new Date(value).toISOString() : null;
}

export async function loadSchoolAdoptionSummary(sql, schoolId) {
  const rows = await sql`
    with code_metrics as (
      select book_package_id,
        count(*)::int codes_generated,
        count(*) filter (where status='redeemed')::int codes_redeemed,
        count(*) filter (where status='unused')::int codes_unused,
        count(*) filter (where status='expired')::int codes_expired,
        count(*) filter (where status='revoked')::int codes_revoked
      from activation_codes
      where school_id=${schoolId}
      group by book_package_id
    ), entitlement_metrics as (
      select ba.book_package_id,
        count(distinct ba.user_id) filter (where ba.role_scope='student' and u.role='student')::int active_student_entitlements,
        count(distinct ba.user_id) filter (where ba.role_scope='teacher' and u.role='teacher')::int active_teacher_entitlements
      from book_access ba
      join app_users u on u.id=ba.user_id
        and u.school_id=${schoolId}
        and u.status='active'
      join book_packages bp on bp.id=ba.book_package_id and bp.status='active'
      where u.school_id=${schoolId}
        and ba.role_scope in ('student','teacher')
      group by ba.book_package_id
    ), assignment_scope as (
      select aa.id,aa.status,bp.id package_id
      from activity_assignments aa
      join activities a on a.id=aa.activity_id
      join lessons l on l.id=a.lesson_id
      join units u on u.id=l.unit_id
      join book_components bc on bc.id=u.book_component_id
      join book_packages bp on bp.id=bc.book_package_id and bp.status='active'
      where aa.school_id=${schoolId}
    ), assignment_metrics as (
      select package_id,
        count(distinct id) filter (where status='assigned')::int active_assignments,
        count(distinct id)::int assignment_signals
      from assignment_scope
      group by package_id
    ), latest_submissions as (
      select distinct on (s.activity_assignment_id,s.student_id)
        a.package_id,s.activity_assignment_id,s.student_id,s.score_percent,s.submitted_at,s.id
      from activity_submissions s
      join assignment_scope a on a.id=s.activity_assignment_id
      join app_users student on student.id=s.student_id
        and student.school_id=${schoolId}
        and student.role='student'
      where s.school_id=${schoolId}
      order by s.activity_assignment_id,s.student_id,s.submitted_at desc,s.id desc
    ), submission_metrics as (
      select package_id,
        count(*)::int unique_submitted_assignments,
        count(distinct student_id)::int unique_students_submitted,
        count(*) filter (where score_percent is not null)::int scored_submissions,
        case when count(score_percent)=0 then null
          else greatest(0,least(100,round(avg(score_percent))))::int end average_score_percent,
        max(submitted_at) last_submission_at
      from latest_submissions
      group by package_id
    ), package_signals as (
      select book_package_id package_id from code_metrics
      union
      select book_package_id from entitlement_metrics
      union
      select package_id from assignment_metrics
      union
      select package_id from submission_metrics
    ), exportable_packages as (
      select distinct bp.id
      from package_signals signal
      join book_packages bp on bp.id=signal.package_id and bp.status='active'
    )
    select school.name school_name,
      (select count(*)::int from exportable_packages) package_count,
      (select coalesce(sum(codes_generated),0)::int from code_metrics) generated_codes,
      (select coalesce(sum(codes_redeemed),0)::int from code_metrics) redeemed_codes,
      (select coalesce(sum(codes_unused),0)::int from code_metrics) unused_codes,
      (select coalesce(sum(codes_expired),0)::int from code_metrics) expired_codes,
      (select coalesce(sum(codes_revoked),0)::int from code_metrics) revoked_codes,
      (select coalesce(sum(active_student_entitlements),0)::int from entitlement_metrics) active_student_entitlements,
      (select coalesce(sum(active_teacher_entitlements),0)::int from entitlement_metrics) active_teacher_entitlements,
      (select coalesce(sum(active_assignments),0)::int from assignment_metrics) active_assignments,
      (select count(*)::int from latest_submissions) unique_submitted_assignments,
      (select count(distinct student_id)::int from latest_submissions) unique_students_submitted,
      (select count(*)::int from latest_submissions where score_percent is not null) scored_submissions,
      (select case when count(score_percent)=0 then null
        else greatest(0,least(100,round(avg(score_percent))))::int end
       from latest_submissions) average_score_percent,
      (select max(submitted_at) from latest_submissions) last_submission_at
    from schools school
    where school.id=${schoolId}
    limit 1
  `;
  if (!rows[0]) return null;
  const row = rows[0];
  return {
    school: { name: row.school_name },
    summary: {
      packageCount: integer(row.package_count),
      generatedCodes: integer(row.generated_codes),
      redeemedCodes: integer(row.redeemed_codes),
      unusedCodes: integer(row.unused_codes),
      expiredCodes: integer(row.expired_codes),
      revokedCodes: integer(row.revoked_codes),
      activeStudentEntitlements: integer(row.active_student_entitlements),
      activeTeacherEntitlements: integer(row.active_teacher_entitlements),
      activeAssignments: integer(row.active_assignments),
      uniqueSubmittedAssignments: integer(row.unique_submitted_assignments),
      uniqueStudentsSubmitted: integer(row.unique_students_submitted),
      scoredSubmissions: integer(row.scored_submissions),
      averageScorePercent: score(row.average_score_percent),
      lastSubmissionAt: timestamp(row.last_submission_at),
      hasExportableData: integer(row.package_count) > 0,
    },
  };
}

export async function loadSchoolAdoptionRows(sql, schoolId) {
  const rows = await sql`
    with code_metrics as (
      select book_package_id,
        count(*)::int codes_generated,
        count(*) filter (where status='redeemed')::int codes_redeemed,
        count(*) filter (where status='unused')::int codes_unused,
        count(*) filter (where status='expired')::int codes_expired,
        count(*) filter (where status='revoked')::int codes_revoked
      from activation_codes
      where school_id=${schoolId}
      group by book_package_id
    ), entitlement_metrics as (
      select ba.book_package_id,
        count(distinct ba.user_id) filter (where ba.role_scope='student' and u.role='student')::int active_student_entitlements,
        count(distinct ba.user_id) filter (where ba.role_scope='teacher' and u.role='teacher')::int active_teacher_entitlements
      from book_access ba
      join app_users u on u.id=ba.user_id
        and u.school_id=${schoolId}
        and u.status='active'
      join book_packages bp on bp.id=ba.book_package_id and bp.status='active'
      where u.school_id=${schoolId}
        and ba.role_scope in ('student','teacher')
      group by ba.book_package_id
    ), assignment_scope as (
      select aa.id,aa.status,bp.id package_id
      from activity_assignments aa
      join activities a on a.id=aa.activity_id
      join lessons l on l.id=a.lesson_id
      join units u on u.id=l.unit_id
      join book_components bc on bc.id=u.book_component_id
      join book_packages bp on bp.id=bc.book_package_id and bp.status='active'
      where aa.school_id=${schoolId}
    ), assignment_metrics as (
      select package_id,
        count(distinct id) filter (where status='assigned')::int active_assignments,
        count(distinct id)::int assignment_signals
      from assignment_scope
      group by package_id
    ), latest_submissions as (
      select distinct on (s.activity_assignment_id,s.student_id)
        a.package_id,s.activity_assignment_id,s.student_id,s.score_percent,s.submitted_at,s.id
      from activity_submissions s
      join assignment_scope a on a.id=s.activity_assignment_id
      join app_users student on student.id=s.student_id
        and student.school_id=${schoolId}
        and student.role='student'
      where s.school_id=${schoolId}
      order by s.activity_assignment_id,s.student_id,s.submitted_at desc,s.id desc
    ), submission_metrics as (
      select package_id,
        count(*)::int unique_submitted_assignments,
        count(distinct student_id)::int unique_students_submitted,
        count(*) filter (where score_percent is not null)::int scored_submissions,
        case when count(score_percent)=0 then null
          else greatest(0,least(100,round(avg(score_percent))))::int end average_score_percent,
        max(submitted_at) last_submission_at
      from latest_submissions
      group by package_id
    ), package_signals as (
      select book_package_id package_id from code_metrics
      union
      select book_package_id from entitlement_metrics
      union
      select package_id from assignment_metrics
      union
      select package_id from submission_metrics
    )
    select school.name school_name,publisher.name publisher_name,
      bp.title package_title,bp.slug package_slug,bp.level,
      coalesce(c.codes_generated,0)::int codes_generated,
      coalesce(c.codes_redeemed,0)::int codes_redeemed,
      coalesce(c.codes_unused,0)::int codes_unused,
      coalesce(c.codes_expired,0)::int codes_expired,
      coalesce(c.codes_revoked,0)::int codes_revoked,
      coalesce(e.active_student_entitlements,0)::int active_student_entitlements,
      coalesce(e.active_teacher_entitlements,0)::int active_teacher_entitlements,
      coalesce(a.active_assignments,0)::int active_assignments,
      coalesce(s.unique_submitted_assignments,0)::int unique_submitted_assignments,
      coalesce(s.unique_students_submitted,0)::int unique_students_submitted,
      coalesce(s.scored_submissions,0)::int scored_submissions,
      s.average_score_percent,s.last_submission_at
    from package_signals signal
    join book_packages bp on bp.id=signal.package_id and bp.status='active'
    join publishers publisher on publisher.id=bp.publisher_id
    join schools school on school.id=${schoolId}
    left join code_metrics c on c.book_package_id=bp.id
    left join entitlement_metrics e on e.book_package_id=bp.id
    left join assignment_metrics a on a.package_id=bp.id
    left join submission_metrics s on s.package_id=bp.id
    order by publisher.name,bp.title,bp.slug
  `;
  return rows.map((row) => ({
    schoolName: row.school_name,
    publisherName: row.publisher_name,
    packageTitle: row.package_title,
    packageSlug: row.package_slug,
    level: row.level,
    codesGenerated: integer(row.codes_generated),
    codesRedeemed: integer(row.codes_redeemed),
    codesUnused: integer(row.codes_unused),
    codesExpired: integer(row.codes_expired),
    codesRevoked: integer(row.codes_revoked),
    activeStudentEntitlements: integer(row.active_student_entitlements),
    activeTeacherEntitlements: integer(row.active_teacher_entitlements),
    activeAssignments: integer(row.active_assignments),
    uniqueSubmittedAssignments: integer(row.unique_submitted_assignments),
    uniqueStudentsSubmitted: integer(row.unique_students_submitted),
    scoredSubmissions: integer(row.scored_submissions),
    averageScorePercent: score(row.average_score_percent),
    lastSubmissionAt: timestamp(row.last_submission_at),
  }));
}

export async function recordSchoolAdoptionExport(sql, currentUser, rows) {
  const totals = rows.reduce((sum, row) => ({
    generatedCodes: sum.generatedCodes + row.codesGenerated,
    activeAssignments: sum.activeAssignments + row.activeAssignments,
    submittedPairs: sum.submittedPairs + row.uniqueSubmittedAssignments,
  }), { generatedCodes: 0, activeAssignments: 0, submittedPairs: 0 });
  await sql`
    insert into account_security_events(user_id,actor_user_id,school_id,event_type,metadata)
    values (
      ${currentUser.id},${currentUser.id},${currentUser.school_id},'school_adoption_exported',
      jsonb_build_object(
        'package_count',${rows.length}::int,
        'exported_row_count',${rows.length}::int,
        'generated_code_count',${totals.generatedCodes}::int,
        'active_assignment_count',${totals.activeAssignments}::int,
        'latest_submission_pair_count',${totals.submittedPairs}::int
      )
    )
  `;
}
