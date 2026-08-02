function activityIdentity(activity) {
  return activity?.stableActivityId || activity?.stableNormalizedId || activity?.id || "";
}

function pageContainsActivity(page, activityId) {
  return (page?.activities || []).some((activity) => (
    activityIdentity(activity) === activityId || activity?.activityKey === activityId
  ));
}

export function resolveTeacherOfflineActivityLocation({
  activityId,
  activities = [],
  pageUnits = [],
  originLocation = null,
}) {
  const activity = activities.find((candidate) => activityIdentity(candidate) === activityId) || null;
  if (!activity) return null;

  const unitNumber = Number(activity.unitNumber);
  const unit = pageUnits.find((candidate) => Number(candidate.number) === unitNumber);
  if (!unit) return null;

  const originPage = originLocation?.pageId
    && Number(originLocation.unitNumber) === unitNumber
    ? unit.pages.find((page) => page.id === originLocation.pageId)
    : null;
  const metadataPage = unit.pages.find((page) => pageContainsActivity(page, activityId))
    || unit.pages.find((page) => (page.pageNumbers || []).includes(Number(activity.printedPage)))
    || unit.pages.find((page) => Number(page.pageNumber) === Number(activity.printedPage));
  const page = originPage || metadataPage;
  if (!page) return null;

  return {
    activity,
    location: {
      unitNumber,
      tab: "pages",
      pageId: page.id,
    },
  };
}

export function isTeacherOfflinePageLocation(location, target) {
  return Number(location?.unitNumber) === Number(target?.unitNumber)
    && location?.tab === "pages"
    && location?.pageId === target?.pageId;
}
