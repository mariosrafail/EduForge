import { normalizeUltimateB2ExerciseVisualCapabilities } from "./exerciseVisualCapabilities.js";

export const ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID = "ultimate-b2-sb-u1-p1-o1";
export const ULTIMATE_B2_PAGE5_IMAGE_ID = "ultimate-b2-sb-u1-p1-o2";

const questionIds = Object.freeze([
  `${ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID}-q1`,
  `${ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID}-q2`,
  `${ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID}-q3`,
]);

const artworkBindings = Object.freeze({
  openResponseInstruction: "unit1.page5.exercise1.instruction",
  quote: "unit1.page5.exercise1.quote",
  imageInstruction: "unit1.page5.exercise2.instruction",
  imageContent: "unit1.page5.exercise2.main-content",
});

export const ultimateB2Page5AuthoringLimits = Object.freeze({
  payloadBytes: 24_000,
  questionCount: 3,
  textLength: 1_000,
  modelAnswerLength: 3_000,
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

function boundedText(value, label, maximum) {
  if (typeof value !== "string" || value.length > maximum || !value.trim()) throw new Error(`${label} must be a non-empty string no longer than ${maximum} characters.`);
  if (/[<>]/.test(value)) throw new Error(`${label} must not contain HTML markup.`);
  return value.trim();
}

function assertPayloadSize(value) {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > ultimateB2Page5AuthoringLimits.payloadBytes) throw new Error("Page 5 authoring payload is too large.");
}

function finiteNumber(value, label, minimum = 0, maximum = 4096) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${label} must be a number from ${minimum} to ${maximum}.`);
  return Math.round(value * 10_000) / 10_000;
}

function pixelArea(value, label, surface) {
  exactKeys(value, ["x", "y", "width", "height"], label);
  const area = { x: finiteNumber(value.x, `${label}.x`), y: finiteNumber(value.y, `${label}.y`), width: finiteNumber(value.width, `${label}.width`, 1), height: finiteNumber(value.height, `${label}.height`, 1) };
  if (area.x + area.width > surface.width || area.y + area.height > surface.height) throw new Error(`${label} must stay inside the authored canvas.`);
  return area;
}

function textStyle(value, label) {
  exactKeys(value, ["fontFamily", "fontSize", "color", "align"], label);
  if (!/^#[0-9a-f]{6}$/i.test(value.color)) throw new Error(`${label}.color must be a six-digit hex color.`);
  if (value.align !== "left") throw new Error(`${label}.align must be left for this publisher activity.`);
  return { fontFamily: boundedText(value.fontFamily, `${label}.fontFamily`, 100), fontSize: finiteNumber(value.fontSize, `${label}.fontSize`, 8, 72), color: value.color.toLowerCase(), align: value.align };
}

function responseRegion(value, label, expectedId, surface) {
  exactKeys(value, ["id", "ariaLabel", "area", "presentation"], label);
  if (value.id !== expectedId) throw new Error(`${label}.id is fixed and cannot be changed.`);
  const area = pixelArea(value.area, `${label}.area`, surface);
  exactKeys(value.presentation, ["paddingX", "paddingY", "lineSpacing", "fontScale", "lineCount", "linePositions", "lineWidth", "fontFamily", "fontSize", "color", "align"], `${label}.presentation`);
  const presentation = {
    paddingX: finiteNumber(value.presentation.paddingX, `${label}.presentation.paddingX`, 0, 40),
    paddingY: finiteNumber(value.presentation.paddingY, `${label}.presentation.paddingY`, 0, 40),
    lineSpacing: finiteNumber(value.presentation.lineSpacing, `${label}.presentation.lineSpacing`, 16, 60),
    fontScale: finiteNumber(value.presentation.fontScale, `${label}.presentation.fontScale`, 0.6, 1.6),
    lineCount: finiteNumber(value.presentation.lineCount, `${label}.presentation.lineCount`, 1, 12),
    linePositions: value.presentation.linePositions,
    lineWidth: finiteNumber(value.presentation.lineWidth, `${label}.presentation.lineWidth`, 1, surface.width),
    ...textStyle({ fontFamily: value.presentation.fontFamily, fontSize: value.presentation.fontSize, color: value.presentation.color, align: value.presentation.align }, `${label}.presentation.textStyle`),
  };
  if (!Number.isInteger(presentation.lineCount) || !Array.isArray(presentation.linePositions) || presentation.linePositions.length !== presentation.lineCount) throw new Error(`${label}.presentation line positions must match lineCount.`);
  presentation.linePositions = presentation.linePositions.map((position, index) => finiteNumber(position, `${label}.presentation.linePositions[${index}]`, 0, area.height));
  return { id: value.id, ariaLabel: boundedText(value.ariaLabel, `${label}.ariaLabel`, ultimateB2Page5AuthoringLimits.responseRegionLabelLength), area, presentation };
}

export function normalizeUltimateB2Page5OpenResponseAuthoring(input) {
  assertPayloadSize(input);
  const value = structuredClone(record(input, "Open-response authoring"));
  exactKeys(value, ["schemaVersion", "activityId", "source", "surface", "visualCapabilities", "instructionImageAlt", "quoteArtworkBinding", "artwork", "questions"], "Open-response authoring");
  if (value.schemaVersion !== 2) throw new Error("Unsupported open-response schema version.");
  if (value.activityId !== ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID) throw new Error("Unexpected open-response activity ID.");
  exactKeys(value.surface, ["width", "height"], "surface");
  const surface = { width: finiteNumber(value.surface.width, "surface.width", 1), height: finiteNumber(value.surface.height, "surface.height", 1) };
  if (surface.width !== 1024 || surface.height !== 582) throw new Error("Page 5 publisher canvas must be 1024×582.");
  exactKeys(value.source, ["kind", "canvas", "files"], "source");
  if (value.source.kind !== "decoded-publisher-iwb") throw new Error("Unknown Page 5 source kind.");
  if (JSON.stringify(value.source.canvas) !== JSON.stringify(surface)) throw new Error("Source canvas must match the authored surface.");
  if (!Array.isArray(value.source.files) || value.source.files.length !== 4) throw new Error("Source provenance must contain exactly four files.");
  const expectedSourceFiles = ["obj_params.xml", "ebook_obj_params.xml", "image_1.png", "image_2.png"];
  const sourceFiles = value.source.files.map((file, index) => {
    exactKeys(file, ["name", "sha256"], `source.files[${index}]`);
    if (file.name !== expectedSourceFiles[index] || !/^[a-f0-9]{64}$/i.test(file.sha256)) throw new Error(`source.files[${index}] is invalid.`);
    return { name: file.name, sha256: file.sha256.toLowerCase() };
  });
  const visualCapabilities = normalizeUltimateB2ExerciseVisualCapabilities(value.visualCapabilities, {
    instructionImages: [artworkBindings.openResponseInstruction],
    showTextImages: [],
  });
  if (value.quoteArtworkBinding !== artworkBindings.quote) throw new Error("Unknown open-response artwork binding.");
  exactKeys(value.artwork, ["instruction", "quote"], "artwork");
  const normalizeArtwork = (artwork, label, binding, sourceFile) => {
    exactKeys(artwork, ["binding", "sourceFile", "naturalSize", "area"], label);
    if (artwork.binding !== binding || artwork.sourceFile !== sourceFile) throw new Error(`${label} binding is fixed.`);
    exactKeys(artwork.naturalSize, ["width", "height"], `${label}.naturalSize`);
    const naturalSize = { width: finiteNumber(artwork.naturalSize.width, `${label}.naturalSize.width`, 1), height: finiteNumber(artwork.naturalSize.height, `${label}.naturalSize.height`, 1) };
    const area = pixelArea(artwork.area, `${label}.area`, surface);
    if (area.width !== naturalSize.width || area.height !== naturalSize.height) throw new Error(`${label} must preserve its natural publisher size.`);
    return { binding, sourceFile, naturalSize, area };
  };
  const artwork = {
    instruction: normalizeArtwork(value.artwork.instruction, "artwork.instruction", artworkBindings.openResponseInstruction, "image_2.png"),
    quote: normalizeArtwork(value.artwork.quote, "artwork.quote", artworkBindings.quote, "image_1.png"),
  };
  if (!Array.isArray(value.questions) || value.questions.length !== questionIds.length) throw new Error("Open-response authoring must contain exactly three questions.");
  const questions = value.questions.map((question, index) => {
    exactKeys(question, ["id", "prompt", "promptArea", "promptStyle", "responseRegion"], `questions[${index}]`);
    if (question.id !== questionIds[index]) throw new Error(`questions[${index}].id is fixed and cannot be changed.`);
    return {
      id: question.id,
      prompt: boundedText(question.prompt, `questions[${index}].prompt`, ultimateB2Page5AuthoringLimits.textLength),
      promptArea: pixelArea(question.promptArea, `questions[${index}].promptArea`, surface),
      promptStyle: textStyle(question.promptStyle, `questions[${index}].promptStyle`),
      responseRegion: responseRegion(question.responseRegion, `questions[${index}].responseRegion`, `${question.id}-response`, surface),
    };
  });
  return {
    schemaVersion: 2,
    activityId: value.activityId,
    source: { kind: value.source.kind, canvas: surface, files: sourceFiles },
    surface,
    visualCapabilities,
    instructionImageAlt: boundedText(value.instructionImageAlt, "instructionImageAlt", ultimateB2Page5AuthoringLimits.textLength),
    quoteArtworkBinding: value.quoteArtworkBinding,
    artwork,
    questions,
  };
}

export function normalizeUltimateB2Page5TeacherAnswers(input) {
  assertPayloadSize(input);
  const value = structuredClone(record(input, "Teacher answer authoring"));
  exactKeys(value, ["schemaVersion", "activityId", "modelAnswers"], "Teacher answer authoring");
  if (value.schemaVersion !== 1) throw new Error("Unsupported Teacher answer schema version.");
  if (value.activityId !== ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID) throw new Error("Unexpected Teacher answer activity ID.");
  if (!Array.isArray(value.modelAnswers) || value.modelAnswers.length !== questionIds.length) throw new Error("Teacher answer authoring must contain exactly three model answers.");
  return {
    schemaVersion: 1,
    activityId: value.activityId,
    modelAnswers: value.modelAnswers.map((answer, index) => {
      exactKeys(answer, ["questionId", "text"], `modelAnswers[${index}]`);
      if (answer.questionId !== questionIds[index]) throw new Error(`modelAnswers[${index}].questionId is fixed and cannot be changed.`);
      return { questionId: answer.questionId, text: boundedText(answer.text, `modelAnswers[${index}].text`, ultimateB2Page5AuthoringLimits.modelAnswerLength) };
    }),
  };
}

export function normalizeUltimateB2Page5ImageAuthoring(input) {
  assertPayloadSize(input);
  const value = structuredClone(record(input, "Image activity authoring"));
  exactKeys(value, ["schemaVersion", "activityId", "visualCapabilities", "instructionImageAlt", "mainImage", "mainImageAlt"], "Image activity authoring");
  if (value.schemaVersion !== 1) throw new Error("Unsupported image activity schema version.");
  if (value.activityId !== ULTIMATE_B2_PAGE5_IMAGE_ID) throw new Error("Unexpected image activity ID.");
  const visualCapabilities = normalizeUltimateB2ExerciseVisualCapabilities(value.visualCapabilities, {
    instructionImages: [artworkBindings.imageInstruction],
    showTextImages: [],
  });
  if (value.mainImage !== artworkBindings.imageContent) throw new Error("Unknown main image binding.");
  return {
    schemaVersion: 1,
    activityId: value.activityId,
    visualCapabilities,
    instructionImageAlt: boundedText(value.instructionImageAlt, "instructionImageAlt", ultimateB2Page5AuthoringLimits.textLength),
    mainImage: value.mainImage,
    mainImageAlt: boundedText(value.mainImageAlt, "mainImageAlt", ultimateB2Page5AuthoringLimits.textLength),
  };
}

export const ultimateB2Page5ArtworkBindings = artworkBindings;
export const ultimateB2Page5QuestionIds = questionIds;
