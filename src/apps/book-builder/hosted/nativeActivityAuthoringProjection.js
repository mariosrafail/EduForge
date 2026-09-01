import { normalizeStageGeometry, roundStageValue } from "../../../components/builder-studio/stageGeometry.js";

const INTEGER_VISUAL_KEYS = new Set([
  "sourceWidth", "sourceHeight", "fontSize", "paddingX", "paddingY", "lineWidth", "lineSpacing",
  "answerFontSizeMin", "answerFontSizeMax", "scrollY", "strokeWidth", "borderWidth",
]);

function isGeometry(value) {
  return value && typeof value === "object" && ["x", "y", "width", "height"].every((key) => Number.isFinite(Number(value[key])));
}

function normalizeVisualNode(value, inheritedStage = null) {
  if (!value || typeof value !== "object") return;
  const ownStage = value.surface && Number(value.surface.width) > 0 && Number(value.surface.height) > 0
    ? { width: Math.max(1, roundStageValue(Number(value.surface.width))), height: Math.max(1, roundStageValue(Number(value.surface.height))) }
    : Number(value.sourceWidth) > 0 && Number(value.sourceHeight) > 0
      ? { width: Math.max(1, roundStageValue(Number(value.sourceWidth))), height: Math.max(1, roundStageValue(Number(value.sourceHeight))) }
      : inheritedStage;

  if (isGeometry(value)) {
    const normalized = inheritedStage
      ? normalizeStageGeometry(value, inheritedStage)
      : Object.fromEntries(["x", "y", "width", "height"].map((key) => [key, roundStageValue(Number(value[key]))]));
    Object.assign(value, normalized);
  }
  for (const key of INTEGER_VISUAL_KEYS) {
    if (Number.isFinite(Number(value[key]))) value[key] = roundStageValue(Number(value[key]));
  }
  if (Array.isArray(value.linePositions)) value.linePositions = value.linePositions.map((position) => roundStageValue(Number(position)));
  for (const [key, child] of Object.entries(value)) {
    if (key === "surface" && isGeometry({ x: 0, y: 0, ...child })) {
      child.width = ownStage.width;
      child.height = ownStage.height;
      continue;
    }
    if (Array.isArray(child)) child.forEach((entry) => normalizeVisualNode(entry, ownStage));
    else if (child && typeof child === "object") normalizeVisualNode(child, ownStage);
  }
}

export function normalizeNativeActivityAuthoringVisualValues(document) {
  const normalized = structuredClone(document);
  normalizeVisualNode(normalized);
  return normalized;
}

export function projectNativeActivityPublicForAuthoring(document) {
  const projected = normalizeNativeActivityAuthoringVisualValues(document);
  projected.metadata.visibleInstructionText = "";
  return projected;
}
