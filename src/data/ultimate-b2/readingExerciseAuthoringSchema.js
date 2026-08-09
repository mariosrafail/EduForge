import { normalizeUltimateB2ExerciseVisualCapabilities } from "./exerciseVisualCapabilities.js";

export const ULTIMATE_B2_COMPLETE_SENTENCES_ID = "ultimate-b2-sb-u1-p2-o4";
export const ULTIMATE_B2_DEBATE_CLUB_ID = "ultimate-b2-sb-u1-p2-o5";

export const ultimateB2ReadingExerciseBindings = Object.freeze({
  completeInstruction: "unit1.reading.exercise4.instruction",
  completeShowText: "unit1.reading.exercise4.show-text",
  debateInstruction: "unit1.reading.debate-club.instruction",
  debateBadge: "unit1.reading.debate-club.badge",
  debatePartOne: "unit1.reading.debate-club.part-1-photo",
  debatePartTwo: "unit1.reading.debate-club.part-2-photo",
  debateArgumentOne: "unit1.reading.debate-club.part-1-argument",
  debateArgumentTwo: "unit1.reading.debate-club.part-2-argument",
});

export const ultimateB2ReadingExerciseLimits = Object.freeze({
  payloadBytes: 80_000,
  revealedTextLength: 4_000,
  sentenceTextLength: 1_000,
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

function boundedText(value, label, maximum = ultimateB2ReadingExerciseLimits.sentenceTextLength, { allowEmpty = false } = {}) {
  if (typeof value !== "string" || value.length > maximum || (!allowEmpty && !value.trim())) throw new Error(`${label} must be ${allowEmpty ? "a" : "a non-empty"} string no longer than ${maximum} characters.`);
  if (/[<>]/.test(value)) throw new Error(`${label} must not contain HTML markup.`);
  return allowEmpty ? value : value.trim();
}

function integer(value, label, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
  return value;
}

function assertPayloadSize(value) {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > ultimateB2ReadingExerciseLimits.payloadBytes) throw new Error("Reading exercise authoring payload is too large.");
}

function surface(value) {
  exactKeys(value, ["width", "height"], "surface");
  return { width: integer(value.width, "surface.width", 320, 4096), height: integer(value.height, "surface.height", 240, 4096) };
}

function area(value, label, bounds) {
  exactKeys(value, ["x", "y", "width", "height"], label);
  const normalized = {
    x: integer(value.x, `${label}.x`, 0, bounds.width),
    y: integer(value.y, `${label}.y`, 0, bounds.height),
    width: integer(value.width, `${label}.width`, 1, bounds.width),
    height: integer(value.height, `${label}.height`, 1, bounds.height),
  };
  if (normalized.x + normalized.width > bounds.width || normalized.y + normalized.height > bounds.height) throw new Error(`${label} must stay inside the activity surface.`);
  return normalized;
}

function responsePresentation(value, label) {
  exactKeys(value, ["paddingX", "paddingY", "lineSpacing", "fontScale"], label);
  const normalized = {
    paddingX: integer(value.paddingX, `${label}.paddingX`, 0, 40),
    paddingY: integer(value.paddingY, `${label}.paddingY`, 0, 40),
    lineSpacing: integer(value.lineSpacing, `${label}.lineSpacing`, 16, 60),
    fontScale: Number(value.fontScale),
  };
  if (!Number.isFinite(normalized.fontScale) || normalized.fontScale < 0.6 || normalized.fontScale > 1.6) throw new Error(`${label}.fontScale must be from 0.6 to 1.6.`);
  return normalized;
}

function sourceEvidence(value, expectedObjectNumber) {
  exactKeys(value, ["objectNumber", "iwbSha256", "decodedSha256", "assetSha256"], "source");
  if (value.objectNumber !== expectedObjectNumber) throw new Error(`source.objectNumber must remain ${expectedObjectNumber}.`);
  for (const [label, hash] of [["iwbSha256", value.iwbSha256], ["decodedSha256", value.decodedSha256]]) if (!/^[a-f0-9]{64}$/.test(hash || "")) throw new Error(`source.${label} must be a SHA-256 digest.`);
  const assetSha256 = record(value.assetSha256, "source.assetSha256");
  if (!Object.keys(assetSha256).length || Object.keys(assetSha256).some((name) => !/^[a-zA-Z0-9_.-]+$/.test(name)) || Object.values(assetSha256).some((hash) => !/^[a-f0-9]{64}$/.test(hash))) throw new Error("source.assetSha256 contains an invalid asset record.");
  return { objectNumber: expectedObjectNumber, iwbSha256: value.iwbSha256, decodedSha256: value.decodedSha256, assetSha256 };
}

export function normalizeUltimateB2CompleteSentencesAuthoring(input) {
  assertPayloadSize(input);
  const value = structuredClone(record(input, "Complete the Sentences authoring"));
  exactKeys(value, ["schemaVersion", "activityId", "source", "surface", "visualCapabilities", "example", "sentences", "blanks"], "Complete the Sentences authoring");
  if (value.schemaVersion !== 1 || value.activityId !== ULTIMATE_B2_COMPLETE_SENTENCES_ID) throw new Error("Unexpected Complete the Sentences identity or schema version.");
  const normalizedSurface = surface(value.surface);
  const visualCapabilities = normalizeUltimateB2ExerciseVisualCapabilities(value.visualCapabilities, {
    instructionImages: [ultimateB2ReadingExerciseBindings.completeInstruction],
    showTextImages: [ultimateB2ReadingExerciseBindings.completeShowText],
  });
  exactKeys(value.example, ["id", "number", "before", "answer", "after"], "example");
  if (value.example.id !== "sentence-1" || value.example.number !== 1) throw new Error("The publisher example identity is fixed.");
  const example = {
    id: value.example.id,
    number: 1,
    before: boundedText(value.example.before, "example.before", 500, { allowEmpty: true }),
    answer: boundedText(value.example.answer, "example.answer", 100),
    after: boundedText(value.example.after, "example.after", 500, { allowEmpty: true }),
  };
  if (!Array.isArray(value.sentences) || value.sentences.length !== 8) throw new Error("Complete the Sentences must contain exactly eight interactive sentences.");
  if (!Array.isArray(value.blanks) || value.blanks.length !== 8) throw new Error("Complete the Sentences must contain exactly eight blanks.");
  const blankIds = new Set();
  const blanks = value.blanks.map((blank, index) => {
    exactKeys(blank, ["id", "sentenceId", "label", "revealedWord", "area"], `blanks[${index}]`);
    const expectedNumber = index + 2;
    if (blank.id !== `blank-${expectedNumber}` || blank.sentenceId !== `sentence-${expectedNumber}`) throw new Error(`blanks[${index}] has a fixed publisher identity.`);
    if (blankIds.has(blank.id)) throw new Error(`Duplicate blank id ${blank.id}.`);
    blankIds.add(blank.id);
    return {
      id: blank.id,
      sentenceId: blank.sentenceId,
      label: boundedText(blank.label, `blanks[${index}].label`, 120),
      revealedWord: boundedText(blank.revealedWord, `blanks[${index}].revealedWord`, 100),
      area: area(blank.area, `blanks[${index}].area`, normalizedSurface),
    };
  });
  const sentences = value.sentences.map((sentence, index) => {
    exactKeys(sentence, ["id", "questionId", "number", "before", "blankId", "after"], `sentences[${index}]`);
    const expectedNumber = index + 2;
    const expectedId = `sentence-${expectedNumber}`;
    const expectedQuestionId = `${ULTIMATE_B2_COMPLETE_SENTENCES_ID}-q${index + 1}`;
    if (sentence.id !== expectedId || sentence.questionId !== expectedQuestionId || sentence.number !== expectedNumber || sentence.blankId !== `blank-${expectedNumber}`) throw new Error(`sentences[${index}] has a fixed publisher identity.`);
    if (!blankIds.has(sentence.blankId)) throw new Error(`${expectedId} references an unknown blank.`);
    return {
      id: expectedId,
      questionId: expectedQuestionId,
      number: expectedNumber,
      before: boundedText(sentence.before, `${expectedId}.before`, 700, { allowEmpty: true }),
      blankId: sentence.blankId,
      after: boundedText(sentence.after, `${expectedId}.after`, 700, { allowEmpty: true }),
    };
  });
  return { schemaVersion: 1, activityId: value.activityId, source: sourceEvidence(value.source, 4), surface: normalizedSurface, visualCapabilities, example, sentences, blanks };
}

export function normalizeUltimateB2DebateClubAuthoring(input) {
  assertPayloadSize(input);
  const value = structuredClone(record(input, "Debate Club authoring"));
  exactKeys(value, ["schemaVersion", "activityId", "source", "surface", "visualCapabilities", "badgeImage", "parts"], "Debate Club authoring");
  if (value.schemaVersion !== 1 || value.activityId !== ULTIMATE_B2_DEBATE_CLUB_ID) throw new Error("Unexpected Debate Club identity or schema version.");
  const normalizedSurface = surface(value.surface);
  const visualCapabilities = normalizeUltimateB2ExerciseVisualCapabilities(value.visualCapabilities, {
    instructionImages: [ultimateB2ReadingExerciseBindings.debateInstruction],
    showTextImages: [],
  });
  if (value.badgeImage !== ultimateB2ReadingExerciseBindings.debateBadge) throw new Error("Debate Club uses an unknown badge image binding.");
  if (!Array.isArray(value.parts) || value.parts.length !== 2) throw new Error("Debate Club must contain exactly two internal parts.");
  const partImages = [ultimateB2ReadingExerciseBindings.debatePartOne, ultimateB2ReadingExerciseBindings.debatePartTwo];
  const argumentImages = [ultimateB2ReadingExerciseBindings.debateArgumentOne, ultimateB2ReadingExerciseBindings.debateArgumentTwo];
  const parts = value.parts.map((part, index) => {
    exactKeys(part, ["id", "number", "prompt", "partImage", "partImageAlt", "argumentImage", "responseRegion"], `parts[${index}]`);
    const number = index + 1;
    if (part.id !== `part-${number}` || part.number !== number) throw new Error(`parts[${index}] has a fixed publisher identity.`);
    if (part.partImage !== partImages[index] || part.argumentImage !== argumentImages[index]) throw new Error(`parts[${index}] uses an unknown image binding.`);
    exactKeys(part.responseRegion, ["id", "area", "ariaLabel", "revealText", "presentation"], `parts[${index}].responseRegion`);
    if (part.responseRegion.id !== `debate-reveal-${number}`) throw new Error(`parts[${index}].responseRegion has a fixed publisher identity.`);
    return {
      id: part.id,
      number,
      prompt: boundedText(part.prompt, `parts[${index}].prompt`, 1_000),
      partImage: part.partImage,
      partImageAlt: boundedText(part.partImageAlt, `parts[${index}].partImageAlt`, 500),
      argumentImage: part.argumentImage,
      responseRegion: {
        id: part.responseRegion.id,
        area: area(part.responseRegion.area, `parts[${index}].responseRegion.area`, normalizedSurface),
        ariaLabel: boundedText(part.responseRegion.ariaLabel, `parts[${index}].responseRegion.ariaLabel`, 300),
        revealText: boundedText(part.responseRegion.revealText, `parts[${index}].responseRegion.revealText`, ultimateB2ReadingExerciseLimits.revealedTextLength),
        presentation: responsePresentation(part.responseRegion.presentation, `parts[${index}].responseRegion.presentation`),
      },
    };
  });
  return { schemaVersion: 1, activityId: value.activityId, source: sourceEvidence(value.source, 5), surface: normalizedSurface, visualCapabilities, badgeImage: value.badgeImage, parts };
}

export function normalizeUltimateB2ReadingExerciseAuthoring(input) {
  if (input?.activityId === ULTIMATE_B2_COMPLETE_SENTENCES_ID) return normalizeUltimateB2CompleteSentencesAuthoring(input);
  if (input?.activityId === ULTIMATE_B2_DEBATE_CLUB_ID) return normalizeUltimateB2DebateClubAuthoring(input);
  throw new Error("Unknown Reading exercise activity ID.");
}
