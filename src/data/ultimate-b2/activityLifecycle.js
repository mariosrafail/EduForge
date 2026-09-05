export const ULTIMATE_B2_ACTIVITY_LIFECYCLE_SCHEMA_VERSION = "1.0";

const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,127}$/;

function safeId(value, label) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

export function createEmptyUltimateB2ActivityLifecycle() {
  return { schemaVersion: ULTIMATE_B2_ACTIVITY_LIFECYCLE_SCHEMA_VERSION, activities: {} };
}

export function normalizeUltimateB2ActivityLifecycle(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).sort().join("\0") !== "activities\0schemaVersion"
    || input.schemaVersion !== ULTIMATE_B2_ACTIVITY_LIFECYCLE_SCHEMA_VERSION
    || !input.activities || typeof input.activities !== "object" || Array.isArray(input.activities)) {
    throw new Error("Ultimate B2 activity lifecycle document is invalid.");
  }
  const activities = {};
  for (const activityId of Object.keys(input.activities).sort()) {
    safeId(activityId, "Activity lifecycle identity");
    const entry = input.activities[activityId];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)
      || Object.keys(entry).sort().join("\0") !== (Object.hasOwn(entry, "sortOrder") ? "pageId\0sortOrder\0status" : "pageId\0status")
      || !["active", "retired"].includes(entry.status)) throw new Error("Activity lifecycle entry is invalid.");
    activities[activityId] = { status: entry.status, pageId: safeId(entry.pageId, "Activity lifecycle page") };
    if (Object.hasOwn(entry, "sortOrder")) {
      if (!Number.isSafeInteger(entry.sortOrder) || entry.sortOrder < 0) throw new Error("Activity lifecycle order is invalid.");
      activities[activityId].sortOrder = entry.sortOrder;
    }
  }
  return { schemaVersion: ULTIMATE_B2_ACTIVITY_LIFECYCLE_SCHEMA_VERSION, activities };
}

export function currentUltimateB2ActivityLifecycleEntry(lifecycle, activityId, canonicalPageId) {
  const normalized = normalizeUltimateB2ActivityLifecycle(lifecycle);
  const override = normalized.activities[activityId];
  return override || { status: "active", pageId: safeId(canonicalPageId, "Canonical activity page") };
}

export function applyUltimateB2ActivityLifecycle(activities, lifecycle) {
  const normalized = normalizeUltimateB2ActivityLifecycle(lifecycle);
  return activities.flatMap((activity) => {
    const override = normalized.activities[activity.activityKey];
    if (override?.status === "retired") return [];
    return [{ ...activity, ...(override ? { pageId: override.pageId } : {}) }];
  });
}

export function updateUltimateB2ActivityLifecycle(lifecycle, activityId, entry) {
  const normalized = normalizeUltimateB2ActivityLifecycle(lifecycle);
  safeId(activityId, "Activity lifecycle identity");
  return normalizeUltimateB2ActivityLifecycle({
    ...normalized,
    activities: { ...normalized.activities, [activityId]: entry },
  });
}
