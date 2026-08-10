import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { XMLParser, XMLValidator } from "fast-xml-parser";
import sharp from "sharp";

import {
  normalizeUltimateB2DebateClubAuthoring,
  ultimateB2ReadingExerciseBindings,
  ULTIMATE_B2_DEBATE_CLUB_ID,
} from "../../src/data/ultimate-b2/readingExerciseAuthoringSchema.js";

export const DEBATE_CLUB_SOURCE_FILES = Object.freeze([
  "obj_params.xml", "ebook_obj_params.xml",
  "image_1.png", "image_2.png", "image_3.png", "image_4.png", "image_5.png", "image_6.png",
]);
export const DEBATE_CLUB_SOURCE_KIND = "decoded-publisher-iwb";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", cdataPropName: "cdata", processEntities: false, parseTagValue: false, trimValues: false });
const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const numeric = (value, label) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be numeric.`);
  return parsed;
};
const area = (value, label) => ({ x: numeric(value.x, `${label}.x`), y: numeric(value.y, `${label}.y`), width: numeric(value.width, `${label}.width`), height: numeric(value.height, `${label}.height`) });
const color = (value) => `#${numeric(value, "fontColor").toString(16).padStart(6, "0")}`;
const normalizeComparisonText = (value) => value.replace(/<br\s*\/?>/gi, " ").replace(/<\/?b>/gi, "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

function safeText(value, label, { allowBold = false, lineBreaks = false } = {}) {
  const allowed = lineBreaks ? /<(?!br\s*\/?>)/i : allowBold ? /<(?!\/?b(?:\s|>))/i : /</;
  if (allowed.test(value)) throw new Error(`${label} contains unsupported markup.`);
  const normalized = value
    .replace(/<\/?b>/gi, "")
    .replace(/<br\s*\/?>/gi, lineBreaks ? "\n" : " ")
    .replace(/\u00a0/g, " ");
  const text = lineBreaks
    ? normalized.split("\n").map((line) => line.trim()).join("\n").trim()
    : normalized.replace(/\s+/g, " ").trim();
  if (!text || /[<>]/.test(text)) throw new Error(`${label} could not be normalized safely.`);
  return text;
}

export function normalizeDebateClubPublisherRevealText(value) {
  return safeText(String(value), "Publisher Debate Club reveal", { lineBreaks: true });
}

function parseXml(raw, label) {
  if (/<!DOCTYPE|<!ENTITY/i.test(raw)) throw new Error(`${label} contains a forbidden XML declaration.`);
  const valid = XMLValidator.validate(raw);
  if (valid !== true) throw new Error(`${label} is malformed XML: ${valid.err.msg}`);
  const params = parser.parse(raw)?.params;
  if (!params) throw new Error(`${label} has no params root.`);
  const viewport = String(params.navigator?.viewport || "").split(",").map(Number);
  if (viewport.length !== 4 || viewport.some((value) => !Number.isFinite(value)) || viewport[0] !== 0 || viewport[1] !== 0) throw new Error(`${label} has an invalid publisher viewport.`);
  const canvas = { width: viewport[2], height: viewport[3] };
  const partCount = numeric(params.navigator?.totalPages, `${label}.navigator.totalPages`);
  const images = asArray(params.images?.image).map((image) => ({ name: image.name, page: numeric(image.pagesIndex, `${label}.${image.name}.pagesIndex`), x: numeric(image.x, `${label}.${image.name}.x`), y: numeric(image.y, `${label}.${image.name}.y`) }));
  const texts = asArray(params.texts).flatMap((group) => asArray(group?.text));
  const prompt = texts.find((text) => text.name === "text_1" && numeric(text.pagesIndex, `${label}.prompt.pagesIndex`) === 1 && !/^_+$/.test(String(text.cdata || "").trim()));
  if (!prompt) throw new Error(`${label} is missing the Debate Club prompt.`);
  const exercises = asArray(params.exercises?.exercise).map((exercise, exerciseIndex) => {
    const page = numeric(exercise.pagesIndex, `${label}.exercise.pagesIndex`);
    const sentence = asArray(exercise.sentences?.sentence)[0];
    if (!sentence) throw new Error(`${label} part ${page} has no publisher sentence.`);
    const answerNodes = asArray(sentence.text);
    if (!answerNodes.length) throw new Error(`${label} part ${page} has no reveal text.`);
    const revealText = answerNodes.map((node) => normalizeDebateClubPublisherRevealText(node.cdata || "")).join("\n");
    const answerAreas = answerNodes.map((node) => area(node, `${label}.${node.name}`));
    const first = answerNodes[0];
    const answerBounds = {
      x: Math.min(...answerAreas.map((value) => value.x)), y: Math.min(...answerAreas.map((value) => value.y)),
      width: Math.max(...answerAreas.map((value) => value.x + value.width)) - Math.min(...answerAreas.map((value) => value.x)),
      height: Math.max(...answerAreas.map((value) => value.y + value.height)) - Math.min(...answerAreas.map((value) => value.y)),
    };
    return {
      page, exerciseIndex: exerciseIndex + 1, revealText, comparisonText: normalizeComparisonText(revealText), answerNodes: answerAreas,
      answerBounds, button: { x: numeric(sentence.buttonX, `${label} buttonX`), y: numeric(sentence.buttonY, `${label} buttonY`) },
      style: { fontFamily: first.fontName, fontSize: numeric(first.fontSize, `${label}.fontSize`), color: color(first.fontColor), align: first.align, wordWrap: first.wordWrap === "true", verticalAlign: first.vAlign, maxLines: first.maxLines == null ? null : numeric(first.maxLines, `${label}.maxLines`), multiline: first.multiline == null ? null : first.multiline === "true" },
    };
  }).sort((left, right) => left.page - right.page);
  const linesByPage = Object.fromEntries(Array.from({ length: partCount }, (_, index) => {
    const page = index + 1;
    const lines = texts.filter((text) => numeric(text.pagesIndex, `${label}.line.pagesIndex`) === page && /^_+$/.test(String(text.cdata || "").trim())).map((text) => area(text, `${label}.${text.name}`)).sort((left, right) => left.y - right.y);
    return [page, lines];
  }));
  return {
    canvas, partCount, images, exercises, linesByPage,
    prompt: { text: safeText(String(prompt.cdata || ""), `${label} prompt`, { allowBold: true }), area: area(prompt, `${label}.prompt`), style: { fontFamily: prompt.fontName, fontSize: numeric(prompt.fontSize, `${label}.prompt.fontSize`), color: color(prompt.fontColor), align: prompt.align } },
  };
}

function verifySecondary(primary, secondary) {
  if (JSON.stringify(primary.canvas) !== JSON.stringify(secondary.canvas) || primary.partCount !== secondary.partCount) throw new Error("Publisher XML canvas or part count conflicts.");
  if (JSON.stringify(primary.images) !== JSON.stringify(secondary.images)) throw new Error("Publisher XML image mapping conflicts.");
  if (primary.prompt.text !== secondary.prompt.text) throw new Error("Publisher XML prompt text conflicts.");
  for (let index = 0; index < primary.partCount; index += 1) {
    if (primary.exercises[index]?.comparisonText !== secondary.exercises[index]?.comparisonText) throw new Error(`Publisher XML reveal text for part ${index + 1} conflicts.`);
  }
}

function responseRegion(part, canvas) {
  const lines = part.lines;
  if (!lines.length) throw new Error(`Publisher part ${part.page} has no underline geometry.`);
  const x = Math.min(...lines.map((line) => line.x));
  const y = Math.min(...lines.map((line) => line.y));
  const width = Math.min(canvas.width, Math.max(...lines.map((line) => line.x + line.width))) - x;
  const height = Math.max(...lines.map((line) => line.y + line.height)) - y;
  const linePositions = lines.map((line) => line.y - y + part.answer.style.fontSize);
  const lineWidths = lines.map((line) => Math.min(line.width, canvas.width - line.x));
  const spacing = linePositions.length > 1 ? (linePositions.at(-1) - linePositions[0]) / (linePositions.length - 1) : part.answer.style.fontSize;
  return {
    id: `debate-reveal-${part.page}`,
    area: { x, y, width, height },
    ariaLabel: part.page === 1 ? "Reveal the argument for watching a film at home" : "Reveal the argument for going to the cinema",
    revealText: part.answer.revealText,
    presentation: {
      paddingX: part.answer.answerBounds.x - x, paddingY: part.answer.answerBounds.y - y,
      lineSpacing: Math.round(spacing * 10_000) / 10_000, fontScale: 1,
      lineCount: lines.length, linePositions, lineWidths, textWidth: part.answer.answerBounds.width,
      fontFamily: part.answer.style.fontFamily, fontSize: part.answer.style.fontSize, color: part.answer.style.color,
      align: part.answer.style.align, wordWrap: part.answer.style.wordWrap, verticalAlign: part.answer.style.verticalAlign,
    },
  };
}

export async function importUltimateB2DebateClubPublisherSource(sourceDirectory) {
  const bytesByName = Object.fromEntries(await Promise.all(DEBATE_CLUB_SOURCE_FILES.map(async (name) => [name, await readFile(path.join(sourceDirectory, name))])));
  const primary = parseXml(bytesByName["obj_params.xml"].toString("utf8"), "obj_params.xml");
  const secondary = parseXml(bytesByName["ebook_obj_params.xml"].toString("utf8"), "ebook_obj_params.xml");
  verifySecondary(primary, secondary);
  if (primary.canvas.width !== 1024 || primary.canvas.height !== 582 || primary.partCount !== 2 || primary.exercises.length !== 2) throw new Error("Debate Club publisher source must declare a 1024×582 two-part write activity.");
  const imageMetadata = await Promise.all(DEBATE_CLUB_SOURCE_FILES.filter((name) => name.endsWith(".png")).map(async (name) => {
    const metadata = await sharp(bytesByName[name], { failOn: "warning" }).metadata();
    if (metadata.format !== "png" || !metadata.width || !metadata.height) throw new Error(`${name} must be a valid PNG.`);
    return { name, sha256: sha256(bytesByName[name]), width: metadata.width, height: metadata.height };
  }));
  const metadataByStem = Object.fromEntries(imageMetadata.map((image) => [image.name.replace(".png", ""), image]));
  const placementByStem = Object.fromEntries(primary.images.map((image) => [image.name, image]));
  const expectedDimensions = [[250, 105], [646, 60], [336, 123], [268, 99], [250, 166], [259, 172]];
  imageMetadata.forEach((image, index) => {
    if (image.width !== expectedDimensions[index][0] || image.height !== expectedDimensions[index][1]) throw new Error(`${image.name} dimensions conflict with the publisher source.`);
  });
  const sourceFiles = DEBATE_CLUB_SOURCE_FILES.map((name) => ({ name, sha256: sha256(bytesByName[name]) }));
  const artwork = (stem, binding) => {
    const image = metadataByStem[stem]; const placement = placementByStem[stem];
    return { binding, sourceFile: image.name, naturalSize: { width: image.width, height: image.height }, area: { x: placement.x, y: placement.y, width: image.width, height: image.height }, parts: [placement.page] };
  };
  const partDefinitions = [
    { photo: ["image_5", ultimateB2ReadingExerciseBindings.debatePartOne], argument: ["image_3", ultimateB2ReadingExerciseBindings.debateArgumentOne], alt: "Watching a film at home" },
    { photo: ["image_6", ultimateB2ReadingExerciseBindings.debatePartTwo], argument: ["image_4", ultimateB2ReadingExerciseBindings.debateArgumentTwo], alt: "Watching a film at the cinema" },
  ];
  const parts = primary.exercises.map((answer, index) => {
    const definition = partDefinitions[index];
    const part = { page: answer.page, answer, lines: primary.linesByPage[answer.page] };
    return {
      id: `part-${answer.page}`, number: answer.page,
      prompt: index === 0 ? primary.prompt.text : "",
      promptArea: index === 0 ? primary.prompt.area : null,
      promptStyle: index === 0 ? primary.prompt.style : null,
      partImageAlt: definition.alt,
      visualObjects: { photo: artwork(...definition.photo), argument: artwork(...definition.argument) },
      responseRegion: responseRegion(part, primary.canvas),
    };
  });
  const authoring = normalizeUltimateB2DebateClubAuthoring({
    schemaVersion: 2, activityId: ULTIMATE_B2_DEBATE_CLUB_ID,
    source: { kind: DEBATE_CLUB_SOURCE_KIND, objectNumber: 5, canvas: primary.canvas, files: sourceFiles, partMapping: primary.exercises.map(({ page, exerciseIndex }) => ({ partId: `part-${page}`, pagesIndex: page, exerciseIndex })) },
    surface: primary.canvas,
    visualCapabilities: { instructionImage: ultimateB2ReadingExerciseBindings.debateInstruction, showText: { enabled: false, showTextImage: null } },
    instructionImageAlt: "With your partner, discuss the question below. Use the ideas given and add your own. Then take turns to present your arguments.",
    artwork: {
      badge: artwork("image_1", ultimateB2ReadingExerciseBindings.debateBadge),
      instruction: artwork("image_2", ultimateB2ReadingExerciseBindings.debateInstruction),
    },
    parts,
  });
  return {
    activityId: ULTIMATE_B2_DEBATE_CLUB_ID,
    authoring,
    report: {
      sourceFilesFound: DEBATE_CLUB_SOURCE_FILES, sourceHashes: Object.fromEntries(sourceFiles.map(({ name, sha256: digest }) => [name, digest])),
      canvas: primary.canvas, partCount: primary.partCount, imageCount: imageMetadata.length, promptCount: 1, responseRegionCount: parts.length,
      lineCounts: parts.map((part) => part.responseRegion.presentation.lineCount),
      revealStyle: { fontFamily: parts[0].responseRegion.presentation.fontFamily, fontSize: parts[0].responseRegion.presentation.fontSize, color: parts[0].responseRegion.presentation.color },
      secondaryProfile: { lineCounts: secondary.exercises.map((exercise, index) => secondary.linesByPage[index + 1].length), maxLines: secondary.exercises.map((exercise) => exercise.style.maxLines) },
      validation: "valid",
    },
  };
}
