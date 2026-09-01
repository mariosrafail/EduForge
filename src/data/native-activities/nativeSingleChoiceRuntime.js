export function selectNativeSingleChoiceResponse(responses, questionId, optionId, question = null) {
  const next = { ...(responses || {}) };
  if (question?.selectionMode !== "multiple") {
    next[questionId] = optionId;
    return next;
  }
  const current = Array.isArray(next[questionId]) ? next[questionId] : [];
  const selected = new Set(current);
  if (selected.has(optionId)) selected.delete(optionId); else selected.add(optionId);
  const canonical = (question.options || []).map((option) => option.id).filter((id) => selected.has(id));
  if (canonical.length) next[questionId] = canonical; else delete next[questionId];
  return next;
}

export function updateNativeSingleChoiceVisualNavigation(state, panelCount, action) {
  const lastIndex = Math.max(0, panelCount - 1);
  const current = { panelIndex: clampNavigationIndex(state?.panelIndex, lastIndex), showAll: Boolean(state?.showAll) };
  if (action === "next") return { ...current, panelIndex: Math.min(current.panelIndex + 1, lastIndex) };
  if (action === "toggle-all") return { ...current, showAll: !current.showAll };
  if (action === "paged") return { ...current, showAll: false };
  return current;
}

function clampNavigationIndex(value, lastIndex) {
  return Number.isSafeInteger(value) ? Math.min(Math.max(value, 0), lastIndex) : 0;
}

export function visibleNativeSingleChoicePanelIndexes(state, panelCount) {
  const normalized = updateNativeSingleChoiceVisualNavigation(state, panelCount, "normalize");
  return normalized.showAll ? Array.from({ length: panelCount }, (_, index) => index) : panelCount ? [normalized.panelIndex] : [];
}
