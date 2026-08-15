import { isNativeChildId } from "./nativeChildIdentity.js";
import { autoFitNativeOpenResponseAnswer } from "./nativeOpenResponseAutoFit.js";

export const NATIVE_OPEN_RESPONSE_LIMITS = Object.freeze({
  questions: 20,
  artwork: 32,
  promptLength: 2_000,
  modelAnswerLength: 5_000,
  altTextLength: 2_000,
  labelLength: 300,
  surfaceMaximum: 10_000,
});

export const NATIVE_OPEN_RESPONSE_DEFAULT_SURFACE = Object.freeze({ width: 1024, height: 582 });
export const NATIVE_OPEN_RESPONSE_FONT_FAMILY = "Arial";

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function exactKeys(value, keys, label) {
  const actual = Object.keys(object(value, label)).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} has missing or unknown fields.`);
}

function number(value, label, minimum, maximum) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${label} is invalid.`);
  return Math.round(value * 1_000) / 1_000;
}

function integer(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${label} is invalid.`);
  return value;
}

function text(value, label, maximum, { required = false } = {}) {
  if (typeof value !== "string" || value.length > maximum || /[<>\u0000-\u001f\u007f]/.test(value)) throw new Error(`${label} is invalid.`);
  const normalized = value.trim();
  if (required && !normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function surface(input) {
  exactKeys(input, ["width", "height"], "Native Open Response surface");
  return {
    width: integer(input.width, "Native Open Response surface width", 1, NATIVE_OPEN_RESPONSE_LIMITS.surfaceMaximum),
    height: integer(input.height, "Native Open Response surface height", 1, NATIVE_OPEN_RESPONSE_LIMITS.surfaceMaximum),
  };
}

function area(input, label, logicalSurface) {
  exactKeys(input, ["x", "y", "width", "height"], label);
  const value = {
    x: number(input.x, `${label}.x`, 0, logicalSurface.width),
    y: number(input.y, `${label}.y`, 0, logicalSurface.height),
    width: number(input.width, `${label}.width`, 1, logicalSurface.width),
    height: number(input.height, `${label}.height`, 1, logicalSurface.height),
  };
  if (value.x + value.width > logicalSurface.width || value.y + value.height > logicalSurface.height) throw new Error(`${label} must stay inside the logical surface.`);
  return value;
}

function color(value, label) {
  if (!/^#[0-9a-f]{6}$/i.test(String(value || ""))) throw new Error(`${label} is invalid.`);
  return value.toLowerCase();
}

function alignment(value, label) {
  if (!["left", "center", "right"].includes(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function promptStyle(input, label) {
  exactKeys(input, ["fontFamily", "fontSize", "color", "align"], label);
  if (input.fontFamily !== NATIVE_OPEN_RESPONSE_FONT_FAMILY) throw new Error(`${label}.fontFamily is not approved.`);
  return {
    fontFamily: input.fontFamily,
    fontSize: number(input.fontSize, `${label}.fontSize`, 8, 96),
    color: color(input.color, `${label}.color`),
    align: alignment(input.align, `${label}.align`),
  };
}

export function nativeOpenResponseLinePositions({ paddingY, lineSpacing, lineCount }) {
  return Array.from({ length: lineCount }, (_, index) => Math.round((paddingY + lineSpacing * (index + 1)) * 1_000) / 1_000);
}

function responsePresentation(input, label, regionArea) {
  exactKeys(input, ["paddingX", "paddingY", "lineCount", "lineSpacing", "linePositions", "lineWidth", "answerFontFamily", "answerFontSizeMin", "answerFontSizeMax", "color", "align"], label);
  const paddingX = number(input.paddingX, `${label}.paddingX`, 0, Math.min(100, regionArea.width / 2));
  const paddingY = number(input.paddingY, `${label}.paddingY`, 0, Math.min(100, regionArea.height / 2));
  const lineCount = integer(input.lineCount, `${label}.lineCount`, 1, 20);
  const lineSpacing = number(input.lineSpacing, `${label}.lineSpacing`, 8, 120);
  const lineWidth = number(input.lineWidth, `${label}.lineWidth`, 1, regionArea.width);
  if (lineWidth > regionArea.width - (2 * paddingX)) throw new Error(`${label}.lineWidth exceeds the padded response width.`);
  if (!Array.isArray(input.linePositions) || input.linePositions.length !== lineCount) throw new Error(`${label}.linePositions must match lineCount.`);
  const expectedPositions = nativeOpenResponseLinePositions({ paddingY, lineSpacing, lineCount });
  const linePositions = input.linePositions.map((position, index) => {
    const normalized = number(position, `${label}.linePositions[${index}]`, 0, regionArea.height);
    if (normalized !== expectedPositions[index]) throw new Error(`${label}.linePositions must follow padding and line spacing.`);
    return normalized;
  });
  if (linePositions.at(-1) > regionArea.height - paddingY) throw new Error(`${label} line layout exceeds the response region.`);
  if (input.answerFontFamily !== NATIVE_OPEN_RESPONSE_FONT_FAMILY) throw new Error(`${label}.answerFontFamily is not approved.`);
  const answerFontSizeMin = number(input.answerFontSizeMin, `${label}.answerFontSizeMin`, 8, 48);
  const answerFontSizeMax = number(input.answerFontSizeMax, `${label}.answerFontSizeMax`, answerFontSizeMin, 72);
  if (answerFontSizeMax > lineSpacing * 0.9) throw new Error(`${label}.answerFontSizeMax exceeds the line spacing.`);
  return {
    paddingX, paddingY, lineCount, lineSpacing, linePositions, lineWidth,
    answerFontFamily: input.answerFontFamily,
    answerFontSizeMin, answerFontSizeMax,
    color: color(input.color, `${label}.color`),
    align: alignment(input.align, `${label}.align`),
  };
}

function responseRegion(input, label, questionId, logicalSurface) {
  exactKeys(input, ["id", "ariaLabel", "area", "presentation"], label);
  if (input.id !== `${questionId}-response`) throw new Error(`${label}.id is invalid.`);
  const regionArea = area(input.area, `${label}.area`, logicalSurface);
  return {
    id: input.id,
    ariaLabel: text(input.ariaLabel, `${label}.ariaLabel`, NATIVE_OPEN_RESPONSE_LIMITS.labelLength, { required: true }),
    area: regionArea,
    presentation: responsePresentation(input.presentation, `${label}.presentation`, regionArea),
  };
}

function question(input, index, logicalSurface) {
  const label = `Native Open Response questions[${index}]`;
  exactKeys(input, ["id", "prompt", "promptArea", "promptStyle", "responseRegion"], label);
  if (!isNativeChildId(input.id, "q")) throw new Error(`${label}.id is invalid.`);
  return {
    id: input.id,
    prompt: text(input.prompt, `${label}.prompt`, NATIVE_OPEN_RESPONSE_LIMITS.promptLength),
    promptArea: area(input.promptArea, `${label}.promptArea`, logicalSurface),
    promptStyle: promptStyle(input.promptStyle, `${label}.promptStyle`),
    responseRegion: responseRegion(input.responseRegion, `${label}.responseRegion`, input.id, logicalSurface),
  };
}

function artwork(input, index, logicalSurface, assetSlots) {
  const label = `Native Open Response artwork[${index}]`;
  const legacy = !("locked" in object(input, label));
  exactKeys(input, legacy ? ["id", "assetSlot", "area", "order", "altText", "decorative", "fit"] : ["id", "assetSlot", "area", "order", "altText", "decorative", "fit", "locked"], label);
  if (!isNativeChildId(input.id, "art")) throw new Error(`${label}.id is invalid.`);
  if (!assetSlots.has(input.assetSlot)) throw new Error(`${label}.assetSlot does not reference a managed asset.`);
  if (!Number.isSafeInteger(input.order) || input.order !== index) throw new Error(`${label}.order must match deterministic array order.`);
  if (!["contain", "cover"].includes(input.fit)) throw new Error(`${label}.fit is invalid.`);
  if (typeof input.decorative !== "boolean") throw new Error(`${label}.decorative is invalid.`);
  if (!legacy && typeof input.locked !== "boolean") throw new Error(`${label}.locked is invalid.`);
  return {
    id: input.id,
    assetSlot: input.assetSlot,
    area: area(input.area, `${label}.area`, logicalSurface),
    order: input.order,
    altText: text(input.altText, `${label}.altText`, NATIVE_OPEN_RESPONSE_LIMITS.altTextLength),
    decorative: input.decorative,
    fit: input.fit,
    locked: legacy ? false : input.locked,
  };
}

export function normalizeNativeOpenResponseInteraction(input, { assets = [] } = {}) {
  const value = structuredClone(object(input, "Native Open Response interaction"));
  exactKeys(value, ["kind", "surface", "artwork", "questions"], "Native Open Response interaction");
  if (value.kind !== "open-response") throw new Error("Native Open Response interaction kind is invalid.");
  const logicalSurface = surface(value.surface);
  if (!Array.isArray(value.questions) || value.questions.length > NATIVE_OPEN_RESPONSE_LIMITS.questions) throw new Error("Native Open Response question count is invalid.");
  if (!Array.isArray(value.artwork) || value.artwork.length > NATIVE_OPEN_RESPONSE_LIMITS.artwork) throw new Error("Native Open Response artwork count is invalid.");
  const questionIds = new Set();
  const responseIds = new Set();
  const questions = value.questions.map((entry, index) => {
    const normalized = question(entry, index, logicalSurface);
    if (questionIds.has(normalized.id) || responseIds.has(normalized.responseRegion.id)) throw new Error("Native Open Response child identities must be unique.");
    questionIds.add(normalized.id); responseIds.add(normalized.responseRegion.id);
    return normalized;
  });
  const assetSlots = new Set(assets.map((asset) => asset.slot));
  const artworkIds = new Set();
  const usedSlots = new Set();
  const normalizedArtwork = value.artwork.map((entry, index) => {
    const normalized = artwork(entry, index, logicalSurface, assetSlots);
    if (artworkIds.has(normalized.id)) throw new Error("Native Open Response artwork identities must be unique.");
    artworkIds.add(normalized.id); usedSlots.add(normalized.assetSlot);
    return normalized;
  });
  if (assets.some((asset) => asset.role !== "activity_artwork" || !usedSlots.has(asset.slot))) throw new Error("Every Native Open Response managed asset must be used by artwork.");
  return { kind: "open-response", surface: logicalSurface, artwork: normalizedArtwork, questions };
}

export function duplicateNativeOpenResponseArtwork(interaction, sourceId, duplicateId) {
  const value = object(interaction, "Native Open Response interaction");
  if (!Array.isArray(value.artwork) || value.artwork.length >= NATIVE_OPEN_RESPONSE_LIMITS.artwork) throw new Error("Native Open Response artwork count is invalid.");
  const source = value.artwork.find((entry) => entry.id === sourceId);
  if (!source) throw new Error("Native Open Response source artwork does not exist.");
  if (!isNativeChildId(duplicateId, "art") || value.artwork.some((entry) => entry.id === duplicateId)) throw new Error("Native Open Response duplicate artwork ID is invalid.");
  const logicalSurface = surface(value.surface);
  const duplicate = structuredClone(source);
  duplicate.id = duplicateId;
  duplicate.area.x = Math.min(source.area.x + 16, logicalSurface.width - source.area.width);
  duplicate.area.y = Math.min(source.area.y + 16, logicalSurface.height - source.area.height);
  duplicate.order = value.artwork.length;
  duplicate.locked = false;
  value.artwork.push(duplicate);
  return duplicate;
}

export function removeNativeOpenResponseArtwork(publicDocument, artworkId) {
  const value = object(publicDocument, "Native public activity");
  if (!Array.isArray(value.assets) || !Array.isArray(value.parts) || !value.parts[0]?.interaction) throw new Error("Native Open Response document is invalid.");
  const interaction = value.parts[0].interaction;
  if (!Array.isArray(interaction.artwork)) throw new Error("Native Open Response artwork is invalid.");
  const removed = interaction.artwork.find((entry) => entry.id === artworkId);
  if (!removed) throw new Error("Native Open Response artwork does not exist.");
  interaction.artwork = interaction.artwork
    .filter((entry) => entry.id !== artworkId)
    .map((entry, order) => ({ ...entry, order }));
  if (!interaction.artwork.some((entry) => entry.assetSlot === removed.assetSlot)) {
    value.assets = value.assets.filter((entry) => entry.slot !== removed.assetSlot);
  }
  return removed;
}

export function normalizeNativeOpenResponseSolution(input) {
  const value = structuredClone(object(input, "Native Open Response Teacher solution"));
  exactKeys(value, ["kind", "modelAnswers"], "Native Open Response Teacher solution");
  if (value.kind !== "open-response" || !Array.isArray(value.modelAnswers) || value.modelAnswers.length > NATIVE_OPEN_RESPONSE_LIMITS.questions) throw new Error("Native Open Response Teacher solution is invalid.");
  const ids = new Set();
  return {
    kind: "open-response",
    modelAnswers: value.modelAnswers.map((answer, index) => {
      const label = `Native Open Response modelAnswers[${index}]`;
      exactKeys(answer, ["questionId", "text"], label);
      if (!isNativeChildId(answer.questionId, "q") || ids.has(answer.questionId)) throw new Error(`${label}.questionId is invalid or duplicate.`);
      ids.add(answer.questionId);
      return { questionId: answer.questionId, text: text(answer.text, `${label}.text`, NATIVE_OPEN_RESPONSE_LIMITS.modelAnswerLength) };
    }),
  };
}

export function validateNativeOpenResponseTopology(publicDocument, teacherDocument) {
  const questions = publicDocument.parts[0].interaction.questions;
  const answers = teacherDocument.parts[0].solution.modelAnswers;
  if (questions.length !== answers.length || questions.some((question, index) => question.id !== answers[index]?.questionId)) {
    throw new Error("Native Open Response Teacher answers must exactly match public question identity and order.");
  }
  return true;
}

export function createNativeOpenResponseQuestion(id, index = 0) {
  const top = 24 + Math.min(index, 10) * 46;
  const responseY = Math.min(180 + Math.min(index, 5) * 60, 390);
  const presentation = {
    paddingX: 12, paddingY: 8, lineCount: 3, lineSpacing: 32,
    linePositions: nativeOpenResponseLinePositions({ paddingY: 8, lineSpacing: 32, lineCount: 3 }),
    lineWidth: 676, answerFontFamily: NATIVE_OPEN_RESPONSE_FONT_FAMILY,
    answerFontSizeMin: 12, answerFontSizeMax: 22, color: "#111827", align: "left",
  };
  return {
    id,
    prompt: "",
    promptArea: { x: 72, y: top, width: 880, height: 38 },
    promptStyle: { fontFamily: NATIVE_OPEN_RESPONSE_FONT_FAMILY, fontSize: 22, color: "#111827", align: "left" },
    responseRegion: { id: `${id}-response`, ariaLabel: `Response for question ${index + 1}`, area: { x: 160, y: responseY, width: 704, height: 120 }, presentation },
  };
}

export function assessNativeOpenResponseReadiness(publicDocument, teacherDocument) {
  const issues = [];
  const questions = publicDocument.parts[0].interaction.questions;
  const answers = new Map(teacherDocument.parts[0].solution.modelAnswers.map((answer) => [answer.questionId, answer.text]));
  if (!questions.length) issues.push("Add at least one question.");
  for (const [index, questionValue] of questions.entries()) {
    if (!questionValue.prompt.trim()) issues.push(`Question ${index + 1} needs a prompt.`);
    const modelAnswer = answers.get(questionValue.id) || "";
    if (!modelAnswer.trim()) issues.push(`Question ${index + 1} needs a model answer.`);
    else if (!autoFitNativeOpenResponseAnswer({ text: modelAnswer, responseRegion: questionValue.responseRegion }).fits) issues.push(`Question ${index + 1} model answer does not fit its authored lines.`);
  }
  publicDocument.parts[0].interaction.artwork.forEach((item, index) => {
    if (!item.decorative && !item.altText.trim()) issues.push(`Artwork ${index + 1} needs alt text or must be marked decorative.`);
  });
  return { ready: issues.length === 0, issues };
}
