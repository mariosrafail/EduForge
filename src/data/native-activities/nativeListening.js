import { isNativeChildId } from "./nativeChildIdentity.js";

export const NATIVE_LISTENING_LIMITS = Object.freeze({
  questions: 20,
  cues: 500,
  snippets: 32,
  promptLength: 2_000,
  answerLength: 5_000,
  cueTextLength: 4_000,
  snippetLabelLength: 160,
  durationMs: 99 * 60 * 60 * 1_000,
  sourceDimension: 16_384,
});

export const NATIVE_LISTENING_PANEL_IDS = Object.freeze(["panel-1", "panel-2"]);

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function exactKeys(value, keys, label) {
  const actual = Object.keys(object(value, label)).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} has missing or unknown fields.`);
}

function text(value, label, maximum, { required = false } = {}) {
  if (typeof value !== "string" || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new Error(`${label} is invalid.`);
  const normalized = value.trim();
  if (required && !normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function integer(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${label} is invalid.`);
  return value;
}

function area(input, label, surface) {
  exactKeys(input, ["x", "y", "width", "height"], label);
  const value = Object.fromEntries(Object.entries(input).map(([key, entry]) => [key, integer(entry, `${label}.${key}`, key === "width" || key === "height" ? 1 : 0, key === "x" || key === "width" ? surface.width : surface.height)]));
  if (value.x + value.width > surface.width || value.y + value.height > surface.height) throw new Error(`${label} must stay inside its source surface.`);
  return value;
}

function normalizeQuestion(input, index) {
  const label = `Native Listening questions[${index}]`;
  exactKeys(input, ["id", "prompt"], label);
  if (!isNativeChildId(input.id, "q")) throw new Error(`${label}.id is invalid.`);
  return { id: input.id, prompt: text(input.prompt, `${label}.prompt`, NATIVE_LISTENING_LIMITS.promptLength) };
}

function normalizeCue(input, index) {
  const label = `Native Listening cues[${index}]`;
  exactKeys(input, ["id", "startMs", "endMs", "text"], label);
  if (!isNativeChildId(input.id, "cue")) throw new Error(`${label}.id is invalid.`);
  const startMs = integer(input.startMs, `${label}.startMs`, 0, NATIVE_LISTENING_LIMITS.durationMs);
  const endMs = integer(input.endMs, `${label}.endMs`, 1, NATIVE_LISTENING_LIMITS.durationMs);
  if (endMs <= startMs) throw new Error(`${label} must end after it starts.`);
  return { id: input.id, startMs, endMs, text: text(input.text, `${label}.text`, NATIVE_LISTENING_LIMITS.cueTextLength, { required: true }) };
}

function normalizeSnippet(input, index, cueIds, surface) {
  const label = `Native Listening snippetHotspots[${index}]`;
  exactKeys(input, ["id", "area", "cueIds", "label"], label);
  if (!isNativeChildId(input.id, "aud")) throw new Error(`${label}.id is invalid.`);
  if (!Array.isArray(input.cueIds) || !input.cueIds.length || input.cueIds.some((id) => !cueIds.has(id)) || new Set(input.cueIds).size !== input.cueIds.length) throw new Error(`${label}.cueIds are invalid.`);
  return {
    id: input.id,
    area: area(input.area, `${label}.area`, surface),
    cueIds: [...input.cueIds],
    label: text(input.label, `${label}.label`, NATIVE_LISTENING_LIMITS.snippetLabelLength, { required: true }),
  };
}

