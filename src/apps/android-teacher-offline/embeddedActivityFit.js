export const EMBEDDED_ACTIVITY_MIN_TARGET_SIZE = 38;

export function calculateEmbeddedActivityScale({ availableWidth, availableHeight, contentWidth, contentHeight }) {
  if (![availableWidth, availableHeight, contentWidth, contentHeight].every((value) => Number(value) > 0)) return 1;
  return Math.min(1, availableWidth / contentWidth, availableHeight / contentHeight);
}

export function resolveEmbeddedActivityFit({ minimumTargetSize, ...dimensions }) {
  const scale = calculateEmbeddedActivityScale(dimensions);
  const targetSize = Number(minimumTargetSize);
  // In the teacher reader, shrinking a tall worksheet to fit its full height
  // also leaves conspicuous unused bands at the sides of the 16:9 stage.
  // Keep the activity surface at the reader width and allow its own safe
  // scroll container to expose the remaining vertical content instead.
  if (scale < 1 || (targetSize > 0 && targetSize * scale < EMBEDDED_ACTIVITY_MIN_TARGET_SIZE)) {
    return { mode: "scroll", scale: 1 };
  }
  return { mode: "scale", scale };
}
