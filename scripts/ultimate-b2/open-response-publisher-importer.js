import { createHash } from "node:crypto";
import path from "node:path";

import { XMLParser, XMLValidator } from "fast-xml-parser";

import { inspectRasterBytes } from "../../lib/book-assets/raster-inspection.js";
import { OPEN_RESPONSE_IMPORT_LIMITS } from "./open-response-import-limits.js";

import {
  normalizeUltimateB2OpenResponseAuthoring,
  normalizeUltimateB2OpenResponseTeacherAnswers,
} from "../../src/data/ultimate-b2/openResponseAuthoringSchema.js";

export const OPEN_RESPONSE_PARAMETER_BASENAMES = Object.freeze(["obj_params", "ebook_obj_params"]);
export { OPEN_RESPONSE_IMPORT_LIMITS } from "./open-response-import-limits.js";

const rasterExtensions = new Set([".png", ".jpg", ".jpeg"]);
const parser = new XMLParser({
  allowBooleanAttributes: false,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  cdataPropName: "cdata",
  processEntities: false,
  parseTagValue: false,
  trimValues: false,
});

const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const numeric = (value, label) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be numeric.`);
  return parsed;
};
const geometry = (value, label) => ({
  x: numeric(value.x, `${label}.x`),
  y: numeric(value.y, `${label}.y`),
  width: numeric(value.width, `${label}.width`),
  height: numeric(value.height, `${label}.height`),
});
const color = (decimal) => `#${numeric(decimal, "fontColor").toString(16).padStart(6, "0")}`;
const cdata = (value) => typeof value?.cdata === "string" ? value.cdata : typeof value === "string" ? value : "";
const comparisonText = (value) => value.replace(/<br\s*\/?>/gi, " ").replace(/<\/?b>/gi, "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

function safeBasename(value, label) {
  if (typeof value !== "string" || !value || value !== path.basename(value) || /^(?:[a-z]:|\\\\|\/)/i.test(value) || /%2f|%5c/i.test(value) || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) throw new Error(`${label} must be a safe basename.`);
  return value;
}

function safePromptText(value) {
  if (/<(?!\/?b(?:\s|>))/i.test(value)) throw new Error("Publisher prompt contains unsupported markup.");
  const normalized = value.replace(/<\/?b>/gi, "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const match = normalized.match(/^(\d+)\s+(.+)$/);
  if (!match) throw new Error("Publisher prompt lacks a deterministic question number.");
  return { number: Number(match[1]), text: match[2].trim() };
}

function safeAnswerText(value) {
  if (/<(?!br\s*\/?>)/i.test(value)) throw new Error("Publisher model answer contains unsupported markup.");
  const text = value.replace(/<br\s*\/?>/gi, "\n").replace(/\u00a0/g, " ").split("\n").map((line) => line.trim()).join("\n").trim();
  if (!text || /[<>]/.test(text)) throw new Error("Publisher model answer could not be normalized safely.");
  return text;
}

function parseCanvas(raw, label) {
  const match = raw.match(/<navigator\b[^>]*\bviewport="0,0,(\d+),(\d+)"/i);
  if (!match) throw new Error(`${label} does not declare the publisher viewport.`);
  const canvas = { width: Number(match[1]), height: Number(match[2]) };
  if (!canvas.width || !canvas.height || canvas.width > 8192 || canvas.height > 8192) throw new Error(`${label} declares an unsupported viewport.`);
  return canvas;
}

export function parseUltimateB2OpenResponsePublisherXml(raw, label) {
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(raw)) throw new Error(`${label} contains a forbidden XML declaration.`);
  const valid = XMLValidator.validate(raw, { allowBooleanAttributes: false });
  if (valid !== true) throw new Error(`${label} is malformed XML: ${valid.err.msg}`);
  const params = parser.parse(raw)?.params;
  if (!params) throw new Error(`${label} has no params root.`);
  const exercises = asArray(params.exercises?.exercise);
  const writeExercises = exercises.filter((exercise) => exercise?.type === "write");
  if (writeExercises.length !== 1) throw new Error(`${label} must contain exactly one write exercise.`);
  const texts = asArray(params.texts?.text);
  const prompts = texts.flatMap((text) => {
    const rawText = cdata(text);
    if (!/^\s*<b>\s*\d+\s*<\/b>/i.test(rawText)) return [];
    const prompt = safePromptText(rawText);
    return [{
      number: prompt.number,
      name: String(text.name || ""),
      text: prompt.text,
      area: geometry(text, `${label}.${text.name || "prompt"}`),
      style: { fontFamily: String(text.fontName || ""), fontSize: numeric(text.fontSize, `${label}.prompt.fontSize`), color: color(text.fontColor), align: String(text.align || "left") },
    }];
  }).sort((left, right) => left.number - right.number);
  const lines = texts.filter((text) => /^_+$/.test(cdata(text).trim())).map((text) => ({
    ...geometry(text, `${label}.${text.name || "line"}`),
    fontSize: numeric(text.fontSize, `${label}.${text.name || "line"}.fontSize`),
    color: color(text.fontColor),
  })).sort((left, right) => left.y - right.y || left.x - right.x);
  const images = asArray(params.images?.image).map((image, index) => {
    const name = safeBasename(String(image.name || ""), `${label} image ${index + 1}`);
    return { name, x: numeric(image.x, `${label}.${name}.x`), y: numeric(image.y, `${label}.${name}.y`), scale: image.scale == null ? 1 : numeric(image.scale, `${label}.${name}.scale`) };
  });
  if (new Set(images.map((image) => image.name.toLowerCase())).size !== images.length) throw new Error(`${label} contains duplicate logical image references.`);
  const answers = asArray(writeExercises[0]?.sentences?.sentence).map((sentence) => {
    const text = sentence?.text;
    if (!text) throw new Error(`${label} contains a sentence without answer text.`);
    const rawText = cdata(text);
    return {
      id: numeric(sentence.id, `${label} sentence id`),
      text: safeAnswerText(rawText),
      comparisonText: comparisonText(rawText),
      area: geometry(text, `${label}.${text.name || "answer"}`),
      style: {
        fontFamily: String(text.fontName || ""),
        fontSize: numeric(text.fontSize, `${label}.${text.name || "answer"}.fontSize`),
        color: color(text.fontColor),
        align: String(text.align || "left"),
        wordWrap: text.wordWrap === "true",
        verticalAlign: String(text.vAlign || ""),
        maxLines: text.maxLines == null ? null : numeric(text.maxLines, `${label}.${text.name || "answer"}.maxLines`),
        multiline: text.multiline == null ? null : text.multiline === "true",
      },
    };
  }).sort((left, right) => left.id - right.id);
  if (!prompts.length || prompts.length !== answers.length) throw new Error(`${label} prompt and response counts conflict.`);
  prompts.forEach((prompt, index) => {
    if (prompt.number !== index + 1 || answers[index].id !== index + 1) throw new Error(`${label} question order is not contiguous.`);
  });
  return { canvas: parseCanvas(raw, label), images, prompts, lines, answers };
}

function equivalent(left, right, label) {
  if (JSON.stringify(left) !== JSON.stringify(right)) throw new Error(`Publisher parameter documents conflict on ${label}.`);
}

function assertEquivalent(primary, ebook) {
  equivalent(primary.canvas, ebook.canvas, "viewport");
  equivalent(primary.images, ebook.images, "image placement");
  equivalent(primary.prompts.map(({ number, text, area, style }) => ({ number, text, area, style })), ebook.prompts.map(({ number, text, area, style }) => ({ number, text, area, style })), "prompt identity/order/text/geometry");
  equivalent(primary.answers.map(({ id, comparisonText, area }) => ({ id, comparisonText, area })), ebook.answers.map(({ id, comparisonText, area }) => ({ id, comparisonText, area })), "model responses or response geometry");
  for (let index = 0; index < primary.answers.length; index += 1) {
    const source = primary.answers[index];
    const secondary = ebook.answers[index];
    equivalent({ fontFamily: source.style.fontFamily, fontSize: source.style.fontSize, color: source.style.color, align: source.style.align, wordWrap: source.style.wordWrap }, { fontFamily: secondary.style.fontFamily, fontSize: secondary.style.fontSize, color: secondary.style.color, align: secondary.style.align, wordWrap: secondary.style.wordWrap }, `response ${index + 1} presentation`);
    if (!secondary.style.multiline || !Number.isInteger(secondary.style.maxLines) || secondary.style.maxLines < 1) throw new Error(`ebook response ${index + 1} lacks multiline metadata.`);
  }
}

function linesForArea(lines, responseArea) {
  return lines.filter((line) => line.y >= responseArea.y && line.y < responseArea.y + responseArea.height && line.x < responseArea.x + responseArea.width && line.x + line.width > responseArea.x);
}

export async function inspectOpenResponseRaster(file) {
  if (file.bytes.length > OPEN_RESPONSE_IMPORT_LIMITS.rasterBytes) throw new Error(`${file.name} exceeds the raster size limit.`);
  let inspected;
  try {
    inspected = await inspectRasterBytes(file.bytes, {
      allowedFormats: ["png", "jpeg"],
      maximumBytes: OPEN_RESPONSE_IMPORT_LIMITS.rasterBytes,
      maximumDimension: Math.max(OPEN_RESPONSE_IMPORT_LIMITS.width, OPEN_RESPONSE_IMPORT_LIMITS.height),
      maximumPixels: OPEN_RESPONSE_IMPORT_LIMITS.pixels,
    });
  } catch (error) {
    if (error?.code === "raster_dimension_limit") throw new Error(`${file.name} exceeds the raster dimension limit.`);
    if (error?.code === "raster_pixel_limit") throw new Error(`${file.name} exceeds the raster pixel limit.`);
    throw new Error(`${file.name} bytes do not match its supported raster extension.`);
  }
  const expectedFormat = { ".png": "png", ".jpg": "jpeg", ".jpeg": "jpeg" }[path.extname(file.name).toLowerCase()];
  if (inspected.format !== expectedFormat) throw new Error(`${file.name} bytes do not match its supported raster extension.`);
  return { ...file, sha256: inspected.checksumSha256, width: inspected.width, height: inspected.height };
}

function normalizeFiles(files) {
  if (!Array.isArray(files) || files.length < 2 || files.length > OPEN_RESPONSE_IMPORT_LIMITS.files) throw new Error("Open Response source bundle file count is invalid.");
  const normalized = files.map((file, index) => ({ name: safeBasename(file?.name, `files[${index}].name`), bytes: Buffer.from(file?.bytes || []) }));
  if (normalized.reduce((sum, file) => sum + file.bytes.length, 0) > OPEN_RESPONSE_IMPORT_LIMITS.totalBytes) throw new Error("Open Response source bundle exceeds the total size limit.");
  const names = normalized.map((file) => file.name.toLowerCase());
  if (new Set(names).size !== names.length) throw new Error("Open Response source bundle contains duplicate filenames.");
  for (const base of OPEN_RESPONSE_PARAMETER_BASENAMES) {
    const candidates = normalized.filter((file) => path.parse(file.name).name.toLowerCase() === base);
    if (candidates.length !== 1) throw new Error(`Source bundle must contain exactly one ${base} parameter document.`);
    if (path.extname(candidates[0].name).toLowerCase() === ".iwb") throw new Error(`${candidates[0].name} requires safe server-side decode context; provide decoded ${base}.xml.`);
    if (path.extname(candidates[0].name).toLowerCase() !== ".xml") throw new Error(`${base} must be supplied as decoded XML.`);
    if (!candidates[0].bytes.length || candidates[0].bytes.length > OPEN_RESPONSE_IMPORT_LIMITS.xmlBytes) throw new Error(`${candidates[0].name} exceeds the XML size limit.`);
  }
  for (const file of normalized) {
    const base = path.parse(file.name).name.toLowerCase();
    if (OPEN_RESPONSE_PARAMETER_BASENAMES.includes(base)) continue;
    if (!rasterExtensions.has(path.extname(file.name).toLowerCase())) throw new Error(`${file.name} has an unsupported extension.`);
  }
  return normalized;
}

export async function importUltimateB2OpenResponsePublisherBundle({ activityId, files, allowUnregisteredDraft = false }) {
  const supplied = normalizeFiles(files);
  const byLogicalParameterName = Object.fromEntries(OPEN_RESPONSE_PARAMETER_BASENAMES.map((base) => [base, supplied.find((file) => path.parse(file.name).name.toLowerCase() === base)]));
  const primary = parseUltimateB2OpenResponsePublisherXml(byLogicalParameterName.obj_params.bytes.toString("utf8"), byLogicalParameterName.obj_params.name);
  const ebook = parseUltimateB2OpenResponsePublisherXml(byLogicalParameterName.ebook_obj_params.bytes.toString("utf8"), byLogicalParameterName.ebook_obj_params.name);
  assertEquivalent(primary, ebook);
  const suppliedRasters = await Promise.all(supplied.filter((file) => rasterExtensions.has(path.extname(file.name).toLowerCase())).map(inspectOpenResponseRaster));
  const rasterLogicalNames = new Map();
  for (const raster of suppliedRasters) {
    const logicalName = path.parse(raster.name).name.toLowerCase();
    if (rasterLogicalNames.has(logicalName)) throw new Error(`Source bundle contains ambiguous raster names for ${logicalName}.`);
    rasterLogicalNames.set(logicalName, raster);
  }
  const referencedNames = new Set();
  const importedImages = primary.images.map((image, index) => {
    const logicalName = path.parse(image.name).name.toLowerCase();
    if (referencedNames.has(logicalName)) throw new Error(`Publisher XML references ${image.name} more than once.`);
    referencedNames.add(logicalName);
    const raster = rasterLogicalNames.get(logicalName);
    if (!raster) throw new Error(`Publisher image ${image.name} is missing from the supplied source bundle.`);
    const width = Math.round(raster.width * image.scale * 10_000) / 10_000;
    const height = Math.round(raster.height * image.scale * 10_000) / 10_000;
    if (image.x < 0 || image.y < 0 || image.x + width > primary.canvas.width || image.y + height > primary.canvas.height) throw new Error(`Publisher image ${image.name} falls outside the source canvas.`);
    const extension = path.extname(raster.name).toLowerCase();
    const managedName = `${raster.sha256}${extension === ".jpeg" ? ".jpg" : extension}`;
    return {
      raster,
      layer: {
        id: `${activityId}-artwork-${index + 1}`,
        binding: `open-response.${activityId}.artwork.${index + 1}.${raster.sha256.slice(0, 12)}`,
        repositoryPath: `src/assets/books/ultimate-b2/authoring/open-response/${activityId}/${managedName}`,
        sourceFile: raster.name,
        sha256: raster.sha256,
        naturalSize: { width: raster.width, height: raster.height },
        area: { x: image.x, y: image.y, width, height },
        order: index,
        altText: "",
        accessibilityStatus: "review-required",
      },
    };
  });
  const questions = primary.prompts.map((prompt, index) => {
    const answer = primary.answers[index];
    const evidenceLines = linesForArea(primary.lines, answer.area);
    if (!evidenceLines.length || evidenceLines.length !== ebook.answers[index].style.maxLines || answer.text.split("\n").length !== evidenceLines.length) throw new Error(`Publisher response ${index + 1} writing-line evidence conflicts.`);
    const linePositions = evidenceLines.map((line) => Math.round((line.y - answer.area.y + line.fontSize) * 10_000) / 10_000);
    const spacing = linePositions.length > 1 ? (linePositions.at(-1) - linePositions[0]) / (linePositions.length - 1) : answer.style.fontSize;
    const left = Math.max(answer.area.x, Math.min(...evidenceLines.map((line) => line.x)));
    const right = Math.min(answer.area.x + answer.area.width, Math.max(...evidenceLines.map((line) => line.x + line.width)));
    const questionId = `${activityId}-q${index + 1}`;
    return {
      id: questionId,
      prompt: prompt.text,
      promptArea: prompt.area,
      promptStyle: prompt.style,
      responseRegion: {
        id: `${questionId}-response`,
        ariaLabel: `Show model response for question ${index + 1}`,
        area: answer.area,
        presentation: {
          paddingX: 0,
          paddingY: 0,
          lineSpacing: Math.round(spacing * 10_000) / 10_000,
          fontScale: 1,
          lineCount: evidenceLines.length,
          linePositions,
          lineWidth: Math.round((right - left) * 10_000) / 10_000,
          fontFamily: answer.style.fontFamily,
          fontSize: answer.style.fontSize,
          color: answer.style.color,
          align: answer.style.align,
        },
      },
    };
  });
  const parameterFiles = OPEN_RESPONSE_PARAMETER_BASENAMES.map((base) => byLogicalParameterName[base]);
  const sourceFiles = [...parameterFiles, ...importedImages.map(({ raster }) => raster)].map((file) => ({ name: file.name, sha256: sha256(file.bytes) }));
  const publicAuthoring = normalizeUltimateB2OpenResponseAuthoring({
    schemaVersion: 3,
    activityId,
    source: { kind: "publisher-open-response-xml", canvas: primary.canvas, files: sourceFiles },
    surface: primary.canvas,
    visualCapabilities: { instructionImage: null, showText: { enabled: false, showTextImage: null } },
    artworkLayers: importedImages.map(({ layer }) => layer),
    questions,
  }, activityId, { allowUnregisteredDraft });
  const teacherAuthoring = normalizeUltimateB2OpenResponseTeacherAnswers({
    schemaVersion: 1,
    activityId,
    modelAnswers: primary.answers.map((answer, index) => ({ questionId: questions[index].id, text: answer.text })),
  }, activityId, questions.map((question) => question.id), { allowUnregisteredDraft });
  const unreferencedImages = suppliedRasters.filter((raster) => !referencedNames.has(path.parse(raster.name).name.toLowerCase())).map((raster) => raster.name);
  return {
    activityId,
    publicAuthoring,
    teacherAuthoring,
    assets: importedImages.map(({ raster, layer }) => ({ repositoryPath: layer.repositoryPath, bytes: raster.bytes, sha256: raster.sha256 })),
    report: {
      parameterFiles: parameterFiles.map((file) => file.name),
      imagesReferenced: primary.images.map((image) => image.name),
      imagesSupplied: suppliedRasters.map((image) => image.name),
      imagesImported: importedImages.map(({ raster }) => raster.name),
      unreferencedImages,
      canvas: primary.canvas,
      questionCount: questions.length,
      responseRegionCount: questions.length,
      imageCount: importedImages.length,
      warnings: unreferencedImages.length ? [`${unreferencedImages.length} supplied raster(s) were not referenced and were not imported.`] : [],
      errors: [],
      validation: "valid",
    },
  };
}
