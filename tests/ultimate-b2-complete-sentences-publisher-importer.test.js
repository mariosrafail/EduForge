import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  COMPLETE_SENTENCES_SOURCE_SHA256,
  importUltimateB2CompleteSentencesPublisherSource,
  parseCompleteSentencesPublisherText,
} from "../scripts/ultimate-b2/complete-sentences-publisher-importer.mjs";
import canonical from "../src/data/ultimate-b2/authoring/unit-01-reading-exercise-4.complete-sentences.json" with { type: "json" };
import { publisherSourceEvidenceOptions } from "./_publisher-source-test-helper.js";

const sourceFile = "tmp/complete-sentences/obj_params.xml";
const publisherEvidence = publisherSourceEvidenceOptions(sourceFile);
const expectedAnswers = ["binge-watching", "season", "franchise", "episodes", "genre", "sub-plots", "Tuning in", "Media streaming"];
const expectedAreas = [
  { x: 498, y: 143, width: 165, height: 27 },
  { x: 358, y: 193, width: 164, height: 27 },
  { x: 603, y: 240, width: 164, height: 27 },
  { x: 252, y: 289, width: 132, height: 27 },
  { x: 239, y: 338, width: 164, height: 27 },
  { x: 702, y: 387, width: 164, height: 27 },
  { x: 88, y: 466, width: 164, height: 27 },
  { x: 88, y: 514, width: 164, height: 27 },
];

test("Complete the Sentences publisher XML safely reconstructs the exact canonical activity", publisherEvidence, async () => {
  const imported = await importUltimateB2CompleteSentencesPublisherSource(sourceFile);
  assert.equal(imported.report.sourceSha256, COMPLETE_SENTENCES_SOURCE_SHA256);
  assert.deepEqual(imported.report.canvas, { width: 1024, height: 582 });
  assert.deepEqual({ exercises: imported.report.exerciseCount, example: imported.report.exampleDetected, sentences: imported.report.interactiveSentenceCount, answers: imported.report.revealAnswerCount }, { exercises: 1, example: true, sentences: 8, answers: 8 });
  assert.equal(imported.authoring.activityId, "ultimate-b2-sb-u1-p2-o4");
  assert.deepEqual(imported.authoring.sentences.map(({ id, questionId, number }) => ({ id, questionId, number })), Array.from({ length: 8 }, (_, index) => ({ id: `sentence-${index + 2}`, questionId: `ultimate-b2-sb-u1-p2-o4-q${index + 1}`, number: index + 2 })));
  assert.deepEqual(imported.authoring.blanks.map((blank) => blank.revealedWord), expectedAnswers);
  assert.deepEqual(imported.authoring.blanks.map((blank) => blank.area), expectedAreas);
  assert.equal(imported.authoring.example.exampleText, "On-demand");
  assert.deepEqual(imported.authoring.example.answerArea, { x: 116, y: 92, width: 153, height: 29 });
  assert.deepEqual(imported.authoring.sentences[5].continuationArea, { x: 84, y: 417, width: 495, height: 29 });
  assert.ok(imported.authoring.blanks.every((blank) => blank.style.fontFamily === "ITC Flora Std Medium" && blank.style.fontSize === 21 && blank.style.color === "#e40083" && blank.style.align === "center" && blank.style.wordWrap === false && blank.style.verticalAlign === "middle"));
  assert.deepEqual(imported.authoring, canonical);
});

test("Complete the Sentences import verifies and SHA-reuses both tracked auxiliary assets", publisherEvidence, async () => {
  const imported = await importUltimateB2CompleteSentencesPublisherSource(sourceFile);
  assert.deepEqual(imported.authoring.instruction, { binding: "unit1.reading.exercise4.instruction", sourceFile: "image_2.png", naturalSize: { width: 873, height: 34 }, area: { x: 93, y: 18, width: 873, height: 34 } });
  assert.deepEqual(imported.authoring.source.assets.map(({ sourceFile, sha256, role }) => ({ sourceFile, sha256, role })), [
    { sourceFile: "image_2.png", sha256: "b44b28059951ce821ceb0588fef367138910b7ac48e01fdc388de32b4a7164ea", role: "instruction" },
    { sourceFile: "showText.png", sha256: "b988b55e3356aa41d88093606f6f495008dcc2987ff5cb5f63fdcc30d1a87732", role: "show-text-auxiliary" },
  ]);
  assert.equal(imported.authoring.visualCapabilities.showText.enabled, true);
  assert.equal(imported.report.instructionAssetMatched, true);
  assert.equal(imported.report.showTextAuxiliaryAssetMatched, true);
});

test("Complete the Sentences import is deterministic, idempotent, and stores no raw XML or local paths", publisherEvidence, async () => {
  const first = await importUltimateB2CompleteSentencesPublisherSource(sourceFile);
  const second = await importUltimateB2CompleteSentencesPublisherSource(sourceFile);
  assert.deepEqual(second, first);
  const serialized = JSON.stringify(first.authoring);
  assert.doesNotMatch(serialized, /<params|<sentence|CDATA|tmp[\\/]|[A-Z]:[\\/]/i);
  assert.doesNotMatch(await readFile("src/data/ultimate-b2/readingExerciseAuthoringData.js", "utf8"), /tmp[\\/]complete-sentences|obj_params\.xml/);
});

test("limited publisher sentence parsing accepts the known tags and rejects arbitrary markup", () => {
  assert.deepEqual(parseCompleteSentencesPublisherText("<b>2</b>  Before <font face='Myriad Pro'>_____</font> <i>After</i>"), { number: 2, before: "Before ", after: " After" });
  assert.throws(() => parseCompleteSentencesPublisherText("<b>2</b> Before <script>bad</script> <font face='Myriad Pro'>_____</font>"), /unsupported publisher markup/);
  assert.throws(() => parseCompleteSentencesPublisherText("<b>2</b> no blank"), /exactly one/);
});
