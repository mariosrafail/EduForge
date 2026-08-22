const normalized = (value) => String(value || "").trim().toLocaleLowerCase();

const stable = (left, right) => (left.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.sortOrder ?? Number.MAX_SAFE_INTEGER)
  || String(left.title || left.id).localeCompare(String(right.title || right.id))
  || String(left.id).localeCompare(String(right.id));

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

export function buildActivityBuilderNavigation({ units = [], nativeActivities = [], placements = [], lifecycle = null, isEditable = () => false } = {}) {
  const placementByPage = new Map(placements.map((placement) => [placement.pageId, placement]));
  const lifecycleEntries = lifecycle?.activities && typeof lifecycle.activities === "object" ? lifecycle.activities : {};
  const pageById = new Map();
  const model = units.map((unit, unitIndex) => {
    const pages = (unit.lessons || []).filter((lesson) => lesson.exercises?.length).map((lesson, pageIndex) => {
      const unitNumber = unit.unitNumber || unit.number || unitIndex + 1;
      const pageId = lesson.pageId || placements.find((placement) => placement.unitNumber === unitNumber && placement.pageLabel === lesson.pageLabel)?.pageId || lesson.id;
      const page = {
        id: pageId,
        title: lesson.sectionTitle || lesson.title || lesson.pageLabel || pageId,
        pageLabel: lesson.pageLabel || placementByPage.get(pageId)?.pageLabel || "",
        sortOrder: pageIndex,
        activities: (lesson.exercises || []).flatMap((exercise, activityIndex) => {
          const override = lifecycleEntries[exercise.stableActivityId];
          if (override?.status === "retired") return [];
          return [{
          id: exercise.stableActivityId,
          title: exercise.title || exercise.stableActivityId,
          description: exercise.description || "",
          type: exercise.activityType || "canonical",
          kind: exercise.activityType || "canonical",
          native: false,
          editable: Boolean(isEditable(exercise.stableActivityId)),
          retirable: true,
          movable: true,
          placement: { pageId: override?.pageId || pageId },
          ready: true,
          sortOrder: activityIndex,
          }];
        }),
      };
      pageById.set(pageId, page);
      return page;
    });
    return { id: unit.id || `unit-${unit.unitNumber || unit.number || unitIndex + 1}`, title: unit.title || `Unit ${unit.unitNumber || unit.number || unitIndex + 1}`, unitNumber: unit.unitNumber || unit.number || unitIndex + 1, sortOrder: unitIndex, pages };
  });

  for (const unit of model) for (const page of unit.pages) {
    for (const item of [...page.activities]) {
      const destination = pageById.get(item.placement?.pageId);
      if (destination && destination !== page) {
        page.activities = page.activities.filter((candidate) => candidate !== item);
        destination.activities.push(item);
      }
    }
  }

  const unplaced = [];
  for (const activity of nativeActivities) {
    const placement = placementByPage.get(activity.placement?.pageId);
    const target = pageById.get(activity.placement?.pageId);
    const item = {
      id: activity.activityId,
      title: activity.title || activity.activityId,
      description: "Native activity draft",
      type: activity.kind,
      kind: activity.kind,
      native: true,
      editable: true,
      retirable: true,
      movable: true,
      ready: Boolean(activity.ready),
      issues: [...(activity.issues || [])],
      placement,
      sortOrder: activity.sortOrder ?? placement?.sortOrder ?? Number.MAX_SAFE_INTEGER,
    };
    if (target) target.activities.push(item); else unplaced.push(item);
  }
  for (const unit of model) for (const page of unit.pages) page.activities.sort(stable);
  unplaced.sort(stable);
  return { units: model, unplaced };
}

function matches(item, query, access, type) {
  if (access === "editable" && !item.editable) return false;
  if (access === "native" && !item.native) return false;
  if (access === "read-only" && item.editable) return false;
  if (type !== "all" && item.kind !== type && item.type !== type) return false;
  if (!query) return true;
  return [item.title, item.id, item.description, item.kind, item.type, item.ready ? "ready complete" : "incomplete"]
    .some((value) => normalized(value).includes(query));
}

export function filterActivityBuilderNavigation(model, { query = "", access = "all", type = "all" } = {}) {
  const needle = normalized(query);
  return {
    units: model.units.map((unit) => ({ ...unit, pages: unit.pages.map((page) => ({
      ...page,
      activities: page.activities.filter((item) => matches(item, needle, access, type)
        || (needle && [unit.title, page.title, page.pageLabel].some((value) => normalized(value).includes(needle)))),
    })).filter((page) => page.activities.length) })).filter((unit) => unit.pages.length),
    unplaced: model.unplaced.filter((item) => matches(item, needle, access, type)),
  };
}

export function findActivityBuilderItem(model, activityId) {
  for (const unit of model.units) for (const page of unit.pages) {
    const item = page.activities.find((activity) => activity.id === activityId);
    if (item) return { item, unit, page };
  }
  const item = model.unplaced.find((activity) => activity.id === activityId);
  return item ? { item, unit: null, page: null } : null;
}

export function activityBuilderTypeOptions(model) {
  return [...new Set([...model.units.flatMap((unit) => unit.pages.flatMap((page) => page.activities)), ...model.unplaced].map((item) => item.kind).filter(Boolean))].sort();
}
