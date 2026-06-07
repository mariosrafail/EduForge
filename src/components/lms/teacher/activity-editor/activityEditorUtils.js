export function cloneActivities(course, updater) {
  return {
    ...course,
    lesson: {
      ...course.lesson,
      activities: updater(course.lesson.activities),
    },
  };
}

export function activityTypeLabel(type) {
  if (type === "line-matching") return "Line Matching";
  if (type === "gap-fill") return "Drag and Drop Gap Fill";
  if (type === "multiple-choice") return "Multiple Choice";
  if (type === "word-search") return "Word Search";
  return type.replace("-", " ");
}
