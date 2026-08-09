import { enabledStudentsBookActivitySequence } from "./studentsBookCatalog.js";
import { ultimateB2TeacherAppAuthoring } from "./teacherAppAuthoring.js";

const AUTHORING_UNITS = new Set([1, 2]);

export const ultimateB2StudentsBookAuthoringPages = Object.freeze(
  ultimateB2TeacherAppAuthoring.pages
    .filter((page) => AUTHORING_UNITS.has(Number(page.unitNumber)))
    .map((page) => Object.freeze({
      id: page.id,
      unitNumber: Number(page.unitNumber),
      unitTitle: page.unitTitle,
      partNumber: Number(page.partNumber),
      pageNumber: Number(page.physicalPageNumber),
      pageNumbers: page.pageNumbers,
      spreadNumber: page.spreadNumber,
      sectionTitle: page.sectionTitle,
      navigationOrder: page.navigationOrder,
      pageImageLogicalKey: page.logicalAssetIdentity,
      assetBindingId: page.assetBindingId,
    })),
);

export const ultimateB2StudentsBookAuthoringActivities = Object.freeze(
  enabledStudentsBookActivitySequence().map((activity) => Object.freeze({
    activityKey: activity.stableActivityId,
    unitNumber: Number(activity.unitNumber),
    pageNumber: Number(activity.pageNumber),
    pageSpread: String(activity.pageSpread || activity.pageNumber),
    pageLabel: activity.pageLabel,
    sectionTitle: activity.sectionTitle,
    title: activity.title,
    availability: activity.availability,
    implementationMode: activity.implementationMode,
    implementationStatus: activity.implementationStatus,
  })),
);

export function getUltimateB2StudentsBookAuthoringPage(pageId) {
  return ultimateB2StudentsBookAuthoringPages.find((page) => page.id === pageId) || null;
}

export function getUltimateB2StudentsBookAuthoringActivity(activityKey) {
  return ultimateB2StudentsBookAuthoringActivities.find((activity) => activity.activityKey === activityKey) || null;
}
