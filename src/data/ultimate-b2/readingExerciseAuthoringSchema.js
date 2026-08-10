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

function finite(value, label, minimum, maximum) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${label} must be a number from ${minimum} to ${maximum}.`);
  return Math.round(value * 10_000) / 10_000;
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
  exactKeys(value, ["paddingX", "paddingY", "lineSpacing", "fontScale", "lineCount", "linePositions", "lineWidths", "textWidth", "fontFamily", "fontSize", "color", "align", "wordWrap", "verticalAlign"], label);
  const normalized = {
    paddingX: integer(value.paddingX, `${label}.paddingX`, 0, 40),
    paddingY: integer(value.paddingY, `${label}.paddingY`, 0, 40),
    lineSpacing: finite(value.lineSpacing, `${label}.lineSpacing`, 16, 60),
    fontScale: finite(value.fontScale, `${label}.fontScale`, 0.6, 1.6),
    lineCount: integer(value.lineCount, `${label}.lineCount`, 1, 20),
    linePositions: value.linePositions,
    lineWidths: value.lineWidths,
    textWidth: finite(value.textWidth, `${label}.textWidth`, 1, 1024),
    fontFamily: boundedText(value.fontFamily, `${label}.fontFamily`, 100),
    fontSize: finite(value.fontSize, `${label}.fontSize`, 8, 72),
    color: String(value.color || "").toLowerCase(),
    align: value.align,
    wordWrap: value.wordWrap,
    verticalAlign: value.verticalAlign,
  };
  if (!Array.isArray(normalized.linePositions) || normalized.linePositions.length !== normalized.lineCount || !Array.isArray(normalized.lineWidths) || normalized.lineWidths.length !== normalized.lineCount) throw new Error(`${label} line geometry must match lineCount.`);
  normalized.linePositions = normalized.linePositions.map((position, index) => finite(position, `${label}.linePositions[${index}]`, 0, 582));
  normalized.lineWidths = normalized.lineWidths.map((width, index) => finite(width, `${label}.lineWidths[${index}]`, 1, 1024));
  if (!/^#[0-9a-f]{6}$/.test(normalized.color) || normalized.align !== "left" || typeof normalized.wordWrap !== "boolean" || !["top", "middle", "bottom"].includes(normalized.verticalAlign)) throw new Error(`${label} has invalid publisher text style.`);
  return normalized;
}

function optionalTextArea(value, label, bounds) {
  if (value == null) return null;
  return area(value, label, bounds);
}

function optionalTextStyle(value, label) {
  if (value == null) return null;
  exactKeys(value, ["fontFamily", "fontSize", "color", "align"], label);
  const normalized = { fontFamily: boundedText(value.fontFamily, `${label}.fontFamily`, 100), fontSize: finite(value.fontSize, `${label}.fontSize`, 8, 72), color: String(value.color || "").toLowerCase(), align: value.align };
  if (!/^#[0-9a-f]{6}$/.test(normalized.color) || normalized.align !== "left") throw new Error(`${label} has invalid publisher text style.`);
  return normalized;
}

function publisherArtwork(value, label, expectedBinding, expectedFile, bounds, expectedPart) {
  exactKeys(value, ["binding", "sourceFile", "naturalSize", "area", "parts"], label);
  if (value.binding !== expectedBinding || value.sourceFile !== expectedFile) throw new Error(`${label} has an unknown publisher asset binding.`);
  exactKeys(value.naturalSize, ["width", "height"], `${label}.naturalSize`);
  const naturalSize = { width: integer(value.naturalSize.width, `${label}.naturalSize.width`, 1, 4096), height: integer(value.naturalSize.height, `${label}.naturalSize.height`, 1, 4096) };
  const normalizedArea = area(value.area, `${label}.area`, bounds);
  if (normalizedArea.width !== naturalSize.width || normalizedArea.height !== naturalSize.height) throw new Error(`${label} must preserve its natural publisher size.`);
  if (!Array.isArray(value.parts) || value.parts.length !== 1 || value.parts[0] !== expectedPart) throw new Error(`${label} has an invalid publisher part mapping.`);
  return { binding: expectedBinding, sourceFile: expectedFile, naturalSize, area: normalizedArea, parts: [expectedPart] };
}

function debateSourceEvidence(value, bounds) {
  exactKeys(value, ["kind", "objectNumber", "canvas", "files", "partMapping"], "source");
  if (value.kind !== "decoded-publisher-iwb" || value.objectNumber !== 5 || JSON.stringify(value.canvas) !== JSON.stringify(bounds)) throw new Error("Debate Club source identity or canvas is invalid.");
  const expectedFiles = ["obj_params.xml", "ebook_obj_params.xml", "image_1.png", "image_2.png", "image_3.png", "image_4.png", "image_5.png", "image_6.png"];
  if (!Array.isArray(value.files) || value.files.length !== expectedFiles.length) throw new Error("Debate Club source provenance must contain exactly eight files.");
  const files = value.files.map((file, index) => {
    exactKeys(file, ["name", "sha256"], `source.files[${index}]`);
    if (file.name !== expectedFiles[index] || !/^[a-f0-9]{64}$/i.test(file.sha256)) throw new Error(`source.files[${index}] is invalid.`);
    return { name: file.name, sha256: file.sha256.toLowerCase() };
  });
  if (!Array.isArray(value.partMapping) || value.partMapping.length !== 2) throw new Error("Debate Club publisher source must map exactly two parts.");
  const partMapping = value.partMapping.map((mapping, index) => {
    exactKeys(mapping, ["partId", "pagesIndex", "exerciseIndex"], `source.partMapping[${index}]`);
    const number = index + 1;
    if (mapping.partId !== `part-${number}` || mapping.pagesIndex !== number || mapping.exerciseIndex !== number) throw new Error(`source.partMapping[${index}] is invalid.`);
    return { partId: mapping.partId, pagesIndex: number, exerciseIndex: number };
  });
  return { kind: value.kind, objectNumber: 5, canvas: bounds, files, partMapping };
}

function sourceEvidence(value, expectedObjectNumber) {
  exactKeys(value, ["objectNumber", "iwbSha256", "decodedSha256", "assetSha256"], "source");
  if (value.objectNumber !== expectedObjectNumber) throw new Error(`source.objectNumber must remain ${expectedObjectNumber}.`);
  for (const [label, hash] of [["iwbSha256", value.iwbSha256], ["decodedSha256", value.decodedSha256]]) if (!/^[a-f0-9]{64}$/.test(hash || "")) throw new Error(`source.${label} must be a SHA-256 digest.`);
  const assetSha256 = record(value.assetSha256, "source.assetSha256");
  if (!Object.keys(assetSha256).length || Object.keys(assetSha256).some((name) => !/^[a-zA-Z0-9_.-]+$/.test(name)) || Object.values(assetSha256).some((hash) => !/^[a-f0-9]{64}$/.test(hash))) throw new Error("source.assetSha256 contains an invalid asset record.");
  return { objectNumber: expectedObjectNumber, iwbSha256: value.iwbSha256, decodedSha256: value.decodedSha256, assetSha256 };
}

function completeTextStyle(value, label, { answer = false } = {}) {
  const keys = answer ? ["fontFamily", "fontSize", "color", "align", "wordWrap", "verticalAlign", "maxChars"] : ["fontFamily", "fontSize", "color", "align"];
  exactKeys(value, keys, label);
  const normalized = {
    fontFamily: boundedText(value.fontFamily, `${label}.fontFamily`, 100),
    fontSize: finite(value.fontSize, `${label}.fontSize`, 8, 72),
    color: String(value.color || "").toLowerCase(),
    align: value.align,
  };
  if (!/^#[0-9a-f]{6}$/.test(normalized.color) || !["left", "center", "right"].includes(normalized.align)) throw new Error(`${label} has invalid publisher typography.`);
  if (!answer) return normalized;
  if (typeof value.wordWrap !== "boolean" || !["top", "middle", "bottom"].includes(value.verticalAlign)) throw new Error(`${label} has invalid publisher answer layout.`);
  return { ...normalized, wordWrap: value.wordWrap, verticalAlign: value.verticalAlign, maxChars: integer(value.maxChars, `${label}.maxChars`, 1, 100) };
}

function completeSourceEvidence(value, bounds) {
  exactKeys(value, ["kind", "objectNumber", "canvas", "files", "iwbSha256", "assets"], "source");
  if (value.kind !== "decoded-publisher-iwb" || value.objectNumber !== 4 || JSON.stringify(value.canvas) !== JSON.stringify(bounds)) throw new Error("Complete the Sentences source identity or canvas is invalid.");
  if (!Array.isArray(value.files) || value.files.length !== 1) throw new Error("Complete the Sentences source must contain exactly one decoded XML record.");
  exactKeys(value.files[0], ["name", "sha256"], "source.files[0]");
  if (value.files[0].name !== "obj_params.xml" || !/^[a-f0-9]{64}$/.test(value.files[0].sha256)) throw new Error("Complete the Sentences decoded XML provenance is invalid.");
  if (!/^[a-f0-9]{64}$/.test(value.iwbSha256 || "")) throw new Error("Complete the Sentences IWB provenance is invalid.");
  const expectedAssets = [
    [ultimateB2ReadingExerciseBindings.completeInstruction, "image_2.png", "instruction", 873, 34],
    [ultimateB2ReadingExerciseBindings.completeShowText, "showText.png", "show-text-auxiliary", 1000, 1219],
  ];
  if (!Array.isArray(value.assets) || value.assets.length !== expectedAssets.length) throw new Error("Complete the Sentences source must reference exactly two canonical auxiliary assets.");
  const assets = value.assets.map((asset, index) => {
    exactKeys(asset, ["binding", "sourceFile", "sha256", "naturalSize", "role"], `source.assets[${index}]`);
    exactKeys(asset.naturalSize, ["width", "height"], `source.assets[${index}].naturalSize`);
    const [binding, sourceFile, role, width, height] = expectedAssets[index];
    if (asset.binding !== binding || asset.sourceFile !== sourceFile || asset.role !== role || asset.naturalSize.width !== width || asset.naturalSize.height !== height || !/^[a-f0-9]{64}$/.test(asset.sha256 || "")) throw new Error(`source.assets[${index}] does not match the canonical auxiliary asset.`);
    return { binding, sourceFile, sha256: asset.sha256, naturalSize: { width, height }, role };
  });
  return { kind: value.kind, objectNumber: 4, canvas: bounds, files: [{ name: "obj_params.xml", sha256: value.files[0].sha256 }], iwbSha256: value.iwbSha256, assets };
}

export function normalizeUltimateB2CompleteSentencesAuthoring(input) {
  assertPayloadSize(input);
  const value = structuredClone(record(input, "Complete the Sentences authoring"));
  exactKeys(value, ["schemaVersion", "activityId", "source", "surface", "visualCapabilities", "instruction", "example", "sentences", "blanks"], "Complete the Sentences authoring");
  if (value.schemaVersion !== 2 || value.activityId !== ULTIMATE_B2_COMPLETE_SENTENCES_ID) throw new Error("Unexpected Complete the Sentences identity or schema version.");
  const normalizedSurface = surface(value.surface);
  if (normalizedSurface.width !== 1024 || normalizedSurface.height !== 582) throw new Error("Complete the Sentences publisher canvas must be 1024x582.");
  const source = completeSourceEvidence(value.source, normalizedSurface);
  const visualCapabilities = normalizeUltimateB2ExerciseVisualCapabilities(value.visualCapabilities, {
    instructionImages: [ultimateB2ReadingExerciseBindings.completeInstruction],
    showTextImages: [ultimateB2ReadingExerciseBindings.completeShowText],
  });
  exactKeys(value.instruction, ["binding", "sourceFile", "naturalSize", "area"], "instruction");
  exactKeys(value.instruction.naturalSize, ["width", "height"], "instruction.naturalSize");
  if (value.instruction.binding !== ultimateB2ReadingExerciseBindings.completeInstruction || value.instruction.sourceFile !== "image_2.png" || value.instruction.naturalSize.width !== 873 || value.instruction.naturalSize.height !== 34) throw new Error("Complete the Sentences instruction artwork identity is invalid.");
  const instruction = { binding: value.instruction.binding, sourceFile: value.instruction.sourceFile, naturalSize: { width: 873, height: 34 }, area: area(value.instruction.area, "instruction.area", normalizedSurface) };
  if (instruction.area.width !== 873 || instruction.area.height !== 34) throw new Error("Complete the Sentences instruction must preserve its publisher dimensions.");
  exactKeys(value.example, ["id", "number", "before", "answer", "after", "textArea", "answerArea", "textStyle", "answerStyle"], "example");
  if (value.example.id !== "sentence-1" || value.example.number !== 1) throw new Error("The publisher example identity is fixed.");
  const example = {
    id: value.example.id,
    number: 1,
    before: boundedText(value.example.before, "example.before", 500, { allowEmpty: true }),
    answer: boundedText(value.example.answer, "example.answer", 100),
    after: boundedText(value.example.after, "example.after", 500, { allowEmpty: true }),
    textArea: area(value.example.textArea, "example.textArea", normalizedSurface),
    answerArea: area(value.example.answerArea, "example.answerArea", normalizedSurface),
    textStyle: completeTextStyle(value.example.textStyle, "example.textStyle"),
    answerStyle: completeTextStyle(value.example.answerStyle, "example.answerStyle"),
  };
  if (!Array.isArray(value.sentences) || value.sentences.length !== 8) throw new Error("Complete the Sentences must contain exactly eight interactive sentences.");
  if (!Array.isArray(value.blanks) || value.blanks.length !== 8) throw new Error("Complete the Sentences must contain exactly eight blanks.");
  const blankIds = new Set();
  const blanks = value.blanks.map((blank, index) => {
    exactKeys(blank, ["id", "sentenceId", "label", "revealedWord", "area", "style", "button"], `blanks[${index}]`);
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
      style: completeTextStyle(blank.style, `blanks[${index}].style`, { answer: true }),
      button: (() => {
        exactKeys(blank.button, ["x", "y"], `blanks[${index}].button`);
        return { x: integer(blank.button.x, `blanks[${index}].button.x`, 0, normalizedSurface.width), y: integer(blank.button.y, `blanks[${index}].button.y`, 0, normalizedSurface.height) };
      })(),
    };
  });
  const sentences = value.sentences.map((sentence, index) => {
    exactKeys(sentence, ["id", "questionId", "number", "before", "blankId", "after", "textArea", "continuationArea", "textStyle"], `sentences[${index}]`);
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
      textArea: area(sentence.textArea, `${expectedId}.textArea`, normalizedSurface),
      continuationArea: optionalTextArea(sentence.continuationArea, `${expectedId}.continuationArea`, normalizedSurface),
      textStyle: completeTextStyle(sentence.textStyle, `${expectedId}.textStyle`),
    };
  });
  if (sentences.some((sentence, index) => Boolean(sentence.continuationArea) !== (index === 5))) throw new Error("Only publisher Sentence 7 may contain continuation geometry.");
  return { schemaVersion: 2, activityId: value.activityId, source, surface: normalizedSurface, visualCapabilities, instruction, example, sentences, blanks };
}

export function normalizeUltimateB2DebateClubAuthoring(input) {
  assertPayloadSize(input);
  const value = structuredClone(record(input, "Debate Club authoring"));
  exactKeys(value, ["schemaVersion", "activityId", "source", "surface", "visualCapabilities", "instructionImageAlt", "artwork", "parts"], "Debate Club authoring");
  if (value.schemaVersion !== 2 || value.activityId !== ULTIMATE_B2_DEBATE_CLUB_ID) throw new Error("Unexpected Debate Club identity or schema version.");
  const normalizedSurface = surface(value.surface);
  if (normalizedSurface.width !== 1024 || normalizedSurface.height !== 582) throw new Error("Debate Club publisher canvas must be 1024×582.");
  const source = debateSourceEvidence(value.source, normalizedSurface);
  const visualCapabilities = normalizeUltimateB2ExerciseVisualCapabilities(value.visualCapabilities, {
    instructionImages: [ultimateB2ReadingExerciseBindings.debateInstruction],
    showTextImages: [],
  });
  exactKeys(value.artwork, ["badge", "instruction"], "artwork");
  const artwork = {
    badge: publisherArtwork(value.artwork.badge, "artwork.badge", ultimateB2ReadingExerciseBindings.debateBadge, "image_1.png", normalizedSurface, 1),
    instruction: publisherArtwork(value.artwork.instruction, "artwork.instruction", ultimateB2ReadingExerciseBindings.debateInstruction, "image_2.png", normalizedSurface, 1),
  };
  if (!Array.isArray(value.parts) || value.parts.length !== 2) throw new Error("Debate Club must contain exactly two internal parts.");
  const partImages = [ultimateB2ReadingExerciseBindings.debatePartOne, ultimateB2ReadingExerciseBindings.debatePartTwo];
  const argumentImages = [ultimateB2ReadingExerciseBindings.debateArgumentOne, ultimateB2ReadingExerciseBindings.debateArgumentTwo];
  const parts = value.parts.map((part, index) => {
    exactKeys(part, ["id", "number", "prompt", "promptArea", "promptStyle", "partImageAlt", "visualObjects", "responseRegion"], `parts[${index}]`);
    const number = index + 1;
    if (part.id !== `part-${number}` || part.number !== number) throw new Error(`parts[${index}] has a fixed publisher identity.`);
    exactKeys(part.visualObjects, ["photo", "argument"], `parts[${index}].visualObjects`);
    const visualObjects = {
      photo: publisherArtwork(part.visualObjects.photo, `parts[${index}].visualObjects.photo`, partImages[index], `image_${index === 0 ? 5 : 6}.png`, normalizedSurface, number),
      argument: publisherArtwork(part.visualObjects.argument, `parts[${index}].visualObjects.argument`, argumentImages[index], `image_${index === 0 ? 3 : 4}.png`, normalizedSurface, number),
    };
    exactKeys(part.responseRegion, ["id", "area", "ariaLabel", "revealText", "presentation"], `parts[${index}].responseRegion`);
    if (part.responseRegion.id !== `debate-reveal-${number}`) throw new Error(`parts[${index}].responseRegion has a fixed publisher identity.`);
    return {
      id: part.id,
      number,
      prompt: boundedText(part.prompt, `parts[${index}].prompt`, 1_000, { allowEmpty: index === 1 }),
      promptArea: optionalTextArea(part.promptArea, `parts[${index}].promptArea`, normalizedSurface),
      promptStyle: optionalTextStyle(part.promptStyle, `parts[${index}].promptStyle`),
      partImageAlt: boundedText(part.partImageAlt, `parts[${index}].partImageAlt`, 500),
      visualObjects,
      responseRegion: {
        id: part.responseRegion.id,
        area: area(part.responseRegion.area, `parts[${index}].responseRegion.area`, normalizedSurface),
        ariaLabel: boundedText(part.responseRegion.ariaLabel, `parts[${index}].responseRegion.ariaLabel`, 300),
        revealText: boundedText(part.responseRegion.revealText, `parts[${index}].responseRegion.revealText`, ultimateB2ReadingExerciseLimits.revealedTextLength),
        presentation: responsePresentation(part.responseRegion.presentation, `parts[${index}].responseRegion.presentation`),
      },
    };
  });
  if (!parts[0].promptArea || !parts[0].promptStyle || parts[1].promptArea || parts[1].promptStyle) throw new Error("Debate Club prompt geometry must follow the publisher page mapping.");
  return { schemaVersion: 2, activityId: value.activityId, source, surface: normalizedSurface, visualCapabilities, instructionImageAlt: boundedText(value.instructionImageAlt, "instructionImageAlt", 500), artwork, parts };
}

export function normalizeUltimateB2ReadingExerciseAuthoring(input) {
  if (input?.activityId === ULTIMATE_B2_COMPLETE_SENTENCES_ID) return normalizeUltimateB2CompleteSentencesAuthoring(input);
  if (input?.activityId === ULTIMATE_B2_DEBATE_CLUB_ID) return normalizeUltimateB2DebateClubAuthoring(input);
  throw new Error("Unknown Reading exercise activity ID.");
}
