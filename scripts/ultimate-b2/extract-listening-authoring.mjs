import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { XMLParser } from "fast-xml-parser";
import sharp from "sharp";

import {
  ULTIMATE_B2_LISTENING_ACTIVITY_ID,
  assertUltimateB2ListeningAuthoring,
} from "../../src/data/ultimate-b2/listeningAuthoringSchema.js";

export const LISTENING_IWB_XOR_KEY = "EA3DC7D7-6954-471A-8399-E217B522F5F2";
export const LISTENING_EXTRACTION_SCHEMA_VERSION = 1;

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const outputPath = path.join(repositoryRoot, "src/data/ultimate-b2/authoring/unit-01-reading-exercise-2.listening.json");
const sourceRelativeDirectory = "Contents/Resources/assets/books/book1/unit/1/part2/obj2";
const iwbNames = ["obj_params.iwb", "ebook_obj_params.iwb", "highlight_params.iwb"];
const expectedHashes = Object.freeze({
  "obj_params.iwb": "4194b3db0d9057041b69a19e33697c30b075a5485aa8922874c032d34be21568",
  "ebook_obj_params.iwb": "7c98badcb63c7d0a5ec87b824fd4a290c60300c051b9fb8e383e5b325103a217",
  "highlight_params.iwb": "3b8e27e9ad9fdc6a2234e0cc69dd09f7fcb4927ca2b47e63d9708369e00bec61",
});

