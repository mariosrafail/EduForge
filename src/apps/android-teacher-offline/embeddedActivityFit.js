export const EMBEDDED_ACTIVITY_MIN_TARGET_SIZE = 38;

export function calculateEmbeddedActivityScale({ availableWidth, availableHeight, contentWidth, contentHeight }) {
  if (![availableWidth, availableHeight, contentWidth, contentHeight].every((value) => Number(value) > 0)) return 1;
  return Math.min(1, availableWidth / contentWidth, availableHeight / contentHeight);
}

export function resolveEmbeddedActivityFit({ minimumTargetSize, ...dimensions }) {
  const scale = calculateEmbeddedActivityScale(dimensions);
  const targetSize = Number(minimumTargetSize);
  if (targetSize > 0 && targetSize * scale < EMBEDDED_ACTIVITY_MIN_TARGET_SIZE) {
    return { mode: "scroll", scale: 1 };
  }
  return { mode: "scale", scale };
}
