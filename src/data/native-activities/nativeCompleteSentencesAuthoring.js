import { createNativeChildId } from "./nativeChildIdentity.js";
import { removeNativeManagedAssetReferenceIfUnused } from "./nativeActivityPublic.js";
import { NATIVE_COMPLETE_SENTENCES_BLANK_TOKEN, NATIVE_COMPLETE_SENTENCES_LIMITS, nativeCompleteSentencesPromptParts } from "./nativeCompleteSentences.js";

const interaction = (document) => document.parts[0].interaction;
const solution = (document) => document.parts[0].solution;

export function parseNativeCompleteSentencesMarkedSentence(input) {
  const source = String(input ?? "");
  if (source.includes(NATIVE_COMPLETE_SENTENCES_BLANK_TOKEN)) return { valid: false, error: "The blank token is reserved; mark the answer with *asterisks* instead." };
  const markers = [...source.matchAll(/\*/g)].map((match) => match.index);
  if (!markers.length) return { valid: false, error: "Mark exactly one answer with a single pair of *asterisks*." };
  if (markers.length !== 2) return { valid: false, error: markers.length % 2 ? "The answer has an unmatched asterisk." : "Mark exactly one answer segment; multiple segments are not allowed." };
  const answer = source.slice(markers[0] + 1, markers[1]).trim();
  if (!answer) return { valid: false, error: "The marked answer cannot be empty." };
  if (answer.length > NATIVE_COMPLETE_SENTENCES_LIMITS.answerLength) return { valid: false, error: "The marked answer is too long." };
  const prompt = `${source.slice(0, markers[0])}${NATIVE_COMPLETE_SENTENCES_BLANK_TOKEN}${source.slice(markers[1] + 1)}`;
  if (prompt.length > NATIVE_COMPLETE_SENTENCES_LIMITS.promptLength) return { valid: false, error: "The sentence is too long." };
  return { valid: true, prompt, answer };
}

export function nativeCompleteSentencesMarkedSentence(prompt, answer) {
  const parts = nativeCompleteSentencesPromptParts(prompt);
  return parts.structured ? `${parts.before}*${answer}*${parts.after}` : String(prompt || "");
}

export function findNextUnusedNativeCompleteSentencesItemId(items, panels, preferredItemId = "") {
  const used = new Set(panels.flatMap((panel) => panel.hotspots.map((hotspot) => hotspot.itemId)));
  if (items.some((item) => item.id === preferredItemId) && !used.has(preferredItemId)) return preferredItemId;
  return items.find((item) => !used.has(item.id))?.id || null;
}

export function createNativeCompleteSentencesHotspotArea(sourceWidth, sourceHeight) {
  if (!Number.isSafeInteger(sourceWidth) || sourceWidth < 1 || !Number.isSafeInteger(sourceHeight) || sourceHeight < 1) throw new Error("Complete the Sentences hotspot source dimensions must be positive integers.");
  const width = Math.min(80, sourceWidth);
  const height = Math.min(30, sourceHeight);
  return { x: Math.floor((sourceWidth - width) / 2), y: Math.floor((sourceHeight - height) / 2), width, height };
}

export function addNextNativeCompleteSentencesHotspot(publicDocument, panelId, preferredItemId = "", createId = createNativeChildId) {
  const current = interaction(publicDocument);
  const panel = current.presentation.panels.find((entry) => entry.id === panelId);
  const itemId = findNextUnusedNativeCompleteSentencesItemId(current.items, current.presentation.panels, preferredItemId);
  if (!panel || !itemId) return null;
  const hotspot = { id: createId("hot"), itemId, area: createNativeCompleteSentencesHotspotArea(panel.sourceWidth, panel.sourceHeight) };
  panel.hotspots.push(hotspot);
  return hotspot;
}

export function addNativeCompleteSentencesItem(publicDocument, teacherDocument, createId = createNativeChildId) {
  const itemId = createId("item");
  interaction(publicDocument).items.push({ id: itemId, prompt: "" });
  solution(teacherDocument).answers.push({ itemId, text: "" });
  return itemId;
}

export function alignNativeCompleteSentencesAnswers(publicDocument, teacherDocument) {
  const answers = new Map(solution(teacherDocument).answers.map((answer) => [answer.itemId, answer]));
  solution(teacherDocument).answers = interaction(publicDocument).items.map((item) => answers.get(item.id) || { itemId: item.id, text: "" });
}

export function removeNativeCompleteSentencesItem(publicDocument, teacherDocument, itemId) {
  interaction(publicDocument).items = interaction(publicDocument).items.filter((item) => item.id !== itemId);
  for (const panel of interaction(publicDocument).presentation.panels) {
    panel.hotspots = panel.hotspots.filter((hotspot) => hotspot.itemId !== itemId);
  }
  alignNativeCompleteSentencesAnswers(publicDocument, teacherDocument);
}

export function createNativeCompleteSentencesPanel(createId = createNativeChildId) {
  return { id: createId("panel"), backgroundAssetSlot: "", sourceWidth: 1024, sourceHeight: 582, hotspots: [] };
}

export function replaceNativeCompleteSentencesBackground(publicDocument, panelId, reference, dimensions) {
  const panel = interaction(publicDocument).presentation.panels.find((entry) => entry.id === panelId);
  if (!panel) throw new Error("Complete the Sentences panel is unavailable.");
  const previous = panel.backgroundAssetSlot;
  const dimensionsChanged = panel.sourceWidth !== dimensions.width || panel.sourceHeight !== dimensions.height;
  panel.backgroundAssetSlot = reference.slot;
  panel.sourceWidth = dimensions.width;
  panel.sourceHeight = dimensions.height;
  if (dimensionsChanged) panel.hotspots = [];
  if (previous && previous !== reference.slot) removeNativeManagedAssetReferenceIfUnused(publicDocument, previous);
  return { dimensionsChanged };
}

export function removeNativeCompleteSentencesPanel(publicDocument, panelId) {
  const presentation = interaction(publicDocument).presentation;
  if (presentation.panels.length <= 1) throw new Error("Complete the Sentences requires at least one panel.");
  const panel = presentation.panels.find((entry) => entry.id === panelId);
  if (!panel) return false;
  presentation.panels = presentation.panels.filter((entry) => entry.id !== panelId);
  if (panel.backgroundAssetSlot) removeNativeManagedAssetReferenceIfUnused(publicDocument, panel.backgroundAssetSlot);
  return true;
}
