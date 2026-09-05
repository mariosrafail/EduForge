const safeId = /^[a-z0-9][a-z0-9-]{0,127}$/;

export function compareNativeActivityOrder(left, right) {
  return (left.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.sortOrder ?? Number.MAX_SAFE_INTEGER)
    || String(left.activityId || left.id).localeCompare(String(right.activityId || right.id));
}

export function componentActivityOrderEntries(canonical, index, lifecycle) {
  const pageCounts = new Map();
  const entries = canonical.flatMap((activity) => {
    const fallback = pageCounts.get(activity.pageId) || 0;
    pageCounts.set(activity.pageId, fallback + 1);
    const override = lifecycle.activities[activity.activityKey];
    return override?.status === "retired" ? [] : [{ activityId: activity.activityKey, pageId: override?.pageId || activity.pageId, sortOrder: override?.sortOrder ?? fallback, native: false }];
  });
  return [...entries, ...index.activities.map((entry) => ({ activityId: entry.activityId, pageId: entry.placement.pageId, sortOrder: entry.sortOrder, native: true }))].sort(compareNativeActivityOrder);
}

export function reorderComponentActivity({ canonical, index, lifecycle, pageId, activityId, direction }) {
  if (!["up", "down"].includes(direction)) throw new Error("invalid_order_direction");
  const entries = componentActivityOrderEntries(canonical, index, lifecycle).filter((entry) => entry.pageId === pageId);
  const position = entries.findIndex((entry) => entry.activityId === activityId);
  const destination = position + (direction === "up" ? -1 : 1);
  if (position < 0 || destination < 0 || destination >= entries.length) throw new Error("activity_order_boundary");
  [entries[position], entries[destination]] = [entries[destination], entries[position]];
  const nextIndex = structuredClone(index); const nextLifecycle = structuredClone(lifecycle);
  entries.forEach((entry, sortOrder) => {
    if (entry.native) nextIndex.activities.find((item) => item.activityId === entry.activityId).sortOrder = sortOrder;
    else nextLifecycle.activities[entry.activityId] = { status: "active", pageId, sortOrder };
  });
  return { index: nextIndex, lifecycle: nextLifecycle, activityIds: entries.map((entry) => entry.activityId) };
}

export function projectComponentActivityOrder(entries, allowedIds = null) {
  const pages = {};
  for (const entry of [...entries].sort(compareNativeActivityOrder)) {
    if (allowedIds && !allowedIds.has(entry.activityId)) continue;
    if (!Object.hasOwn(pages, entry.pageId)) pages[entry.pageId] = [];
    pages[entry.pageId].push(entry.activityId);
  }
  return pages;
}

export function normalizeComponentActivityOrder(value, { pageIds = null, activityIds = null, nativeActivities = null } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid activity order.");
  const seen = new Set(); const pages = {};
  for (const [pageId, ids] of Object.entries(value)) {
    if (!safeId.test(pageId) || !Array.isArray(ids) || pageIds && !pageIds.has(pageId)) throw new Error("Invalid activity order identities.");
    for (const id of ids) {
      if (typeof id !== "string" || !safeId.test(id) || seen.has(id) || activityIds && !activityIds.has(id)
        || nativeActivities?.[id] && nativeActivities[id].document.placement.pageId !== pageId) throw new Error("Invalid activity order identities.");
      seen.add(id);
    }
    pages[pageId] = [...ids];
  }
  return pages;
}
