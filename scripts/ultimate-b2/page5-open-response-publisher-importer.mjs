import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { XMLParser, XMLValidator } from "fast-xml-parser";
import sharp from "sharp";

import {
  normalizeUltimateB2Page5OpenResponseAuthoring,
  normalizeUltimateB2Page5TeacherAnswers,
  ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID,
} from "../../src/data/ultimate-b2/page5AuthoringSchema.js";

export const PAGE5_OPEN_RESPONSE_SOURCE_FILES = Object.freeze(["obj_params.xml", "ebook_obj_params.xml", "image_1.png", "image_2.png"]);
export const PAGE5_OPEN_RESPONSE_SOURCE_KIND = "decoded-publisher-iwb";
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", cdataPropName: "cdata", processEntities: false, parseTagValue: false, trimValues: false });
const promptNames = ["text_1", "text_5", "text_10"];

const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const number = (value, label) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be numeric.`);
  return parsed;
};
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const geometry = (value, label) => ({ x: number(value.x, `${label}.x`), y: number(value.y, `${label}.y`), width: number(value.width, `${label}.width`), height: number(value.height, `${label}.height`) });
const color = (decimal) => `#${number(decimal, "fontColor").toString(16).padStart(6, "0")}`;
const normalizedComparisonText = (value) => value.replace(/<br\s*\/?>/gi, " ").replace(/<\/?b>/gi, "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

function safePromptText(value) {
  if (/<(?!\/?b(?:\s|>))/i.test(value)) throw new Error("Publisher prompt contains unsupported markup.");
  const text = value.replace(/<\/?b>/gi, "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  if (!text) throw new Error("Publisher prompt is empty.");
  return text.replace(/^\d+\s+/, "");
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
  return { width: Number(match[1]), height: Number(match[2]) };
}

function parsePublisherXml(raw, label) {
  if (/<!DOCTYPE|<!ENTITY/i.test(raw)) throw new Error(`${label} contains a forbidden XML declaration.`);
  const valid = XMLValidator.validate(raw);
  if (valid !== true) throw new Error(`${label} is malformed XML: ${valid.err.msg}`);
  const params = parser.parse(raw)?.params;
  if (!params) throw new Error(`${label} has no params root.`);
  const texts = asArray(params.texts?.text);
  const images = asArray(params.images?.image).map((image) => ({ name: image.name, x: number(image.x, `${label} image x`), y: number(image.y, `${label} image y`) }));
  const prompts = promptNames.map((name) => {
    const text = texts.find((candidate) => candidate.name === name);
    if (!text) throw new Error(`${label} is missing ${name}.`);
    return { name, text: safePromptText(String(text.cdata || "")), area: geometry(text, `${label}.${name}`), style: { fontFamily: text.fontName, fontSize: number(text.fontSize, `${label}.${name}.fontSize`), color: color(text.fontColor), align: text.align } };
  });
  const lines = texts.filter((text) => /^_+$/.test(String(text.cdata || "").trim())).map((text) => ({ ...geometry(text, `${label}.${text.name}`), fontSize: number(text.fontSize, `${label}.${text.name}.fontSize`), color: color(text.fontColor) })).sort((left, right) => left.y - right.y);
  const answers = asArray(params.exercises?.exercise?.sentences?.sentence).map((sentence) => {
    const text = sentence.text;
    return {
      id: number(sentence.id, `${label} sentence id`),
      text: safeAnswerText(String(text.cdata || "")),
      comparisonText: normalizedComparisonText(String(text.cdata || "")),
      area: geometry(text, `${label}.${text.name}`),
      style: { fontFamily: text.fontName, fontSize: number(text.fontSize, `${label}.${text.name}.fontSize`), color: color(text.fontColor), align: text.align, wordWrap: text.wordWrap === "true", verticalAlign: text.vAlign, maxLines: text.maxLines == null ? null : number(text.maxLines, `${label}.${text.name}.maxLines`), multiline: text.multiline == null ? null : text.multiline === "true" },
    };
  }).sort((left, right) => left.id - right.id);
  return { canvas: parseCanvas(raw, label), images, prompts, lines, answers };
}

function assertEquivalent(primary, secondary) {
  if (JSON.stringify(primary.canvas) !== JSON.stringify(secondary.canvas)) throw new Error("Publisher XML canvas geometry conflicts.");
  if (JSON.stringify(primary.images) !== JSON.stringify(secondary.images)) throw new Error("Publisher XML artwork geometry conflicts.");
  for (let index = 0; index < 3; index += 1) {
    if (primary.prompts[index].text !== secondary.prompts[index].text || JSON.stringify(primary.prompts[index].area) !== JSON.stringify(secondary.prompts[index].area)) throw new Error(`Publisher XML prompt ${index + 1} conflicts.`);
    if (primary.answers[index].comparisonText !== secondary.answers[index].comparisonText || JSON.stringify(primary.answers[index].area) !== JSON.stringify(secondary.answers[index].area)) throw new Error(`Publisher XML model response ${index + 1} conflicts.`);
    if (secondary.answers[index].style.maxLines !== [3, 4, 4][index] || !secondary.answers[index].style.multiline || !secondary.answers[index].style.wordWrap) throw new Error(`ebook XML response ${index + 1} metadata is inconsistent.`);
  }
}

function linesForArea(lines, area) {
  const matched = lines.filter((line) => line.y >= area.y && line.y < area.y + area.height);
  if (!matched.length) throw new Error("Publisher response region has no underline evidence.");
  return matched;
}

export async function importUltimateB2Page5OpenResponsePublisherSource(sourceDirectory) {
  const paths = Object.fromEntries(PAGE5_OPEN_RESPONSE_SOURCE_FILES.map((name) => [name, path.join(sourceDirectory, name)]));
  const [primaryBytes, secondaryBytes, image1Bytes, image2Bytes] = await Promise.all(PAGE5_OPEN_RESPONSE_SOURCE_FILES.map((name) => readFile(paths[name])));
  const primary = parsePublisherXml(primaryBytes.toString("utf8"), "obj_params.xml");
  const secondary = parsePublisherXml(secondaryBytes.toString("utf8"), "ebook_obj_params.xml");
  assertEquivalent(primary, secondary);
  if (primary.canvas.width !== 1024 || primary.canvas.height !== 582) throw new Error("Publisher canvas must be 1024×582 for this pilot.");
  if (primary.images.length !== 2 || primary.prompts.length !== 3 || primary.answers.length !== 3) throw new Error("Publisher source must contain two images, three prompts, and three responses.");
  const imageMetadata = await Promise.all([["image_1.png", image1Bytes], ["image_2.png", image2Bytes]].map(async ([name, bytes]) => {
    const metadata = await sharp(bytes, { failOn: "warning" }).metadata();
    if (metadata.format !== "png" || !metadata.width || !metadata.height) throw new Error(`${name} must be a valid PNG.`);
    return { name, sha256: hash(bytes), width: metadata.width, height: metadata.height };
  }));
  const imageByName = Object.fromEntries(imageMetadata.map((image) => [image.name.replace(".png", ""), image]));
  if (imageByName.image_1.width !== 317 || imageByName.image_1.height !== 507 || imageByName.image_2.width !== 606 || imageByName.image_2.height !== 34) throw new Error("Publisher artwork dimensions conflict with the Page 5 source contract.");
  const imagePlacement = Object.fromEntries(primary.images.map((image) => [image.name, image]));
  const sourceFiles = [
    { name: "obj_params.xml", sha256: hash(primaryBytes) },
    { name: "ebook_obj_params.xml", sha256: hash(secondaryBytes) },
    ...imageMetadata.map(({ name, sha256 }) => ({ name, sha256 })),
  ];
  const questions = primary.prompts.map((prompt, index) => {
    const answer = primary.answers[index];
    const responseLines = linesForArea(primary.lines, answer.area);
    if (responseLines.length !== secondary.answers[index].style.maxLines || answer.text.split("\n").length !== responseLines.length) throw new Error(`Publisher response ${index + 1} line evidence conflicts.`);
    if (answer.style.fontFamily !== "ITC Flora Std Medium" || answer.style.fontSize !== 21 || answer.style.color !== "#e40083" || answer.style.align !== "left" || !answer.style.wordWrap) throw new Error(`Publisher response ${index + 1} reveal style conflicts.`);
    const linePositions = responseLines.map((line) => line.y - answer.area.y + line.fontSize);
    const averageSpacing = linePositions.length > 1 ? (linePositions.at(-1) - linePositions[0]) / (linePositions.length - 1) : answer.style.fontSize;
    const usableLineWidth = Math.min(answer.area.x + answer.area.width, Math.max(...responseLines.map((line) => line.x + line.width))) - Math.max(answer.area.x, Math.min(...responseLines.map((line) => line.x)));
    const questionId = `${ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID}-q${index + 1}`;
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
          paddingX: 0, paddingY: 0, lineSpacing: Math.round(averageSpacing * 10_000) / 10_000, fontScale: 1,
          lineCount: responseLines.length, linePositions, lineWidth: usableLineWidth,
          fontFamily: answer.style.fontFamily, fontSize: answer.style.fontSize, color: answer.style.color, align: answer.style.align,
        },
      },
    };
  });
  const publicAuthoring = normalizeUltimateB2Page5OpenResponseAuthoring({
    schemaVersion: 2,
    activityId: ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID,
    source: { kind: PAGE5_OPEN_RESPONSE_SOURCE_KIND, canvas: primary.canvas, files: sourceFiles },
    surface: primary.canvas,
    visualCapabilities: { instructionImage: "unit1.page5.exercise1.instruction", showText: { enabled: false, showTextImage: null } },
    instructionImageAlt: "Read the quote and discuss these questions with a partner.",
    quoteArtworkBinding: "unit1.page5.exercise1.quote",
    artwork: {
      instruction: { binding: "unit1.page5.exercise1.instruction", sourceFile: "image_2.png", naturalSize: { width: imageByName.image_2.width, height: imageByName.image_2.height }, area: { x: imagePlacement.image_2.x, y: imagePlacement.image_2.y, width: imageByName.image_2.width, height: imageByName.image_2.height } },
      quote: { binding: "unit1.page5.exercise1.quote", sourceFile: "image_1.png", naturalSize: { width: imageByName.image_1.width, height: imageByName.image_1.height }, area: { x: imagePlacement.image_1.x, y: imagePlacement.image_1.y, width: imageByName.image_1.width, height: imageByName.image_1.height } },
    },
    questions,
  });
  const teacherAuthoring = normalizeUltimateB2Page5TeacherAnswers({ schemaVersion: 1, activityId: ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID, modelAnswers: primary.answers.map((answer, index) => ({ questionId: questions[index].id, text: answer.text })) });
  return {
    activityId: ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID,
    publicAuthoring,
    teacherAuthoring,
    report: { sourceFilesFound: PAGE5_OPEN_RESPONSE_SOURCE_FILES, canvas: primary.canvas, questionCount: questions.length, responseRegionCount: questions.length, imageCount: imageMetadata.length, lineCounts: questions.map((question) => question.responseRegion.presentation.lineCount), validation: "valid" },
  };
}