const asArray = (value) => value === undefined ? [] : Array.isArray(value) ? value : [value];
const integer = (value, label) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${label} must be an integer.`);
  return parsed;
};
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

export function decodeListeningIwb(encoded, name = "IWB source") {
  const compact = String(encoded).replace(/\s+/g, "");
  if (!compact || compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
    throw new Error(`${name} is not valid Base64.`);
  }
  const bytes = Buffer.from(compact, "base64");
  const key = Buffer.from(LISTENING_IWB_XOR_KEY, "utf8");
  for (let index = 0; index < bytes.length; index += 1) bytes[index] ^= key[index % key.length];
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(decoded)) throw new Error(`${name} contains a forbidden DTD or entity declaration.`);
  if (!/^\uFEFF?\s*<params(?:\s|>)/.test(decoded) || !/<\/params>\s*$/.test(decoded)) {
    throw new Error(`${name} did not decode to a <params> document.`);
  }
  return decoded;
}

function parseParams(xml, name) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    trimValues: false,
    processEntities: false,
    allowBooleanAttributes: false,
  });
  const document = parser.parse(xml);
  if (!document || Object.keys(document).filter((key) => key !== "?xml").length !== 1 || !document.params) {
    throw new Error(`${name} must have exactly one <params> root.`);
  }
  return document.params;
}

function exerciseList(params) {
  return asArray(params.exercises).flatMap((container) => asArray(container?.exercise));
}

function sourceGeometry(node, label) {
  return {
    x: integer(node.x, `${label}.x`),
    y: integer(node.y, `${label}.y`),
    width: integer(node.width, `${label}.width`),
    height: integer(node.height, `${label}.height`),
  };
}

function normalizeRuns(source, label) {
  const text = String(source ?? "");
  if (!text) throw new Error(`${label} is empty.`);
  const runs = [];
  const stack = [];
  let cursor = 0;
  const tags = /<\/?([a-zA-Z0-9]+)>/g;
  for (let match = tags.exec(text); match; match = tags.exec(text)) {
    if (match.index > cursor) {
      const run = { text: text.slice(cursor, match.index) };
      if (stack.length) run.style = stack.at(-1);
      runs.push(run);
    }
    const tag = match[1].toLowerCase();
    if (!['i', 'b'].includes(tag)) throw new Error(`${label} contains unsupported <${tag}> markup.`);
    const closing = match[0][1] === "/";
    const style = tag === "i" ? "italic" : "bold";
    if (closing) {
      if (stack.at(-1) !== style) throw new Error(`${label} has unbalanced markup.`);
      stack.pop();
    } else stack.push(style);
    cursor = tags.lastIndex;
  }
  if (cursor < text.length) {
    const run = { text: text.slice(cursor) };
    if (stack.length) run.style = stack.at(-1);
    runs.push(run);
  }
  if (stack.length || /[<>]/.test(runs.map((run) => run.text).join(""))) throw new Error(`${label} contains unsafe or unbalanced markup.`);
  return runs.filter((run) => run.text.length > 0);
}

function plainText(source) {
  return normalizeRuns(source, "question text").map((run) => run.text).join("")
    .replace(/^\s*\d+\s*/u, "")
    .replace(/\u00a0/g, " ")
    .trim();
}

function parseTiming(value, label) {
  const parts = String(value || "").split("-").map((part) => integer(part, label));
  if (parts.length !== 2 || parts[1] <= parts[0]) throw new Error(`${label} must be start-end milliseconds.`);
  return parts;
}

function parseScrollTiming(value, label) {
  const parts = String(value || "").split("-").map((part) => integer(part, label));
  if (![2, 3].includes(parts.length) || parts[1] <= parts[0]) throw new Error(`${label} has an unsupported timing form.`);
  return { startMs: parts[0], endMs: parts[1], sourceTimingParts: parts };
}

function resolveObjectDirectory(source) {
  const supplied = path.resolve(source || path.join(repositoryRoot, "Ultimate English B2.app"));
  const directFiles = iwbNames.every((name) => fs.existsSync(path.join(supplied, name)));
  const resolved = directFiles ? supplied : path.join(supplied, ...sourceRelativeDirectory.split("/"));
  if (!iwbNames.every((name) => fs.existsSync(path.join(resolved, name)))) {
    throw new Error(`Object 2 IWB files were not found under ${supplied}.`);
  }
  return resolved;
}

export async function extractListeningAuthoring({ source, enforceKnownHashes = true } = {}) {
  const objectDirectory = resolveObjectDirectory(source);
  const rawFiles = Object.fromEntries(iwbNames.map((name) => [name, fs.readFileSync(path.join(objectDirectory, name))]));
  const hashes = Object.fromEntries(iwbNames.map((name) => [name, sha256(rawFiles[name])]));
  if (enforceKnownHashes) iwbNames.forEach((name) => {
    if (hashes[name] !== expectedHashes[name]) throw new Error(`${name} SHA-256 does not match the verified source.`);
  });
  const params = Object.fromEntries(iwbNames.map((name) => [
    name,
    parseParams(decodeListeningIwb(rawFiles[name].toString("utf8"), name), name),
  ]));
  const teacher = params["obj_params.iwb"];
  const ebook = params["ebook_obj_params.iwb"];
  const highlights = params["highlight_params.iwb"];
  const teacherKaraoke = exerciseList(teacher).find((exercise) => exercise.type === "karaokeScroll");
  const ebookKaraoke = exerciseList(ebook).find((exercise) => exercise.type === "karaokeScroll");
  if (!teacherKaraoke || teacherKaraoke.clickableTexts !== "true") throw new Error("Teacher obj_params.iwb must contain clickable karaokeScroll text.");
  if (!asArray(teacher.notifications?.notification).some((item) => item.type === "showText")) throw new Error("Teacher obj_params.iwb must declare Show Text.");
  if (!ebookKaraoke || ebookKaraoke.clickableTexts !== "false" || asArray(ebook.notifications?.notification).some((item) => item.type === "showText")) throw new Error("ebook_obj_params.iwb variant evidence is unexpected.");

  const topLevelQuestionTexts = asArray(teacher.texts?.text).filter((item) => String(item["#text"] || "").includes("?"));
  const writeExercise = exerciseList(teacher).find((exercise) => exercise.type === "write");
  const answerSentences = asArray(writeExercise?.sentences?.sentence);
  if (topLevelQuestionTexts.length !== 3 || answerSentences.length !== 3 || answerSentences.some((item) => item.text?.fontColor !== "14942339")) {
    throw new Error("Teacher question/model-answer structure is unexpected.");
  }
  const modelAnswers = Object.fromEntries(answerSentences.map((sentence, index) => [
    `${ULTIMATE_B2_LISTENING_ACTIVITY_ID}-q${index + 1}`,
    String(sentence.text["#text"] || "").replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim(),
  ]));

  const quads = asArray(highlights.highlights?.quad);
  const quadById = new Map(quads.map((quad) => [integer(quad.id, "highlight id"), quad]));
  const buttons = asArray(highlights.buttons?.button);
  if (buttons.length !== 3 || quads.length !== 12 || highlights.highlights?.autoScroll !== "true") throw new Error("Question highlight structure is unexpected.");
  if (quads.some((quad) => quad.color !== "16711935" || quad.alpha !== "0.3")) throw new Error("Question highlight styling is inconsistent.");
  const questionSegments = buttons.map((button, index) => {
    const questionNumber = index + 1;
    const regionIds = String(button.url).split(",").map((id) => integer(id, "button region ID"));
    const sourceAudioId = integer(button.id, "button audio ID");
    const regions = regionIds.map((id) => {
      const quad = quadById.get(id);
      if (!quad || integer(quad.audioID, "quad audio ID") !== sourceAudioId) throw new Error(`Question ${questionNumber} region/audio mapping is inconsistent.`);
      return { id: `region-${id}`, ...sourceGeometry(quad, `region ${id}`) };
    });
    return {
      id: `question-${questionNumber}`,
      questionId: `${ULTIMATE_B2_LISTENING_ACTIVITY_ID}-q${questionNumber}`,
      questionNumber,
      questionText: plainText(topLevelQuestionTexts[index]["#text"]),
      answerLineCount: [2, 3, 1][index],
      audioLogicalKey: `ultimate-b2.legacy-pilot.unit-1.part-2.obj2.highlight-${questionNumber}`,
      sourceButtonId: sourceAudioId,
      sourceAudioId,
      regions,
    };
  });

  const sourceFragments = asArray(teacherKaraoke.texts?.text);
  const fragments = sourceFragments.map((fragment, index) => ({
    id: `fragment-${integer(fragment.id, `fragment ${index + 1} id`)}`,
    ...sourceGeometry(fragment, `fragment ${index + 1}`),
    runs: normalizeRuns(fragment["#text"], `fragment ${index + 1}`),
  }));
  const cueMap = new Map();
  sourceFragments.forEach((fragment, index) => {
    const [startMs, endMs] = parseTiming(fragment.times, `fragment ${index + 1} timing`);
    const key = `${startMs}-${endMs}`;
    if (!cueMap.has(key)) cueMap.set(key, { startMs, endMs, fragmentIds: [] });
    cueMap.get(key).fragmentIds.push(fragments[index].id);
  });
  const cues = [...cueMap.values()].map((cue, index) => ({ id: `cue-${index + 1}`, ...cue }));
  if (fragments.length !== 98 || cues.length !== 37 || cues[0].startMs !== 26629 || cues.at(-1).endMs !== 279001) {
    throw new Error(`Unexpected karaoke extraction: ${fragments.length} fragments, ${cues.length} cues, ${cues[0]?.startMs}-${cues.at(-1)?.endMs}.`);
  }
  const scrollTimeline = asArray(teacherKaraoke.scrollValues?.scrollValue).map((entry, index) => ({
    ...parseScrollTiming(entry.times, `scroll entry ${index + 1}`),
    scrollY: integer(entry.value, `scroll entry ${index + 1} value`),
  }));
  const backgroundMetadata = await sharp(path.join(objectDirectory, "image_1.png")).metadata();
  const staticTextMetadata = await sharp(path.join(objectDirectory, "showText.png")).metadata();
  if (backgroundMetadata.width !== 1020 || backgroundMetadata.height !== 1801 || staticTextMetadata.width !== 1000 || staticTextMetadata.height !== 1219) {
    throw new Error("Object 2 source image dimensions are unexpected.");
  }
  const scroller = teacher.scroller;
  const background = asArray(teacher.images?.image).find((image) => image.name === "image_1");
  const authoring = {
    schemaVersion: 1,
    activityId: ULTIMATE_B2_LISTENING_ACTIVITY_ID,
    source: {
      extractionSchemaVersion: LISTENING_EXTRACTION_SCHEMA_VERSION,
      iwbFiles: iwbNames.map((name) => ({ name, sha256: hashes[name] })),
      selectedTeacherVariant: "obj_params.iwb",
    },
    assets: {
      instructionImage: "ultimate-b2.legacy-pilot.unit-1.part-2.obj2.image_2",
      staticTextImage: "ultimate-b2.legacy-pilot.unit-1.part-2.obj2.showText",
      karaokeBackgroundImage: "ultimate-b2.legacy-pilot.unit-1.part-2.obj2.image_1",
      fullAudio: "ultimate-b2.students-book.unit-1.reading.text-audio",
    },
    staticText: {
      surface: { width: staticTextMetadata.width, height: staticTextMetadata.height },
      highlightColor: "#FF00FF",
      highlightAlpha: 0.3,
      autoScroll: true,
    },
    questionSegments,
    karaoke: {
      content: { width: integer(scroller.contentWidth, "scroller contentWidth"), height: integer(scroller.contentHeight, "scroller contentHeight") },
      viewport: sourceGeometry(scroller, "scroller viewport"),
      background: { x: integer(background.x, "background x"), y: integer(background.y, "background y"), width: backgroundMetadata.width, height: backgroundMetadata.height },
      font: { family: "Roboto Regular", sizePx: 21 },
      fragments,
      cues,
      scrollTimeline,
    },
  };
  assertUltimateB2ListeningAuthoring(authoring);
  return { authoring, modelAnswers, hashes, objectDirectory };
}

function parseArguments(argv) {
  const write = argv.includes("--write");
  const sourceIndex = argv.indexOf("--source");
  if (sourceIndex >= 0 && !argv[sourceIndex + 1]) throw new Error("--source requires a path.");
  const unknown = argv.filter((item, index) => item !== "--write" && item !== "--source" && argv[index - 1] !== "--source");
  if (unknown.length) throw new Error(`Unknown argument: ${unknown[0]}`);
  return { write, source: sourceIndex >= 0 ? argv[sourceIndex + 1] : undefined };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const result = await extractListeningAuthoring({ source: options.source });
  const serialized = `${JSON.stringify(result.authoring, null, 2)}\n`;
  if (options.write) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const temporary = `${outputPath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, serialized, { encoding: "utf8", flag: "wx" });
    fs.renameSync(temporary, outputPath);
    console.log(`Wrote ${path.relative(repositoryRoot, outputPath)}.`);
  } else {
    console.log("Validated Listening source. Pass --write to update the tracked authoring JSON.");
  }
  console.log(JSON.stringify({
    iwbSha256: result.hashes,
    questionSegmentRegions: result.authoring.questionSegments.map((segment) => segment.regions.length),
    fragments: result.authoring.karaoke.fragments.length,
    cues: result.authoring.karaoke.cues.length,
    firstCueStartMs: result.authoring.karaoke.cues[0].startMs,
    lastCueEndMs: result.authoring.karaoke.cues.at(-1).endMs,
    teacherModelAnswerCount: Object.keys(result.modelAnswers).length,
  }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) await main();
