export const EMBEDDED_ACTIVITY_MIN_TARGET_SIZE = 38;

export function calculateEmbeddedActivityScale({ availableWidth, availableHeight, contentWidth, contentHeight }) {
  if (![availableWidth, availableHeight, contentWidth, contentHeight].every((value) => Number(value) > 0)) return 1;
  return Math.min(1, availableWidth / contentWidth, availableHeight / contentHeight);
}

export function resolveEmbeddedActivityFit({ minimumTargetSize, ...dimensions }) {
  const scale = calculateEmbeddedActivityScale(dimensions);
  void minimumTargetSize;
  return { mode: "scale", scale };
}
