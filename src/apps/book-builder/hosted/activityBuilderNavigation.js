const normalized = (value) => String(value || "").trim().toLocaleLowerCase();

import { compareNativeActivityOrder as stable } from "../../../data/native-activities/nativeActivityOrder.js";

export function buildActivityBuilderNavigation({ units = [], nativeActivities = [], placements = [], lifecycle = null, activePageIds = null, activityOrder = null, isEditable = () => false } = {}) {
  const placementByPage = new Map(placements.map((placement) => [placement.pageId, placement]));
  const lifecycleEntries = lifecycle?.activities && typeof lifecycle.activities === "object" ? lifecycle.activities : {};
  const pageById = new Map();
  const model = units.map((unit, unitIndex) => {
    const pages = (unit.lessons || []).map((lesson, pageIndex) => {
      const unitNumber = unit.unitNumber || unit.number || unitIndex + 1;
      const matchingPlacements = placements.filter((placement) => placement.unitNumber === unitNumber && placement.pageLabel === lesson.pageLabel);
      const pageId = lesson.pageId || (matchingPlacements.length === 1 ? matchingPlacements[0].pageId : lesson.id);
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
          sortOrder: override?.sortOrder ?? activityIndex,
          }];
        }),
      };
      pageById.set(pageId, page);
      return page;
    });
    return { id: unit.id || `unit-${unit.unitNumber || unit.number || unitIndex + 1}`, title: unit.title || `Unit ${unit.unitNumber || unit.number || unitIndex + 1}`, unitNumber: unit.unitNumber || unit.number || unitIndex + 1, sortOrder: unitIndex, pages };
  });

  const unassigned = [];
  for (const unit of model) for (const page of unit.pages) {
    for (const item of [...page.activities]) {
      const destination = pageById.get(item.placement?.pageId);
      if (destination && destination !== page) {
        page.activities = page.activities.filter((candidate) => candidate !== item);
        destination.activities.push(item);
      } else if (!destination && item.placement?.pageId !== page.id) {
        page.activities = page.activities.filter((candidate) => candidate !== item);
        unassigned.push({ ...item, sourcePageId: item.placement?.pageId, assignment: { state: "unassigned", reason: "page-unavailable" } });
      }
    }
  }

  if (activePageIds) {
    const active = new Set(activePageIds);
    for (const unit of model) for (const page of unit.pages) if (!active.has(page.id)) {
      unassigned.push(...page.activities.map((item) => ({
        ...item,
        sourcePageId: item.placement?.pageId || page.id,
        assignment: { state: "unassigned", reason: "page-deleted" },
      })));
      page.activities = [];
    }
  }
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
      placement: placement || activity.placement,
      sourcePageId: activity.sourcePageId || activity.placement?.pageId,
      assignment: activity.assignment || { state: target ? "assigned" : "unassigned", reason: target ? undefined : "page-unavailable" },
      sortOrder: activity.sortOrder ?? placement?.sortOrder ?? Number.MAX_SAFE_INTEGER,
    };
    const assigned = item.assignment.state === "assigned" && target && (!activePageIds || activePageIds.includes(target.id));
    if (assigned) target.activities.push(item);
    else unassigned.push({ ...item, assignment: { state: "unassigned", reason: item.assignment.reason || "page-unavailable" } });
  }
  for (const unit of model) for (const page of unit.pages) {
    const ids = activityOrder?.[page.id];
    const ranks = ids && new Map(ids.map((id, index) => [id, index]));
    page.activities.sort((left, right) => ranks
      ? (ranks.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (ranks.get(right.id) ?? Number.MAX_SAFE_INTEGER) || stable(left, right)
      : stable(left, right));
  }
  unassigned.sort(stable);
  return { units: model, unassigned };
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
  const preserveEmptyPages = !needle && access === "all" && type === "all";
  return {
    units: model.units.map((unit) => ({ ...unit, pages: unit.pages.map((page) => ({
      ...page,
      activities: page.activities.filter((item) => matches(item, needle, access, type)
        || (needle && [unit.title, page.title, page.pageLabel].some((value) => normalized(value).includes(needle)))),
    })).filter((page) => preserveEmptyPages || page.activities.length) })).filter((unit) => preserveEmptyPages || unit.pages.length),
    unassigned: (model.unassigned || []).filter((item) => matches(item, needle, access, type)),
  };
}

export function findActivityBuilderItem(model, activityId) {
  for (const unit of model.units) for (const page of unit.pages) {
    const item = page.activities.find((activity) => activity.id === activityId);
    if (item) return { item, unit, page };
  }
  const item = (model.unassigned || []).find((activity) => activity.id === activityId);
  return item ? { item, unit: null, page: null } : null;
}

export function activityBuilderTypeOptions(model) {
  return [...new Set([...model.units.flatMap((unit) => unit.pages.flatMap((page) => page.activities)), ...(model.unassigned || [])].map((item) => item.kind).filter(Boolean))].sort();
}

export function activityBuilderSourcePageId(selection) {
  return selection?.page?.id || selection?.item?.sourcePageId || selection?.item?.placement?.pageId || "";
}
