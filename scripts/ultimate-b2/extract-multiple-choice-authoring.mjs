import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { XMLParser } from "fast-xml-parser";
import sharp from "sharp";

import { normalizeMultipleChoiceAuthoring } from "../../src/data/ultimate-b2/multipleChoiceAuthoringSchema.js";
import { decodeListeningIwb } from "./extract-listening-authoring.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const defaultSource = path.join(repositoryRoot, "Ultimate English B2.app/Contents/Resources/assets/books/book1/unit/1/part2/obj3");
const outputPath = path.join(repositoryRoot, "src/data/ultimate-b2/authoring/unit-01-reading-exercise-3.multiple-choice.json");
const runtimePath = path.join(repositoryRoot, "src/data/ultimate-b2/generated/unit-01.runtime.json");
const activityId = "ultimate-b2-sb-u1-p2-o3";
const asArray = (value) => value == null ? [] : Array.isArray(value) ? value : [value];
const number = (value, label) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${label} must be an integer.`);
  return parsed;
};
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function parseIwb(filePath) {
  const encoded = fs.readFileSync(filePath, "utf8");
  const decoded = decodeListeningIwb(encoded, path.basename(filePath));
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", processEntities: false });
  return { encoded, decoded, params: parser.parse(decoded).params };
}

function findActivity(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findActivity(item);
      if (match) return match;
    }
  } else if (value && typeof value === "object") {
    if (value.stableNormalizedId === activityId) return value;
    for (const item of Object.values(value)) {
      const match = findActivity(item);
      if (match) return match;
    }
  }
  return null;
}

export async function extractMultipleChoiceAuthoring({ source = defaultSource } = {}) {
  const objectSource = path.resolve(source);
  const objectIwb = parseIwb(path.join(objectSource, "obj_params.iwb"));
  const highlightIwb = parseIwb(path.join(objectSource, "highlight_params.iwb"));
  if (number(objectIwb.params.navigator?.totalPages, "navigator.totalPages") !== 2) throw new Error("Object 3 must contain exactly two source pages.");
  const runtime = findActivity(JSON.parse(fs.readFileSync(runtimePath, "utf8")));
  if (!runtime || runtime.runtime.questions.length !== 6) throw new Error("The normalized Object 3 question text source is unavailable.");
  const sourceExercises = asArray(objectIwb.params.exercises).flatMap((entry) => asArray(entry.exercise));
  if (sourceExercises.length !== 2) throw new Error("Object 3 must contain two source exercise panels.");
  const sentences = sourceExercises.flatMap((exercise) => asArray(exercise.sentences?.sentence));
  const buttons = asArray(highlightIwb.params.buttons?.button);
  const highlights = asArray(highlightIwb.params.highlights?.quad);
  if (sentences.length !== 6 || buttons.length !== 6 || highlights.length !== 23) throw new Error("Unexpected Object 3 source question/highlight count.");
  const imageNodes = asArray(objectIwb.params.images?.image);
  const imageMetadata = {};
  for (const name of ["image_1.png", "image_2.png", "image_3.png", "showText.png"]) imageMetadata[name] = await sharp(path.join(objectSource, name)).metadata();
  const panelQuestionIds = [runtime.runtime.questions.slice(0, 4).map((question) => question.id), runtime.runtime.questions.slice(4).map((question) => question.id)];
  const panels = [1, 2].map((panelNumber) => {
    const baseName = panelNumber === 1 ? "image_1" : "image_3";
    const node = imageNodes.find((image) => image.name === baseName);
    const imageAsset = `${baseName}.png`;
    const panel = {
      id: `panel-${panelNumber}`,
      number: panelNumber,
      imageAsset,
      imageArea: { x: number(node.x, `${baseName}.x`), y: number(node.y, `${baseName}.y`), width: imageMetadata[imageAsset].width, height: imageMetadata[imageAsset].height },
      instructionArea: null,
      questionIds: panelQuestionIds[panelNumber - 1],
    };
    if (panelNumber === 1) {
      const instruction = imageNodes.find((image) => image.name === "image_2");
      panel.instructionArea = { x: number(instruction.x, "image_2.x"), y: number(instruction.y, "image_2.y"), width: imageMetadata["image_2.png"].width, height: imageMetadata["image_2.png"].height };
    }
    return panel;
  });
  const questions = runtime.runtime.questions.map((runtimeQuestion, index) => {
    const sentence = sentences[index];
    const button = buttons[index];
    const options = asArray(sentence.choice);
    const correctIndex = number(sentence.answer, `question ${index + 1} answer`) - 1;
    return {
      id: runtimeQuestion.id,
      number: index + 1,
      panelId: index < 4 ? "panel-1" : "panel-2",
      prompt: runtimeQuestion.prompt,
      correctOptionId: runtimeQuestion.options[correctIndex].id,
      referenceArea: { x: number(button.x, `button ${index + 1}.x`), y: number(button.y, `button ${index + 1}.y`), width: 44, height: 44 },
      audioLogicalKey: `ultimate-b2.legacy-pilot.unit-1.part-2.obj3.highlight-${index + 1}`,
      persistSolved: true,
      options: runtimeQuestion.options.map((option, optionIndex) => ({
        id: option.id,
        label: String.fromCharCode(65 + optionIndex),
        text: option.text,
        area: { x: number(options[optionIndex].x, `${option.id}.x`), y: number(options[optionIndex].y, `${option.id}.y`), width: number(options[optionIndex].width, `${option.id}.width`), height: number(options[optionIndex].height, `${option.id}.height`) },
      })),
      highlightRegions: highlights.filter((highlight) => number(highlight.audioID, "highlight.audioID") === index + 1).map((highlight) => ({
        id: `region-${highlight.id}`,
        x: number(highlight.x, `highlight ${highlight.id}.x`),
        y: number(highlight.y, `highlight ${highlight.id}.y`),
        width: number(highlight.width, `highlight ${highlight.id}.width`),
        height: number(highlight.height, `highlight ${highlight.id}.height`),
      })),
    };
  });
  const sourceFiles = ["obj_params.iwb", "highlight_params.iwb", "image_1.png", "image_2.png", "image_3.png", "showText.png", ...Array.from({ length: 6 }, (_, index) => `highlight_${index + 1}.mp3`)];
  const sourceManifest = sourceFiles.map((name) => ({ name, sha256: sha256(fs.readFileSync(path.join(objectSource, name))) }));
  sourceManifest[0].decodedSha256 = sha256(objectIwb.decoded);
  sourceManifest[1].decodedSha256 = sha256(highlightIwb.decoded);
  return normalizeMultipleChoiceAuthoring({
    schemaVersion: 1,
    activityId,
    source: { path: "assets/books/book1/unit/1/part2/obj3", teacherVariant: "obj_params.iwb", totalPages: 2, files: sourceManifest },
    surface: { width: 1024, height: 582 },
    textSurface: { width: imageMetadata["showText.png"].width, height: imageMetadata["showText.png"].height },
    assets: { instructionImage: "image_2.png", textImage: "showText.png" },
    panels,
    questions,
  });
}

function argumentsFrom(argv) {
  const sourceIndex = argv.indexOf("--source");
  return { write: argv.includes("--write"), source: sourceIndex >= 0 ? argv[sourceIndex + 1] : undefined };
}

async function main() {
  const options = argumentsFrom(process.argv.slice(2));
  const authoring = await extractMultipleChoiceAuthoring({ source: options.source });
  if (options.write) {
    const temporary = `${outputPath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(authoring, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    fs.renameSync(temporary, outputPath);
    console.log(`Wrote ${path.relative(repositoryRoot, outputPath)}.`);
  } else console.log("Validated Object 3 Multiple Choice source. Pass --write to update the tracked authoring JSON.");
  console.log(JSON.stringify({ questions: authoring.questions.length, panels: authoring.panels.length, highlightRegions: authoring.questions.reduce((sum, question) => sum + question.highlightRegions.length, 0), correctOptions: authoring.questions.map((question) => question.correctOptionId.at(-1)) }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) await main();
