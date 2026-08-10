const nonNegativeInteger = (value) => Number.isInteger(value) && value >= 0 ? value : 0;

export function normalizeTeacherActivityPresentationState(value, fallback = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const panelCount = nonNegativeInteger(source.panelCount ?? fallback.panelCount);
  const panelIndex = Math.min(nonNegativeInteger(source.panelIndex ?? fallback.panelIndex), Math.max(0, panelCount - 1));
  const revealSource = source.reveal;
  const reveal = revealSource?.supported === true ? {
    supported: true,
    total: nonNegativeInteger(revealSource.total),
    revealed: Math.min(nonNegativeInteger(revealSource.revealed), nonNegativeInteger(revealSource.total)),
    pristine: revealSource.pristine === true,
  } : null;
  return { view: source.view === "text" ? "text" : "questions", panelIndex, panelCount, reveal };
}
