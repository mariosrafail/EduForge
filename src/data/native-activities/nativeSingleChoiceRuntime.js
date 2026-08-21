export function selectNativeSingleChoiceResponse(responses, questionId, optionId) {
  return { ...(responses || {}), [questionId]: optionId };
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
