import { isNativeChildId } from "./nativeChildIdentity.js";
import { autoFitNativeOpenResponseAnswer } from "./nativeOpenResponseAutoFit.js";
import {
  createNativeOpenResponseQuestion,
  initialNativeOpenResponseArtworkArea,
  normalizeNativeOpenResponseInteraction,
} from "./nativeOpenResponse.js";

export const NATIVE_OLDSCHOOL_LISTENING_LIMITS = Object.freeze({
  questions: 20,
  cues: 500,
  regionsPerCue: 24,
  regionsTotal: 4_000,
  snippets: 32,
  promptLength: 2_000,
  answerLength: 5_000,
  cueTextLength: 4_000,
  pageAltTextLength: 2_000,
  snippetLabelLength: 160,
  durationMs: 99 * 60 * 60 * 1_000,
  sourceDimension: 16_384,
});

export const NATIVE_OLDSCHOOL_LISTENING_PANEL_IDS = Object.freeze(["panel-1", "panel-2"]);

export function initialNativeOldschoolListeningArtworkArea(surface, metadata, artworkCount = 0) {
  if (artworkCount === 0 && metadata?.width === surface.width && metadata?.height === surface.height) return { x: 0, y: 0, width: surface.width, height: surface.height };
  return initialNativeOpenResponseArtworkArea(surface, metadata);
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

function normalizeLegacyQuestion(input, index) {
  const label = `Oldschool Listening questions[${index}]`;
  exactKeys(input, ["id", "prompt"], label);
  if (!isNativeChildId(input.id, "q")) throw new Error(`${label}.id is invalid.`);
  return { ...createNativeOpenResponseQuestion(input.id, index), prompt: text(input.prompt, `${label}.prompt`, NATIVE_OLDSCHOOL_LISTENING_LIMITS.promptLength) };
}

function normalizeRegion(input, cueIndex, regionIndex, surface) {
  const label = `Oldschool Listening cues[${cueIndex}].highlightRegions[${regionIndex}]`;
  const hasText = Object.hasOwn(input, "text");
  exactKeys(input, ["id", "x", "y", "width", "height", ...(hasText ? ["text"] : [])], label);
  if (!isNativeChildId(input.id, "region")) throw new Error(`${label}.id is invalid.`);
  return { id: input.id, ...area({ x: input.x, y: input.y, width: input.width, height: input.height }, label, surface), ...(hasText ? { text: text(input.text, `${label}.text`, NATIVE_OLDSCHOOL_LISTENING_LIMITS.cueTextLength, { required: true }) } : {}) };
}

function normalizeCue(input, index, surface) {
  const label = `Oldschool Listening cues[${index}]`;
  exactKeys(input, ["id", "startMs", "endMs", "text", "highlightRegions", "scrollY"], label);
  if (!isNativeChildId(input.id, "cue")) throw new Error(`${label}.id is invalid.`);
  const startMs = integer(input.startMs, `${label}.startMs`, 0, NATIVE_OLDSCHOOL_LISTENING_LIMITS.durationMs);
  const endMs = integer(input.endMs, `${label}.endMs`, 1, NATIVE_OLDSCHOOL_LISTENING_LIMITS.durationMs);
  if (endMs <= startMs) throw new Error(`${label} must end after it starts.`);
  if (!Array.isArray(input.highlightRegions) || input.highlightRegions.length > NATIVE_OLDSCHOOL_LISTENING_LIMITS.regionsPerCue) throw new Error(`${label}.highlightRegions count is invalid.`);
  const regions = input.highlightRegions.map((region, regionIndex) => normalizeRegion(region, index, regionIndex, surface));
  if (new Set(regions.map((region) => region.id)).size !== regions.length) throw new Error(`${label}.highlightRegions identities must be unique.`);
  const scrollY = input.scrollY === null ? null : integer(input.scrollY, `${label}.scrollY`, 0, surface.height);
  return { id: input.id, startMs, endMs, text: text(input.text, `${label}.text`, NATIVE_OLDSCHOOL_LISTENING_LIMITS.cueTextLength, { required: true }), highlightRegions: regions, scrollY };
}

function normalizeSnippet(input, index, cueIds, surface, assetSlots) {
  const label = `Oldschool Listening snippetHotspots[${index}]`;
  exactKeys(input, ["id", "area", "cueIds", "label", "audioAssetSlot"], label);
  if (!isNativeChildId(input.id, "aud")) throw new Error(`${label}.id is invalid.`);
  if (!Array.isArray(input.cueIds) || !input.cueIds.length || input.cueIds.some((id) => !cueIds.has(id)) || new Set(input.cueIds).size !== input.cueIds.length) throw new Error(`${label}.cueIds are invalid.`);
  const audioAssetSlot = text(input.audioAssetSlot, `${label}.audioAssetSlot`, 128);
  if (audioAssetSlot && !assetSlots.has(audioAssetSlot)) throw new Error(`${label}.audioAssetSlot must reference managed native audio.`);
  return { id: input.id, area: area(input.area, `${label}.area`, surface), cueIds: [...input.cueIds], label: text(input.label, `${label}.label`, NATIVE_OLDSCHOOL_LISTENING_LIMITS.snippetLabelLength, { required: true }), audioAssetSlot };
}

export function normalizeNativeOldschoolListeningInteraction(input, { assets = [], commonAssetSlots = new Set() } = {}) {
  const value = structuredClone(object(input, "Oldschool Listening interaction"));
  const legacyQuestions = !Object.hasOwn(value, "artwork");
  exactKeys(value, ["kind", "audioAssetSlot", "audioDurationMs", "panels", ...(legacyQuestions ? [] : ["artwork"]), "questions", "cues", "snippetHotspots"], "Oldschool Listening interaction");
  if (value.kind !== "oldschool-listening") throw new Error("Oldschool Listening interaction kind is invalid.");
  if (!Array.isArray(value.questions) || value.questions.length > NATIVE_OLDSCHOOL_LISTENING_LIMITS.questions) throw new Error("Oldschool Listening question count is invalid.");
  if (!Array.isArray(value.cues) || value.cues.length > NATIVE_OLDSCHOOL_LISTENING_LIMITS.cues) throw new Error("Oldschool Listening cue count is invalid.");
  if (!Array.isArray(value.snippetHotspots) || value.snippetHotspots.length > NATIVE_OLDSCHOOL_LISTENING_LIMITS.snippets) throw new Error("Oldschool Listening snippet count is invalid.");
  if (!Array.isArray(value.panels) || value.panels.length !== 2) throw new Error("Oldschool Listening requires exactly Panel 1 and Panel 2.");
  const assetSlots = new Set(assets.map((asset) => asset.slot));
  if (value.audioAssetSlot && !assetSlots.has(value.audioAssetSlot)) throw new Error("Oldschool Listening audio must reference a managed asset.");
  const audioDurationMs = integer(value.audioDurationMs, "Oldschool Listening audio duration", 0, NATIVE_OLDSCHOOL_LISTENING_LIMITS.durationMs);
  const panelOne = structuredClone(object(value.panels[0], "Oldschool Listening Panel 1"));
  const panelTwo = structuredClone(object(value.panels[1], "Oldschool Listening Panel 2"));
  exactKeys(panelOne, ["id", "kind", "sourceWidth", "sourceHeight"], "Oldschool Listening Panel 1");
  exactKeys(panelTwo, ["id", "kind", "pageAssetSlot", "sourceWidth", "sourceHeight", "altText"], "Oldschool Listening Panel 2");
  if (panelOne.id !== "panel-1" || panelOne.kind !== "questions" || panelTwo.id !== "panel-2" || panelTwo.kind !== "synchronized-page") throw new Error("Oldschool Listening panel identity or order is invalid.");
  const normalizeSurface = (panel, label) => ({ width: integer(panel.sourceWidth, `${label}.sourceWidth`, 1, NATIVE_OLDSCHOOL_LISTENING_LIMITS.sourceDimension), height: integer(panel.sourceHeight, `${label}.sourceHeight`, 1, NATIVE_OLDSCHOOL_LISTENING_LIMITS.sourceDimension) });
  const surfaceOne = normalizeSurface(panelOne, "Oldschool Listening Panel 1");
  const surfaceTwo = normalizeSurface(panelTwo, "Oldschool Listening Panel 2");
  if (panelTwo.pageAssetSlot && !assetSlots.has(panelTwo.pageAssetSlot)) throw new Error("Oldschool Listening page must reference a managed asset.");
  const questionSurface = normalizeNativeOpenResponseInteraction({ kind: "open-response", surface: surfaceOne, artwork: legacyQuestions ? [] : value.artwork, questions: legacyQuestions ? value.questions.map(normalizeLegacyQuestion) : value.questions }, {
    assets,
    commonAssetSlots: new Set([...commonAssetSlots, value.audioAssetSlot, panelTwo.pageAssetSlot, ...value.snippetHotspots.map((hotspot) => hotspot?.audioAssetSlot)].filter(Boolean)),
  });
  const cues = value.cues.map((cue, index) => normalizeCue(cue, index, surfaceTwo));
  const cueIds = cues.map((cue) => cue.id);
  if (new Set(cueIds).size !== cueIds.length) throw new Error("Oldschool Listening cue identities must be unique.");
  const regionIds = cues.flatMap((cue) => cue.highlightRegions.map((region) => region.id));
  if (regionIds.length > NATIVE_OLDSCHOOL_LISTENING_LIMITS.regionsTotal || new Set(regionIds).size !== regionIds.length) throw new Error("Oldschool Listening highlight region identities are invalid or exceed the limit.");
  cues.forEach((cue, index) => {
    if (index && cue.startMs < cues[index - 1].endMs) throw new Error("Oldschool Listening cues must be ordered and non-overlapping.");
    if (audioDurationMs && cue.endMs > audioDurationMs) throw new Error("Oldschool Listening cue exceeds the audio duration.");
  });
  const cueIdSet = new Set(cueIds);
  const snippets = value.snippetHotspots.map((entry, index) => normalizeSnippet(entry, index, cueIdSet, surfaceOne, assetSlots));
  if (new Set(snippets.map((entry) => entry.id)).size !== snippets.length) throw new Error("Oldschool Listening snippet identities must be unique.");
  return {
    kind: "oldschool-listening",
    audioAssetSlot: value.audioAssetSlot,
    audioDurationMs,
    panels: [
      { id: "panel-1", kind: "questions", sourceWidth: surfaceOne.width, sourceHeight: surfaceOne.height },
      { id: "panel-2", kind: "synchronized-page", pageAssetSlot: panelTwo.pageAssetSlot, sourceWidth: surfaceTwo.width, sourceHeight: surfaceTwo.height, altText: text(panelTwo.altText, "Oldschool Listening page alt text", NATIVE_OLDSCHOOL_LISTENING_LIMITS.pageAltTextLength, { required: Boolean(panelTwo.pageAssetSlot) }) },
    ],
    artwork: questionSurface.artwork,
    questions: questionSurface.questions,
    cues,
    snippetHotspots: snippets,
  };
}

export function normalizeNativeOldschoolListeningSolution(input) {
  const value = structuredClone(object(input, "Oldschool Listening Teacher solution"));
  exactKeys(value, ["kind", "modelAnswers"], "Oldschool Listening Teacher solution");
  if (value.kind !== "oldschool-listening" || !Array.isArray(value.modelAnswers) || value.modelAnswers.length > NATIVE_OLDSCHOOL_LISTENING_LIMITS.questions) throw new Error("Oldschool Listening Teacher solution is invalid.");
  const answers = value.modelAnswers.map((entry, index) => {
    const label = `Oldschool Listening modelAnswers[${index}]`;
    exactKeys(entry, ["questionId", "text"], label);
    if (!isNativeChildId(entry.questionId, "q")) throw new Error(`${label}.questionId is invalid.`);
    return { questionId: entry.questionId, text: text(entry.text, `${label}.text`, NATIVE_OLDSCHOOL_LISTENING_LIMITS.answerLength) };
  });
  if (new Set(answers.map((entry) => entry.questionId)).size !== answers.length) throw new Error("Oldschool Listening model-answer identities must be unique.");
  return { kind: "oldschool-listening", modelAnswers: answers };
}

export function validateNativeOldschoolListeningTopology(publicDocument, teacherDocument) {
  const questions = publicDocument.parts[0].interaction.questions;
  const answers = teacherDocument.parts[0].solution.modelAnswers;
  if (questions.length !== answers.length || questions.some((question, index) => question.id !== answers[index]?.questionId)) throw new Error("Oldschool Listening Teacher answers must exactly match public question identity and order.");
  return true;
}

export function nativeOldschoolListeningAssetRequirements(publicDocument) {
  const interaction = publicDocument?.parts?.[0]?.interaction;
  if (interaction?.kind !== "oldschool-listening") return [];
  const panelTwo = interaction.panels[1];
  return [
    ...(interaction.audioAssetSlot ? [{ slot: interaction.audioAssetSlot, mediaType: "audio/mpeg", label: "Oldschool Listening MP3" }] : []),
    ...(panelTwo?.pageAssetSlot ? [{ slot: panelTwo.pageAssetSlot, width: panelTwo.sourceWidth, height: panelTwo.sourceHeight, label: "Oldschool Listening page image" }] : []),
    ...interaction.snippetHotspots.filter((hotspot) => hotspot.audioAssetSlot).map((hotspot, index) => ({ slot: hotspot.audioAssetSlot, mediaType: "audio/mpeg", label: `Oldschool Listening hotspot MP3 ${index + 1}` })),
  ];
}

export function assessNativeOldschoolListeningReadiness(publicDocument, teacherDocument) {
  const issues = [];
  const interaction = publicDocument.parts[0].interaction;
  const panelTwo = interaction.panels[1];
  if (!interaction.audioAssetSlot) issues.push("Upload an Oldschool Listening MP3.");
  if (!interaction.audioDurationMs) issues.push("Listening audio duration is unavailable.");
  if (!panelTwo.pageAssetSlot) issues.push("Upload the Panel 2 page image.");
  if (panelTwo.pageAssetSlot && !panelTwo.altText.trim()) issues.push("Add accessible alt text for the Panel 2 page image.");
  if (!interaction.cues.length) issues.push("Add or import at least one timed cue.");
  interaction.cues.forEach((cue, index) => {
    if (!Number.isInteger(cue.startMs) || !Number.isInteger(cue.endMs) || cue.startMs < 0 || cue.endMs <= cue.startMs) issues.push(`Cue ${index + 1} needs a valid start and end time.`);
    if (index && cue.startMs < interaction.cues[index - 1].endMs) issues.push(`Cue ${index + 1} overlaps the previous cue.`);
    if (interaction.audioDurationMs && cue.endMs > interaction.audioDurationMs) issues.push(`Cue ${index + 1} extends beyond the listening audio.`);
    if (!cue.text.trim()) issues.push(`Cue ${index + 1} needs text.`);
    if (!cue.highlightRegions.length) issues.push(`Cue ${index + 1} needs at least one page highlight region.`);
    cue.highlightRegions.forEach((region, regionIndex) => {
      if (![region.x, region.y, region.width, region.height].every(Number.isInteger)
        || region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0
        || region.x + region.width > panelTwo.sourceWidth || region.y + region.height > panelTwo.sourceHeight) {
        issues.push(`Cue ${index + 1} highlight region ${regionIndex + 1} must stay inside the page image.`);
      }
    });
    if (cue.scrollY !== null && (cue.scrollY < 0 || cue.scrollY > panelTwo.sourceHeight)) issues.push(`Cue ${index + 1} has an invalid scroll target.`);
  });
  const answers = new Map(teacherDocument.parts[0].solution.modelAnswers.map((entry) => [entry.questionId, entry.text]));
  if (!interaction.questions.length) issues.push("Add at least one Panel 1 question.");
  interaction.questions.forEach((question, index) => {
    if (!question.prompt.trim()) issues.push(`Question ${index + 1} needs a prompt.`);
    const modelAnswer = answers.get(question.id) || "";
    if (!modelAnswer.trim()) issues.push(`Question ${index + 1} needs a model answer.`);
    else if (question.responseRegion && !autoFitNativeOpenResponseAnswer({ text: modelAnswer, responseRegion: question.responseRegion }).fits) issues.push(`Question ${index + 1} model answer does not fit its authored lines.`);
  });
  (interaction.artwork || []).forEach((item, index) => { if (!item.decorative && !item.altText.trim()) issues.push(`Artwork ${index + 1} needs alt text or must be marked decorative.`); });
  return { ready: issues.length === 0, issues };
}

export function createEmptyNativeOldschoolListeningInteraction() {
  return {
    kind: "oldschool-listening",
    audioAssetSlot: "",
    audioDurationMs: 0,
    panels: [
      { id: "panel-1", kind: "questions", sourceWidth: 1024, sourceHeight: 582 },
      { id: "panel-2", kind: "synchronized-page", pageAssetSlot: "", sourceWidth: 1024, sourceHeight: 1400, altText: "" },
    ],
    artwork: [],
    questions: [],
    cues: [],
    snippetHotspots: [],
  };
}
