import { isNativeChildId } from "./nativeChildIdentity.js";
import { nativeActivityFontFamily } from "./nativeActivityFont.js";
import { NATIVE_IMAGE_DEFAULT_SURFACE, NATIVE_IMAGE_LIMITS, normalizeNativeImageInteraction } from "./nativeImage.js";
import { removeNativeManagedAssetReferenceIfUnused } from "./nativeActivityPublic.js";
import { normalizeNativePedagogicalText, normalizeNativeSingleLineText } from "./nativePedagogicalText.js";

export const NATIVE_DRAG_DROP_LIMITS = Object.freeze({
  words: 100,
  wordTextLength: 300,
  panels: 12,
  targetsPerPanel: 40,
  totalTargets: 120,
  targetLabelLength: 300,
  imagesPerPanel: NATIVE_IMAGE_LIMITS.images,
  surfaceMaximum: NATIVE_IMAGE_LIMITS.surfaceMaximum,
  fontSizeMinimum: 8,
  fontSizeMaximum: 96,
});

export const NATIVE_DRAG_DROP_DEFAULT_SURFACE = NATIVE_IMAGE_DEFAULT_SURFACE;
export const NATIVE_DRAG_DROP_FONT_FAMILIES = Object.freeze(["Arial", "Georgia", "Verdana"]);
export const NATIVE_DRAG_DROP_DEFAULT_PRESENTATION = Object.freeze({
  bankWordStyle: Object.freeze({ fontFamily: "Arial", fontSize: 18, color: "#172033", fontAssetSlot: null }),
  placedAnswerStyle: Object.freeze({ fontFamily: "Arial", fontSize: 21, color: "#172033", fontAssetSlot: null }),
});

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

function normalizeArea(input, surface, label) {
  exactKeys(input, ["x", "y", "width", "height"], label);
  const area = {
    x: number(input.x, `${label}.x`, 0, surface.width),
    y: number(input.y, `${label}.y`, 0, surface.height),
    width: number(input.width, `${label}.width`, 1, surface.width),
    height: number(input.height, `${label}.height`, 1, surface.height),
  };
  if (area.x + area.width > surface.width || area.y + area.height > surface.height) throw new Error(`${label} must stay inside its logical surface.`);
  return area;
}

