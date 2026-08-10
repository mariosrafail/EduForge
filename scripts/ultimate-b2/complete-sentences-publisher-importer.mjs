import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { XMLParser, XMLValidator } from "fast-xml-parser";
import sharp from "sharp";

import {
  normalizeUltimateB2CompleteSentencesAuthoring,
  ultimateB2ReadingExerciseBindings,
  ULTIMATE_B2_COMPLETE_SENTENCES_ID,
} from "../../src/data/ultimate-b2/readingExerciseAuthoringSchema.js";

export const COMPLETE_SENTENCES_SOURCE_FILE = "obj_params.xml";
export const COMPLETE_SENTENCES_SOURCE_SHA256 = "dbb4266297982f0b01590adf051b6ccd5104cef2fff51cdcf10cbf5b05ca3e69";
export const COMPLETE_SENTENCES_IWB_SHA256 = "eff1d381a1eab943703845a72dea1913ae5f526ec283fea9c0349aac60a3fc90";
export const COMPLETE_SENTENCES_SOURCE_KIND = "decoded-publisher-iwb";

const assetContracts = Object.freeze([
  Object.freeze({
    binding: ultimateB2ReadingExerciseBindings.completeInstruction,
    sourceFile: "image_2.png",
    relativePath: "../../src/assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj4/image_2.png",
    sha256: "b44b28059951ce821ceb0588fef367138910b7ac48e01fdc388de32b4a7164ea",
    width: 873,
    height: 34,
    role: "instruction",
  }),
  Object.freeze({
    binding: ultimateB2ReadingExerciseBindings.completeShowText,
    sourceFile: "showText.png",
    relativePath: "../../src/assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj4/showText.png",
    sha256: "b988b55e3356aa41d88093606f6f495008dcc2987ff5cb5f63fdcc30d1a87732",
    width: 1000,
    height: 1219,
    role: "show-text-auxiliary",
  }),
]);

