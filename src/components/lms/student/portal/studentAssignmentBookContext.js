import { findUltimateB2Exercise } from "../../../../data/ultimateB2DemoData.js";
import { ultimateB2StudentsBookHotspotManifest } from "../../../../data/ultimate-b2/studentsBookHotspots.js";
import { resolvePublishedAssignmentBookContext } from "./publishedAssignmentBookContext.js";

export function resolveStudentAssignmentBookContext(assignment = {}) {
  if (assignment.target?.kind === "published_native") {
    return resolvePublishedAssignmentBookContext(assignment);
  }
  const activity = assignment.activity || assignment.dbActivity || {};
  const activityKey = activity.stableActivityId || activity.demoActivityKey || activity.activityKey || assignment.demoActivityKey || activity.slug;
  const catalog = findUltimateB2Exercise(activityKey);
  let hotspot = null;
  let pageId = assignment.pageId || activity.pageId || null;

  for (const [candidatePageId, hotspots] of Object.entries(ultimateB2StudentsBookHotspotManifest.pages || {})) {
    const match = hotspots.find((item) => item.activityKey === activityKey);
    if (match) {
      hotspot = match;
      pageId = match.pageId || candidatePageId;
      break;
    }
  }

  return {
    packageSlug: assignment.packageSlug || "ultimate-b2",
    componentId: assignment.componentSlug || catalog?.component?.id || "students-book",
    unitId: assignment.unitSlug || catalog?.unit?.id || null,
    pageId,
    pageNumber: assignment.pageNumber || activity.pageNumber || hotspot?.pageNumber || catalog?.exercise?.pageNumber || null,
    hotspotId: hotspot?.id || null,
    activityKey,
    catalog,
  };
}
