const DEFAULT_PRECISION = 3;

export const STAGE_RESIZE_HANDLES = Object.freeze(["nw", "ne", "sw", "se"]);

export function clampStageValue(value, minimum, maximum) {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(Math.max(value, minimum), maximum);
}

export function roundStageValue(value, precision = DEFAULT_PRECISION) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export function clientPointToStage({ clientX, clientY }, rect, stage) {
  const scaleX = stage.width / Math.max(rect.width, 1);
  const scaleY = stage.height / Math.max(rect.height, 1);
  return {
    x: roundStageValue((clientX - rect.left) * scaleX),
    y: roundStageValue((clientY - rect.top) * scaleY),
    scaleX,
    scaleY,
  };
}

export function moveStageGeometry(geometry, delta, stage, { locked = false, precision = DEFAULT_PRECISION } = {}) {
  if (locked) return { ...geometry };
  return {
    ...geometry,
    x: roundStageValue(clampStageValue(geometry.x + delta.x, 0, stage.width - geometry.width), precision),
    y: roundStageValue(clampStageValue(geometry.y + delta.y, 0, stage.height - geometry.height), precision),
  };
}

function resizeFreeform(geometry, handle, delta, stage, minimums) {
  const right = geometry.x + geometry.width;
  const bottom = geometry.y + geometry.height;
  const west = handle.includes("w");
  const north = handle.includes("n");
  const nextLeft = west
    ? clampStageValue(geometry.x + delta.x, 0, right - minimums.width)
    : geometry.x;
  const nextRight = west
    ? right
    : clampStageValue(right + delta.x, geometry.x + minimums.width, stage.width);
  const nextTop = north
    ? clampStageValue(geometry.y + delta.y, 0, bottom - minimums.height)
    : geometry.y;
  const nextBottom = north
    ? bottom
    : clampStageValue(bottom + delta.y, geometry.y + minimums.height, stage.height);
  return { x: nextLeft, y: nextTop, width: nextRight - nextLeft, height: nextBottom - nextTop };
}

function resizeWithAspectRatio(geometry, handle, delta, stage, minimums) {
  const west = handle.includes("w");
  const north = handle.includes("n");
  const anchorX = west ? geometry.x + geometry.width : geometry.x;
  const anchorY = north ? geometry.y + geometry.height : geometry.y;
  const widthCandidate = west ? geometry.width - delta.x : geometry.width + delta.x;
  const heightCandidate = north ? geometry.height - delta.y : geometry.height + delta.y;
  const widthScale = widthCandidate / geometry.width;
  const heightScale = heightCandidate / geometry.height;
  const candidateScale = Math.abs(widthScale - 1) >= Math.abs(heightScale - 1) ? widthScale : heightScale;
  const maximumWidth = west ? anchorX : stage.width - anchorX;
  const maximumHeight = north ? anchorY : stage.height - anchorY;
  const minimumScale = Math.max(minimums.width / geometry.width, minimums.height / geometry.height);
  const maximumScale = Math.max(minimumScale, Math.min(maximumWidth / geometry.width, maximumHeight / geometry.height));
  const scale = clampStageValue(candidateScale, minimumScale, maximumScale);
  const width = geometry.width * scale;
  const height = geometry.height * scale;
  return {
    x: west ? anchorX - width : anchorX,
    y: north ? anchorY - height : anchorY,
    width,
    height,
  };
}

export function resizeStageGeometry(geometry, handle, delta, stage, {
  locked = false,
  minWidth = 1,
  minHeight = 1,
  preserveAspectRatio = false,
  precision = DEFAULT_PRECISION,
} = {}) {
  if (locked || !STAGE_RESIZE_HANDLES.includes(handle)) return { ...geometry };
  const minimums = {
    width: clampStageValue(minWidth, 0.001, stage.width),
    height: clampStageValue(minHeight, 0.001, stage.height),
  };
  const next = preserveAspectRatio
    ? resizeWithAspectRatio(geometry, handle, delta, stage, minimums)
    : resizeFreeform(geometry, handle, delta, stage, minimums);
  return Object.fromEntries(Object.entries(next).map(([key, value]) => [key, roundStageValue(value, precision)]));
}

export function transformStageGeometry({
  geometry,
  operation,
  handle = "se",
  startPoint,
  currentPoint,
  stage,
  ...options
}) {
  const delta = {
    x: currentPoint.x - startPoint.x,
    y: currentPoint.y - startPoint.y,
  };
  return operation === "move"
    ? moveStageGeometry(geometry, delta, stage, options)
    : resizeStageGeometry(geometry, handle, delta, stage, options);
}

export function percentGeometryToStage(area) {
  return { x: area.left, y: area.top, width: area.width, height: area.height };
}

export function stageGeometryToPercent(area, precision = DEFAULT_PRECISION) {
  return {
    left: roundStageValue(area.x, precision),
    top: roundStageValue(area.y, precision),
    width: roundStageValue(area.width, precision),
    height: roundStageValue(area.height, precision),
  };
}

export function logicalAreaStyle(area, stage) {
  return {
    left: `${(area.x / stage.width) * 100}%`,
    top: `${(area.y / stage.height) * 100}%`,
    width: `${(area.width / stage.width) * 100}%`,
    height: `${(area.height / stage.height) * 100}%`,
  };
}
