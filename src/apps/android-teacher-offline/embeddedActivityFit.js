export function calculateEmbeddedActivityScale({ availableWidth, availableHeight, contentWidth, contentHeight }) {
  if (![availableWidth, availableHeight, contentWidth, contentHeight].every((value) => Number(value) > 0)) return 1;
  return Math.min(1, availableWidth / contentWidth, availableHeight / contentHeight);
}
