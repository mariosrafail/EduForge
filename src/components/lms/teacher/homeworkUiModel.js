import { getCatalogPackageSlug, PHASE_ONE_PACKAGE_SLUGS } from "../../../config/bookCatalogVisibility.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function array(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

function numericSort(value, fallback = Number.MAX_SAFE_INTEGER) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function text(value) {
  return String(value || "").trim();
}

function packageOrder(packageSlug) {
  const index = PHASE_ONE_PACKAGE_SLUGS.indexOf(packageSlug);
  return index === -1 ? PHASE_ONE_PACKAGE_SLUGS.length : index;
}

function compareText(left, right) {
  return text(left).localeCompare(text(right), "en", { numeric: true, sensitivity: "base" });
}

function compareOptions(left, right) {
  return numericSort(left.packageSortOrder, packageOrder(left.packageSlug)) - numericSort(right.packageSortOrder, packageOrder(right.packageSlug))
    || compareText(left.packageTitle, right.packageTitle)
    || compareText(left.packageId, right.packageId)
    || numericSort(left.componentSortOrder) - numericSort(right.componentSortOrder)
    || compareText(left.componentTitle, right.componentTitle)
    || compareText(left.componentId, right.componentId)
    || (left.targetKind === right.targetKind ? 0 : left.targetKind === "legacy_activity" ? -1 : 1)
    || numericSort(left.unitSortOrder) - numericSort(right.unitSortOrder)
    || compareText(left.unitTitle, right.unitTitle)
    || numericSort(left.lessonSortOrder) - numericSort(right.lessonSortOrder)
    || compareText(left.lessonTitle, right.lessonTitle)
    || numericSort(left.activitySortOrder) - numericSort(right.activitySortOrder)
    || compareText(left.title, right.title)
    || compareText(left.id, right.id);
}

function deterministicDuplicateKey(option) {
  return [option.label, option.packageSlug, option.componentSlug, option.unitTitle, option.lessonTitle, option.title]
    .map(text)
    .join("\0");
}

function addCanonicalOption(optionsByIdentity, option) {
  const existing = optionsByIdentity.get(option.identity);
  if (!existing || deterministicDuplicateKey(option).localeCompare(deterministicDuplicateKey(existing)) < 0) {
    optionsByIdentity.set(option.identity, option);
  }
}

