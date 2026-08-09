import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createServer } from "vite";

import { buildUltimateB2TeacherSolutionPayload } from "../netlify/functions/_ultimate-b2-teacher-solutions.js";
import { ultimateB2Page5BuilderPlugin } from "../scripts/ultimate-b2/page5-builder-vite-plugin.mjs";
import { buildUltimateB2ActivityNavigation } from "../src/apps/ultimate-b2-builder/activityBuilderNavigation.js";
import { ultimateB2ActivityEditorMetadata } from "../src/apps/ultimate-b2-builder/activityEditorMetadata.js";
import imageActivity from "../src/data/ultimate-b2/authoring/unit-01-page-5-exercise-2.image.json" with { type: "json" };
import openResponse from "../src/data/ultimate-b2/authoring/unit-01-page-5-exercise-1.open-response.json" with { type: "json" };
import { ultimateB2StudentsBookAuthoringActivities } from "../src/data/ultimate-b2/studentsBookAuthoringCatalog.js";
import {
  normalizeUltimateB2Page5ImageAuthoring,
  normalizeUltimateB2Page5OpenResponseAuthoring,
  normalizeUltimateB2Page5TeacherAnswers,
} from "../src/data/ultimate-b2/page5AuthoringSchema.js";
import teacherAnswers from "../netlify/functions/_ultimate-b2-unit1-opener-model-answers.json" with { type: "json" };

const openResponseId = "ultimate-b2-sb-u1-p1-o1";
const imageActivityId = "ultimate-b2-sb-u1-p1-o2";

async function fixtureServer() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "hhplms-page5-authoring-"));
  const openResponsePath = path.join(directory, "open-response.json");
  const imagePath = path.join(directory, "image.json");
  const teacherAnswersPath = path.join(directory, "teacher-answers.json");
  await Promise.all([
    writeFile(openResponsePath, `${JSON.stringify(openResponse, null, 2)}\n`),
    writeFile(imagePath, `${JSON.stringify(imageActivity, null, 2)}\n`),
    writeFile(teacherAnswersPath, `${JSON.stringify(teacherAnswers, null, 2)}\n`),
  ]);
  const server = await createServer({ configFile: false, appType: "custom", logLevel: "silent", plugins: [ultimateB2Page5BuilderPlugin({ openResponsePath, imagePath, teacherAnswersPath })], server: { host: "127.0.0.1", port: 0 } });
  await server.listen();
  return { directory, server, base: `http://127.0.0.1:${server.httpServer.address().port}`, imagePath, teacherAnswersPath };
}

test("Activity Builder navigation follows authoritative Unit to Page to Exercise order", () => {
  const groups = buildUltimateB2ActivityNavigation(ultimateB2StudentsBookAuthoringActivities, ultimateB2ActivityEditorMetadata);
  assert.deepEqual(groups.map((unit) => unit.label), ["Unit 1", "Unit 2"]);
  const unit1 = groups[0];
  assert.equal(unit1.pages[0].pageLabel, "Page 5");
  assert.deepEqual(unit1.pages[0].activities.map((activity) => activity.activityKey), [openResponseId, imageActivityId]);
  const reading = unit1.pages.find((page) => page.pageSpread === "6-7" && page.sectionTitle === "Reading");
  assert.deepEqual(reading.activities.slice(0, 5).map((activity) => activity.editorLabel), ["Video", "Listening", "Multiple Choice", "Complete the Sentences", "Open Answer"]);
  assert.ok(reading.activities.slice(0, 5).every((activity) => activity.configurable));
});

test("Page 5 schemas keep stable identities, allowlisted bindings, and exact fields", () => {
  assert.deepEqual(normalizeUltimateB2Page5OpenResponseAuthoring(openResponse), openResponse);
  assert.deepEqual(normalizeUltimateB2Page5ImageAuthoring(imageActivity), imageActivity);
  assert.deepEqual(normalizeUltimateB2Page5TeacherAnswers(teacherAnswers), teacherAnswers);
  assert.throws(() => normalizeUltimateB2Page5OpenResponseAuthoring({ ...openResponse, arbitraryPath: "C:/escape" }), /unknown fields/);
  assert.throws(() => normalizeUltimateB2Page5ImageAuthoring({ ...imageActivity, mainImage: "../../escape.png" }), /Unknown/);
  assert.throws(() => normalizeUltimateB2Page5ImageAuthoring({ ...imageActivity, bullets: [] }), /unknown fields/);
  assert.throws(() => normalizeUltimateB2Page5TeacherAnswers({ ...teacherAnswers, modelAnswers: [] }), /three model answers/);
});

