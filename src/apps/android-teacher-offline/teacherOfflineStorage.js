const LEGACY_STORAGE_KEY = "interactive-classroom:location:v1";
const STORAGE_KEY = "interactive-classroom:locations:v2";
const DEFAULT_COMPONENT_KEY = "ultimate-b2/ultimate-b2-students-book";

function componentKey(identity) {
  return identity?.bookSlug && identity?.componentSlug
    ? `${identity.bookSlug}/${identity.componentSlug}`
    : DEFAULT_COMPONENT_KEY;
}

function validUnitNumber(value) {
  return Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 10;
}

function normalizeLocation(value) {
  if (!value || !validUnitNumber(value.unitNumber)) return null;
  return {
    unitNumber: Number(value.unitNumber),
    tab: value.tab === "exercises" ? "exercises" : "pages",
    pageId: String(value.pageId || ""),
  };
}

export function readTeacherOfflineLocation(identity) {
  if (typeof localStorage === "undefined") return null;
  try {
    const locations = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    const current = normalizeLocation(locations?.[componentKey(identity)]);
    if (current) return current;
    if (componentKey(identity) !== DEFAULT_COMPONENT_KEY) return null;
    return normalizeLocation(JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || "null"));
  } catch {
    return null;
  }
}

export function writeTeacherOfflineLocation(location, identity) {
  if (typeof localStorage === "undefined") return;
  const safeLocation = {
    unitNumber: validUnitNumber(location?.unitNumber) ? Number(location.unitNumber) : 1,
    tab: location?.tab === "exercises" ? "exercises" : "pages",
    pageId: String(location?.pageId || ""),
  };
  let locations = {};
  try { locations = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {}; } catch { locations = {}; }
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...locations, [componentKey(identity)]: safeLocation }));
}
