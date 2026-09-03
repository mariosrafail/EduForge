import {
  badRequest,
  isTeacher,
  isValidUuid,
  json,
} from "./shared.js";
import { withDashboardMetricsHeaders } from "./dashboard-metrics.js";

export const TEACHER_ANALYTICS_SCORE_BANDS = Object.freeze([
  Object.freeze({ id: "excellent", label: "Excellent", minimum: 85, maximum: 100 }),
  Object.freeze({ id: "good", label: "Good", minimum: 70, maximum: 84.99 }),
  Object.freeze({ id: "developing", label: "Developing", minimum: 50, maximum: 69.99 }),
  Object.freeze({ id: "needs-support", label: "Needs support", minimum: 0, maximum: 49.99 }),
]);

const allowedStatuses = new Set(["all", "assigned", "closed"]);
const allowedWindows = new Map([
  ["all", null],
  ["30d", 30],
  ["90d", 90],
]);
const rejectedIdentityKeys = new Set(["teacherId", "studentId", "schoolId", "teacher_id", "student_id", "school_id"]);

function count(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function roundAnalyticsMetric(value, digits = 1) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const factor = 10 ** digits;
  return Math.round((numeric + Number.EPSILON) * factor) / factor;
}

export function scoreBandFor(score) {
  if (score === null || score === undefined || score === "") return null;
  const numeric = Number(score);
  if (!Number.isFinite(numeric)) return null;
  return TEACHER_ANALYTICS_SCORE_BANDS.find((band) => numeric >= band.minimum && numeric <= band.maximum) || null;
}

export function normalizeTeacherAnalyticsOverview(row = {}) {
  return {
    assignedSlots: count(row.assigned_slots),
    submitted: count(row.submitted),
    missing: count(row.missing),
    completionRate: roundAnalyticsMetric(row.completion_rate),
    scoredCount: count(row.scored_count),
    averageScore: roundAnalyticsMetric(row.average_score),
    medianScore: roundAnalyticsMetric(row.median_score),
    highestScore: roundAnalyticsMetric(row.highest_score),
    lowestScore: roundAnalyticsMetric(row.lowest_score),
    awaitingReview: count(row.awaiting_review),
    reviewed: count(row.reviewed),
    autoScored: count(row.auto_scored),
    completed: count(row.completed),
    unscoredCount: count(row.unscored_count),
    recentGradedCount: count(row.recent_graded_count),
  };
}

export function buildScoreBands(row = {}) {
  return TEACHER_ANALYTICS_SCORE_BANDS.map((band) => ({
    ...band,
    count: count(row[band.id === "needs-support" ? "needs_support" : band.id]),
  }));
}

function analyticsFilters(query = {}) {
  const suppliedIdentity = Object.keys(query).find((key) => rejectedIdentityKeys.has(key));
  if (suppliedIdentity) return { error: "Teacher grade analytics use the authenticated session identity" };
  const ids = {
    classId: String(query.classId || "").trim() || null,
    assignmentId: String(query.assignmentId || "").trim() || null,
    packageId: String(query.packageId || "").trim() || null,
    componentId: String(query.componentId || "").trim() || null,
  };
  const invalid = Object.entries(ids).find(([, value]) => value && !isValidUuid(value));
  if (invalid) return { error: `${invalid[0]} must be a valid UUID` };
  const status = String(query.status || "all");
  if (!allowedStatuses.has(status)) return { error: "status must be all, assigned, or closed" };
  const window = String(query.window || "all");
  if (!allowedWindows.has(window)) return { error: "window must be all, 30d, or 90d" };
  const days = allowedWindows.get(window);
  return {
    value: {
      ...ids,
      status,
      window,
      cutoff: days ? new Date(Date.now() - days * 86_400_000).toISOString() : null,
    },
  };
}

function analyticsNotFound() {
  return withDashboardMetricsHeaders(json(404, { error: "Analytics filter not found" }));
}

