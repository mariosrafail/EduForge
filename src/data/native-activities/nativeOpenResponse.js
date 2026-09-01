import { isNativeChildId } from "./nativeChildIdentity.js";
import { NATIVE_IMAGE_LIMITS, normalizeNativeImageInteraction } from "./nativeImage.js";
import { removeNativeManagedAssetReferenceIfUnused } from "./nativeActivityPublic.js";
import { nativeActivityFontFamily } from "./nativeActivityFont.js";
import { autoFitNativeOpenResponseAnswer } from "./nativeOpenResponseAutoFit.js";
import { normalizeNativePedagogicalText, normalizeNativeSingleLineText } from "./nativePedagogicalText.js";

export const NATIVE_OPEN_RESPONSE_LIMITS = Object.freeze({
  questions: 20,
  artwork: 32,
  promptLength: 2_000,
  modelAnswerLength: 5_000,
  altTextLength: 2_000,
  labelLength: 300,
  surfaceMaximum: 10_000,
  panels: 12,
  imagesPerPanel: NATIVE_IMAGE_LIMITS.images,
});

export const NATIVE_OPEN_RESPONSE_DEFAULT_SURFACE = Object.freeze({ width: 1024, height: 582 });
export const NATIVE_OPEN_RESPONSE_FONT_FAMILY = "Arial";
export const NATIVE_OPEN_RESPONSE_ANSWER_FONT_SIZE_MINIMUM = 8;
export const NATIVE_OPEN_RESPONSE_ANSWER_FONT_SIZE_MAXIMUM = 72;
export const NATIVE_OPEN_RESPONSE_LEGACY_PANEL_ID = "panel-00000000000040008000000000000000";

export function initialNativeOpenResponseArtworkArea(logicalSurface, metadata = {}) {
  const surfaceWidth = Math.max(1, Number(logicalSurface?.width) || NATIVE_OPEN_RESPONSE_DEFAULT_SURFACE.width);
  const surfaceHeight = Math.max(1, Number(logicalSurface?.height) || NATIVE_OPEN_RESPONSE_DEFAULT_SURFACE.height);
  const intrinsicWidth = Number(metadata?.width);
  const intrinsicHeight = Number(metadata?.height);
  if (!Number.isFinite(intrinsicWidth) || !Number.isFinite(intrinsicHeight) || !(intrinsicWidth > 0) || !(intrinsicHeight > 0)) {
    const width = Math.min(320, surfaceWidth);
    const height = Math.min(220, surfaceHeight);
    return { x: Math.min(160, surfaceWidth - width), y: Math.min(120, surfaceHeight - height), width, height };
  }
  const maximumWidth = Math.max(24, surfaceWidth * .6);
  const maximumHeight = Math.max(24, surfaceHeight * .6);
  const scale = Math.min(maximumWidth / intrinsicWidth, maximumHeight / intrinsicHeight);
  const width = Math.min(surfaceWidth, Math.max(24, Math.round(intrinsicWidth * scale)));
  const height = Math.min(surfaceHeight, Math.max(24, Math.round(intrinsicHeight * scale)));
  return {
    x: Math.round((surfaceWidth - width) / 2),
    y: Math.round((surfaceHeight - height) / 2),
    width,
    height,
  };
}

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

const roundGeometry = (value) => Math.round(Number(value) * 1_000) / 1_000;

function availableResponseLineWidth(area, presentation) {
  return roundGeometry(Math.max(1, area.width - (2 * presentation.paddingX)));
}

function responseLineWidthFollowsArea(area, presentation) {
  const available = availableResponseLineWidth(area, presentation);
  const lineWidth = roundGeometry(presentation.lineWidth);
  // Existing blank questions use a four-pixel visual inset inside the padded
  // response width. Treat that canonical legacy default as linked too.
  const canonicalLegacyDefault = roundGeometry(area.width) === 704
    && roundGeometry(presentation.paddingX) === 12
    && lineWidth === 676;
  return lineWidth === available || canonicalLegacyDefault;
}

