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

export function homeworkItemRequest(option) {
  return option.targetKind === "published_native"
    ? option.target
    : { kind: "legacy_activity", activityId: option.id };
}
