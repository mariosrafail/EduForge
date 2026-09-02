export * from "../book-builder/hosted/activityBuilderNavigation.js";

export function ultimateB2ExerciseLabel(activity) {
  const exercise = String(activity.title || "").match(/Exercise\s+\d+/i)?.[0];
  if (exercise) return exercise.replace(/^exercise/i, "Exercise");
  const suffix = String(activity.title || "").split("·").at(-1)?.trim();
  return suffix || "Exercise";
}

export function buildUltimateB2ActivityNavigation(activities, editorMetadata = {}) {
  const units = [];
  const unitsByNumber = new Map();
  for (const activity of activities) {
    let unit = unitsByNumber.get(activity.unitNumber);
    if (!unit) {
      unit = { unitNumber: activity.unitNumber, label: `Unit ${activity.unitNumber}`, pages: [] };
      unitsByNumber.set(activity.unitNumber, unit);
      units.push(unit);
    }
    const pageKey = `${activity.unitNumber}:${activity.pageSpread}:${activity.sectionTitle}`;
    let page = unit.pages.find((candidate) => candidate.key === pageKey);
    if (!page) {
      page = { key: pageKey, pageId: activity.pageId, unitNumber: activity.unitNumber, partNumber: activity.partNumber, pageNumber: activity.pageNumber, pageLabel: activity.pageLabel, pageSpread: activity.pageSpread, sectionTitle: activity.sectionTitle, activities: [] };
      unit.pages.push(page);
    }
    const editor = typeof editorMetadata === "function" ? editorMetadata(activity) : editorMetadata[activity.activityKey] || null;
    page.activities.push({ ...activity, exerciseLabel: ultimateB2ExerciseLabel(activity), editorLabel: editor?.label || null, editorStatus: editor?.status || "Not configurable yet", configurable: Boolean(editor) });
  }
  return units;
}