export function resizeNativeOpenResponseRegion(responseRegion, nextArea) {
  const previousArea = responseRegion.area;
  const presentation = responseRegion.presentation;
  const linkedLineWidth = responseLineWidthFollowsArea(previousArea, presentation);
  responseRegion.area = { ...nextArea };
  const available = availableResponseLineWidth(responseRegion.area, presentation);
  presentation.lineWidth = linkedLineWidth ? available : Math.min(presentation.lineWidth, available);
  while (presentation.lineCount > 1 && presentation.paddingY + presentation.lineSpacing * presentation.lineCount > responseRegion.area.height - presentation.paddingY) presentation.lineCount -= 1;
  presentation.linePositions = nativeOpenResponseLinePositions(presentation);
  return responseRegion;
}

function responsePresentation(input, label, regionArea, assets) {
  const hasFontAsset = Object.hasOwn(input, "answerFontAssetSlot");
  exactKeys(input, ["paddingX", "paddingY", "lineCount", "lineSpacing", "linePositions", "lineWidth", "answerFontFamily", "answerFontSizeMin", "answerFontSizeMax", "color", "align", ...(hasFontAsset ? ["answerFontAssetSlot"] : [])], label);
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
  const answerFontSizeMin = number(input.answerFontSizeMin, `${label}.answerFontSizeMin`, NATIVE_OPEN_RESPONSE_ANSWER_FONT_SIZE_MINIMUM, 48);
  const answerFontSizeMax = number(input.answerFontSizeMax, `${label}.answerFontSizeMax`, answerFontSizeMin, NATIVE_OPEN_RESPONSE_ANSWER_FONT_SIZE_MAXIMUM);
  if (answerFontSizeMax > lineSpacing * 0.9) throw new Error(`${label}.answerFontSizeMax exceeds the line spacing.`);
  let answerFontAssetSlot;
  if (hasFontAsset) {
    const reference = assets.find((asset) => asset.slot === input.answerFontAssetSlot);
    if (!reference || reference.role !== "activity_font") throw new Error(`${label}.answerFontAssetSlot must reference a managed component font.`);
    answerFontAssetSlot = reference.slot;
  }
  return {
    paddingX, paddingY, lineCount, lineSpacing, linePositions, lineWidth,
    answerFontFamily: input.answerFontFamily,
    ...(answerFontAssetSlot ? { answerFontAssetSlot } : {}),
    answerFontSizeMin, answerFontSizeMax,
    color: color(input.color, `${label}.color`),
    align: alignment(input.align, `${label}.align`),
  };
}

function responseRegion(input, label, questionId, logicalSurface, assets) {
  exactKeys(input, ["id", "ariaLabel", "area", "presentation"], label);
  if (input.id !== `${questionId}-response`) throw new Error(`${label}.id is invalid.`);
  const regionArea = area(input.area, `${label}.area`, logicalSurface);
  return {
    id: input.id,
    ariaLabel: normalizeNativeSingleLineText(input.ariaLabel, `${label}.ariaLabel`, NATIVE_OPEN_RESPONSE_LIMITS.labelLength, { required: true }),
    area: regionArea,
    presentation: responsePresentation(input.presentation, `${label}.presentation`, regionArea, assets),
  };
}

function question(input, index, logicalSurface, assets) {
  const label = `Native Open Response questions[${index}]`;
  exactKeys(input, ["id", "prompt", "promptArea", "promptStyle", "responseRegion"], label);
  if (!isNativeChildId(input.id, "q")) throw new Error(`${label}.id is invalid.`);
  return {
    id: input.id,
    prompt: normalizeNativePedagogicalText(input.prompt, `${label}.prompt`, NATIVE_OPEN_RESPONSE_LIMITS.promptLength),
    promptArea: area(input.promptArea, `${label}.promptArea`, logicalSurface),
    promptStyle: promptStyle(input.promptStyle, `${label}.promptStyle`),
    responseRegion: responseRegion(input.responseRegion, `${label}.responseRegion`, input.id, logicalSurface, assets),
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
    altText: normalizeNativePedagogicalText(input.altText, `${label}.altText`, NATIVE_OPEN_RESPONSE_LIMITS.altTextLength),
    decorative: input.decorative,
    fit: input.fit,
    locked: legacy ? false : input.locked,
  };
}

