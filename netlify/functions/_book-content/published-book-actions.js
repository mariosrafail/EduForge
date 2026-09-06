import { json, isValidUuid, isStudent, verifyPackageAccess } from "./shared.js";
import { loadVerifiedPublishedBookFamily } from "./published-book-releases.js";
import { publishedBookReadModel, supportedPublishedBook } from "./published-book-model.js";
import { nativeAssignmentCapability, nativeTargetToStudent, resolveNativeAssignmentTarget } from "./native-assignment-runtime.js";
import { listAssignmentsForStudent } from "./assignment-actions.js";
import { isPhaseOneComponentVisible } from "../../../src/config/bookCatalogVisibility.js";

export const privateBookJson = (status, payload) => json(status, payload, { "Cache-Control": "private, no-store", Vary: "Cookie" });

export function releaseBookModel({ row, verified, productReleaseId = null }) {
  const capabilities = Object.fromEntries(Object.entries(verified.publicProjection.nativeActivities || {}).map(([id, entry]) => [id, nativeAssignmentCapability(entry.kind, entry.document)]));
  return publishedBookReadModel(row, verified.publicProjection, capabilities, productReleaseId);
}

export async function listPublishedBooks(sql, currentUser) {
  try {
    const releases = await loadVerifiedPublishedBookFamily(sql, currentUser);
    return privateBookJson(200, { books: releases.filter(({ row }) => isPhaseOneComponentVisible(row.package_slug, row.component_slug)).map(releaseBookModel) });
  } catch {
    return privateBookJson(503, { error: "publication_catalog_unavailable", detail: "Published books could not be verified. Refresh and try again." });
  }
}

export async function getPublishedBookActivity(sql, currentUser, query) {
  if (!supportedPublishedBook(query.bookSlug, query.componentSlug) || !isPhaseOneComponentVisible(query.bookSlug, query.componentSlug) || !isValidUuid(query.releaseId)) return privateBookJson(404, { error: "publication_activity_not_found" });
  const accessError = await verifyPackageAccess(sql, currentUser, { packageSlug: query.bookSlug });
  if (accessError) return { ...accessError, headers: { ...accessError.headers, "Cache-Control": "private, no-store", Vary: "Cookie" } };
  const target = await resolveNativeAssignmentTarget(sql, currentUser, { kind: "published_native", releaseId: query.releaseId, nativeActivityId: query.activityId }, { requireActive: false });
  if (target.error || target.row.package_slug !== query.bookSlug || target.row.component_slug !== query.componentSlug) return privateBookJson(404, { error: "publication_activity_not_found" });
  return privateBookJson(200, { target: nativeTargetToStudent(target, query.activityId) });
}

export async function getStudentAssignmentDetail(sql, currentUser, query) {
  if (!isStudent(currentUser) || !isValidUuid(query.assignmentId)) return privateBookJson(404, { error: "assignment_not_found" });
  const rows = await listAssignmentsForStudent(sql, currentUser.id, currentUser, { assignmentId: query.assignmentId, includeBook: true });
  const assignment = rows[0];
  if (!assignment) return privateBookJson(404, { error: "assignment_not_found" });
  return privateBookJson(200, { assignment });
}