function normalizeTextStyle(input, label, assets) {
  exactKeys(input, ["fontFamily", "fontSize", "color", "fontAssetSlot"], label);
  if (!NATIVE_DRAG_DROP_FONT_FAMILIES.includes(input.fontFamily)) throw new Error(`${label}.fontFamily is not approved.`);
  const fontSize = number(input.fontSize, `${label}.fontSize`, NATIVE_DRAG_DROP_LIMITS.fontSizeMinimum, NATIVE_DRAG_DROP_LIMITS.fontSizeMaximum);
  if (typeof input.color !== "string" || !/^#[0-9a-f]{6}$/i.test(input.color)) throw new Error(`${label}.color is invalid.`);
  const fontAssetSlot = input.fontAssetSlot === null ? null : String(input.fontAssetSlot);
  if (fontAssetSlot !== null && !assets.some((asset) => asset.slot === fontAssetSlot && asset.role === "activity_font")) throw new Error(`${label}.fontAssetSlot does not reference an authorized font.`);
  return { fontFamily: input.fontFamily, fontSize, color: input.color.toLowerCase(), fontAssetSlot };
}

function normalizePresentation(input, assets) {
  if (input === undefined) return structuredClone(NATIVE_DRAG_DROP_DEFAULT_PRESENTATION);
  exactKeys(input, ["bankWordStyle", "placedAnswerStyle"], "Native Drag & Drop presentation");
  return {
    bankWordStyle: normalizeTextStyle(input.bankWordStyle, "Native Drag & Drop bank word style", assets),
    placedAnswerStyle: normalizeTextStyle(input.placedAnswerStyle, "Native Drag & Drop placed answer style", assets),
  };
}

export function createEmptyNativeDragDropInteraction() {
  return { kind: "drag-drop", words: [], presentation: structuredClone(NATIVE_DRAG_DROP_DEFAULT_PRESENTATION), panels: [] };
}

export function normalizeNativeDragDropInteraction(input, { assets = [], commonAssetSlots = new Set() } = {}) {
  const value = structuredClone(object(input, "Native Drag & Drop interaction"));
  const hasPresentation = Object.hasOwn(value, "presentation");
  exactKeys(value, ["kind", "words", ...(hasPresentation ? ["presentation"] : []), "panels"], "Native Drag & Drop interaction");
  if (value.kind !== "drag-drop") throw new Error("Native Drag & Drop interaction kind is invalid.");
  if (!Array.isArray(value.words) || value.words.length > NATIVE_DRAG_DROP_LIMITS.words) throw new Error("Native Drag & Drop word count is invalid.");
  if (!Array.isArray(value.panels) || value.panels.length > NATIVE_DRAG_DROP_LIMITS.panels) throw new Error("Native Drag & Drop panel count is invalid.");

  const wordIds = new Set();
  const words = value.words.map((word, index) => {
    const label = `Native Drag & Drop words[${index}]`;
    exactKeys(word, ["id", "text"], label);
    if (!isNativeChildId(word.id, "word") || wordIds.has(word.id)) throw new Error("Native Drag & Drop word identity is invalid or duplicate.");
    wordIds.add(word.id);
    return { id: word.id, text: normalizeNativePedagogicalText(word.text, `${label}.text`, NATIVE_DRAG_DROP_LIMITS.wordTextLength, { required: true }) };
  });

  const presentation = normalizePresentation(value.presentation, assets);
  const panelIds = new Set();
  const imageIds = new Set();
  const targetIds = new Set();
  const usedAssetSlots = new Set();
  let targetCount = 0;
  const panels = value.panels.map((panel, panelIndex) => {
    const label = `Native Drag & Drop panels[${panelIndex}]`;
    exactKeys(panel, ["id", "surface", "images", "dropTargets"], label);
    if (!isNativeChildId(panel.id, "panel") || panelIds.has(panel.id)) throw new Error("Native Drag & Drop panel identity is invalid or duplicate.");
    panelIds.add(panel.id);
    if (!Array.isArray(panel.images) || panel.images.length > NATIVE_DRAG_DROP_LIMITS.imagesPerPanel) throw new Error(`${label}.images count is invalid.`);
    if (!Array.isArray(panel.dropTargets) || panel.dropTargets.length > NATIVE_DRAG_DROP_LIMITS.targetsPerPanel) throw new Error(`${label}.dropTargets count is invalid.`);
    targetCount += panel.dropTargets.length;
    if (targetCount > NATIVE_DRAG_DROP_LIMITS.totalTargets) throw new Error("Native Drag & Drop total target count is invalid.");

    const compositionAssets = assets.filter((asset) => asset.role !== "activity_font");
    const panelAssetSlots = new Set(panel.images.map((image) => image.assetSlot));
    const otherAssetSlots = new Set([...commonAssetSlots, ...compositionAssets.filter((asset) => !panelAssetSlots.has(asset.slot)).map((asset) => asset.slot)]);
    const composition = normalizeNativeImageInteraction({ kind: "image", surface: panel.surface, images: panel.images }, { assets: compositionAssets, commonAssetSlots: otherAssetSlots });
    composition.images.forEach((image) => {
      if (imageIds.has(image.id)) throw new Error("Native Drag & Drop image identities must be unique across panels.");
      imageIds.add(image.id); usedAssetSlots.add(image.assetSlot);
    });
    const dropTargets = panel.dropTargets.map((target, targetIndex) => {
      const targetLabel = `${label}.dropTargets[${targetIndex}]`;
      exactKeys(target, ["id", "area", "accessibleLabel"], targetLabel);
      if (!isNativeChildId(target.id, "target") || targetIds.has(target.id)) throw new Error("Native Drag & Drop target identity is invalid or duplicate.");
      targetIds.add(target.id);
      return {
        id: target.id,
        area: normalizeArea(target.area, composition.surface, `${targetLabel}.area`),
        accessibleLabel: normalizeNativeSingleLineText(target.accessibleLabel, `${targetLabel}.accessibleLabel`, NATIVE_DRAG_DROP_LIMITS.targetLabelLength, { required: true }),
      };
    });
    return { id: panel.id, surface: composition.surface, images: composition.images, dropTargets };
  });

  [presentation.bankWordStyle.fontAssetSlot, presentation.placedAnswerStyle.fontAssetSlot].filter(Boolean).forEach((slot) => usedAssetSlots.add(slot));
  if (assets.some((asset) => !usedAssetSlots.has(asset.slot) && !commonAssetSlots.has(asset.slot))) throw new Error("Every Native Drag & Drop managed asset must be used by an image layer, text style, or common supporting content.");
  return { kind: "drag-drop", words, presentation, panels };
}

export function normalizeNativeDragDropSolution(input) {
  const value = structuredClone(object(input, "Native Drag & Drop Teacher solution"));
  exactKeys(value, ["kind", "mappings"], "Native Drag & Drop Teacher solution");
  if (value.kind !== "drag-drop" || !Array.isArray(value.mappings) || value.mappings.length > NATIVE_DRAG_DROP_LIMITS.totalTargets) throw new Error("Native Drag & Drop Teacher solution is invalid.");
  const targetIds = new Set();
  const wordIds = new Set();
  return { kind: "drag-drop", mappings: value.mappings.map((mapping, index) => {
    const label = `Native Drag & Drop mappings[${index}]`;
    exactKeys(mapping, ["targetId", "wordId"], label);
    if (!isNativeChildId(mapping.targetId, "target") || targetIds.has(mapping.targetId)) throw new Error("Native Drag & Drop target mapping is invalid or duplicate.");
    if (!isNativeChildId(mapping.wordId, "word") || wordIds.has(mapping.wordId)) throw new Error("Native Drag & Drop word mapping is invalid or reused.");
    targetIds.add(mapping.targetId); wordIds.add(mapping.wordId);
    return { targetId: mapping.targetId, wordId: mapping.wordId };
  }) };
}

export function validateNativeDragDropTopology(publicDocument, teacherDocument) {
  const interaction = publicDocument.parts[0].interaction;
  const targets = interaction.panels.flatMap((panel) => panel.dropTargets);
  const targetIds = new Set(targets.map((target) => target.id));
  const wordIds = new Set(interaction.words.map((word) => word.id));
  const mappings = teacherDocument.parts[0].solution.mappings;
  if (mappings.length !== targets.length
    || mappings.some((mapping) => !targetIds.has(mapping.targetId) || !wordIds.has(mapping.wordId))
    || new Set(mappings.map((mapping) => mapping.targetId)).size !== mappings.length
    || new Set(mappings.map((mapping) => mapping.wordId)).size !== mappings.length) {
    throw new Error("Drag & Drop requires exactly one private stable-ID mapping per target and one target per word instance.");
  }
  return true;
}

export function assessNativeDragDropReadiness(publicDocument, teacherDocument) {
  const interaction = publicDocument.parts[0].interaction;
  const mappings = new Map(teacherDocument.parts[0].solution.mappings.map((mapping) => [mapping.targetId, mapping.wordId]));
  const wordIds = new Set(interaction.words.map((word) => word.id));
  const issues = [];
  if (!interaction.words.length) issues.push("Add at least one draggable word.");
  if (!interaction.panels.length) issues.push("Add at least one visual panel.");
  interaction.panels.forEach((panel, panelIndex) => {
    if (!panel.images.length) issues.push(`Panel ${panelIndex + 1} needs at least one image layer.`);
    if (!panel.dropTargets.length) issues.push(`Panel ${panelIndex + 1} needs at least one drop target.`);
    panel.images.forEach((image, imageIndex) => { if (!image.decorative && !image.altText) issues.push(`Panel ${panelIndex + 1} image ${imageIndex + 1} needs alt text or must be decorative.`); });
    panel.dropTargets.forEach((target, targetIndex) => {
      if (!target.accessibleLabel) issues.push(`Panel ${panelIndex + 1} target ${targetIndex + 1} needs an accessible label.`);
      if (!wordIds.has(mappings.get(target.id))) issues.push(`Panel ${panelIndex + 1} target ${targetIndex + 1} needs a private correct word mapping.`);
    });
  });
  return { ready: issues.length === 0, issues };
}

export function nativeDragDropAssetRequirements(publicDocument) {
  const interaction = publicDocument?.parts?.[0]?.interaction;
  const panels = interaction?.panels || [];
  const seen = new Set();
  const requirements = panels.flatMap((panel, panelIndex) => panel.images.flatMap((image, imageIndex) => {
    if (seen.has(image.assetSlot)) return [];
    seen.add(image.assetSlot);
    return [{ slot: image.assetSlot, label: `Drag & Drop panel ${panelIndex + 1} image ${imageIndex + 1}` }];
  }));
  for (const [style, label] of [[interaction?.presentation?.bankWordStyle, "Drag & Drop bank word font"], [interaction?.presentation?.placedAnswerStyle, "Drag & Drop placed answer font"]]) {
    const slot = style?.fontAssetSlot;
    if (slot && !seen.has(slot)) { seen.add(slot); requirements.push({ slot, mediaType: "font/ttf", label }); }
  }
  return requirements;
}

export function nativeDragDropTextFontFamily(publicDocument, style) {
  return nativeActivityFontFamily(publicDocument, style?.fontAssetSlot, style?.fontFamily || "Arial");
}

export function removeNativeDragDropImage(publicDocument, panelId, imageId) {
  const panel = publicDocument.parts[0].interaction.panels.find((entry) => entry.id === panelId);
  const image = panel?.images.find((entry) => entry.id === imageId);
  if (!panel || !image) throw new Error("Drag & Drop image does not exist.");
  panel.images = panel.images.filter((entry) => entry.id !== imageId).map((entry, order) => ({ ...entry, order }));
  removeNativeManagedAssetReferenceIfUnused(publicDocument, image.assetSlot);
  return image;
}

export function removeNativeDragDropPanel(publicDocument, teacherDocument, panelId) {
  const interaction = publicDocument.parts[0].interaction;
  const panel = interaction.panels.find((entry) => entry.id === panelId);
  if (!panel) throw new Error("Drag & Drop panel does not exist.");
  const targetIds = new Set(panel.dropTargets.map((target) => target.id));
  const assetSlots = new Set(panel.images.map((image) => image.assetSlot));
  interaction.panels = interaction.panels.filter((entry) => entry.id !== panelId);
  teacherDocument.parts[0].solution.mappings = teacherDocument.parts[0].solution.mappings.filter((mapping) => !targetIds.has(mapping.targetId));
  assetSlots.forEach((slot) => removeNativeManagedAssetReferenceIfUnused(publicDocument, slot));
  return panel;
}

export function removeNativeDragDropWord(publicDocument, teacherDocument, wordId) {
  const interaction = publicDocument.parts[0].interaction;
  if (!interaction.words.some((word) => word.id === wordId)) throw new Error("Drag & Drop word does not exist.");
  interaction.words = interaction.words.filter((word) => word.id !== wordId);
  teacherDocument.parts[0].solution.mappings = teacherDocument.parts[0].solution.mappings.filter((mapping) => mapping.wordId !== wordId);
}

export function normalizeNativeDragDropResponses(input, publicDocument) {
  const value = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const interaction = publicDocument.parts[0].interaction;
  const targetIds = new Set(interaction.panels.flatMap((panel) => panel.dropTargets.map((target) => target.id)));
  const wordIds = new Set(interaction.words.map((word) => word.id));
  const usedWords = new Set();
  const normalized = {};
  for (const [targetId, wordId] of Object.entries(value)) {
    if (!targetIds.has(targetId) || !wordIds.has(wordId) || usedWords.has(wordId)) continue;
    usedWords.add(wordId); normalized[targetId] = wordId;
  }
  return normalized;
}

export function placeNativeDragDropWord(responses, targetId, wordId) {
  const next = Object.fromEntries(Object.entries(responses || {}).filter(([currentTargetId, currentWordId]) => currentTargetId !== targetId && currentWordId !== wordId));
  next[targetId] = wordId;
  return next;
}

export function shuffleNativeDragDropWordIds(words, random = Math.random) {
  if (!Array.isArray(words) || typeof random !== "function") throw new Error("Drag & Drop shuffle input is invalid.");
  const ids = words.map((word) => word.id);
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const sample = Number(random());
    const swapIndex = Math.min(index, Math.max(0, Math.floor((Number.isFinite(sample) ? sample : 0) * (index + 1))));
    [ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]];
  }
  return ids;
}