export function normalizeNativeOpenResponseInteraction(input, { assets = [], commonAssetSlots = new Set() } = {}) {
  const value = structuredClone(object(input, "Native Open Response interaction"));
  if (value.kind !== "open-response") throw new Error("Native Open Response interaction kind is invalid.");
  const legacy = Object.hasOwn(value, "surface") || Object.hasOwn(value, "artwork");
  exactKeys(value, legacy ? ["kind", "surface", "artwork", "questions"] : ["kind", "questions", "presentation"], "Native Open Response interaction");
  if (!Array.isArray(value.questions) || value.questions.length > NATIVE_OPEN_RESPONSE_LIMITS.questions) throw new Error("Native Open Response question count is invalid.");
  if (legacy) return normalizeLegacyOpenResponse(value, { assets, commonAssetSlots });

  const artworkAssets = assets.filter((asset) => asset.role !== "activity_font");

  exactKeys(value.presentation, ["kind", "panels"], "Native Open Response presentation");
  if (value.presentation.kind !== "panels" || !Array.isArray(value.presentation.panels) || value.presentation.panels.length > NATIVE_OPEN_RESPONSE_LIMITS.panels) throw new Error("Native Open Response panel presentation is invalid.");
  const rawQuestionIds = new Set();
  value.questions.forEach((entry, index) => {
    if (!isNativeChildId(entry?.id, "q") || rawQuestionIds.has(entry.id)) throw new Error(`Native Open Response questions[${index}].id is invalid or duplicate.`);
    rawQuestionIds.add(entry.id);
  });
  const panelIds = new Set();
  const imageIds = new Set();
  const legacyAssignedQuestionIds = new Set();
  const promptSurfaces = new Map();
  const responseSurfaces = new Map();
  const addSurface = (surfaceMap, questionId, panelSurface) => {
    if (!surfaceMap.has(questionId)) surfaceMap.set(questionId, []);
    surfaceMap.get(questionId).push(panelSurface);
  };
  const usedSlots = new Set();
  const panels = value.presentation.panels.map((panelValue, panelIndex) => {
    const label = `Native Open Response panels[${panelIndex}]`;
    const composed = Object.hasOwn(panelValue, "promptQuestionIds") || Object.hasOwn(panelValue, "responseQuestionIds");
    exactKeys(panelValue, composed ? ["id", "surface", "images", "promptQuestionIds", "responseQuestionIds"] : ["id", "surface", "images", "questionIds"], label);
    if (!isNativeChildId(panelValue.id, "panel") || panelIds.has(panelValue.id)) throw new Error("Native Open Response panel identity is invalid or duplicate.");
    panelIds.add(panelValue.id);
    if (!Array.isArray(panelValue.images) || panelValue.images.length > NATIVE_OPEN_RESPONSE_LIMITS.imagesPerPanel) throw new Error(`${label}.images count is invalid.`);
    const membershipKeys = composed ? ["promptQuestionIds", "responseQuestionIds"] : ["questionIds"];
    membershipKeys.forEach((key) => {
      if (!Array.isArray(panelValue[key]) || panelValue[key].length > NATIVE_OPEN_RESPONSE_LIMITS.questions) throw new Error(`${label}.${key} count is invalid.`);
    });
    const panelSlots = new Set(panelValue.images.map((image) => image.assetSlot));
    const otherSlots = new Set([...commonAssetSlots, ...artworkAssets.filter((asset) => !panelSlots.has(asset.slot)).map((asset) => asset.slot)]);
    const composition = normalizeNativeImageInteraction({ kind: "image", surface: panelValue.surface, images: panelValue.images }, { assets: artworkAssets, commonAssetSlots: otherSlots });
    composition.images.forEach((image) => {
      if (imageIds.has(image.id)) throw new Error("Native Open Response image identities must be unique across panels.");
      imageIds.add(image.id); usedSlots.add(image.assetSlot);
    });
    const normalizeMembership = (key) => {
      const seen = new Set();
      const membership = panelValue[key].map((questionId, questionIndex) => {
        if (!rawQuestionIds.has(questionId)) throw new Error(`${label}.${key}[${questionIndex}] does not reference a semantic question.`);
        if (seen.has(questionId)) throw new Error(`${label}.${key} contains a duplicate question.`);
        seen.add(questionId);
        return questionId;
      });
      return composed ? value.questions.map((entry) => entry.id).filter((questionId) => seen.has(questionId)) : membership;
    };
    if (!composed) {
      const questionIds = normalizeMembership("questionIds");
      questionIds.forEach((questionId) => {
        if (legacyAssignedQuestionIds.has(questionId)) throw new Error("A legacy Native Open Response question cannot belong to more than one panel.");
        legacyAssignedQuestionIds.add(questionId);
        addSurface(promptSurfaces, questionId, composition.surface);
        addSurface(responseSurfaces, questionId, composition.surface);
      });
      return { id: panelValue.id, surface: composition.surface, images: composition.images, questionIds };
    }
    const promptQuestionIds = normalizeMembership("promptQuestionIds");
    const responseQuestionIds = normalizeMembership("responseQuestionIds");
    promptQuestionIds.forEach((questionId) => addSurface(promptSurfaces, questionId, composition.surface));
    responseQuestionIds.forEach((questionId) => addSurface(responseSurfaces, questionId, composition.surface));
    return { id: panelValue.id, surface: composition.surface, images: composition.images, promptQuestionIds, responseQuestionIds };
  });
  const questionIds = new Set();
  const responseIds = new Set();
  const questions = value.questions.map((entry, index) => {
    const normalized = question(entry, index, unassignedQuestionSurface(entry), assets);
    if ((promptSurfaces.get(entry.id) || []).some((panelSurface) => !areaFitsSurface(normalized.promptArea, panelSurface))) throw new Error(`Native Open Response question ${index + 1} prompt geometry does not fit every composed panel.`);
    if ((responseSurfaces.get(entry.id) || []).some((panelSurface) => !areaFitsSurface(normalized.responseRegion.area, panelSurface))) throw new Error(`Native Open Response question ${index + 1} response geometry does not fit every composed panel.`);
    if (questionIds.has(normalized.id) || responseIds.has(normalized.responseRegion.id)) throw new Error("Native Open Response child identities must be unique.");
    questionIds.add(normalized.id); responseIds.add(normalized.responseRegion.id);
    return normalized;
  });
  const usedFontSlots = new Set(questions.map((entry) => entry.responseRegion.presentation.answerFontAssetSlot).filter(Boolean));
  if (assets.some((asset) => asset.role === "activity_font"
    ? !usedFontSlots.has(asset.slot)
    : asset.role !== "activity_artwork" || (!usedSlots.has(asset.slot) && !commonAssetSlots.has(asset.slot)))) throw new Error("Every Native Open Response managed asset must be used by a panel image, answer font, or common supporting content.");
  return { kind: "open-response", questions, presentation: { kind: "panels", panels } };
}