export function normalizeNativeListeningInteraction(input, { assets = [], commonAssetSlots = new Set() } = {}) {
  const value = structuredClone(object(input, "Native Listening interaction"));
  exactKeys(value, ["kind", "audioAssetSlot", "audioDurationMs", "panels", "questions", "cues", "snippetHotspots"], "Native Listening interaction");
  if (value.kind !== "listening") throw new Error("Native Listening interaction kind is invalid.");
  if (!Array.isArray(value.questions) || value.questions.length > NATIVE_LISTENING_LIMITS.questions) throw new Error("Native Listening question count is invalid.");
  if (!Array.isArray(value.cues) || value.cues.length > NATIVE_LISTENING_LIMITS.cues) throw new Error("Native Listening cue count is invalid.");
  if (!Array.isArray(value.snippetHotspots) || value.snippetHotspots.length > NATIVE_LISTENING_LIMITS.snippets) throw new Error("Native Listening snippet count is invalid.");
  if (!Array.isArray(value.panels) || value.panels.length !== 2) throw new Error("Native Listening requires exactly Panel 1 and Panel 2.");
  const assetSlots = new Set(assets.map((asset) => asset.slot));
  if (value.audioAssetSlot && !assetSlots.has(value.audioAssetSlot)) throw new Error("Native Listening audio must reference a managed asset.");
  const audioDurationMs = integer(value.audioDurationMs, "Native Listening audio duration", 0, NATIVE_LISTENING_LIMITS.durationMs);
  const panelOne = structuredClone(object(value.panels[0], "Native Listening Panel 1"));
  const panelTwo = structuredClone(object(value.panels[1], "Native Listening Panel 2"));
  exactKeys(panelOne, ["id", "kind", "sourceWidth", "sourceHeight"], "Native Listening Panel 1");
  exactKeys(panelTwo, ["id", "kind", "backgroundAssetSlot", "sourceWidth", "sourceHeight", "transcriptArea"], "Native Listening Panel 2");
  if (panelOne.id !== "panel-1" || panelOne.kind !== "questions" || panelTwo.id !== "panel-2" || panelTwo.kind !== "synchronized-transcript") throw new Error("Native Listening panel identity or order is invalid.");
  const normalizeSurface = (panel, label) => ({
    width: integer(panel.sourceWidth, `${label}.sourceWidth`, 1, NATIVE_LISTENING_LIMITS.sourceDimension),
    height: integer(panel.sourceHeight, `${label}.sourceHeight`, 1, NATIVE_LISTENING_LIMITS.sourceDimension),
  });
  const surfaceOne = normalizeSurface(panelOne, "Native Listening Panel 1");
  const surfaceTwo = normalizeSurface(panelTwo, "Native Listening Panel 2");
  if (panelTwo.backgroundAssetSlot && !assetSlots.has(panelTwo.backgroundAssetSlot)) throw new Error("Native Listening background must reference a managed asset.");
  const questions = value.questions.map(normalizeQuestion);
  const questionIds = questions.map((entry) => entry.id);
  if (new Set(questionIds).size !== questionIds.length) throw new Error("Native Listening question identities must be unique.");
  const cues = value.cues.map(normalizeCue);
  const cueIds = cues.map((entry) => entry.id);
  if (new Set(cueIds).size !== cueIds.length) throw new Error("Native Listening cue identities must be unique.");
  cues.forEach((cue, index) => {
    if (index && cue.startMs < cues[index - 1].endMs) throw new Error("Native Listening cues must be ordered and non-overlapping.");
  });
  const cueIdSet = new Set(cueIds);
  const snippets = value.snippetHotspots.map((entry, index) => normalizeSnippet(entry, index, cueIdSet, surfaceOne));
  if (new Set(snippets.map((entry) => entry.id)).size !== snippets.length) throw new Error("Native Listening snippet identities must be unique.");
  const usedSlots = new Set([value.audioAssetSlot, panelTwo.backgroundAssetSlot].filter(Boolean));
  if (assets.some((asset) => asset.role !== "activity_artwork" || (!usedSlots.has(asset.slot) && !commonAssetSlots.has(asset.slot)))) throw new Error("Every Native Listening managed asset must be used.");
  return {
    kind: "listening",
    audioAssetSlot: value.audioAssetSlot,
    audioDurationMs,
    panels: [
      { id: "panel-1", kind: "questions", sourceWidth: surfaceOne.width, sourceHeight: surfaceOne.height },
      { id: "panel-2", kind: "synchronized-transcript", backgroundAssetSlot: panelTwo.backgroundAssetSlot, sourceWidth: surfaceTwo.width, sourceHeight: surfaceTwo.height, transcriptArea: area(panelTwo.transcriptArea, "Native Listening transcript area", surfaceTwo) },
    ],
    questions,
    cues,
    snippetHotspots: snippets,
  };
}

