import { normalizeUltimateB2ExerciseVisualCapabilities } from "./exerciseVisualCapabilities.js";
import {
  normalizeUltimateB2Page5OpenResponseAuthoring,
  normalizeUltimateB2Page5TeacherAnswers,
  ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID,
} from "./page5AuthoringSchema.js";
import { ultimateB2PublisherCreatedActivities } from "./publisherCreatedActivities.js";

export { ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID };

export const ULTIMATE_B2_UNIT2_OPENER_OPEN_RESPONSE_ID = "ultimate-b2-sb-u2-p1-o1";
export const ULTIMATE_B2_OPEN_RESPONSE_ACTIVITY_IDS = Object.freeze([
  ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID,
  ULTIMATE_B2_UNIT2_OPENER_OPEN_RESPONSE_ID,
  ...ultimateB2PublisherCreatedActivities.filter((activity) => activity.authoringKind === "open-response").map((activity) => activity.activityId),
]);

export const ultimateB2OpenResponseLimits = Object.freeze({
  payloadBytes: 256_000,
  sourceFiles: 34,
  artworkLayers: 32,
  questions: 20,
  textLength: 2_000,
  modelAnswerLength: 5_000,
  responseRegionLabelLength: 300,
});

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function exactKeys(value, allowed, label) {
  const keys = Object.keys(record(value, label));
  const allowedSet = new Set(allowed);
  if (keys.some((key) => !allowedSet.has(key)) || allowed.some((key) => !keys.includes(key))) throw new Error(`${label} has missing or unknown fields.`);
}

function safeActivityId(value, allowUnregisteredDraft = false) {
  if (!ULTIMATE_B2_OPEN_RESPONSE_ACTIVITY_IDS.includes(value) && !(allowUnregisteredDraft && /^ultimate-b2-sb-u[1-9]\d*-p[1-9]\d*-o[1-9]\d*$/.test(value))) throw new Error("Unsupported Ultimate B2 Open Response activity ID.");
  return value;
}

function boundedText(value, label, maximum, { allowEmpty = false } = {}) {
  if (typeof value !== "string" || value.length > maximum || (!allowEmpty && !value.trim())) throw new Error(`${label} must be ${allowEmpty ? "a string" : "a non-empty string"} no longer than ${maximum} characters.`);
  if (/[<>]/.test(value)) throw new Error(`${label} must not contain HTML markup.`);
  return value.trim();
}

function safeFilename(value, label) {
  const name = boundedText(value, label, 160);
  if (name !== name.split(/[\\/]/).at(-1) || name === "." || name === ".." || /^(?:[a-z]:|\\\\|\/)/i.test(name) || /%2f|%5c/i.test(name)) throw new Error(`${label} must be a safe basename.`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) throw new Error(`${label} contains unsupported characters.`);
  return name;
}