function normalizeLegacyOpenResponse(value, { assets, commonAssetSlots }) {
  const logicalSurface = surface(value.surface);
  if (!Array.isArray(value.artwork) || value.artwork.length > NATIVE_OPEN_RESPONSE_LIMITS.artwork) throw new Error("Native Open Response artwork count is invalid.");
  const questionIds = new Set(); const responseIds = new Set();
  const questions = value.questions.map((entry, index) => {
    const normalized = question(entry, index, logicalSurface, assets);
    if (questionIds.has(normalized.id) || responseIds.has(normalized.responseRegion.id)) throw new Error("Native Open Response child identities must be unique.");
    questionIds.add(normalized.id); responseIds.add(normalized.responseRegion.id); return normalized;
  });
  const assetSlots = new Set(assets.filter((asset) => asset.role === "activity_artwork").map((asset) => asset.slot)); const artworkIds = new Set(); const usedSlots = new Set();
  const normalizedArtwork = value.artwork.map((entry, index) => {
    const normalized = artwork(entry, index, logicalSurface, assetSlots);
    if (artworkIds.has(normalized.id)) throw new Error("Native Open Response artwork identities must be unique.");
    artworkIds.add(normalized.id); usedSlots.add(normalized.assetSlot); return normalized;
  });
  const usedFontSlots = new Set(questions.map((entry) => entry.responseRegion.presentation.answerFontAssetSlot).filter(Boolean));
  if (assets.some((asset) => asset.role === "activity_font"
    ? !usedFontSlots.has(asset.slot)
    : asset.role !== "activity_artwork" || (!usedSlots.has(asset.slot) && !commonAssetSlots.has(asset.slot)))) throw new Error("Every Native Open Response managed asset must be used by artwork, an answer font, or common supporting content.");
  return { kind: "open-response", surface: logicalSurface, artwork: normalizedArtwork, questions };
}

