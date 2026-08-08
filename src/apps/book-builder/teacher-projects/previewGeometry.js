export function containedTeacherStage({ width, height, stageWidth = 1920, stageHeight = 1080 }) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const scale = Math.min(safeWidth / stageWidth, safeHeight / stageHeight);
  return {
    width: safeWidth,
    height: safeHeight,
    scale,
    left: (safeWidth - stageWidth * scale) / 2,
    top: (safeHeight - stageHeight * scale) / 2,
  };
}