const parser = new XMLParser({
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
const area = (value, label) => ({
  x: numeric(value.x, `${label}.x`),
  y: numeric(value.y, `${label}.y`),
  width: numeric(value.width, `${label}.width`),
  height: numeric(value.height, `${label}.height`),
});
const color = (value) => `#${numeric(value, "fontColor").toString(16).padStart(6, "0")}`;
const style = (value, label) => ({
  fontFamily: String(value.fontName || ""),
  fontSize: numeric(value.fontSize, `${label}.fontSize`),
  color: color(value.fontColor),
  align: String(value.align || ""),
});
const answerStyle = (value, label) => ({
  ...style(value, label),
  wordWrap: value.wordWrap === "true",
  verticalAlign: String(value.vAlign || ""),
  maxChars: numeric(value.maxChars, `${label}.maxChars`),
});

function assertInside(bounds, candidate, label) {
  if (candidate.x < 0 || candidate.y < 0 || candidate.width <= 0 || candidate.height <= 0 || candidate.x + candidate.width > bounds.width || candidate.y + candidate.height > bounds.height) {
    throw new Error(`${label} falls outside the canonical publisher surface.`);
  }
}

function normalizePlainText(value, label) {
  if (/<[^>]+>/.test(value)) throw new Error(`${label} contains unsupported markup.`);
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function parseCompleteSentencesPublisherText(value, label = "Publisher sentence") {
  const raw = String(value);
  const tags = raw.match(/<[^>]+>/g) || [];
  const supported = /^(?:<\/?(?:b|i)>|<font\s+face=(?:'Myriad Pro'|"Myriad Pro")>|<\/font>)$/i;
  if (tags.some((tag) => !supported.test(tag))) throw new Error(`${label} contains unsupported publisher markup.`);
  const withBlank = raw
    .replace(/<font\s+face=(?:'Myriad Pro'|"Myriad Pro")>\s*_+\s*<\/font>/i, "\u0000")
    .replace(/<\/?(?:b|i)>/gi, "")
    .replace(/\u00a0/g, " ");
  if ((withBlank.match(/\u0000/g) || []).length !== 1 || /<[^>]+>/.test(withBlank)) throw new Error(`${label} must contain exactly one supported blank marker.`);
  const withoutNumber = withBlank.replace(/^\s*(\d+)\s+/, "");
  const numberMatch = withBlank.match(/^\s*(\d+)\s+/);
  if (!numberMatch) throw new Error(`${label} is missing its displayed number.`);
  const [beforeRaw, afterRaw] = withoutNumber.split("\u0000");
  return {
    number: Number(numberMatch[1]),
    before: beforeRaw.replace(/\s+/g, " ").replace(/^\s+/, ""),
    after: afterRaw.replace(/\s+/g, " ").replace(/\s+$/, ""),
  };
}

function parsePublisherXml(raw) {
  if (/<!DOCTYPE|<!ENTITY/i.test(raw)) throw new Error("obj_params.xml contains a forbidden XML declaration.");
  const valid = XMLValidator.validate(raw);
  if (valid !== true) throw new Error(`obj_params.xml is malformed XML: ${valid.err.msg}`);
  const params = parser.parse(raw)?.params;
  if (!params) throw new Error("obj_params.xml has no params root.");

  // This fixed importer recognizes the known commented historical navigator only
  // after validating the exact source identity. It is not a generic comment rule.
  const viewport = raw.match(/<navigator\b[^>]*\bviewport="0,0,(\d+),(\d+)"[^>]*\btotalPages="(\d+)"/i);
  if (!viewport || Number(viewport[3]) !== 1) throw new Error("The fixed Complete the Sentences source lacks its known one-page viewport evidence.");
  const canvas = { width: Number(viewport[1]), height: Number(viewport[2]) };
  if (canvas.width !== 1024 || canvas.height !== 582) throw new Error("Complete the Sentences publisher canvas must remain 1024x582.");

  const exercises = asArray(params.exercises?.exercise);
  if (exercises.length !== 1 || exercises[0].type !== "write") throw new Error("Publisher source must contain exactly one write exercise.");
  const answerSentences = asArray(exercises[0].sentences?.sentence);
  if (answerSentences.length !== 8) throw new Error("Publisher source must contain exactly eight interactive answer entries.");
  const texts = asArray(params.texts?.text);
  const byName = Object.fromEntries(texts.map((text) => [text.name, text]));
  const image = asArray(params.images?.image);
  if (image.length !== 1 || image[0].name !== "image_2" || image[0].textureName !== "image_2") throw new Error("Publisher instruction image_2 mapping is ambiguous.");
  const notification = asArray(params.notifications?.notification).find((entry) => entry.type === "showText");
  if (!notification) throw new Error("Publisher source is missing the Show Text capability signal.");

  const exampleMarkup = parseCompleteSentencesPublisherText(String(byName.text_1?.cdata || ""), "publisher example");
  if (exampleMarkup.number !== 1) throw new Error("Publisher example must be Sentence 1.");
  const exampleAnswer = normalizePlainText(String(byName.text_11?.cdata || ""), "publisher example answer");
  const interactiveTextNames = ["text_2", "text_3", "text_4", "text_5", "text_6", "text_7", "text_9", "text_10"];
  const interactiveTexts = interactiveTextNames.map((name, index) => {
    const text = byName[name];
    if (!text) throw new Error(`Publisher source is missing ${name}.`);
    const parsed = parseCompleteSentencesPublisherText(String(text.cdata || ""), name);
    const expectedNumber = index + 2;
    if (parsed.number !== expectedNumber) throw new Error(`${name} does not map to Sentence ${expectedNumber}.`);
    const continuation = expectedNumber === 7 ? byName.text_8 : null;
    if (expectedNumber === 7 && !continuation) throw new Error("Sentence 7 continuation text is missing.");
    return {
      ...parsed,
      after: `${parsed.after}${continuation ? ` ${normalizePlainText(String(continuation.cdata || ""), "Sentence 7 continuation")}` : ""}`,
      textArea: area(text, name),
      continuationArea: continuation ? area(continuation, "text_8") : null,
      textStyle: style(text, name),
    };
  });
  const answers = answerSentences.map((sentence, index) => {
    const text = sentence.text;
    if (!text || Array.isArray(text)) throw new Error(`Interactive answer ${index + 1} must contain exactly one text object.`);
    const expectedId = index + 1;
    if (numeric(sentence.id, `sentence[${index}].id`) !== expectedId) throw new Error(`Interactive answer ${index + 1} has an unexpected publisher ID.`);
    const revealText = normalizePlainText(String(text.cdata || ""), `answer ${expectedId}`);
    if (revealText !== String(text.answers || "")) throw new Error(`Interactive answer ${expectedId} conflicts with its publisher answers attribute.`);
    return {
      id: expectedId,
      revealText,
      area: area(text, `answer_${expectedId}`),
      style: answerStyle(text, `answer_${expectedId}`),
      button: { x: numeric(sentence.buttonX, `sentence[${index}].buttonX`), y: numeric(sentence.buttonY, `sentence[${index}].buttonY`) },
    };
  });
  const example = {
    ...exampleMarkup,
    answer: exampleAnswer,
    textArea: area(byName.text_1, "text_1"),
    answerArea: area(byName.text_11, "text_11"),
    textStyle: style(byName.text_1, "text_1"),
    answerStyle: style(byName.text_11, "text_11"),
  };
  const instructionArea = { x: numeric(image[0].x, "image_2.x"), y: numeric(image[0].y, "image_2.y"), width: 873, height: 34 };
  for (const [label, candidate] of [
    ["instruction", instructionArea], ["example text", example.textArea], ["example answer", example.answerArea],
    ...interactiveTexts.flatMap((entry) => [[`Sentence ${entry.number} text`, entry.textArea], ...(entry.continuationArea ? [[`Sentence ${entry.number} continuation`, entry.continuationArea]] : [])]),
    ...answers.map((entry) => [`answer ${entry.id}`, entry.area]),
  ]) assertInside(canvas, candidate, label);
  return { canvas, exerciseCount: exercises.length, instructionArea, example, interactiveTexts, answers };
}

async function verifiedAsset(contract) {
  const assetPath = path.resolve(import.meta.dirname, contract.relativePath);
  const bytes = await readFile(assetPath);
  const digest = sha256(bytes);
  const metadata = await sharp(bytes, { failOn: "warning" }).metadata();
  if (digest !== contract.sha256 || metadata.format !== "png" || metadata.width !== contract.width || metadata.height !== contract.height) throw new Error(`${contract.sourceFile} does not match the canonical tracked publisher asset.`);
  return { binding: contract.binding, sourceFile: contract.sourceFile, sha256: digest, naturalSize: { width: contract.width, height: contract.height }, role: contract.role };
}

export async function importUltimateB2CompleteSentencesPublisherSource(sourceFile) {
  const bytes = await readFile(sourceFile);
  const digest = sha256(bytes);
  if (digest !== COMPLETE_SENTENCES_SOURCE_SHA256) throw new Error("obj_params.xml SHA-256 does not match the canonical Complete the Sentences source.");
  const parsed = parsePublisherXml(bytes.toString("utf8"));
  const assets = await Promise.all(assetContracts.map(verifiedAsset));
  const instructionAsset = assets[0];
  const showTextAsset = assets[1];
  const sentences = parsed.interactiveTexts.map((sentence, index) => ({
    id: `sentence-${sentence.number}`,
    questionId: `${ULTIMATE_B2_COMPLETE_SENTENCES_ID}-q${index + 1}`,
    number: sentence.number,
    before: sentence.before,
    blankId: `blank-${sentence.number}`,
    after: sentence.after,
    textArea: sentence.textArea,
    continuationArea: sentence.continuationArea,
    textStyle: sentence.textStyle,
  }));
  const blanks = parsed.answers.map((answer, index) => {
    const number = index + 2;
    return {
      id: `blank-${number}`,
      sentenceId: `sentence-${number}`,
      label: `Sentence ${number} blank`,
      revealedWord: answer.revealText,
      area: answer.area,
      style: answer.style,
      button: answer.button,
    };
  });
  const authoring = normalizeUltimateB2CompleteSentencesAuthoring({
    schemaVersion: 2,
    activityId: ULTIMATE_B2_COMPLETE_SENTENCES_ID,
    source: {
      kind: COMPLETE_SENTENCES_SOURCE_KIND,
      objectNumber: 4,
      canvas: parsed.canvas,
      files: [{ name: COMPLETE_SENTENCES_SOURCE_FILE, sha256: digest }],
      iwbSha256: COMPLETE_SENTENCES_IWB_SHA256,
      assets,
    },
    surface: parsed.canvas,
    visualCapabilities: {
      instructionImage: instructionAsset.binding,
      showText: { enabled: true, showTextImage: showTextAsset.binding },
    },
    instruction: { binding: instructionAsset.binding, sourceFile: instructionAsset.sourceFile, naturalSize: instructionAsset.naturalSize, area: parsed.instructionArea },
    example: { id: "sentence-1", ...parsed.example },
    sentences,
    blanks,
  });
  return {
    activityId: ULTIMATE_B2_COMPLETE_SENTENCES_ID,
    authoring,
    report: {
      sourceFile: COMPLETE_SENTENCES_SOURCE_FILE,
      sourceSha256: digest,
      canvas: parsed.canvas,
      exerciseCount: parsed.exerciseCount,
      exampleDetected: true,
      interactiveSentenceCount: sentences.length,
      revealAnswerCount: blanks.length,
      instructionAssetMatched: true,
      showTextAuxiliaryAssetMatched: true,
      validation: "valid",
    },
  };
}