function unassignedQuestionSurface(questionValue) {
  const areas = [questionValue?.promptArea, questionValue?.responseRegion?.area];
  return {
    width: Math.min(NATIVE_OPEN_RESPONSE_LIMITS.surfaceMaximum, Math.max(NATIVE_OPEN_RESPONSE_DEFAULT_SURFACE.width, ...areas.map((entry) => Number(entry?.x || 0) + Number(entry?.width || 0)))),
    height: Math.min(NATIVE_OPEN_RESPONSE_LIMITS.surfaceMaximum, Math.max(NATIVE_OPEN_RESPONSE_DEFAULT_SURFACE.height, ...areas.map((entry) => Number(entry?.y || 0) + Number(entry?.height || 0)))),
  };
}

export function nativeOpenResponsePanels(interaction) {
  if (interaction?.presentation?.kind === "panels") return interaction.presentation.panels;
  return [{ id: NATIVE_OPEN_RESPONSE_LEGACY_PANEL_ID, surface: interaction.surface, images: interaction.artwork || [], questionIds: (interaction.questions || []).map((questionValue) => questionValue.id), legacy: true }];
}

export function nativeOpenResponsePanelPromptIds(panel) {
  return panel?.promptQuestionIds || panel?.questionIds || [];
}

export function nativeOpenResponsePanelResponseIds(panel) {
  return panel?.responseQuestionIds || panel?.questionIds || [];
}

function customizeNativeOpenResponsePanel(panel, canonicalQuestionIds) {
  if (!Object.hasOwn(panel, "questionIds")) return panel;
  const legacyMembership = new Set(panel.questionIds);
  const orderedMembership = canonicalQuestionIds.filter((questionId) => legacyMembership.has(questionId));
  panel.promptQuestionIds = [...orderedMembership];
  panel.responseQuestionIds = [...orderedMembership];
  delete panel.questionIds;
  return panel;
}

export function promoteNativeOpenResponsePanels(interaction) {
  if (interaction?.presentation?.kind === "panels") return interaction;
  return {
    kind: "open-response",
    questions: structuredClone(interaction.questions || []),
    presentation: { kind: "panels", panels: [{
      id: NATIVE_OPEN_RESPONSE_LEGACY_PANEL_ID,
      surface: structuredClone(interaction.surface || NATIVE_OPEN_RESPONSE_DEFAULT_SURFACE),
      images: (interaction.artwork || []).map((item) => ({ ...structuredClone(item), id: item.id.replace(/^art-/, "img-") })),
      questionIds: (interaction.questions || []).map((questionValue) => questionValue.id),
    }] },
  };
}

function areaFitsSurface(value, logicalSurface) {
  return value.x >= 0 && value.y >= 0 && value.width >= 1 && value.height >= 1 && value.x + value.width <= logicalSurface.width && value.y + value.height <= logicalSurface.height;
}