test("Page 5 endpoint saves and reloads open-response public prompts and Teacher-private answers", async () => {
  const fixture = await fixtureServer();
  try {
    const url = `${fixture.base}/__hhplms/ultimate-b2-page-5-authoring?activityId=${openResponseId}`;
    const loaded = await fetch(url).then((response) => response.json());
    const ids = loaded.publicAuthoring.questions.map((question) => question.id);
    loaded.publicAuthoring.questions[0].prompt = "Edited isolated question?";
    loaded.teacherAuthoring.modelAnswers[0].text = "Edited isolated Teacher model answer.";
    assert.equal((await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(loaded) })).status, 200);
    const reloaded = await fetch(url).then((response) => response.json());
    assert.equal(reloaded.publicAuthoring.questions[0].prompt, "Edited isolated question?");
    assert.equal(reloaded.teacherAuthoring.modelAnswers[0].text, "Edited isolated Teacher model answer.");
    assert.deepEqual(reloaded.publicAuthoring.questions.map((question) => question.id), ids);
    assert.equal(JSON.parse(await readFile(fixture.teacherAnswersPath, "utf8")).modelAnswers[0].text, "Edited isolated Teacher model answer.");
    assert.equal((await fetch(url, { method: "PUT" })).status, 405);
    assert.equal((await fetch(url, { method: "POST", body: JSON.stringify(loaded) })).status, 415);
    assert.equal((await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...loaded, path: "C:/escape" }) })).status, 400);
  } finally { await fixture.server.close(); await rm(fixture.directory, { recursive: true, force: true }); }
});

test("Page 5 Exercise 2 is a generic image activity with no bullet authoring", async () => {
  const fixture = await fixtureServer();
  try {
    const url = `${fixture.base}/__hhplms/ultimate-b2-page-5-authoring?activityId=${imageActivityId}`;
    const loaded = await fetch(url).then((response) => response.json());
    loaded.publicAuthoring.mainImageAlt = "Edited discussion prompt image description.";
    assert.equal((await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(loaded) })).status, 200);
    const reloaded = await fetch(url).then((response) => response.json());
    assert.equal(reloaded.publicAuthoring.mainImageAlt, "Edited discussion prompt image description.");
    assert.equal(reloaded.publicAuthoring.mainImage, "unit1.page5.exercise2.main-content");
    assert.equal("bullets" in reloaded.publicAuthoring, false);
    assert.deepEqual(JSON.parse(await readFile(fixture.imagePath, "utf8")), reloaded.publicAuthoring);
  } finally { await fixture.server.close(); await rm(fixture.directory, { recursive: true, force: true }); }
});

test("Page 5 model answers stay in Teacher payload and out of public authoring", async () => {
  const distinctive = "Films are an art form which involve many artistic processes";
  const sources = await Promise.all([
    readFile("src/data/ultimate-b2/authoring/unit-01-page-5-exercise-1.open-response.json", "utf8"),
    readFile("src/data/ultimate-b2/authoring/unit-01-page-5-exercise-2.image.json", "utf8"),
    readFile("src/data/ultimate-b2/generated/students-book.runtime.json", "utf8"),
    readFile("src/data/ultimate-b2/page5AuthoringData.js", "utf8"),
  ]);
  assert.match(JSON.stringify(buildUltimateB2TeacherSolutionPayload(openResponseId)), new RegExp(distinctive));
  for (const source of sources) assert.doesNotMatch(source, new RegExp(distinctive));
});

test("Builder registry exposes focused Page 5 and Reading editors", async () => {
  const [registry, metadata, openBuilder, imageBuilder, completeBuilder, debateBuilder] = await Promise.all([
    readFile("src/apps/ultimate-b2-builder/activityEditorRegistry.js", "utf8"),
    readFile("src/apps/ultimate-b2-builder/activityEditorMetadata.js", "utf8"),
    readFile("src/apps/ultimate-b2-builder/UltimateB2OpenResponseBuilder.jsx", "utf8"),
    readFile("src/apps/ultimate-b2-builder/UltimateB2ImageBuilder.jsx", "utf8"),
    readFile("src/apps/ultimate-b2-builder/UltimateB2CompleteSentencesBuilder.jsx", "utf8"),
    readFile("src/apps/ultimate-b2-builder/UltimateB2DebateClubBuilder.jsx", "utf8"),
  ]);
  for (const label of ["Open response", "Image", "Video", "Listening", "Multiple Choice", "Complete the Sentences", "Open Answer"]) assert.match(metadata, new RegExp(label));
  assert.match(openBuilder, /Content[\s\S]*Teacher Answers[\s\S]*Preview/);
  assert.match(imageBuilder, /Main horizontal image/);
  assert.doesNotMatch(imageBuilder, /bullet/i);
  assert.match(completeBuilder, /Content[\s\S]*Blanks[\s\S]*Preview/);
  assert.match(debateBuilder, /Parts[\s\S]*Preview/);
  assert.match(registry, /UltimateB2CompleteSentencesBuilder[\s\S]*UltimateB2DebateClubBuilder/);
});
