function activityMode(assignment = {}) {
  const activity = assignment.activity || assignment.dbActivity || {};
  return activity.contentJson?.implementationMode
    || activity.content_json?.implementationMode
    || activity.implementationMode
    || "auto-scored";
}

export function deriveStudentAssignmentPresentation(assignment = {}, now = Date.now()) {
  const status = assignment.submissionStatus || assignment.activitySubmissionStatus || null;
  const submitted = Boolean(assignment.submissionId || assignment.submittedAt || status);
  const mode = activityMode(assignment);
  const score = assignment.scorePercent ?? assignment.score ?? null;

  if (!submitted) {
    if (assignment.status === "closed") {
      return { key: "closed", label: "Closed", action: "Closed", tone: "slate", canSubmit: false, score: null };
    }
    const dueTime = assignment.dueAt ? new Date(assignment.dueAt).getTime() : Number.NaN;
    const overdue = Number.isFinite(dueTime) && dueTime <= now;
    return {
      key: overdue ? "overdue" : "not-started",
      label: overdue ? "Overdue" : "Not started",
      action: overdue ? "View assignment" : "Start exercise",
      tone: overdue ? "red" : "gold",
      canSubmit: !overdue,
      score: null,
    };
  }

  if (status === "awaiting_review") {
    return { key: "awaiting-review", label: "Awaiting teacher review", action: "View submission", tone: "gold", canSubmit: false, score: null };
  }
  if (status === "reviewed") {
    return { key: "reviewed", label: "Reviewed", action: "View feedback", tone: "green", canSubmit: false, score };
  }
  if (status === "completed" || ["unscored-practice", "reading-content"].includes(mode)) {
    return { key: "completed", label: "Completed", action: "View activity", tone: "green", canSubmit: false, score: null };
  }
  return { key: "auto-scored", label: "Automatically graded", action: "View results", tone: "green", canSubmit: false, score };
}
