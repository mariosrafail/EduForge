import { createNativeChildId } from "./nativeChildIdentity.js";
import { canonicalMarkWordsText, segmentMarkWordsText, normalizeNativeMarkWordsInteraction, normalizeNativeMarkWordsSolution, validateNativeMarkWordsTopology } from "./nativeMarkWords.js";

export function createNativeMarkWordsPassage(text = "", createId = createNativeChildId) {
  const canonical = canonicalMarkWordsText(text);
  return { id: createId("passage"), text: canonical, words: segmentMarkWordsText(canonical).map((range) => ({ id: createId("word"), ...range })) };
}

export function validateMarkWordsAuthoringPair(publicDocument, teacherDocument) {
  normalizeNativeMarkWordsInteraction(publicDocument.parts[0].interaction, { assets: publicDocument.assets });
  normalizeNativeMarkWordsSolution(teacherDocument.parts[0].solution);
  validateNativeMarkWordsTopology(publicDocument, teacherDocument);
}

export function alignNativeMarkWordsAnswers(publicDocument, teacherDocument) {
  const previous = new Map(teacherDocument.parts[0].solution.answers.map((answer) => [answer.itemId, answer.correctWordIds]));
  teacherDocument.parts[0].solution.answers = publicDocument.parts[0].interaction.items.map((item) => ({ itemId: item.id, correctWordIds: item.words.filter((word) => previous.get(item.id)?.includes(word.id)).map((word) => word.id) }));
}

export function addNativeMarkWordsPassage(publicDocument, teacherDocument, text = "", createId = createNativeChildId) {
  const item = createNativeMarkWordsPassage(text, createId);
  publicDocument.parts[0].interaction.items.push(item);
  alignNativeMarkWordsAnswers(publicDocument, teacherDocument);
  return item.id;
}

export function removeNativeMarkWordsPassage(publicDocument, teacherDocument, itemId) {
  const interaction = publicDocument.parts[0].interaction;
  interaction.items = interaction.items.filter((item) => item.id !== itemId);
  interaction.presentation.panels.forEach((panel) => { panel.hotspots = panel.hotspots.filter((hotspot) => hotspot.itemId !== itemId); });
  alignNativeMarkWordsAnswers(publicDocument, teacherDocument);
}

// The passage keeps its identity, but every occurrence is fresh. Rebinding is
// explicit even for small edits; old answers and geometry are never guessed.
export function rebuildNativeMarkWordsPassage(publicDocument, teacherDocument, itemId, text, { confirmed = false, createId = createNativeChildId } = {}) {
  const item = publicDocument.parts[0].interaction.items.find((entry) => entry.id === itemId);
  if (!item) throw new Error("Passage no longer exists.");
  if (canonicalMarkWordsText(text) === item.text) return;
  if (!confirmed) throw new Error("Confirm rebuilding this passage: its answers and word hotspots will be cleared.");
  const next = createNativeMarkWordsPassage(text, createId);
  item.text = next.text; item.words = next.words;
  publicDocument.parts[0].interaction.presentation.panels.forEach((panel) => { panel.hotspots = panel.hotspots.filter((hotspot) => hotspot.itemId !== itemId); });
  alignNativeMarkWordsAnswers(publicDocument, teacherDocument);
}

export function setNativeMarkWordsAnswers(publicDocument, teacherDocument, itemId, selected) {
  const item = publicDocument.parts[0].interaction.items.find((entry) => entry.id === itemId);
  if (!item || !Array.isArray(selected) || new Set(selected).size !== selected.length || selected.some((id) => !item.words.some((word) => word.id === id))) throw new Error("Correct words must belong to their passage.");
  const answer = teacherDocument.parts[0].solution.answers.find((entry) => entry.itemId === itemId);
  if (!answer) throw new Error("Passage answer is missing.");
  answer.correctWordIds = item.words.filter((word) => selected.includes(word.id)).map((word) => word.id);
}

export function nextNativeMarkWordsBinding(interaction, panelId) {
  const mapped = new Set(interaction.presentation.panels.flatMap((panel) => panel.hotspots.map((hotspot) => hotspot.wordId)));
  for (const item of interaction.items) {
    const owner = interaction.presentation.panels.find((panel) => panel.hotspots.some((hotspot) => hotspot.itemId === item.id));
    if (owner && owner.id !== panelId) continue;
    const word = item.words.find((entry) => !mapped.has(entry.id));
    if (word) return { itemId: item.id, wordId: word.id };
  }
  return null;
}

export function createNativeMarkWordsPanel(createId = createNativeChildId) {
  return { id: createId("panel"), backgroundAssetSlot: "", sourceWidth: 1024, sourceHeight: 582, hotspots: [] };
}
