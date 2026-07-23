import { ultimateB2Package } from "../../../data/ultimateB2DemoData.js";
import { buildActivityHash, buildCourseComponentHash, getPackageRouteSlug } from "../../../utils/hashRoutes.js";
import { getCanonicalBookId } from "./bookCoverAssets.js";

export function statusTone(status) {
  if (status === "Completed" || status === "Available" || status === "Submitted") return "green";
  if (status === "Assigned") return "gold";
  if (status === "Locked") return "slate";
  return "blue";
}

export function exerciseActionLabel(exercise) {
  if (exercise.status === "Completed") return "Review";
  if (exercise.status === "Submitted") return "Review";
  if (exercise.status === "Assigned") return "Continue";
  return "Start";
}

export function getExerciseActivityKey(exercise = {}) {
  return exercise.stableActivityId || exercise.activityKey || exercise.demoActivityKey || exercise.slug || exercise.id || "";
}

export function isExerciseActive(exercise) {
  return Boolean(getExerciseActivityKey(exercise) && !exercise.locked && (exercise.availableToStudent || exercise.assignable));
}

export function getActiveExercises(component) {
  return component.units.flatMap((unit) => unit.lessons.flatMap((lesson) => lesson.exercises.filter(isExerciseActive)));
}

export function copyHashLink(hash) {
  if (typeof window === "undefined") return;
  const url = `${window.location.origin}${window.location.pathname}${window.location.search}#${hash}`;
  navigator.clipboard?.writeText(url).catch(() => {});
}

export function buildBookPackageComponentHash(mode, bookPackage, componentSlug) {
  const packageSlug = getPackageRouteSlug(bookPackage);
  if (mode === "teacher") return `/teacher/books/${packageSlug}/components/${componentSlug}`;
  return buildCourseComponentHash(packageSlug, componentSlug);
}

export function isBookMatch(component, selectedBookId) {
  if (!selectedBookId) return false;
  return component.id === selectedBookId || component.slug === selectedBookId || component.routeSlug === selectedBookId || getCanonicalBookId(component) === selectedBookId;
}

export function findBookComponentById(bookPackage = ultimateB2Package, selectedComponentId = null) {
  const activePackage = bookPackage?.components?.length ? bookPackage : ultimateB2Package;
  return activePackage.components.find((component) => isBookMatch(component, selectedComponentId)) || null;
}

export { buildActivityHash };
