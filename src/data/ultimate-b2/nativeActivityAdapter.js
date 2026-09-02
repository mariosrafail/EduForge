import { NATIVE_ACTIVITY_KINDS } from "../native-activities/nativeActivityKinds.js";
import { NativeActivityPlacementError } from "../native-activities/nativeActivityPlacementError.js";
import { nextUltimateB2PublisherActivityId } from "./publisherCreatedActivities.js";
import { ultimateB2StudentsBookAuthoringActivities, ultimateB2StudentsBookAuthoringPages } from "./studentsBookAuthoringCatalog.js";

export const ultimateB2NativeActivityPlacements = Object.freeze(ultimateB2StudentsBookAuthoringPages.map((page) => Object.freeze({
  pageId: page.id,
  unitNumber: page.unitNumber,
  partNumber: page.partNumber,
  pageNumber: page.pageNumber,
  pageLabel: page.pageNumbers?.length > 1 ? `Pages ${page.spreadNumber}` : `Page ${page.pageNumber}`,
  sectionTitle: page.sectionTitle,
  sortOrder: Number(page.navigationOrder) * 1_000,
})));

export function normalizeUltimateB2NativeActivityPlacement(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length !== 1 || typeof input.pageId !== "string") throw new NativeActivityPlacementError("Ultimate B2 native activity placement is invalid.");
  const page = ultimateB2NativeActivityPlacements.find((candidate) => candidate.pageId === input.pageId);
  if (!page) throw new NativeActivityPlacementError("Ultimate B2 native activity placement is unknown.");
  return page;
}

export function nextUltimateB2NativeActivityIdentity({ placement, nativeIndex, occupiedActivityIds = [] }) {
  const page = normalizeUltimateB2NativeActivityPlacement({ pageId: placement.pageId });
  const occupiedIds = [
    ...ultimateB2StudentsBookAuthoringActivities.map((activity) => activity.activityKey),
    ...(nativeIndex?.activities || []).map((activity) => activity.activityId),
    ...occupiedActivityIds,
  ];
  return nextUltimateB2PublisherActivityId(page, occupiedIds);
}

export const ultimateB2NativeActivityAdapter = Object.freeze({
  id: "ultimate-b2-students-book-native-activities",
  bookSlug: "ultimate-b2",
  componentSlug: "ultimate-b2-students-book",
  kinds: NATIVE_ACTIVITY_KINDS,
  placements: ultimateB2NativeActivityPlacements,
  ownsActivityId(activityId) { return /^ultimate-b2-sb-[a-z0-9-]+-o\d+$/.test(String(activityId || "")); },
  normalizePlacement: normalizeUltimateB2NativeActivityPlacement,
  async normalizeDestinationPlacement(input, { sql, bookSlug, componentSlug } = {}) {
    const placement = normalizeUltimateB2NativeActivityPlacement(input);
    if (bookSlug !== "ultimate-b2" || componentSlug !== "ultimate-b2-students-book") throw new NativeActivityPlacementError("Ultimate B2 native activity placement is invalid.");
    if (typeof sql === "function") {
      const stableKey = `${componentSlug}/pages/${placement.pageId}`;
      const rows = await sql`
        select page.source_metadata from book_pages page
        join book_packages package on package.id=page.book_package_id
        join book_components component on component.id=page.book_component_id and component.book_package_id=package.id
        where package.slug=${bookSlug} and component.slug=${componentSlug} and page.stable_key=${stableKey} limit 1
      `;
      if (rows[0]?.source_metadata?.is_deleted === true || rows[0]?.source_metadata?.is_permanently_deleted === true) throw new NativeActivityPlacementError("Ultimate B2 native activity placement is inactive.");
    }
    return placement;
  },
  async resolveExistingPlacement(input, { sql, bookSlug, componentSlug } = {}) {
    const placement = normalizeUltimateB2NativeActivityPlacement(input);
    if (bookSlug !== "ultimate-b2" || componentSlug !== "ultimate-b2-students-book") throw new NativeActivityPlacementError("Ultimate B2 native activity placement is invalid.");
    let active = true;
    if (typeof sql === "function") {
      const stableKey = `${componentSlug}/pages/${placement.pageId}`;
      const rows = await sql`
        select page.source_metadata
        from book_pages page
        join book_packages package on package.id=page.book_package_id
        join book_components component on component.id=page.book_component_id and component.book_package_id=package.id
        where package.slug=${bookSlug} and component.slug=${componentSlug} and page.stable_key=${stableKey}
        limit 1
      `;
      const metadata = rows[0]?.source_metadata;
      active = metadata?.is_deleted !== true && metadata?.is_permanently_deleted !== true;
    }
    return {
      ...placement,
      sourcePageId: placement.pageId,
      assignmentState: active ? "assigned" : "unassigned",
      ...(active ? {} : { unassignedReason: "page-deleted" }),
    };
  },
  nextActivityId: nextUltimateB2NativeActivityIdentity,
  sortOrder({ placement, activityId }) {
    const page = normalizeUltimateB2NativeActivityPlacement({ pageId: placement.pageId });
    const ordinal = Number(String(activityId).match(/-o(\d+)$/)?.[1] || 0);
    return page.sortOrder + ordinal;
  },
});
