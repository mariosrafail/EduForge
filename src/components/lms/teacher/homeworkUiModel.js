export function buildHomeworkActivityOptions(packageTree = {}, nativeTargets = []) {
  const options = [];
  for (const component of packageTree.components || []) {
    for (const unit of component.units || []) {
      for (const lesson of unit.lessons || []) {
        for (const exercise of lesson.exercises || []) {
          if (exercise.assignable === false || exercise.isAssignable === false) continue;
          const assignmentActivityId = exercise.assignmentActivityId || exercise.dbActivity?.id;
          if (!assignmentActivityId) continue;
          options.push({
            id: assignmentActivityId,
            targetKind: "legacy_activity",
            title: exercise.title,
            label: `${component.title} / ${unit.title} / ${exercise.title}`,
            component: component.title,
          });
        }
      }
    }
  }
  for (const native of nativeTargets) {
    options.push({
      id: `native:${native.target.releaseId}:${native.target.nativeActivityId}`,
      targetKind: "published_native",
      target: native.target,
      title: native.title,
      label: `${native.packageTitle} / ${native.componentTitle} / ${native.title} (${native.nativeKind}${native.assignable ? "" : ", display only"})`,
      component: native.componentTitle,
      assignable: native.assignable,
    });
  }
  return options;
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
    ? `native:${item.nativeReleaseId}:${item.nativeActivityId}`
    : item.activityId;
  return activityOptions.find((option) => String(option.id) === String(optionId)) || {
    id: optionId,
    targetKind: item.targetKind,
    target: item.targetKind === "published_native" ? {
      kind: "published_native",
      releaseId: item.nativeReleaseId,
      nativeActivityId: item.nativeActivityId,
    } : undefined,
    title: item.title,
    label: item.title,
    component: item.componentTitle || item.packageTitle || "Homework",
    assignable: true,
  };
}

export function homeworkDueDateInputValue(dueAt) {
  return typeof dueAt === "string" && /^\d{4}-\d{2}-\d{2}/.test(dueAt) ? dueAt.slice(0, 10) : "";
}

export function homeworkItemRequest(option) {
  return option.targetKind === "published_native"
    ? option.target
    : { kind: "legacy_activity", activityId: option.id };
}
