export function resolvePublishedAssignmentBookContext(assignment) {
  const target = assignment.target;
  const placements = (assignment.book?.pages || []).flatMap((page) => page.hotspots.filter((hotspot) => hotspot.target?.nativeActivityId === target.nativeActivityId).map((hotspot) => ({ page, hotspot })));
  const requested = assignment.bookLocator;
  const placement = requested ? placements.find(({ page, hotspot }) => page.id === requested.pageId && hotspot.id === requested.hotspotId) : placements.length === 1 ? placements[0] : null;
  return { packageSlug: target.publication?.bookSlug, componentId: target.publication?.componentSlug,
    unitId: placement?.page.unitId || null, pageId: placement?.page.id || null,
    pageNumber: placement?.page.printedLabel || null, hotspotId: placement?.hotspot.id || null,
    activityKey: target.nativeActivityId, catalog: null };
}
