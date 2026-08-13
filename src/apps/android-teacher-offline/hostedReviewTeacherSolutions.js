import teacherSolutions from "../../../android-content-packs/ultimate-b2-students-book/teacher-solutions.json" with { type: "json" };

export function getOfflineTeacherSolution(activityId) {
  return teacherSolutions.solutions?.[String(activityId || "")] || null;
}
