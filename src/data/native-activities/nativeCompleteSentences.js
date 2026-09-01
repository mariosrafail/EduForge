import { isNativeChildId } from "./nativeChildIdentity.js";
import { nativeActivityFontFamilyAlias } from "./nativeActivityFont.js";
import { normalizeNativePedagogicalText, normalizeNativeSingleLineText } from "./nativePedagogicalText.js";

export const NATIVE_COMPLETE_SENTENCES_LIMITS = Object.freeze({
  items: 30, panels: 8, hotspots: 30, promptLength: 2_000, answerLength: 500, acceptedTextMaximum: 20,
  sourceDimension: 16_384, fontSizeMinimum: 1,
});
export const NATIVE_COMPLETE_SENTENCES_BLANK_TOKEN = "[[blank]]";
export const NATIVE_COMPLETE_SENTENCES_LEGACY_PANEL_ID = "panel-00000000000000000000000000000001";
export const NATIVE_COMPLETE_SENTENCES_DEFAULT_HOTSPOT_PRESENTATION = Object.freeze({ fontSize: 21, color: "#12304b", fontAssetSlot: null });
export const NATIVE_COMPLETE_SENTENCES_EXACT_EVALUATION_MODE = "exact-answer";

export function nativeCompleteSentencesPromptParts(prompt) {
  const source = String(prompt || "");
  const first = source.indexOf(NATIVE_COMPLETE_SENTENCES_BLANK_TOKEN);
  if (first < 0) return { before: source, after: "", structured: false };
  return { before: source.slice(0, first), after: source.slice(first + NATIVE_COMPLETE_SENTENCES_BLANK_TOKEN.length), structured: source.indexOf(NATIVE_COMPLETE_SENTENCES_BLANK_TOKEN, first + NATIVE_COMPLETE_SENTENCES_BLANK_TOKEN.length) < 0 };
}

