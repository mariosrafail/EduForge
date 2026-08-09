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

function percentage(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) throw new Error(`${label} must be a number from 0 to 100.`);
  return Math.round(value * 10_000) / 10_000;
}

function responseRegion(value, label, expectedId) {
  exactKeys(value, ["id", "ariaLabel", "area", "presentation"], label);
  if (value.id !== expectedId) throw new Error(`${label}.id is fixed and cannot be changed.`);
  exactKeys(value.area, ["left", "top", "width", "height"], `${label}.area`);
  const area = {
    left: percentage(value.area.left, `${label}.area.left`),
    top: percentage(value.area.top, `${label}.area.top`),
    width: percentage(value.area.width, `${label}.area.width`),
    height: percentage(value.area.height, `${label}.area.height`),
  };
  if (area.width < 1 || area.height < 1 || area.left + area.width > 100 || area.top + area.height > 100) throw new Error(`${label}.area must stay inside the activity surface and have a visible size.`);
  exactKeys(value.presentation, ["paddingX", "paddingY", "lineSpacing", "fontScale"], `${label}.presentation`);
  const presentation = {
    paddingX: percentage(value.presentation.paddingX, `${label}.presentation.paddingX`),
    paddingY: percentage(value.presentation.paddingY, `${label}.presentation.paddingY`),
    lineSpacing: percentage(value.presentation.lineSpacing, `${label}.presentation.lineSpacing`),
    fontScale: percentage(value.presentation.fontScale, `${label}.presentation.fontScale`),
  };
  if (presentation.paddingX > 40 || presentation.paddingY > 40 || presentation.lineSpacing < 16 || presentation.lineSpacing > 60 || presentation.fontScale < 0.6 || presentation.fontScale > 1.6) throw new Error(`${label}.presentation contains an unsupported text layout value.`);
  return { id: value.id, ariaLabel: boundedText(value.ariaLabel, `${label}.ariaLabel`, ultimateB2Page5AuthoringLimits.responseRegionLabelLength), area, presentation };
}

export function normalizeUltimateB2Page5OpenResponseAuthoring(input) {
  assertPayloadSize(input);
  const value = structuredClone(record(input, "Open-response authoring"));
  exactKeys(value, ["schemaVersion", "activityId", "visualCapabilities", "instructionImageAlt", "quoteArtworkBinding", "questions"], "Open-response authoring");
  if (value.schemaVersion !== 1) throw new Error("Unsupported open-response schema version.");
  if (value.activityId !== ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID) throw new Error("Unexpected open-response activity ID.");
  const visualCapabilities = normalizeUltimateB2ExerciseVisualCapabilities(value.visualCapabilities, {
    instructionImages: [artworkBindings.openResponseInstruction],
    showTextImages: [],
  });
  if (value.quoteArtworkBinding !== artworkBindings.quote) throw new Error("Unknown open-response artwork binding.");
  if (!Array.isArray(value.questions) || value.questions.length !== questionIds.length) throw new Error("Open-response authoring must contain exactly three questions.");
  const questions = value.questions.map((question, index) => {
    exactKeys(question, ["id", "prompt", "responseRegion"], `questions[${index}]`);
    if (question.id !== questionIds[index]) throw new Error(`questions[${index}].id is fixed and cannot be changed.`);
    return {
      id: question.id,
      prompt: boundedText(question.prompt, `questions[${index}].prompt`, ultimateB2Page5AuthoringLimits.textLength),
      responseRegion: responseRegion(question.responseRegion, `questions[${index}].responseRegion`, `${question.id}-response`),
    };
  });
  return {
    schemaVersion: 1,
    activityId: value.activityId,
    visualCapabilities,
    instructionImageAlt: boundedText(value.instructionImageAlt, "instructionImageAlt", ultimateB2Page5AuthoringLimits.textLength),
    quoteArtworkBinding: value.quoteArtworkBinding,
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
