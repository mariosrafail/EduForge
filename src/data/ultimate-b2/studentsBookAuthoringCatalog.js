import studentsBookRuntime from "./generated/students-book.runtime.json" with { type: "json" };
import { enabledStudentsBookActivitySequence } from "./studentsBookCatalog.js";

const AUTHORING_UNITS = new Set([1, 2]);

export const ultimateB2StudentsBookAuthoringPages = Object.freeze(
  (studentsBookRuntime.units || [])
    .filter((unit) => AUTHORING_UNITS.has(Number(unit.number)))
    .flatMap((unit) => (unit.pages || []).map((page) => Object.freeze({
      id: page.id,
      unitNumber: Number(unit.number),
      unitTitle: unit.title,
      partNumber: Number(page.partNumber),
      pageNumber: Number(page.physicalPageNumber),
      pageNumbers: Object.freeze([...(page.pageNumbers || [page.physicalPageNumber])].map(Number)),
      spreadNumber: String(page.spreadNumber || page.physicalPageNumber),
      sectionTitle: page.sectionTitle,
      pageImageLogicalKey: page.pageImage?.identity || null,
    }))),
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
