import { isNativeChildId } from "./nativeChildIdentity.js";

export const NATIVE_COMPLETE_SENTENCES_LIMITS = Object.freeze({ items: 30, promptLength: 2_000, answerLength: 500, sourceDimension: 16_384 });
export const NATIVE_COMPLETE_SENTENCES_BLANK_TOKEN = "[[blank]]";
export const NATIVE_COMPLETE_SENTENCES_DEFAULT_HOTSPOT_PRESENTATION = Object.freeze({ fontSize: 21, color: "#12304b" });

export function nativeCompleteSentencesPromptParts(prompt) {
  const source = String(prompt || "");
  const first = source.indexOf(NATIVE_COMPLETE_SENTENCES_BLANK_TOKEN);
  if (first < 0) return { before: source, after: "", structured: false };
  return {
    before: source.slice(0, first),
    after: source.slice(first + NATIVE_COMPLETE_SENTENCES_BLANK_TOKEN.length),
    structured: source.indexOf(NATIVE_COMPLETE_SENTENCES_BLANK_TOKEN, first + NATIVE_COMPLETE_SENTENCES_BLANK_TOKEN.length) < 0,
  };
}

export function updateNativeCompleteSentencesRevealState(current, itemIds, action) {
  const revealed = current instanceof Set ? current : new Set();
  if (action === "reset-activity") return revealed.size ? new Set() : revealed;
  if (action === "show-all") return revealed.size === itemIds.length && itemIds.every((itemId) => revealed.has(itemId)) ? revealed : new Set(itemIds);
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

function text(value, label, maximum) {
  if (typeof value !== "string" || value.length > maximum || /[<>\u0000-\u001f\u007f]/.test(value)) throw new Error(`${label} is invalid.`);
  return value.trim();
}

function area(value, presentation, label) {
  exact(value, ["x", "y", "width", "height"], label);
  const normalized = Object.fromEntries(Object.entries(value).map(([key, number]) => [key, Number(number)]));
  if (!Object.values(normalized).every(Number.isSafeInteger) || normalized.x < 0 || normalized.y < 0
    || normalized.width < 1 || normalized.height < 1 || normalized.x + normalized.width > presentation.sourceWidth
    || normalized.y + normalized.height > presentation.sourceHeight) throw new Error(`${label} is outside its source image.`);
  return normalized;
}

export function normalizeNativeCompleteSentencesHotspotPresentation(input, label = "Complete the Sentences hotspot presentation") {
  if (input === undefined) return { ...NATIVE_COMPLETE_SENTENCES_DEFAULT_HOTSPOT_PRESENTATION };
  exact(input, ["fontSize", "color"], label);
  const fontSize = Number(input.fontSize);
  if (!Number.isSafeInteger(fontSize) || fontSize < 8 || fontSize > 96) throw new Error(`${label}.fontSize is invalid.`);
  if (typeof input.color !== "string" || !/^#[0-9a-f]{6}$/i.test(input.color)) throw new Error(`${label}.color is invalid.`);
  return { fontSize, color: input.color.toLowerCase() };
}

export function normalizeNativeCompleteSentencesInteraction(input, { assets = [] } = {}) {
  const value = structuredClone(object(input, "Native Complete the Sentences interaction"));
  exact(value, ["kind", "items", "presentation"], "Native Complete the Sentences interaction");
  if (value.kind !== "complete-sentences" || !Array.isArray(value.items) || value.items.length > NATIVE_COMPLETE_SENTENCES_LIMITS.items) throw new Error("Native Complete the Sentences interaction is invalid.");
  const ids = new Set();
  const items = value.items.map((item, index) => {
    exact(item, ["id", "prompt"], `Complete the Sentences items[${index}]`);
    if (!isNativeChildId(item.id, "item") || ids.has(item.id)) throw new Error("Complete the Sentences item identity is invalid or duplicate.");
    const prompt = text(item.prompt, "Complete the Sentences prompt", NATIVE_COMPLETE_SENTENCES_LIMITS.promptLength);
    if (prompt.split(NATIVE_COMPLETE_SENTENCES_BLANK_TOKEN).length > 2) throw new Error("Complete the Sentences prompt can contain only one blank token.");
    ids.add(item.id); return { id: item.id, prompt };
  });
  const presentation = structuredClone(object(value.presentation, "Complete the Sentences presentation"));
  exact(presentation, ["kind", "backgroundAssetSlot", "sourceWidth", "sourceHeight", "hotspots"], "Complete the Sentences presentation");
  if (presentation.kind !== "image-hotspot" || (presentation.backgroundAssetSlot && !assets.some((asset) => asset.slot === presentation.backgroundAssetSlot))
    || ![presentation.sourceWidth, presentation.sourceHeight].every((number) => Number.isSafeInteger(number) && number > 0 && number <= NATIVE_COMPLETE_SENTENCES_LIMITS.sourceDimension)
    || !Array.isArray(presentation.hotspots) || presentation.hotspots.length > NATIVE_COMPLETE_SENTENCES_LIMITS.items) throw new Error("Complete the Sentences presentation is invalid.");
  const hotspotIds = new Set(); const itemIds = new Set(items.map((item) => item.id));
  const hotspots = presentation.hotspots.map((hotspot, index) => {
    const label = `Complete the Sentences hotspots[${index}]`;
    const hasPresentation = Object.hasOwn(hotspot, "presentation");
    exact(hotspot, ["id", "itemId", "area", ...(hasPresentation ? ["presentation"] : [])], label);
    if (!isNativeChildId(hotspot.id, "hot") || hotspotIds.has(hotspot.id) || !itemIds.has(hotspot.itemId)) throw new Error("Complete the Sentences hotspot binding is invalid or duplicate.");
    hotspotIds.add(hotspot.id); return { id: hotspot.id, itemId: hotspot.itemId, area: area(hotspot.area, presentation, `${label}.area`), presentation: normalizeNativeCompleteSentencesHotspotPresentation(hotspot.presentation, `${label}.presentation`) };
  });
  return { kind: "complete-sentences", items, presentation: { kind: "image-hotspot", backgroundAssetSlot: presentation.backgroundAssetSlot, sourceWidth: presentation.sourceWidth, sourceHeight: presentation.sourceHeight, hotspots } };
}

export function normalizeNativeCompleteSentencesSolution(input) {
  const value = structuredClone(object(input, "Complete the Sentences Teacher solution"));
  exact(value, ["kind", "answers"], "Complete the Sentences Teacher solution");
  if (value.kind !== "complete-sentences" || !Array.isArray(value.answers) || value.answers.length > NATIVE_COMPLETE_SENTENCES_LIMITS.items) throw new Error("Complete the Sentences Teacher solution is invalid.");
  const ids = new Set();
  return { kind: "complete-sentences", answers: value.answers.map((answer, index) => {
    exact(answer, ["itemId", "text"], `Complete the Sentences answers[${index}]`);
    if (!isNativeChildId(answer.itemId, "item") || ids.has(answer.itemId)) throw new Error("Complete the Sentences answer identity is invalid or duplicate.");
    ids.add(answer.itemId); return { itemId: answer.itemId, text: text(answer.text, "Complete the Sentences answer", NATIVE_COMPLETE_SENTENCES_LIMITS.answerLength) };
  }) };
}

export function validateNativeCompleteSentencesTopology(publicDocument, teacherDocument) {
  const items = publicDocument.parts[0].interaction.items;
  const answers = teacherDocument.parts[0].solution.answers;
  const hotspots = publicDocument.parts[0].interaction.presentation.hotspots;
  if (items.length !== answers.length || items.some((item, index) => answers[index]?.itemId !== item.id)
    || items.length !== hotspots.length || items.some((item) => hotspots.filter((hotspot) => hotspot.itemId === item.id).length !== 1)) {
    throw new Error("Complete the Sentences items, private answers, and hotspots must match exactly.");
  }
  return true;
}

export function assessNativeCompleteSentencesReadiness(publicDocument, teacherDocument) {
  const interaction = publicDocument.parts[0].interaction; const answers = new Map(teacherDocument.parts[0].solution.answers.map((answer) => [answer.itemId, answer.text]));
  const issues = [];
  if (!interaction.items.length) issues.push("Add at least one sentence item.");
  if (!publicDocument.assets.some((asset) => asset.slot === interaction.presentation.backgroundAssetSlot)) issues.push("Upload a managed background image.");
  interaction.items.forEach((item, index) => {
    if (!item.prompt) issues.push(`Item ${index + 1} needs a sentence prompt.`);
    if (!answers.get(item.id)) issues.push(`Item ${index + 1} needs a private correct word or phrase.`);
    if (interaction.presentation.hotspots.filter((hotspot) => hotspot.itemId === item.id).length !== 1) issues.push(`Item ${index + 1} needs exactly one blank hotspot.`);
  });
  return { ready: issues.length === 0, issues };
}

export function nativeCompleteSentencesAssetRequirements(publicDocument) {
  const presentation = publicDocument?.parts?.[0]?.interaction?.presentation;
  return presentation?.kind === "image-hotspot" && presentation.backgroundAssetSlot ? [{ slot: presentation.backgroundAssetSlot, width: presentation.sourceWidth, height: presentation.sourceHeight, label: "Complete the Sentences background" }] : [];
}