function filterOptions(classRows, assignmentRows) {
  const packages = new Map();
  const components = new Map();
  for (const row of assignmentRows) {
    if (row.package_id) packages.set(String(row.package_id), { id: row.package_id, label: row.package_title || "Untitled book" });
    if (row.component_id) components.set(String(row.component_id), {
      id: row.component_id,
      label: row.component_title || "Untitled component",
      packageId: row.package_id || null,
    });
  }
  return {
    classes: classRows.map((row) => ({ id: row.id, label: row.name })),
    assignments: assignmentRows.map((row) => ({
      id: row.id,
      label: row.title || "Untitled assignment",
      classId: row.class_id || null,
      status: row.status || "assigned",
      packageId: row.package_id || null,
      componentId: row.component_id || null,
    })),
    packages: [...packages.values()],
    components: [...components.values()],
    statuses: [
      { id: "all", label: "All statuses" },
      { id: "assigned", label: "Open" },
      { id: "closed", label: "Closed" },
    ],
    windows: [
      { id: "all", label: "All time" },
      { id: "30d", label: "Last 30 days" },
      { id: "90d", label: "Last 90 days" },
    ],
  };
}

function validateAccessibleFilters(filters, options) {
  const checks = [
    ["classId", "classes"],
    ["assignmentId", "assignments"],
    ["packageId", "packages"],
    ["componentId", "components"],
  ];
  return checks.every(([filterKey, optionKey]) => !filters[filterKey]
    || options[optionKey].some((option) => String(option.id) === String(filters[filterKey])));
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export function normalizeTeacherAnalyticsStudents(rows = []) {
  const students = rows.map((row) => ({
    studentId: row.student_id,
    name: row.full_name || "Unnamed student",
    email: row.email || "",
    className: row.class_names || "Individual",
    assigned: count(row.assigned),
    submitted: count(row.submitted),
    missing: count(row.missing),
    completionRate: roundAnalyticsMetric(row.completion_rate),
    scoredCount: count(row.scored_count),
    averageScore: roundAnalyticsMetric(row.average_score),
    latestScore: roundAnalyticsMetric(row.latest_score),
    latestStatus: row.latest_status || "missing",
    latestSubmittedAt: row.latest_submitted_at || null,
    overdueMissing: count(row.overdue_missing),
    awaitingReview: count(row.awaiting_review),
  }));
  const scoredAverages = students.map((student) => student.averageScore).filter((score) => score !== null);
  const lowerQuartile = percentile(scoredAverages, 0.25);
  const attention = students.flatMap((student) => {
    const reasons = [];
    if (student.overdueMissing > 0) reasons.push(`${student.overdueMissing} overdue or closed item${student.overdueMissing === 1 ? "" : "s"} missing`);
    if (student.assigned > 0 && student.submitted === 0) reasons.push("No submitted work yet");
    if (scoredAverages.length >= 4 && student.averageScore !== null && student.averageScore <= lowerQuartile) reasons.push("In the selected group’s bottom scored quartile");
    return reasons.length ? [{ studentId: student.studentId, name: student.name, reasons }] : [];
  });
  return { students, attention };
}

function baseParameters(filters, currentUser) {
  return {
    teacherId: currentUser.id,
    schoolId: currentUser.school_id,
    classId: filters.classId,
    assignmentId: filters.assignmentId,
    packageId: filters.packageId,
    componentId: filters.componentId,
    status: filters.status === "all" ? null : filters.status,
    cutoff: filters.cutoff,
  };
}

async function loadOptions(sql, currentUser) {
  const [classes, assignments] = await Promise.all([
    sql`
      select c.id, c.name
      from classes c
      where c.teacher_id = ${currentUser.id}
        and c.school_id = ${currentUser.school_id}
        and coalesce(c.status, 'active') = 'active'
      order by lower(c.name), c.id
    `,
    sql`
      select assignment.id, assignment.title, assignment.class_id, assignment.status,
             coalesce(component.id, native_component.id) as component_id,
             coalesce(component.title, native_component.title) as component_title,
             coalesce(package.id, native_package.id) as package_id,
             coalesce(package.title, native_package.title) as package_title
      from activity_assignments assignment
      left join activities activity on activity.id = assignment.activity_id
      left join lessons lesson on lesson.id = activity.lesson_id
      left join units unit_item on unit_item.id = lesson.unit_id
      left join book_components component on component.id = unit_item.book_component_id
      left join book_packages package on package.id = component.book_package_id
      left join book_component_releases native_release on native_release.id = assignment.native_release_id
      left join book_components native_component on native_component.id = native_release.book_component_id
      left join book_packages native_package on native_package.id = native_release.book_package_id
      where assignment.teacher_id = ${currentUser.id}
        and assignment.school_id = ${currentUser.school_id}
      order by assignment.assigned_at desc, assignment.id
    `,
  ]);
  return filterOptions(classes, assignments);
}

async function loadOverview(sql, parameters) {
  const rows = await sql`
    with scoped_assignments as (
      select assignment.id, assignment.class_id, assignment.student_id, assignment.due_at, assignment.status,
             coalesce(component.id, native_component.id) as component_id,
             coalesce(package.id, native_package.id) as package_id
      from activity_assignments assignment
      left join activities activity on activity.id = assignment.activity_id
      left join lessons lesson on lesson.id = activity.lesson_id
      left join units unit_item on unit_item.id = lesson.unit_id
      left join book_components component on component.id = unit_item.book_component_id
      left join book_packages package on package.id = component.book_package_id
      left join book_component_releases native_release on native_release.id = assignment.native_release_id
      left join book_components native_component on native_component.id = native_release.book_component_id
      left join book_packages native_package on native_package.id = native_release.book_package_id
      where assignment.teacher_id = ${parameters.teacherId}
        and assignment.school_id = ${parameters.schoolId}
        and (${parameters.classId}::uuid is null or assignment.class_id = ${parameters.classId})
        and (${parameters.assignmentId}::uuid is null or assignment.id = ${parameters.assignmentId})
        and (${parameters.packageId}::uuid is null or coalesce(package.id, native_package.id) = ${parameters.packageId})
        and (${parameters.componentId}::uuid is null or coalesce(component.id, native_component.id) = ${parameters.componentId})
        and (${parameters.status}::text is null or assignment.status = ${parameters.status})
        and (${parameters.cutoff}::timestamptz is null or assignment.assigned_at >= ${parameters.cutoff})
    ), assignment_slots as (
      select assignment.id as assignment_id, assignment.due_at, assignment.status as assignment_status, student.id as student_id
      from scoped_assignments assignment
      join class_students membership on membership.class_id = assignment.class_id and coalesce(membership.status, 'active') = 'active'
      join app_users student on student.id = membership.student_id and student.school_id = ${parameters.schoolId} and student.role = 'student' and student.status = 'active'
      where assignment.class_id is not null
      union all
      select assignment.id, assignment.due_at, assignment.status, student.id
      from scoped_assignments assignment
      join app_users student on student.id = assignment.student_id and student.school_id = ${parameters.schoolId} and student.role = 'student' and student.status = 'active'
      where assignment.student_id is not null
    ), ranked_submissions as (
      select submission.*, row_number() over (partition by submission.activity_assignment_id, submission.student_id order by submission.submitted_at desc, submission.id desc) as position
      from activity_submissions submission
      join scoped_assignments assignment on assignment.id = submission.activity_assignment_id
      where submission.school_id = ${parameters.schoolId}
    ), slot_results as (
      select slot.*, submission.id as submission_id, submission.status as submission_status,
             submission.score_percent, submission.submitted_at
      from assignment_slots slot
      left join ranked_submissions submission on submission.activity_assignment_id = slot.assignment_id
        and submission.student_id = slot.student_id and submission.position = 1
    )
    select count(*)::int as assigned_slots,
           count(submission_id)::int as submitted,
           count(*) filter (where submission_id is null)::int as missing,
           case when count(*) = 0 then 0 else round(count(submission_id)::numeric * 100 / count(*), 1) end as completion_rate,
           count(score_percent)::int as scored_count,
           round(avg(score_percent) filter (where score_percent is not null), 1) as average_score,
           round((percentile_cont(0.5) within group (order by score_percent) filter (where score_percent is not null))::numeric, 1) as median_score,
           max(score_percent) filter (where score_percent is not null) as highest_score,
           min(score_percent) filter (where score_percent is not null) as lowest_score,
           count(*) filter (where submission_status = 'awaiting_review')::int as awaiting_review,
           count(*) filter (where submission_status = 'reviewed')::int as reviewed,
           count(*) filter (where submission_status = 'submitted')::int as auto_scored,
           count(*) filter (where submission_status = 'completed')::int as completed,
           count(*) filter (where submission_id is not null and score_percent is null)::int as unscored_count,
           count(*) filter (where score_percent is not null and submitted_at >= now() - interval '30 days')::int as recent_graded_count,
           count(*) filter (where score_percent >= 85)::int as excellent,
           count(*) filter (where score_percent >= 70 and score_percent < 85)::int as good,
           count(*) filter (where score_percent >= 50 and score_percent < 70)::int as developing,
           count(*) filter (where score_percent < 50)::int as needs_support
    from slot_results
  `;
  return rows[0] || {};
}

async function loadStudents(sql, parameters) {
  return sql`
    with scoped_assignments as (
      select assignment.id, assignment.class_id, assignment.student_id, assignment.due_at, assignment.status,
             coalesce(component.id, native_component.id) as component_id,
             coalesce(package.id, native_package.id) as package_id
      from activity_assignments assignment
      left join activities activity on activity.id = assignment.activity_id
      left join lessons lesson on lesson.id = activity.lesson_id
      left join units unit_item on unit_item.id = lesson.unit_id
      left join book_components component on component.id = unit_item.book_component_id
      left join book_packages package on package.id = component.book_package_id
      left join book_component_releases native_release on native_release.id = assignment.native_release_id
      left join book_components native_component on native_component.id = native_release.book_component_id
      left join book_packages native_package on native_package.id = native_release.book_package_id
      where assignment.teacher_id = ${parameters.teacherId} and assignment.school_id = ${parameters.schoolId}
        and (${parameters.classId}::uuid is null or assignment.class_id = ${parameters.classId})
        and (${parameters.assignmentId}::uuid is null or assignment.id = ${parameters.assignmentId})
        and (${parameters.packageId}::uuid is null or coalesce(package.id, native_package.id) = ${parameters.packageId})
        and (${parameters.componentId}::uuid is null or coalesce(component.id, native_component.id) = ${parameters.componentId})
        and (${parameters.status}::text is null or assignment.status = ${parameters.status})
        and (${parameters.cutoff}::timestamptz is null or assignment.assigned_at >= ${parameters.cutoff})
    ), assignment_slots as (
      select assignment.id as assignment_id, assignment.due_at, assignment.status as assignment_status,
             student.id as student_id, student.full_name, student.email, class_item.name as class_name
      from scoped_assignments assignment
      join classes class_item on class_item.id = assignment.class_id and class_item.school_id = ${parameters.schoolId} and class_item.teacher_id = ${parameters.teacherId}
      join class_students membership on membership.class_id = class_item.id and coalesce(membership.status, 'active') = 'active'
      join app_users student on student.id = membership.student_id and student.school_id = ${parameters.schoolId} and student.role = 'student' and student.status = 'active'
      where assignment.class_id is not null
      union all
      select assignment.id, assignment.due_at, assignment.status, student.id, student.full_name, student.email, 'Individual'
      from scoped_assignments assignment
      join app_users student on student.id = assignment.student_id and student.school_id = ${parameters.schoolId} and student.role = 'student' and student.status = 'active'
      where assignment.student_id is not null
    ), ranked_submissions as (
      select submission.*, row_number() over (partition by submission.activity_assignment_id, submission.student_id order by submission.submitted_at desc, submission.id desc) as position
      from activity_submissions submission
      join scoped_assignments assignment on assignment.id = submission.activity_assignment_id
      where submission.school_id = ${parameters.schoolId}
    ), slot_results as (
      select slot.*, submission.id as submission_id, submission.status as submission_status,
             submission.score_percent, submission.submitted_at
      from assignment_slots slot
      left join ranked_submissions submission on submission.activity_assignment_id = slot.assignment_id
        and submission.student_id = slot.student_id and submission.position = 1
    )
    select student_id, max(full_name) as full_name, max(email) as email,
           string_agg(distinct class_name, ', ' order by class_name) as class_names,
           count(*)::int as assigned, count(submission_id)::int as submitted,
           count(*) filter (where submission_id is null)::int as missing,
           case when count(*) = 0 then 0 else round(count(submission_id)::numeric * 100 / count(*), 1) end as completion_rate,
           count(score_percent)::int as scored_count,
           round(avg(score_percent) filter (where score_percent is not null), 1) as average_score,
           (array_agg(score_percent order by submitted_at desc nulls last) filter (where submission_id is not null))[1] as latest_score,
           (array_agg(submission_status order by submitted_at desc nulls last) filter (where submission_id is not null))[1] as latest_status,
           max(submitted_at) as latest_submitted_at,
           count(*) filter (where submission_id is null and (assignment_status = 'closed' or (due_at is not null and due_at <= now())))::int as overdue_missing,
           count(*) filter (where submission_status = 'awaiting_review')::int as awaiting_review
    from slot_results
    group by student_id
    order by lower(max(full_name)), student_id
  `;
}

async function loadTrend(sql, parameters) {
  return sql`
    with scoped_assignments as (
      select assignment.id
      from activity_assignments assignment
      left join activities activity on activity.id = assignment.activity_id
      left join lessons lesson on lesson.id = activity.lesson_id
      left join units unit_item on unit_item.id = lesson.unit_id
      left join book_components component on component.id = unit_item.book_component_id
      left join book_packages package on package.id = component.book_package_id
      left join book_component_releases native_release on native_release.id = assignment.native_release_id
      left join book_components native_component on native_component.id = native_release.book_component_id
      left join book_packages native_package on native_package.id = native_release.book_package_id
      where assignment.teacher_id = ${parameters.teacherId} and assignment.school_id = ${parameters.schoolId}
        and (${parameters.classId}::uuid is null or assignment.class_id = ${parameters.classId})
        and (${parameters.assignmentId}::uuid is null or assignment.id = ${parameters.assignmentId})
        and (${parameters.packageId}::uuid is null or coalesce(package.id, native_package.id) = ${parameters.packageId})
        and (${parameters.componentId}::uuid is null or coalesce(component.id, native_component.id) = ${parameters.componentId})
        and (${parameters.status}::text is null or assignment.status = ${parameters.status})
        and (${parameters.cutoff}::timestamptz is null or assignment.assigned_at >= ${parameters.cutoff})
    ), ranked as (
      select submission.*, row_number() over (partition by submission.activity_assignment_id, submission.student_id order by submission.submitted_at desc, submission.id desc) as position
      from activity_submissions submission join scoped_assignments assignment on assignment.id = submission.activity_assignment_id
      where submission.school_id = ${parameters.schoolId}
    )
    select date_trunc('week', submitted_at)::date as period_start,
           count(*)::int as submitted_count,
           count(score_percent)::int as scored_count,
           round(avg(score_percent) filter (where score_percent is not null), 1) as average_score
    from ranked where position = 1
    group by date_trunc('week', submitted_at)
    order by period_start desc
    limit 12
  `;
}

async function loadRecentAssignments(sql, parameters) {
  return sql`
    with scoped_assignments as (
      select assignment.id, assignment.title, assignment.class_id, assignment.student_id, assignment.due_at, assignment.status, assignment.assigned_at
      from activity_assignments assignment
      left join activities activity on activity.id = assignment.activity_id
      left join lessons lesson on lesson.id = activity.lesson_id
      left join units unit_item on unit_item.id = lesson.unit_id
      left join book_components component on component.id = unit_item.book_component_id
      left join book_packages package on package.id = component.book_package_id
      left join book_component_releases native_release on native_release.id = assignment.native_release_id
      left join book_components native_component on native_component.id = native_release.book_component_id
      left join book_packages native_package on native_package.id = native_release.book_package_id
      where assignment.teacher_id = ${parameters.teacherId} and assignment.school_id = ${parameters.schoolId}
        and (${parameters.classId}::uuid is null or assignment.class_id = ${parameters.classId})
        and (${parameters.assignmentId}::uuid is null or assignment.id = ${parameters.assignmentId})
        and (${parameters.packageId}::uuid is null or coalesce(package.id, native_package.id) = ${parameters.packageId})
        and (${parameters.componentId}::uuid is null or coalesce(component.id, native_component.id) = ${parameters.componentId})
        and (${parameters.status}::text is null or assignment.status = ${parameters.status})
        and (${parameters.cutoff}::timestamptz is null or assignment.assigned_at >= ${parameters.cutoff})
    ), assignment_slots as (
      select assignment.id as assignment_id, student.id as student_id
      from scoped_assignments assignment join class_students membership on membership.class_id = assignment.class_id and coalesce(membership.status, 'active') = 'active'
      join app_users student on student.id = membership.student_id and student.school_id = ${parameters.schoolId} and student.role = 'student' and student.status = 'active'
      where assignment.class_id is not null
      union all
      select assignment.id, student.id from scoped_assignments assignment
      join app_users student on student.id = assignment.student_id and student.school_id = ${parameters.schoolId} and student.role = 'student' and student.status = 'active'
      where assignment.student_id is not null
    ), ranked as (
      select submission.*, row_number() over (partition by submission.activity_assignment_id, submission.student_id order by submission.submitted_at desc, submission.id desc) as position
      from activity_submissions submission join scoped_assignments assignment on assignment.id = submission.activity_assignment_id
      where submission.school_id = ${parameters.schoolId}
    )
    select assignment.id, assignment.title, assignment.assigned_at, assignment.due_at, assignment.status,
           count(slot.student_id)::int as assigned_slots,
           count(submission.id)::int as submitted,
           count(submission.score_percent)::int as scored_count,
           round(avg(submission.score_percent) filter (where submission.score_percent is not null), 1) as average_score,
           count(*) filter (where submission.status = 'awaiting_review')::int as awaiting_review
    from scoped_assignments assignment
    left join assignment_slots slot on slot.assignment_id = assignment.id
    left join ranked submission on submission.activity_assignment_id = assignment.id and submission.student_id = slot.student_id and submission.position = 1
    group by assignment.id, assignment.title, assignment.assigned_at, assignment.due_at, assignment.status
    order by assignment.assigned_at desc, assignment.id
    limit 8
  `;
}

export async function getTeacherGradeAnalytics(sql, currentUser, query = {}) {
  if (!isTeacher(currentUser)) return withDashboardMetricsHeaders(json(403, { error: "Teacher access required" }));
  const parsed = analyticsFilters(query);
  if (parsed.error) return withDashboardMetricsHeaders(badRequest(parsed.error));
  const filters = parsed.value;
  const options = await loadOptions(sql, currentUser);
  if (!validateAccessibleFilters(filters, options)) return analyticsNotFound();
  const parameters = baseParameters(filters, currentUser);
  const [overviewRow, studentRows, trendRows, recentRows] = await Promise.all([
    loadOverview(sql, parameters),
    loadStudents(sql, parameters),
    loadTrend(sql, parameters),
    loadRecentAssignments(sql, parameters),
  ]);
  const overview = normalizeTeacherAnalyticsOverview(overviewRow);
  const { students, attention } = normalizeTeacherAnalyticsStudents(studentRows);
  const trendPoints = [...trendRows].reverse().map((row) => {
    const periodDate = row.period_start instanceof Date ? row.period_start : new Date(`${row.period_start}T00:00:00Z`);
    return {
      periodStart: row.period_start,
      label: periodDate.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" }),
      submitted: count(row.submitted_count),
      scoredCount: count(row.scored_count),
      averageScore: roundAnalyticsMetric(row.average_score),
    };
  });
  return withDashboardMetricsHeaders(json(200, {
    filters: {
      selected: {
        classId: filters.classId,
        assignmentId: filters.assignmentId,
        packageId: filters.packageId,
        componentId: filters.componentId,
        status: filters.status,
        window: filters.window,
      },
      options,
    },
    definitions: {
      denominator: "One slot for each selected assignment and currently active assigned student.",
      scoreStatistics: "Authoritative numeric final scores only; missing and unscored submissions are excluded.",
      rounding: "Percentages and score statistics are rounded to one decimal place.",
      timeWindow: "The time window filters assignments by assigned date.",
      trendGrouping: "Calendar week, based on the latest final submission per student and assignment.",
      scoreBandPolicy: "Presentation descriptors only; these are not pass/fail thresholds.",
      recentGradedCount: "Scored final submissions received in the last 30 days, within the selected assignment scope.",
    },
    overview,
    statusDistribution: [
      { id: "auto-scored", label: "Auto-scored", count: overview.autoScored },
      { id: "reviewed", label: "Teacher reviewed", count: overview.reviewed },
      { id: "awaiting-review", label: "Awaiting review", count: overview.awaitingReview },
      { id: "unscored-completed", label: "Unscored completed", count: overview.completed },
      { id: "missing", label: "Missing", count: overview.missing },
    ],
    scoreBands: buildScoreBands(overviewRow),
    notScored: overview.unscoredCount,
    trend: {
      grouping: "week",
      points: trendPoints,
      insufficientData: trendPoints.length < 2,
    },
    students,
    attention,
    recentAssignments: recentRows.map((row) => ({
      assignmentId: row.id,
      title: row.title || "Untitled assignment",
      assignedAt: row.assigned_at,
      dueAt: row.due_at,
      status: row.status,
      assignedSlots: count(row.assigned_slots),
      submitted: count(row.submitted),
      scoredCount: count(row.scored_count),
      averageScore: roundAnalyticsMetric(row.average_score),
      awaitingReview: count(row.awaiting_review),
    })),
  }));
}