function finiteNumber(value, label, minimum = 0, maximum = 8192) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${label} must be a number from ${minimum} to ${maximum}.`);
  return Math.round(value * 10_000) / 10_000;
}

function size(value, label) {
  exactKeys(value, ["width", "height"], label);
  return { width: finiteNumber(value.width, `${label}.width`, 1), height: finiteNumber(value.height, `${label}.height`, 1) };
}

function area(value, label, surface) {
  exactKeys(value, ["x", "y", "width", "height"], label);
  const normalized = {
    x: finiteNumber(value.x, `${label}.x`),
    y: finiteNumber(value.y, `${label}.y`),
    width: finiteNumber(value.width, `${label}.width`, 1),
    height: finiteNumber(value.height, `${label}.height`, 1),
  };
  if (normalized.x + normalized.width > surface.width || normalized.y + normalized.height > surface.height) throw new Error(`${label} must stay inside the authored canvas.`);
  return normalized;
}

function textStyle(value, label) {
  exactKeys(value, ["fontFamily", "fontSize", "color", "align"], label);
  if (!/^#[0-9a-f]{6}$/i.test(value.color)) throw new Error(`${label}.color must be a six-digit hex color.`);
  if (!["left", "center", "right"].includes(value.align)) throw new Error(`${label}.align is unsupported.`);
  return {
    fontFamily: boundedText(value.fontFamily, `${label}.fontFamily`, 100),
    fontSize: finiteNumber(value.fontSize, `${label}.fontSize`, 8, 96),
    color: value.color.toLowerCase(),
    align: value.align,
  };
}

function assertPayloadSize(value) {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > ultimateB2OpenResponseLimits.payloadBytes) throw new Error("Open Response authoring payload is too large.");
}

function normalizeSource(value, surface) {
  exactKeys(value, ["kind", "canvas", "files"], "source");
  if (value.kind !== "publisher-open-response-xml") throw new Error("Unknown Open Response source kind.");
  const canvas = size(value.canvas, "source.canvas");
  if (JSON.stringify(canvas) !== JSON.stringify(surface)) throw new Error("Source canvas must match the authored surface.");
  if (!Array.isArray(value.files) || value.files.length < 2 || value.files.length > ultimateB2OpenResponseLimits.sourceFiles) throw new Error("Source provenance file count is invalid.");
  const names = new Set();
  const files = value.files.map((file, index) => {
    exactKeys(file, ["name", "sha256"], `source.files[${index}]`);
    const name = safeFilename(file.name, `source.files[${index}].name`);
    const lower = name.toLowerCase();
    if (names.has(lower)) throw new Error("Source provenance contains duplicate filenames.");
    names.add(lower);
    if (!/^[a-f0-9]{64}$/i.test(file.sha256)) throw new Error(`source.files[${index}].sha256 is invalid.`);
    return { name, sha256: file.sha256.toLowerCase() };
  });
  return { kind: value.kind, canvas, files };
}

function normalizeArtworkLayer(value, index, activityId, surface, sourceFiles) {
  const label = `artworkLayers[${index}]`;
  exactKeys(value, ["id", "binding", "repositoryPath", "sourceFile", "sha256", "naturalSize", "area", "order", "altText", "accessibilityStatus"], label);
  const expectedId = `${activityId}-artwork-${index + 1}`;
  if (value.id !== expectedId) throw new Error(`${label}.id must follow deterministic source order.`);
  if (typeof value.binding !== "string" || !new RegExp(`^open-response\\.${activityId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.artwork\\.${index + 1}\\.[a-f0-9]{12}$`).test(value.binding)) throw new Error(`${label}.binding is invalid.`);
  const repositoryPath = boundedText(value.repositoryPath, `${label}.repositoryPath`, 300);
  const expectedPrefix = `src/assets/books/ultimate-b2/authoring/open-response/${activityId}/`;
  if (!repositoryPath.startsWith(expectedPrefix) || repositoryPath.slice(expectedPrefix.length) !== repositoryPath.slice(expectedPrefix.length).split(/[\\/]/).at(-1)) throw new Error(`${label}.repositoryPath is outside the managed asset directory.`);
  const sourceFile = safeFilename(value.sourceFile, `${label}.sourceFile`);
  const provenance = sourceFiles.find((file) => file.name.toLowerCase() === sourceFile.toLowerCase());
  if (!provenance || provenance.sha256 !== String(value.sha256).toLowerCase()) throw new Error(`${label} must match source provenance.`);
  if (value.order !== index || !Number.isInteger(value.order)) throw new Error(`${label}.order must follow deterministic source order.`);
  if (!["review-required", "reviewed", "decorative"].includes(value.accessibilityStatus)) throw new Error(`${label}.accessibilityStatus is invalid.`);
  return {
    id: value.id,
    binding: value.binding,
    repositoryPath,
    sourceFile,
    sha256: provenance.sha256,
    naturalSize: size(value.naturalSize, `${label}.naturalSize`),
    area: area(value.area, `${label}.area`, surface),
    order: value.order,
    altText: boundedText(value.altText, `${label}.altText`, ultimateB2OpenResponseLimits.textLength, { allowEmpty: true }),
    accessibilityStatus: value.accessibilityStatus,
  };
}

function normalizeResponseRegion(value, index, questionId, surface) {
  const label = `questions[${index}].responseRegion`;
  exactKeys(value, ["id", "ariaLabel", "area", "presentation"], label);
  if (value.id !== `${questionId}-response`) throw new Error(`${label}.id is invalid.`);
  const normalizedArea = area(value.area, `${label}.area`, surface);
  exactKeys(value.presentation, ["paddingX", "paddingY", "lineSpacing", "fontScale", "lineCount", "linePositions", "lineWidth", "fontFamily", "fontSize", "color", "align"], `${label}.presentation`);
  const lineCount = finiteNumber(value.presentation.lineCount, `${label}.presentation.lineCount`, 1, 20);
  if (!Number.isInteger(lineCount) || !Array.isArray(value.presentation.linePositions) || value.presentation.linePositions.length !== lineCount) throw new Error(`${label}.presentation line positions must match lineCount.`);
  return {
    id: value.id,
    ariaLabel: boundedText(value.ariaLabel, `${label}.ariaLabel`, ultimateB2OpenResponseLimits.responseRegionLabelLength),
    area: normalizedArea,
    presentation: {
      paddingX: finiteNumber(value.presentation.paddingX, `${label}.presentation.paddingX`, 0, 80),
      paddingY: finiteNumber(value.presentation.paddingY, `${label}.presentation.paddingY`, 0, 80),
      lineSpacing: finiteNumber(value.presentation.lineSpacing, `${label}.presentation.lineSpacing`, 1, 100),
      fontScale: finiteNumber(value.presentation.fontScale, `${label}.presentation.fontScale`, 0.4, 2),
      lineCount,
      linePositions: value.presentation.linePositions.map((position, lineIndex) => finiteNumber(position, `${label}.presentation.linePositions[${lineIndex}]`, 0, normalizedArea.height)),
      lineWidth: finiteNumber(value.presentation.lineWidth, `${label}.presentation.lineWidth`, 1, surface.width),
      ...textStyle({ fontFamily: value.presentation.fontFamily, fontSize: value.presentation.fontSize, color: value.presentation.color, align: value.presentation.align }, `${label}.presentation.textStyle`),
    },
  };
}

export function normalizeUltimateB2OpenResponseAuthoring(input, expectedActivityId = input?.activityId, { allowUnregisteredDraft = false } = {}) {
  if (input?.schemaVersion === 2 && expectedActivityId === ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID) return normalizeUltimateB2Page5OpenResponseAuthoring(input);
  assertPayloadSize(input);
  const value = structuredClone(record(input, "Open Response authoring"));
  exactKeys(value, ["schemaVersion", "activityId", "source", "surface", "visualCapabilities", "artworkLayers", "questions"], "Open Response authoring");
  if (value.schemaVersion !== 3) throw new Error("Unsupported Open Response schema version.");
  const activityId = safeActivityId(value.activityId, allowUnregisteredDraft);
  if (activityId !== expectedActivityId) throw new Error("Open Response activity ID does not match the selected activity.");
  const surface = size(value.surface, "surface");
  const source = normalizeSource(value.source, surface);
  const visualCapabilities = normalizeUltimateB2ExerciseVisualCapabilities(value.visualCapabilities, { instructionImages: [], showTextImages: [] });
  if (!Array.isArray(value.artworkLayers) || value.artworkLayers.length > ultimateB2OpenResponseLimits.artworkLayers) throw new Error("Artwork layer count is invalid.");
  const artworkLayers = value.artworkLayers.map((layer, index) => normalizeArtworkLayer(layer, index, activityId, surface, source.files));
  if (!Array.isArray(value.questions) || !value.questions.length || value.questions.length > ultimateB2OpenResponseLimits.questions) throw new Error("Open Response question count is invalid.");
  const questions = value.questions.map((question, index) => {
    const label = `questions[${index}]`;
    exactKeys(question, ["id", "prompt", "promptArea", "promptStyle", "responseRegion"], label);
    const questionId = `${activityId}-q${index + 1}`;
    if (question.id !== questionId) throw new Error(`${label}.id must follow stable source order.`);
    return {
      id: questionId,
      prompt: boundedText(question.prompt, `${label}.prompt`, ultimateB2OpenResponseLimits.textLength),
      promptArea: area(question.promptArea, `${label}.promptArea`, surface),
      promptStyle: textStyle(question.promptStyle, `${label}.promptStyle`),
      responseRegion: normalizeResponseRegion(question.responseRegion, index, questionId, surface),
    };
  });
  return { schemaVersion: 3, activityId, source, surface, visualCapabilities, artworkLayers, questions };
}

export function normalizeUltimateB2OpenResponseTeacherAnswers(input, expectedActivityId = input?.activityId, expectedQuestionIds = null, { allowUnregisteredDraft = false } = {}) {
  if (input?.activityId === ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID && input?.schemaVersion === 1) return normalizeUltimateB2Page5TeacherAnswers(input);
  assertPayloadSize(input);
  const value = structuredClone(record(input, "Teacher Open Response authoring"));
  exactKeys(value, ["schemaVersion", "activityId", "modelAnswers"], "Teacher Open Response authoring");
  if (value.schemaVersion !== 1) throw new Error("Unsupported Teacher Open Response schema version.");
  const activityId = safeActivityId(value.activityId, allowUnregisteredDraft);
  if (activityId !== expectedActivityId) throw new Error("Teacher Open Response activity ID does not match the selected activity.");
  if (!Array.isArray(value.modelAnswers) || !value.modelAnswers.length || value.modelAnswers.length > ultimateB2OpenResponseLimits.questions) throw new Error("Teacher model answer count is invalid.");
  const questionIds = expectedQuestionIds || value.modelAnswers.map((_, index) => `${activityId}-q${index + 1}`);
  if (questionIds.length !== value.modelAnswers.length) throw new Error("Teacher model answers must match the public question count.");
  return {
    schemaVersion: 1,
    activityId,
    modelAnswers: value.modelAnswers.map((answer, index) => {
      exactKeys(answer, ["questionId", "text"], `modelAnswers[${index}]`);
      if (answer.questionId !== questionIds[index]) throw new Error(`modelAnswers[${index}].questionId does not match public source order.`);
      return { questionId: answer.questionId, text: boundedText(answer.text, `modelAnswers[${index}].text`, ultimateB2OpenResponseLimits.modelAnswerLength) };
    }),
  };
}

export function isUltimateB2ConfigurableOpenResponse(activityOrId) {
  const activityId = typeof activityOrId === "string" ? activityOrId : activityOrId?.stableNormalizedId;
  return ULTIMATE_B2_OPEN_RESPONSE_ACTIVITY_IDS.includes(activityId);
}
