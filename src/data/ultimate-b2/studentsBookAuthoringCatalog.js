import { enabledStudentsBookActivitySequence } from "./studentsBookCatalog.js";
import { ultimateB2TeacherAppAuthoring } from "./teacherAppAuthoring.js";
import { normalizeUltimateB2PublisherActivityRecord } from "./publisherCreatedActivities.js";

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

function authoringActivity(activity) {
  const page = ultimateB2StudentsBookAuthoringPages.find((candidate) => (
    candidate.unitNumber === Number(activity.unitNumber)
    && String(candidate.spreadNumber) === String(activity.pageSpread || activity.pageNumber)
    && candidate.sectionTitle === activity.sectionTitle
  ));
  return Object.freeze({
    activityKey: activity.stableActivityId,
    unitNumber: Number(activity.unitNumber),
    partNumber: Number(page?.partNumber || activity.partNumber),
    pageId: page?.id || null,
    pageNumber: Number(activity.pageNumber),
    pageSpread: String(activity.pageSpread || activity.pageNumber),
    pageLabel: activity.pageLabel,
    sectionTitle: activity.sectionTitle,
    title: activity.title,
    availability: activity.availability,
    implementationMode: activity.implementationMode,
    implementationStatus: activity.implementationStatus,
    authoringKind: activity.authoringKind || null,
    publisherCreated: Boolean(activity.authoringKind),
  });
}

export const ultimateB2StudentsBookAuthoringActivities = Object.freeze(
  enabledStudentsBookActivitySequence().map(authoringActivity),
);

export function projectUltimateB2PublisherActivityForAuthoring(record) {
  const value = normalizeUltimateB2PublisherActivityRecord(record);
  return Object.freeze({
    activityKey: value.activityId,
    unitNumber: value.unitNumber,
    partNumber: value.partNumber,
    pageId: value.pageId,
    pageNumber: value.printedPage,
    pageSpread: value.pageSpread,
    pageLabel: value.pageLabel,
    sectionTitle: value.sectionTitle,
    title: value.title,
    availability: "enabled",
    implementationMode: value.runtime.implementationMode,
    implementationStatus: "implemented-publisher-authored-react",
    authoringKind: value.authoringKind,
    publisherCreated: true,
  });
}

export function mergeUltimateB2StudentsBookAuthoringActivities(records = []) {
  const byId = new Map(ultimateB2StudentsBookAuthoringActivities.map((activity) => [activity.activityKey, activity]));
  for (const record of records) byId.set(record.activityId, projectUltimateB2PublisherActivityForAuthoring(record));
  return [...byId.values()].sort((left, right) => left.unitNumber - right.unitNumber || left.partNumber - right.partNumber || left.activityKey.localeCompare(right.activityKey, undefined, { numeric: true }));
}

export function getUltimateB2StudentsBookAuthoringPage(pageId) {
  return ultimateB2StudentsBookAuthoringPages.find((page) => page.id === pageId) || null;
}

export function getUltimateB2StudentsBookAuthoringActivity(activityKey) {
  return ultimateB2StudentsBookAuthoringActivities.find((activity) => activity.activityKey === activityKey) || null;
}