export function updateNativeCompleteSentencesRevealState(current, itemIds, action) {
  const revealed = current instanceof Set ? current : new Set();
  if (action === "reset-activity") return revealed.size ? new Set() : revealed;
  if (action === "show-all") {
    const next = new Set(revealed);
    itemIds.forEach((itemId) => next.add(itemId));
    return next.size === revealed.size ? revealed : next;
  }
  const itemId = action === "show-next" ? itemIds.find((candidate) => !revealed.has(candidate)) : action?.itemId;
  if (!itemId || !itemIds.includes(itemId) || revealed.has(itemId)) return revealed;
  return new Set(revealed).add(itemId);
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function exact(value, keys, label) {
  const actual = Object.keys(object(value, label)).sort(); const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} has missing or unknown fields.`);
}

function positiveInteger(value, label, maximum) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > maximum) throw new Error(`${label} is invalid.`);
  return normalized;
}

function area(value, panel, label) {
  exact(value, ["x", "y", "width", "height"], label);
  const normalized = Object.fromEntries(Object.entries(value).map(([key, number]) => [key, Number(number)]));
  if (!Object.values(normalized).every(Number.isSafeInteger) || normalized.x < 0 || normalized.y < 0 || normalized.width < 1 || normalized.height < 1 || normalized.x + normalized.width > panel.sourceWidth || normalized.y + normalized.height > panel.sourceHeight) throw new Error(`${label} is outside its source image.`);
  return normalized;
}

export function nativeCompleteSentencesFontFamilyAlias(assetId) {
  return nativeActivityFontFamilyAlias(assetId);
}

export function normalizeNativeCompleteSentencesHotspotPresentation(input, label = "Complete the Sentences hotspot presentation", { assets = null } = {}) {
  if (input === undefined) return { ...NATIVE_COMPLETE_SENTENCES_DEFAULT_HOTSPOT_PRESENTATION };
  const hasFont = Object.hasOwn(input, "fontAssetSlot");
  exact(input, ["fontSize", "color", ...(hasFont ? ["fontAssetSlot"] : [])], label);
  const fontSize = Number(input.fontSize);
  if (!Number.isFinite(fontSize) || fontSize < NATIVE_COMPLETE_SENTENCES_LIMITS.fontSizeMinimum) throw new Error(`${label}.fontSize is invalid.`);
  if (typeof input.color !== "string" || !/^#[0-9a-f]{6}$/i.test(input.color)) throw new Error(`${label}.color is invalid.`);
  const fontAssetSlot = hasFont && input.fontAssetSlot !== null ? String(input.fontAssetSlot) : null;
  if (fontAssetSlot !== null) {
    if (!/^[a-z0-9][a-z0-9-]{0,127}$/.test(fontAssetSlot)) throw new Error(`${label}.fontAssetSlot is invalid.`);
    if (assets && !assets.some((asset) => asset.slot === fontAssetSlot && asset.role === "activity_font")) throw new Error(`${label}.fontAssetSlot does not reference an authorized font.`);
  }
  return { fontSize, color: input.color.toLowerCase(), fontAssetSlot };
}

function legacyPanel(presentation) {
  return { id: NATIVE_COMPLETE_SENTENCES_LEGACY_PANEL_ID, backgroundAssetSlot: presentation.backgroundAssetSlot, sourceWidth: presentation.sourceWidth, sourceHeight: presentation.sourceHeight, hotspots: presentation.hotspots };
}

function normalizePresentation(input, { items, assets }) {
  const value = structuredClone(object(input, "Complete the Sentences presentation"));
  const panelShape = Object.hasOwn(value, "panels");
  exact(value, panelShape ? ["kind", "panels"] : ["kind", "backgroundAssetSlot", "sourceWidth", "sourceHeight", "hotspots"], "Complete the Sentences presentation");
  const rawPanels = panelShape ? value.panels : [legacyPanel(value)];
  if (value.kind !== "image-hotspot" || !Array.isArray(rawPanels) || rawPanels.length < 1 || rawPanels.length > NATIVE_COMPLETE_SENTENCES_LIMITS.panels) throw new Error("Complete the Sentences presentation is invalid.");
  const itemIds = new Set(items.map((item) => item.id));
  const assetSlots = new Set(assets.map((asset) => asset.slot));
  const panelIds = new Set(); const hotspotIds = new Set(); const mappedItems = new Set();
  return { kind: "image-hotspot", panels: rawPanels.map((entry, panelIndex) => {
    const label = `Complete the Sentences panels[${panelIndex}]`;
    exact(entry, ["id", "backgroundAssetSlot", "sourceWidth", "sourceHeight", "hotspots"], label);
    if (!isNativeChildId(entry.id, "panel") || panelIds.has(entry.id) || typeof entry.backgroundAssetSlot !== "string" || (entry.backgroundAssetSlot && !assetSlots.has(entry.backgroundAssetSlot)) || !Array.isArray(entry.hotspots) || entry.hotspots.length > NATIVE_COMPLETE_SENTENCES_LIMITS.hotspots) throw new Error(`${label} is invalid.`);
    panelIds.add(entry.id);
    const panel = { id: entry.id, backgroundAssetSlot: entry.backgroundAssetSlot, sourceWidth: positiveInteger(entry.sourceWidth, `${label}.sourceWidth`, NATIVE_COMPLETE_SENTENCES_LIMITS.sourceDimension), sourceHeight: positiveInteger(entry.sourceHeight, `${label}.sourceHeight`, NATIVE_COMPLETE_SENTENCES_LIMITS.sourceDimension) };
    return { ...panel, hotspots: entry.hotspots.map((hotspot, hotspotIndex) => {
      const hotspotLabel = `${label}.hotspots[${hotspotIndex}]`;
      const hasPresentation = Object.hasOwn(hotspot, "presentation");
      exact(hotspot, ["id", "itemId", "area", ...(hasPresentation ? ["presentation"] : [])], hotspotLabel);
      if (!isNativeChildId(hotspot.id, "hot") || hotspotIds.has(hotspot.id) || !itemIds.has(hotspot.itemId) || mappedItems.has(hotspot.itemId)) throw new Error("Complete the Sentences hotspot binding is invalid or duplicate.");
      hotspotIds.add(hotspot.id); mappedItems.add(hotspot.itemId);
      return { id: hotspot.id, itemId: hotspot.itemId, area: area(hotspot.area, panel, `${hotspotLabel}.area`), presentation: normalizeNativeCompleteSentencesHotspotPresentation(hotspot.presentation, `${hotspotLabel}.presentation`, { assets }) };
    }) };
  }) };
}

export function normalizeNativeCompleteSentencesInteraction(input, { assets = [] } = {}) {
  const value = structuredClone(object(input, "Native Complete the Sentences interaction"));
  const hasEvaluationMode = Object.hasOwn(value, "evaluationMode");
  exact(value, ["kind", "items", "presentation", ...(hasEvaluationMode ? ["evaluationMode"] : [])], "Native Complete the Sentences interaction");
  if (value.kind !== "complete-sentences" || !Array.isArray(value.items) || value.items.length > NATIVE_COMPLETE_SENTENCES_LIMITS.items) throw new Error("Native Complete the Sentences interaction is invalid.");
  if (hasEvaluationMode && value.evaluationMode !== NATIVE_COMPLETE_SENTENCES_EXACT_EVALUATION_MODE) throw new Error("Complete the Sentences evaluation mode is invalid.");
  const ids = new Set();
  const items = value.items.map((item, index) => {
    exact(item, ["id", "prompt"], `Complete the Sentences items[${index}]`);
    if (!isNativeChildId(item.id, "item") || ids.has(item.id)) throw new Error("Complete the Sentences item identity is invalid or duplicate.");
    const prompt = normalizeNativePedagogicalText(item.prompt, "Complete the Sentences prompt", NATIVE_COMPLETE_SENTENCES_LIMITS.promptLength);
    if (prompt.split(NATIVE_COMPLETE_SENTENCES_BLANK_TOKEN).length > 2) throw new Error("Complete the Sentences prompt can contain only one blank token.");
    ids.add(item.id); return { id: item.id, prompt };
  });
  return { kind: "complete-sentences", ...(hasEvaluationMode ? { evaluationMode: value.evaluationMode } : {}), items, presentation: normalizePresentation(value.presentation, { items, assets }) };
}

export function nativeCompleteSentencesAcceptedTexts(answer) {
  return Array.isArray(answer?.acceptedTexts) ? answer.acceptedTexts : typeof answer?.text === "string" ? [answer.text] : [];
}

export function normalizeNativeCompleteSentencesSolution(input) {
  const value = structuredClone(object(input, "Complete the Sentences Teacher solution"));
  exact(value, ["kind", "answers"], "Complete the Sentences Teacher solution");
  if (value.kind !== "complete-sentences" || !Array.isArray(value.answers) || value.answers.length > NATIVE_COMPLETE_SENTENCES_LIMITS.items) throw new Error("Complete the Sentences Teacher solution is invalid.");
  const ids = new Set();
  return { kind: "complete-sentences", answers: value.answers.map((answer, index) => {
    const hasAcceptedTexts = Object.hasOwn(answer, "acceptedTexts");
    exact(answer, ["itemId", "text", ...(hasAcceptedTexts ? ["acceptedTexts"] : [])], `Complete the Sentences answers[${index}]`);
    if (!isNativeChildId(answer.itemId, "item") || ids.has(answer.itemId)) throw new Error("Complete the Sentences answer identity is invalid or duplicate.");
    const text = normalizeNativeSingleLineText(answer.text, "Complete the Sentences answer", NATIVE_COMPLETE_SENTENCES_LIMITS.answerLength);
    if (!hasAcceptedTexts) { ids.add(answer.itemId); return { itemId: answer.itemId, text }; }
    if (!Array.isArray(answer.acceptedTexts) || !answer.acceptedTexts.length || answer.acceptedTexts.length > NATIVE_COMPLETE_SENTENCES_LIMITS.acceptedTextMaximum) throw new Error("Complete the Sentences accepted answers are invalid.");
    const acceptedTexts = answer.acceptedTexts.map((acceptedText, acceptedIndex) => normalizeNativeSingleLineText(acceptedText, `Complete the Sentences accepted answers[${acceptedIndex}]`, NATIVE_COMPLETE_SENTENCES_LIMITS.answerLength, { required: true }));
    if (new Set(acceptedTexts).size !== acceptedTexts.length) throw new Error("Complete the Sentences accepted answers must be unique.");
    ids.add(answer.itemId); return { itemId: answer.itemId, text: text || acceptedTexts.join("/"), acceptedTexts };
  }) };
}

export function validateNativeCompleteSentencesTopology(publicDocument, teacherDocument) {
  const items = publicDocument.parts[0].interaction.items;
  const answers = teacherDocument.parts[0].solution.answers;
  const hotspots = publicDocument.parts[0].interaction.presentation.panels.flatMap((panel) => panel.hotspots);
  if (items.length !== answers.length || items.some((item, index) => answers[index]?.itemId !== item.id) || items.some((item) => hotspots.filter((hotspot) => hotspot.itemId === item.id).length > 1)) throw new Error("Complete the Sentences private answers must match item order and visual mappings must be unique.");
  return true;
}

function contentIssues(publicDocument, teacherDocument) {
  const interaction = publicDocument.parts[0].interaction;
  const answers = new Map(teacherDocument.parts[0].solution.answers.map((answer) => [answer.itemId, nativeCompleteSentencesAcceptedTexts(answer)]));
  const issues = [];
  if (!interaction.items.length) issues.push("Add at least one sentence item.");
  interaction.items.forEach((item, index) => {
    if (!item.prompt) issues.push(`Item ${index + 1} needs a sentence prompt.`);
    if (!answers.get(item.id)?.some((answer) => answer.trim())) issues.push(`Item ${index + 1} needs a private correct word or phrase.`);
  });
  return issues;
}

export function assessNativeCompleteSentencesSaveability(publicDocument, teacherDocument) {
  const issues = contentIssues(publicDocument, teacherDocument);
  const presentation = publicDocument.parts[0].interaction.presentation;
  const assets = new Set(publicDocument.assets.map((asset) => asset.slot));
  if (!presentation.panels.length) issues.push("Add at least one visual panel.");
  presentation.panels.forEach((panel, index) => { if (!panel.backgroundAssetSlot || !assets.has(panel.backgroundAssetSlot)) issues.push(`Panel ${index + 1} needs a managed background image.`); });
  return { saveable: issues.length === 0, issues };
}

export function assessNativeCompleteSentencesReadiness(publicDocument, teacherDocument) {
  const saveability = assessNativeCompleteSentencesSaveability(publicDocument, teacherDocument);
  const interaction = publicDocument.parts[0].interaction;
  const hotspots = interaction.presentation.panels.flatMap((panel) => panel.hotspots);
  const issues = [...saveability.issues];
  interaction.items.forEach((item, index) => { if (hotspots.filter((hotspot) => hotspot.itemId === item.id).length !== 1) issues.push(`Item ${index + 1} needs exactly one blank hotspot.`); });
  return { ready: issues.length === 0, issues, saveable: saveability.saveable, saveIssues: saveability.issues };
}

export function nativeCompleteSentencesAssetRequirements(publicDocument) {
  const presentation = publicDocument?.parts?.[0]?.interaction?.presentation;
  if (presentation?.kind !== "image-hotspot" || !Array.isArray(presentation.panels)) return [];
  const requirements = presentation.panels.flatMap((panel, index) => panel.backgroundAssetSlot ? [{ slot: panel.backgroundAssetSlot, width: panel.sourceWidth, height: panel.sourceHeight, label: `Complete the Sentences panel ${index + 1} background` }] : []);
  const fontSlots = new Set();
  for (const panel of presentation.panels) for (const hotspot of panel.hotspots) {
    const slot = hotspot.presentation?.fontAssetSlot;
    if (slot && !fontSlots.has(slot)) { fontSlots.add(slot); requirements.push({ slot, mediaType: "font/ttf", label: "Complete the Sentences font" }); }
  }
  return requirements;
}
