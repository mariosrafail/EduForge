export const teacherReviewFilters = [
  { id: "all", label: "All" },
  { id: "awaiting_review", label: "Awaiting review" },
  { id: "reviewed", label: "Reviewed" },
  { id: "submitted", label: "Auto-scored" },
  { id: "missing", label: "Not submitted" },
];

export function assignmentReviewAction(assignment = {}) {
  if (Number(assignment.awaitingReviewCount || 0) > 0) return "Review submissions";
  if (Number(assignment.submittedCount ?? assignment.submitted ?? 0) > 0) return "View results";
  return "View assignment";
}

export function filterAssignmentResultRows(rows = [], filter = "all") {
  if (filter === "all") return rows;
  if (filter === "missing") return rows.filter((row) => !row.submissionId);
  return rows.filter((row) => row.submissionStatus === filter);
}

export function teacherScorePolicy(row = {}, assignment = {}) {
  const implementationMode = row.implementationMode || assignment.implementationMode || "auto-scored";
  const editable = implementationMode === "teacher-reviewed" && Boolean(row.submissionId);
  return {
    editable,
    required: editable && row.submissionStatus === "awaiting_review",
    label: editable ? "Teacher score (0–100)" : implementationMode === "auto-scored" ? "Server score" : "No numerical score",
  };
}
