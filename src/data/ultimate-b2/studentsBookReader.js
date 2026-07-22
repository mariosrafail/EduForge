import studentsBookContent from "./generated/students-book.runtime.json";
import {
  adjacentStudentsBookPageInCatalog,
  findStudentsBookPageInCatalog,
  findStudentsBookUnitInCatalog,
  flattenStudentsBookPages,
  studentsBookPageRouteTokenForPage,
  visibleStudentsBookActivitiesForMode,
} from "./studentsBookReaderModel.js";

export const studentsBookUnits = studentsBookContent.units;
export const studentsBookPages = flattenStudentsBookPages(studentsBookContent);

export function findStudentsBookPage(pageToken) {
  return findStudentsBookPageInCatalog(studentsBookContent, pageToken);
}

export function findStudentsBookUnit(unitToken) {
  return findStudentsBookUnitInCatalog(studentsBookContent, unitToken);
}

export function adjacentStudentsBookPage(pageToken, direction) {
  return adjacentStudentsBookPageInCatalog(studentsBookContent, pageToken, direction);
}

export function visibleStudentsBookActivities(page, mode = "student") {
  return visibleStudentsBookActivitiesForMode(page, mode);
}

export function studentsBookPageRouteToken(page) {
  return studentsBookPageRouteTokenForPage(page);
}

export default studentsBookContent;
