const DEFAULT_PRECISION = 0;

export const STAGE_RESIZE_HANDLES = Object.freeze(["nw", "ne", "sw", "se"]);

export function clampStageValue(value, minimum, maximum) {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(Math.max(value, minimum), maximum);
}

export function roundStageValue(value, precision = DEFAULT_PRECISION) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** precision;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function normalizeStageGeometry(geometry, stage, { minWidth = 1, minHeight = 1 } = {}) {
  const width = clampStageValue(roundStageValue(Number(geometry?.width)), Math.ceil(minWidth), Math.round(stage.width));
  const height = clampStageValue(roundStageValue(Number(geometry?.height)), Math.ceil(minHeight), Math.round(stage.height));
  return {
    x: clampStageValue(roundStageValue(Number(geometry?.x)), 0, Math.max(0, Math.round(stage.width) - width)),
    y: clampStageValue(roundStageValue(Number(geometry?.y)), 0, Math.max(0, Math.round(stage.height) - height)),
    width,
    height,
  };
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

function validAspectRatio(value) {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function resizeWithAspectRatio(geometry, handle, delta, stage, minimums, fixedAspectRatio = null) {
  const ratio = validAspectRatio(fixedAspectRatio) || geometry.width / geometry.height;
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
  const baseWidth = geometry.width;
  const baseHeight = baseWidth / ratio;
  const minimumScale = Math.max(minimums.width / baseWidth, minimums.height / baseHeight);
  const maximumScale = Math.max(minimumScale, Math.min(maximumWidth / baseWidth, maximumHeight / baseHeight));
  const scale = clampStageValue(candidateScale, minimumScale, maximumScale);
  const width = baseWidth * scale;
  const height = width / ratio;
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
  aspectRatio = null,
  precision = DEFAULT_PRECISION,
} = {}) {
  if (locked || !STAGE_RESIZE_HANDLES.includes(handle)) return { ...geometry };
  const minimums = {
    width: clampStageValue(minWidth, 0.001, stage.width),
    height: clampStageValue(minHeight, 0.001, stage.height),
  };
  const next = preserveAspectRatio
    ? resizeWithAspectRatio(geometry, handle, delta, stage, minimums, aspectRatio)
    : resizeFreeform(geometry, handle, delta, stage, minimums);
  const rounded = Object.fromEntries(Object.entries(next).map(([key, value]) => [key, roundStageValue(value, precision)]));
  if (!preserveAspectRatio) return rounded;
  if (handle.includes("w")) rounded.x = roundStageValue(geometry.x + geometry.width, precision) - rounded.width;
  if (handle.includes("n")) rounded.y = roundStageValue(geometry.y + geometry.height, precision) - rounded.height;
  return rounded;
}

export function normalizeStageGeometryAspectRatio(geometry, stage, {
  aspectRatio,
  minWidth = 1,
  minHeight = 1,
  precision = DEFAULT_PRECISION,
} = {}) {
  const ratio = validAspectRatio(aspectRatio);
  if (!ratio) return { ...geometry };
  const minimumWidth = Math.max(minWidth, minHeight * ratio);
  const maximumWidth = Math.min(stage.width, stage.height * ratio);
  const idealWidth = (geometry.width + geometry.height / ratio) / (1 + 1 / (ratio * ratio));
  const width = roundStageValue(clampStageValue(idealWidth, Math.min(minimumWidth, maximumWidth), maximumWidth), precision);
  const height = roundStageValue(width / ratio, precision);
  const centerX = geometry.x + geometry.width / 2;
  const centerY = geometry.y + geometry.height / 2;
  return {
    x: roundStageValue(clampStageValue(centerX - width / 2, 0, stage.width - width), precision),
    y: roundStageValue(clampStageValue(centerY - height / 2, 0, stage.height - height), precision),
    width,
    height,
  };
}

export function updateStageGeometryField(geometry, key, rawValue, stage, {
  aspectRatio = null,
  minWidth = 1,
  minHeight = 1,
  precision = DEFAULT_PRECISION,
} = {}) {
  const value = Number(rawValue);
  if (!Number.isFinite(value) || !["x", "y", "width", "height"].includes(key)) return { ...geometry };
  const ratio = validAspectRatio(aspectRatio);
  if (key === "x" || key === "y") {
    const maximum = key === "x" ? stage.width - geometry.width : stage.height - geometry.height;
    return { ...geometry, [key]: roundStageValue(clampStageValue(value, 0, maximum), precision) };
  }
  if (!ratio) {
    const maximum = key === "width" ? stage.width - geometry.x : stage.height - geometry.y;
    const minimum = key === "width" ? minWidth : minHeight;
    return { ...geometry, [key]: roundStageValue(clampStageValue(value, minimum, maximum), precision) };
  }
  if (key === "width") {
    const minimum = Math.max(minWidth, minHeight * ratio);
    const maximum = Math.min(stage.width - geometry.x, (stage.height - geometry.y) * ratio);
    const width = roundStageValue(clampStageValue(value, Math.min(minimum, maximum), maximum), precision);
    return { ...geometry, width, height: roundStageValue(width / ratio, precision) };
  }
  const minimum = Math.max(minHeight, minWidth / ratio);
  const maximum = Math.min(stage.height - geometry.y, (stage.width - geometry.x) / ratio);
  const height = roundStageValue(clampStageValue(value, Math.min(minimum, maximum), maximum), precision);
  return { ...geometry, width: roundStageValue(height * ratio, precision), height };
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