export function assignNativeOpenResponseQuestion(interaction, questionId, panelId) {
  const panels = interaction?.presentation?.panels;
  const target = panels?.find((panel) => panel.id === panelId);
  const questionValue = interaction?.questions?.find((entry) => entry.id === questionId);
  if (!target || !questionValue) throw new Error("Native Open Response question assignment is invalid.");
  if (target.surface.height < 9) throw new Error("Native Open Response destination panel is too small for a response region.");
  panels.forEach((panel) => {
    if (Object.hasOwn(panel, "questionIds")) panel.questionIds = panel.questionIds.filter((id) => id !== questionId);
    else {
      panel.promptQuestionIds = panel.promptQuestionIds.filter((id) => id !== questionId);
      panel.responseQuestionIds = panel.responseQuestionIds.filter((id) => id !== questionId);
    }
  });
  if (Object.hasOwn(target, "questionIds")) target.questionIds.push(questionId);
  else { target.promptQuestionIds.push(questionId); target.responseQuestionIds.push(questionId); }
  if (areaFitsSurface(questionValue.promptArea, target.surface) && areaFitsSurface(questionValue.responseRegion.area, target.surface)) return { repositioned: false };
  questionValue.promptArea = clampAreaToSurface(questionValue.promptArea, target.surface, { minimumWidth: 24, minimumHeight: 24 });
  resizeNativeOpenResponseRegion(questionValue.responseRegion, clampAreaToSurface(questionValue.responseRegion.area, target.surface, {
    minimumWidth: Math.min(target.surface.width, Math.max(80, 2 * questionValue.responseRegion.presentation.paddingX + 1)),
    minimumHeight: Math.min(target.surface.height, Math.max(44, 2 * questionValue.responseRegion.presentation.paddingY + questionValue.responseRegion.presentation.lineSpacing)),
  }));
  fitResponsePresentationToArea(questionValue.responseRegion);
  return { repositioned: true };
}

export function updateNativeOpenResponsePanelMembership(interaction, panelId, questionId, membership, included) {
  if (!["prompt", "response"].includes(membership)) throw new Error("Native Open Response panel membership kind is invalid.");
  const panel = interaction?.presentation?.panels?.find((entry) => entry.id === panelId);
  const questionValue = interaction?.questions?.find((entry) => entry.id === questionId);
  if (!panel || !questionValue) throw new Error("Native Open Response panel membership is invalid.");
  customizeNativeOpenResponsePanel(panel, interaction.questions.map((entry) => entry.id));
  const key = membership === "prompt" ? "promptQuestionIds" : "responseQuestionIds";
  const current = new Set(panel[key]);
  if (included) current.add(questionId); else current.delete(questionId);
  panel[key] = interaction.questions.map((questionEntry) => questionEntry.id).filter((id) => current.has(id));
  if (!included) return { repositioned: false };
  if (membership === "prompt") {
    if (areaFitsSurface(questionValue.promptArea, panel.surface)) return { repositioned: false };
    questionValue.promptArea = clampAreaToSurface(questionValue.promptArea, panel.surface, { minimumWidth: 24, minimumHeight: 24 });
    return { repositioned: true };
  }
  if (panel.surface.height < 9) throw new Error("Native Open Response destination panel is too small for a response region.");
  if (areaFitsSurface(questionValue.responseRegion.area, panel.surface)) return { repositioned: false };
  resizeNativeOpenResponseRegion(questionValue.responseRegion, clampAreaToSurface(questionValue.responseRegion.area, panel.surface, {
    minimumWidth: Math.min(panel.surface.width, Math.max(80, 2 * questionValue.responseRegion.presentation.paddingX + 1)),
    minimumHeight: Math.min(panel.surface.height, Math.max(44, 2 * questionValue.responseRegion.presentation.paddingY + questionValue.responseRegion.presentation.lineSpacing)),
  }));
  fitResponsePresentationToArea(questionValue.responseRegion);
  return { repositioned: true };
}

