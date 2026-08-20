import { jsonArray } from "./shared.js";

function progressFromRow(row = {}) {
  const expected = Number(row.expected_count || 0);
  const submitted = Number(row.submitted_count || 0);
  return {
    expected,
    submitted,
    missing: Math.max(expected - submitted, 0),
    awaitingReview: Number(row.awaiting_review_count || 0),
    reviewed: Number(row.reviewed_count || 0),
    autoScored: Number(row.auto_scored_count || 0),
    completionPercent: expected ? Math.round((submitted / expected) * 100) : null,
  };
}

function homeworkHeaderToUi(row, progress = {}) {
  return {
    id: row.id,
    kind: "homework",
    teacherId: row.teacher_id,
    title: row.title,
    teacherNotes: row.teacher_notes || "",
    worksheetLinks: jsonArray(row.worksheet_links),
    dueAt: row.due_at || null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    progress: progressFromRow(progress),
  };
}

export function assembleTeacherHomeworks({ headers = [], items = [], assignments = [], progress = [] } = {}) {
  const progressByHomework = new Map(progress.map((row) => [String(row.homework_id), row]));
  return headers.map((header) => {
    const homeworkItems = items
      .filter((item) => String(item.homework_id) === String(header.id))
      .sort((left, right) => Number(left.position) - Number(right.position));
    const homeworkAssignments = assignments.filter((assignment) => String(assignment.homeworkId) === String(header.id));
    const classes = [...new Map(homeworkAssignments
      .filter((assignment) => assignment.classId)
      .map((assignment) => [String(assignment.classId), { id: assignment.classId, name: assignment.className }])).values()];
    return {
      ...homeworkHeaderToUi(header, progressByHomework.get(String(header.id))),
      classes,
      itemCount: homeworkItems.length,
      items: homeworkItems.map((item) => ({
        id: item.id,
        position: Number(item.position),
        targetKind: item.target_kind,
        activityId: item.activity_id,
        nativeReleaseId: item.native_release_id,
        nativeActivityId: item.native_activity_id,
        title: item.title,
        activitySlug: item.activity_slug || null,
        activityType: item.activity_type || null,
        componentTitle: item.component_title || "",
        packageTitle: item.package_title || "",
        assignments: homeworkAssignments.filter((assignment) => String(assignment.homeworkItemId) === String(item.id)),
      })),
    };
  });
}

function studentItemStatus(row) {
  if (row.submission_id) {
    if (row.submission_status === "awaiting_review") return "Awaiting teacher review";
    if (row.submission_status === "reviewed") return "Reviewed";
    if (row.submission_status === "completed") return "Completed";
    return "Automatically graded";
  }
  if (row.status === "closed") return "Closed";
  if (row.due_at && new Date(row.due_at).getTime() <= Date.now()) return "Late";
  return "Assigned";
}

export function assembleStudentHomeworks(rows = []) {
  const homeworks = new Map();
  for (const row of rows) {
    const homeworkKey = String(row.homework_id);
    if (!homeworks.has(homeworkKey)) {
      homeworks.set(homeworkKey, {
        id: row.homework_id,
        kind: "homework",
        title: row.homework_title,
        teacherNotes: row.teacher_notes || "",
        worksheetLinks: jsonArray(row.worksheet_links),
        dueAt: row.due_at || null,
        status: row.homework_status,
        teacherName: row.teacher_name || "",
        classNames: new Set(),
        itemCandidates: new Map(),
      });
    }
    const homework = homeworks.get(homeworkKey);
    if (row.class_name) homework.classNames.add(row.class_name);
    const itemKey = String(row.homework_item_id);
    if (!homework.itemCandidates.has(itemKey)) homework.itemCandidates.set(itemKey, []);
    homework.itemCandidates.get(itemKey).push(row);
  }
  return [...homeworks.values()].map((homework) => {
    const items = [...homework.itemCandidates.values()].map((candidates) => {
      const selected = [...candidates].sort((left, right) => {
        if (Boolean(left.submission_id) !== Boolean(right.submission_id)) return left.submission_id ? -1 : 1;
        return String(left.assignment_id).localeCompare(String(right.assignment_id));
      })[0];
      return {
        id: selected.homework_item_id,
        position: Number(selected.position),
        assignmentId: selected.assignment_id,
        targetKind: selected.target_kind,
        activityId: selected.activity_id,
        nativeReleaseId: selected.native_release_id,
        nativeActivityId: selected.native_activity_id,
        title: selected.activity_title,
        componentTitle: selected.component_title || "",
        packageTitle: selected.package_title || "",
        status: selected.status,
        submissionId: selected.submission_id || null,
        submissionStatus: selected.submission_status || null,
        submittedAt: selected.submitted_at || null,
        scorePercent: selected.score_percent === null || selected.score_percent === undefined
          ? null
          : Number(selected.score_percent),
        completionStatus: studentItemStatus(selected),
      };
    }).sort((left, right) => left.position - right.position);
    const submitted = items.filter((item) => item.submissionId).length;
    const awaitingReview = items.filter((item) => item.submissionStatus === "awaiting_review").length;
    const reviewed = items.filter((item) => item.submissionStatus === "reviewed").length;
    return {
      id: homework.id,
      kind: homework.kind,
      title: homework.title,
      teacherNotes: homework.teacherNotes,
      worksheetLinks: homework.worksheetLinks,
      dueAt: homework.dueAt,
      status: items.length && items.every((item) => item.status === "closed") ? "closed" : homework.status,
      teacherName: homework.teacherName,
      classNames: [...homework.classNames],
      itemCount: items.length,
      items,
      progress: {
        expected: items.length,
        submitted,
        missing: Math.max(items.length - submitted, 0),
        awaitingReview,
        reviewed,
        completionPercent: items.length ? Math.round((submitted / items.length) * 100) : null,
      },
    };
  });
}
