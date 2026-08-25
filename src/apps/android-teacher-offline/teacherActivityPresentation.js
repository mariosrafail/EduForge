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
  const view = ["text", "video"].includes(source.view) ? source.view : "questions";
  return { view, panelIndex, panelCount, panelNavigationActive: source.panelNavigationActive === true, reveal, readableTextAvailable: source.readableTextAvailable === true, videoAvailable: source.videoAvailable === true, audioFocusActive: source.audioFocusActive === true };
}