export function buildHomeworkActivityOptions(packageTrees = [], nativeTargets = []) {
  const optionsByIdentity = new Map();
  for (const packageTree of array(packageTrees)) {
    const packageId = text(packageTree.id);
    if (!UUID_PATTERN.test(packageId)) continue;
    const packageSlug = getCatalogPackageSlug(packageTree);
    const packageTitle = text(packageTree.packageTitle || packageTree.title) || packageSlug;
    for (const component of packageTree.components || []) {
      for (const unit of component.units || []) {
        for (const lesson of unit.lessons || []) {
          for (const exercise of lesson.exercises || []) {
            if (exercise.assignable === false || exercise.isAssignable === false) continue;
            const activityId = text(exercise.assignmentActivityId || exercise.dbActivity?.id);
            if (!UUID_PATTERN.test(activityId)) continue;
            const identity = `legacy_activity:${activityId.toLowerCase()}`;
            const componentTitle = text(component.title);
            const unitTitle = text(unit.title || unit.unit);
            const lessonTitle = text(lesson.title || lesson.lessonType || exercise.lesson);
            const title = text(exercise.title) || "Untitled activity";
            addCanonicalOption(optionsByIdentity, {
              id: identity,
              identity,
              activityId: activityId.toLowerCase(),
              targetKind: "legacy_activity",
              target: { kind: "legacy_activity", activityId: activityId.toLowerCase() },
              title,
              label: [packageTitle, componentTitle, unitTitle, lessonTitle, title].filter(Boolean).join(" / "),
              packageId,
              packageSlug,
              packageTitle,
              packageSortOrder: packageOrder(packageSlug),
              componentId: text(component.id),
              componentSlug: text(component.slug),
              componentTitle,
              component: componentTitle,
              componentSortOrder: component.sortOrder ?? component.sort_order,
              unitId: text(unit.id),
              unitTitle,
              unitSortOrder: unit.sortOrder ?? unit.sort_order ?? unit.unitNumber,
              lessonId: text(lesson.id),
              lessonTitle,
              lessonSortOrder: lesson.sortOrder ?? lesson.sort_order ?? lesson.position ?? lesson.navigationOrder,
              activitySortOrder: exercise.sortOrder ?? exercise.sort_order ?? exercise.position ?? exercise.navigationOrder,
              assignable: true,
            });
          }
        }
      }
    }
  }
  for (const native of array(nativeTargets)) {
    const releaseId = text(native.target?.releaseId);
    const nativeActivityId = text(native.target?.nativeActivityId);
    const packageId = text(native.packageId);
    if (!UUID_PATTERN.test(releaseId) || !nativeActivityId || !UUID_PATTERN.test(packageId)) continue;
    const identity = `published_native:${releaseId.toLowerCase()}:${nativeActivityId}`;
    const packageSlug = getCatalogPackageSlug(native.packageSlug || native.packageTitle);
    const packageTitle = text(native.packageTitle) || packageSlug;
    const componentTitle = text(native.componentTitle);
    const title = text(native.title) || nativeActivityId;
    addCanonicalOption(optionsByIdentity, {
      id: identity,
      identity,
      targetKind: "published_native",
      target: { kind: "published_native", releaseId: releaseId.toLowerCase(), nativeActivityId,
        ...(native.placements?.length === 1 ? { locator: { pageId: native.placements[0].pageId, hotspotId: native.placements[0].hotspotId, ...(native.productReleaseId ? { productReleaseId: native.productReleaseId } : {}) } } : {}) },
      title,
      label: `${[packageTitle, componentTitle, title].filter(Boolean).join(" / ")} (${native.nativeKind}${native.assignable ? "" : ", display only"})`,
      packageId,
      packageSlug,
      packageTitle,
      packageSortOrder: packageOrder(packageSlug),
      componentId: text(native.componentId),
      componentSlug: text(native.componentSlug),
      componentTitle,
      component: componentTitle,
      componentSortOrder: native.componentSortOrder,
      activitySortOrder: native.activitySortOrder,
      nativeKind: native.nativeKind,
      releaseNumber: Number(native.releaseNumber),
      assignable: native.assignable,
    });
  }
  return [...optionsByIdentity.values()].sort(compareOptions);
}

export function buildAssignmentCatalogState({
  packageTrees = [], packageLoading = false, packageLoaded = false, packageError = "",
  nativeTargets = [], nativeLoading = false, nativeLoaded = false, nativeError = "",
} = {}) {
  const legacyFailed = Boolean(packageError);
  const nativeFailed = Boolean(nativeError);
  const unavailable = legacyFailed && nativeFailed;
  const warning = unavailable
    ? "Assignable activities are temporarily unavailable. Book activities and published activities could not be loaded."
    : legacyFailed
      ? "Book activities are temporarily unavailable. Published activities remain available."
      : nativeFailed
        ? "Published activities are temporarily unavailable. Book activities remain available."
        : "";
  return {
    options: buildHomeworkActivityOptions(legacyFailed ? [] : packageTrees, nativeFailed ? [] : nativeTargets),
    loading: Boolean((packageLoading && !packageLoaded && !legacyFailed) || (nativeLoading && !nativeLoaded && !nativeFailed)),
    unavailable,
    warning,
    legacyFailed,
    nativeFailed,
  };
}