export function normalizeNativeListeningSolution(input) {
  const value = structuredClone(object(input, "Native Listening Teacher solution"));
  exactKeys(value, ["kind", "modelAnswers"], "Native Listening Teacher solution");
  if (value.kind !== "listening" || !Array.isArray(value.modelAnswers) || value.modelAnswers.length > NATIVE_LISTENING_LIMITS.questions) throw new Error("Native Listening Teacher solution is invalid.");
  const answers = value.modelAnswers.map((entry, index) => {
    const label = `Native Listening modelAnswers[${index}]`;
    exactKeys(entry, ["questionId", "text"], label);
    if (!isNativeChildId(entry.questionId, "q")) throw new Error(`${label}.questionId is invalid.`);
    return { questionId: entry.questionId, text: text(entry.text, `${label}.text`, NATIVE_LISTENING_LIMITS.answerLength) };
  });
  if (new Set(answers.map((entry) => entry.questionId)).size !== answers.length) throw new Error("Native Listening model-answer identities must be unique.");
  return { kind: "listening", modelAnswers: answers };
}

export function validateNativeListeningTopology(publicDocument, teacherDocument) {
  const questions = publicDocument.parts[0].interaction.questions;
  const answers = teacherDocument.parts[0].solution.modelAnswers;
  if (questions.length !== answers.length || questions.some((question, index) => question.id !== answers[index]?.questionId)) throw new Error("Native Listening Teacher answers must exactly match public question identity and order.");
  return true;
}

export function nativeListeningAssetRequirements(publicDocument) {
  const interaction = publicDocument?.parts?.[0]?.interaction;
  if (interaction?.kind !== "listening") return [];
  const panelTwo = interaction.panels[1];
  return [
    ...(interaction.audioAssetSlot ? [{ slot: interaction.audioAssetSlot, mediaType: "audio/mpeg", label: "Listening MP3" }] : []),
    ...(panelTwo?.backgroundAssetSlot ? [{ slot: panelTwo.backgroundAssetSlot, width: panelTwo.sourceWidth, height: panelTwo.sourceHeight, label: "Listening background" }] : []),
  ];
}

export function assessNativeListeningReadiness(publicDocument, teacherDocument) {
  const issues = [];
  const interaction = publicDocument.parts[0].interaction;
  if (!interaction.audioAssetSlot) issues.push("Upload a Listening MP3.");
  if (!interaction.audioDurationMs) issues.push("Listening audio duration is unavailable.");
  if (!interaction.panels[1].backgroundAssetSlot) issues.push("Upload a Panel 2 background.");
  if (!interaction.cues.length) issues.push("Add at least one transcript cue.");
  const cueIds = new Set(interaction.cues.map((cue) => cue.id));
  interaction.cues.forEach((cue, index) => {
    if (!Number.isSafeInteger(cue.startMs) || cue.startMs < 0 || !Number.isSafeInteger(cue.endMs) || cue.endMs <= cue.startMs) issues.push(`Transcript cue ${index + 1} needs valid start and end times.`);
    if (!(cue.text || "").trim()) issues.push(`Transcript cue ${index + 1} needs text.`);
    if (index && cue.startMs < interaction.cues[index - 1].endMs) issues.push(`Transcript cue ${index + 1} overlaps or is out of order.`);
    if (interaction.audioDurationMs && cue.endMs > interaction.audioDurationMs) issues.push(`Transcript cue ${index + 1} exceeds the audio duration.`);
  });
  interaction.snippetHotspots.forEach((hotspot, index) => {
    if (!(hotspot.label || "").trim()) issues.push(`Transcript hotspot ${index + 1} needs an accessible label.`);
    if (!hotspot.cueIds.length || hotspot.cueIds.some((id) => !cueIds.has(id))) issues.push(`Transcript hotspot ${index + 1} needs valid transcript cues.`);
  });
  const answers = new Map(teacherDocument.parts[0].solution.modelAnswers.map((entry) => [entry.questionId, entry.text]));
  interaction.questions.forEach((question, index) => {
    if (!question.prompt) issues.push(`Question ${index + 1} needs a prompt.`);
    if (!(answers.get(question.id) || "").trim()) issues.push(`Question ${index + 1} needs a model answer.`);
  });
  return { ready: issues.length === 0, issues };
}

export function createEmptyNativeListeningInteraction() {
  return {
    kind: "listening",
    audioAssetSlot: "",
    audioDurationMs: 0,
    panels: [
      { id: "panel-1", kind: "questions", sourceWidth: 1024, sourceHeight: 582 },
      { id: "panel-2", kind: "synchronized-transcript", backgroundAssetSlot: "", sourceWidth: 1024, sourceHeight: 1801, transcriptArea: { x: 72, y: 120, width: 880, height: 1500 } },
    ],
    questions: [],
    cues: [],
    snippetHotspots: [],
  };
}
