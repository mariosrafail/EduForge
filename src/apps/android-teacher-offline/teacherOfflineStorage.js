const STORAGE_KEY = "interactive-classroom:location:v1";

export function readTeacherOfflineLocation() {
  if (typeof localStorage === "undefined") return null;
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!value || ![1, 2].includes(Number(value.unitNumber))) return null;
    return {
      unitNumber: Number(value.unitNumber),
      tab: value.tab === "exercises" ? "exercises" : "pages",
      pageId: String(value.pageId || ""),
    };
  } catch {
    return null;
  }
}

export function writeTeacherOfflineLocation(location) {
  if (typeof localStorage === "undefined") return;
  const safeLocation = {
    unitNumber: [1, 2].includes(Number(location?.unitNumber)) ? Number(location.unitNumber) : 1,
    tab: location?.tab === "exercises" ? "exercises" : "pages",
    pageId: String(location?.pageId || ""),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safeLocation));
}