export function selectedClassPackageState(classes = [], selectedClassIds = []) {
  if (!selectedClassIds.length) return { packageId: null, conflict: "no-classes", message: "Choose at least one class." };
  const classesById = new Map(classes.map((item) => [String(item.id), item]));
  const selected = selectedClassIds.map((id) => classesById.get(String(id))).filter(Boolean);
  if (selected.length !== selectedClassIds.length) return { packageId: null, conflict: "unknown-class", message: "One selected class is no longer available. Choose classes again." };
  const withoutPackage = selected.find((item) => !item.bookPackageId);
  if (withoutPackage) return { packageId: null, conflict: "class-package-unassigned", message: `Class “${withoutPackage.name}” is not linked to a book package. Link the class to a book before assigning new work.` };
  const packageIds = [...new Set(selected.map((item) => String(item.bookPackageId)))];
  if (packageIds.length !== 1) return { packageId: null, conflict: "mixed-class-packages", message: "Selected classes use different book packages. Choose classes from one book package for this Homework." };
  return { packageId: packageIds[0], conflict: "", message: "" };
}

export function compatibleHomeworkActivityOptions(activityOptions = [], classes = [], selectedClassIds = []) {
  const classState = selectedClassPackageState(classes, selectedClassIds);
  return {
    ...classState,
    options: classState.packageId
      ? activityOptions.filter((item) => item.assignable !== false && String(item.packageId) === classState.packageId)
      : [],
  };
}

export function homeworkPackageCompatibilityIssue(classes = [], selectedClassIds = [], selectedActivities = []) {
  const classState = selectedClassPackageState(classes, selectedClassIds);
  if (classState.conflict) return classState;
  const incompatible = selectedActivities.find((item) => !item.packageId || String(item.packageId) !== classState.packageId);
  return incompatible
    ? { ...classState, conflict: "class-package-mismatch", message: `“${incompatible.title}” belongs to a different book package. Remove it or choose compatible classes.` }
    : classState;
}

export function addSelectedHomeworkActivity(selected, option) {
  if (!option || option.assignable === false || selected.some((item) => item.id === option.id)) return selected;
  return [...selected, option];
}

export function removeSelectedHomeworkActivity(selected, id) {
  return selected.filter((item) => item.id !== id);
}

export function moveSelectedHomeworkActivity(selected, index, direction) {
  const nextIndex = index + direction;
  if (index < 0 || index >= selected.length || nextIndex < 0 || nextIndex >= selected.length) return selected;
  const reordered = [...selected];
  [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
  return reordered;
}

export function homeworkItemSelection(item, activityOptions = []) {
  const optionId = item.targetKind === "published_native"
    ? `published_native:${item.nativeReleaseId}:${item.nativeActivityId}`
    : `legacy_activity:${item.activityId}`;
  const activeOption = activityOptions.find((option) => option.id === optionId);
  if (activeOption) return { ...activeOption, target: { ...activeOption.target, ...(item.bookLocator ? { locator: item.bookLocator } : {}) } };
  return {
    id: optionId,
    identity: optionId,
    activityId: item.activityId || null,
    targetKind: item.targetKind,
    target: item.targetKind === "published_native" ? {
      kind: "published_native",
      releaseId: item.nativeReleaseId,
      nativeActivityId: item.nativeActivityId,
      ...(item.bookLocator ? { locator: item.bookLocator } : {}),
    } : { kind: "legacy_activity", activityId: item.activityId },
    title: item.title,
    label: item.title,
    component: item.componentTitle || item.packageTitle || "Homework",
    componentTitle: item.componentTitle || "",
    packageId: item.packageId || null,
    packageSlug: item.packageSlug || "",
    packageTitle: item.packageTitle || "",
    assignable: true,
  };
}

export function homeworkDueDateInputValue(dueAt) {
  return typeof dueAt === "string" && /^\d{4}-\d{2}-\d{2}/.test(dueAt) ? dueAt.slice(0, 10) : "";
}

export function homeworkItemRequest(option) {
  return option.targetKind === "published_native"
    ? option.target
    : { kind: "legacy_activity", activityId: option.activityId || String(option.id).replace(/^legacy_activity:/, "") };
}
