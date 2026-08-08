export const TEACHER_STAGE_WIDTH = 1920;
export const TEACHER_STAGE_HEIGHT = 1080;

export function renderedDeltaToTeacherStage(delta, scale) {
  const safeScale = Number(scale);
  return Number(delta) / (Number.isFinite(safeScale) && safeScale > 0 ? safeScale : 1);
}