function clampAreaToSurface(value, logicalSurface, { minimumWidth, minimumHeight }) {
  const width = Math.min(logicalSurface.width, Math.max(Math.min(minimumWidth, logicalSurface.width), Math.min(value.width, logicalSurface.width)));
  const height = Math.min(logicalSurface.height, Math.max(Math.min(minimumHeight, logicalSurface.height), Math.min(value.height, logicalSurface.height)));
  return { x: Math.min(Math.max(0, value.x), logicalSurface.width - width), y: Math.min(Math.max(0, value.y), logicalSurface.height - height), width, height };
}

function fitResponsePresentationToArea(responseRegion) {
  const { area, presentation } = responseRegion;
  presentation.paddingX = roundGeometry(Math.min(presentation.paddingX, Math.max(0, (area.width - 1) / 2)));
  presentation.lineSpacing = roundGeometry(Math.min(presentation.lineSpacing, area.height));
  presentation.answerFontSizeMax = roundGeometry(Math.min(presentation.answerFontSizeMax, presentation.lineSpacing * .9));
  presentation.answerFontSizeMin = roundGeometry(Math.min(presentation.answerFontSizeMin, presentation.answerFontSizeMax));
  presentation.paddingY = roundGeometry(Math.min(presentation.paddingY, Math.max(0, (area.height - presentation.lineSpacing) / 2)));
  while (presentation.lineCount > 1 && presentation.paddingY + presentation.lineSpacing * presentation.lineCount > area.height - presentation.paddingY) presentation.lineCount -= 1;
  presentation.linePositions = nativeOpenResponseLinePositions(presentation);
  presentation.lineWidth = roundGeometry(Math.min(presentation.lineWidth, Math.max(1, area.width - 2 * presentation.paddingX)));
}

export function removeNativeOpenResponsePanel(publicDocument, panelId) {
  const interaction = publicDocument.parts[0].interaction;
  const panel = interaction.presentation?.panels.find((entry) => entry.id === panelId);
  if (!panel) throw new Error("Native Open Response panel does not exist.");
  interaction.presentation.panels = interaction.presentation.panels.filter((entry) => entry.id !== panelId);
  new Set(panel.images.map((image) => image.assetSlot)).forEach((slot) => removeNativeManagedAssetReferenceIfUnused(publicDocument, slot));
  return panel;
}

export function nativeOpenResponseAssetRequirements(publicDocument) {
  const panels = nativeOpenResponsePanels(publicDocument?.parts?.[0]?.interaction || {}); const seen = new Set();
  const artwork = panels.flatMap((panel, panelIndex) => panel.images.flatMap((image, imageIndex) => {
    if (seen.has(image.assetSlot)) return [];
    seen.add(image.assetSlot); return [{ slot: image.assetSlot, label: `Open Response panel ${panelIndex + 1} image ${imageIndex + 1}` }];
  }));
  const fonts = (publicDocument?.parts?.[0]?.interaction?.questions || []).flatMap((question, questionIndex) => {
    const slot = question.responseRegion?.presentation?.answerFontAssetSlot;
    if (!slot || seen.has(slot)) return [];
    seen.add(slot);
    return [{ slot, mediaType: "font/ttf", label: `Open Response question ${questionIndex + 1} answer font` }];
  });
  return [...artwork, ...fonts];
}

export function nativeOpenResponseAnswerFontFamily(publicDocument, presentation) {
  return nativeActivityFontFamily(publicDocument, presentation?.answerFontAssetSlot, presentation?.answerFontFamily || NATIVE_OPEN_RESPONSE_FONT_FAMILY);
}

export function nativeOpenResponseConfiguredFontSizeBounds(presentation) {
  return {
    minimum: Math.ceil(Math.max(NATIVE_OPEN_RESPONSE_ANSWER_FONT_SIZE_MINIMUM, Number(presentation?.answerFontSizeMin) || NATIVE_OPEN_RESPONSE_ANSWER_FONT_SIZE_MINIMUM)),
    maximum: Math.floor(Math.min(NATIVE_OPEN_RESPONSE_ANSWER_FONT_SIZE_MAXIMUM, (Number(presentation?.lineSpacing) || 0) * 0.9)),
  };
}

