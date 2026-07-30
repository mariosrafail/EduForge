export function exerciseDisplayStatus(exercise, completed = null) {
  if (completed) return "Submitted";
  return exercise.status || (exercise.availableToStudent ? "Available" : "Unavailable");
}

export function exerciseSecondaryText(exercise, { isTeacher = false, completed = null } = {}) {
  if (completed) {
    return Number.isFinite(completed.score) ? `Submitted / ${completed.score}%` : "Submitted";
  }
  if (exercise.locked || !exercise.availableToStudent) return exercise.disabledReason || "Unavailable";
  if (isTeacher && exercise.assignable) return "Assignable";
  return exercise.assignable ? "Available" : "Practice activity";
}