export function visibleNativeDragDropWordIds(sessionWordIds, responses = {}, targetWordOverrides = null) {
  const consumed = new Set(Object.values(responses || {}));
  if (targetWordOverrides instanceof Map) targetWordOverrides.forEach((word) => { if (word?.id) consumed.add(word.id); });
  return (sessionWordIds || []).filter((wordId) => !consumed.has(wordId));
}

export function reassignNativeDragDropMapping(mappings, targetId, wordId) {
  if (!Array.isArray(mappings)) throw new Error("Drag & Drop mappings must be an array.");
  const next = mappings.map((mapping) => ({ ...mapping }));
  const current = next.find((mapping) => mapping.targetId === targetId);
  const displaced = next.find((mapping) => mapping.wordId === wordId && mapping.targetId !== targetId);
  if (displaced && !current) throw new Error("A used Drag & Drop word cannot be assigned to an unmapped target.");
  if (displaced) displaced.wordId = current.wordId;
  if (current) current.wordId = wordId;
  else next.push({ targetId, wordId });
  return next;
}

export function removeNativeDragDropResponse(responses, targetId) {
  return Object.fromEntries(Object.entries(responses || {}).filter(([currentTargetId]) => currentTargetId !== targetId));
}

export function updateNativeDragDropRevealState(current, targetIds, action) {
  const revealed = current instanceof Set ? current : new Set();
  if (action === "reset-activity") return revealed.size ? new Set() : revealed;
  if (action === "show-all") return revealed.size === targetIds.length && targetIds.every((targetId) => revealed.has(targetId)) ? revealed : new Set(targetIds);
  const targetId = action === "show-next" ? targetIds.find((candidate) => !revealed.has(candidate)) : action?.targetId;
  if (!targetId || !targetIds.includes(targetId) || revealed.has(targetId)) return revealed;
  return new Set(revealed).add(targetId);
}
