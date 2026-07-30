export function quantityLabel(value, singular, plural = `${singular}s`) {
  const count = Number(value);
  return `${count} ${count === 1 ? singular : plural}`;
}

function liveValue(state, format) {
  if (state?.loading) return "Loading…";
  if (state?.error || !state?.data) return "Unavailable";
  return format(state.data);
}

export function teacherSectionMetric(section, state) {
  if (section.capabilityLabel) return section.capabilityLabel;
  return liveValue(state, ({ metrics }) => {
    if (section.id === "books") return quantityLabel(metrics.activeBookComponents, "active component");
    if (section.id === "classes") return quantityLabel(metrics.activeClasses, "active class", "active classes");
    if (section.id === "students") return quantityLabel(metrics.activeStudents, "active student");
    if (section.id === "assignments") return quantityLabel(metrics.activeAssignments, "active assignment");
    return "";
  });
}

export function studentCardMetric(cardId, state) {
  return liveValue(state, ({ metrics }) => {
    if (cardId === "books") return quantityLabel(metrics.activeBookComponents, "active component");
    if (cardId === "assignments") return quantityLabel(metrics.pendingAssignments, "pending assignment");
    if (cardId === "grades") {
      return metrics.averageScore === null ? "No scored work yet" : `${metrics.averageScore}% average`;
    }
    return "";
  });
}

export function studentProfilePresentation(state) {
  if (state?.loading) return { detail: "Loading…", tag: "Loading…" };
  if (state?.error || !state?.data) return { detail: "Unavailable", tag: "Unavailable" };
  const { schoolName, primaryClassName, level } = state.data.profile;
  const detail = primaryClassName && schoolName
    ? `${primaryClassName} / ${schoolName}`
    : primaryClassName || schoolName || "No active class yet";
  return { detail, tag: level ? `${level} class` : "Active account" };
}

export function studentGradeSummary(state) {
  if (state?.loading) {
    return { average: "Loading…", completed: "Loading…", pending: "Loading…" };
  }
  if (state?.error || !state?.data) {
    return { average: "Unavailable", completed: "Unavailable", pending: "Unavailable" };
  }
  const { metrics } = state.data;
  return {
    average: metrics.averageScore === null ? "No scored work" : `${metrics.averageScore}%`,
    completed: String(metrics.completedAssignments),
    pending: String(metrics.pendingAssignments),
  };
}