export function commitNativeOpenResponseConfiguredFontSize(presentation, value) {
  if (!Number.isSafeInteger(value)) throw new Error("Requested answer font size must be a whole number.");
  const bounds = nativeOpenResponseConfiguredFontSizeBounds(presentation);
  if (bounds.maximum < bounds.minimum) throw new Error("The line spacing is too small for the auto-fit minimum.");
  const committed = clampNumber(value, bounds.minimum, bounds.maximum);
  return { value: committed, bounds, clamped: committed !== value };
}

function clampNumber(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
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
  removeNativeManagedAssetReferenceIfUnused(value, removed.assetSlot);
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
      const variantsShape = Object.hasOwn(answer, "modelAnswerTexts");
      exactKeys(answer, ["questionId", variantsShape ? "modelAnswerTexts" : "text"], label);
      if (!isNativeChildId(answer.questionId, "q") || ids.has(answer.questionId)) throw new Error(`${label}.questionId is invalid or duplicate.`);
      ids.add(answer.questionId);
      if (!variantsShape) return { questionId: answer.questionId, text: normalizeNativePedagogicalText(answer.text, `${label}.text`, NATIVE_OPEN_RESPONSE_LIMITS.modelAnswerLength) };
      if (!Array.isArray(answer.modelAnswerTexts) || answer.modelAnswerTexts.length < 1 || answer.modelAnswerTexts.length > 2) throw new Error(`${label}.modelAnswerTexts must contain one or two variants.`);
      return { questionId: answer.questionId, modelAnswerTexts: answer.modelAnswerTexts.map((text, variantIndex) => normalizeNativePedagogicalText(text, `${label}.modelAnswerTexts[${variantIndex}]`, NATIVE_OPEN_RESPONSE_LIMITS.modelAnswerLength)) };
    }),
  };
}

export function nativeOpenResponseModelAnswerTexts(answer) {
  return Array.isArray(answer?.modelAnswerTexts) ? answer.modelAnswerTexts : typeof answer?.text === "string" ? [answer.text] : [];
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
  const answers = new Map(teacherDocument.parts[0].solution.modelAnswers.map((answer) => [answer.questionId, nativeOpenResponseModelAnswerTexts(answer)]));
  if (!questions.length) issues.push("Add at least one question.");
  const panels = nativeOpenResponsePanels(publicDocument.parts[0].interaction);
  if (!panels.length) issues.push("Add at least one visual panel.");
  const membership = new Set(panels.flatMap((panel) => [...nativeOpenResponsePanelPromptIds(panel), ...nativeOpenResponsePanelResponseIds(panel)]));
  for (const [index, questionValue] of questions.entries()) {
    if (!questionValue.prompt.trim()) issues.push(`Question ${index + 1} needs a prompt.`);
    if (!membership.has(questionValue.id)) issues.push(`Question ${index + 1} must be assigned to a panel.`);
    const modelAnswers = answers.get(questionValue.id) || [];
    if (!modelAnswers.length || modelAnswers.some((modelAnswer) => !modelAnswer.trim())) issues.push(`Question ${index + 1} needs one or two model answers.`);
    else modelAnswers.forEach((modelAnswer, answerIndex) => {
      if (!autoFitNativeOpenResponseAnswer({ text: modelAnswer, responseRegion: questionValue.responseRegion }).fits) issues.push(`Question ${index + 1} model answer ${answerIndex + 1} does not fit its authored lines.`);
    });
  }
  panels.forEach((panel, panelIndex) => panel.images.forEach((item, imageIndex) => {
    if (!item.decorative && !item.altText.trim()) issues.push(`Panel ${panelIndex + 1} image ${imageIndex + 1} needs alt text or must be marked decorative.`);
  }));
  return { ready: issues.length === 0, issues };
}
