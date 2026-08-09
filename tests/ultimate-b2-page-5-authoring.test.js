import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createServer } from "vite";

import { buildUltimateB2TeacherSolutionPayload } from "../netlify/functions/_ultimate-b2-teacher-solutions.js";
import { ultimateB2Page5BuilderPlugin } from "../scripts/ultimate-b2/page5-builder-vite-plugin.mjs";
import openResponse from "../src/data/ultimate-b2/authoring/unit-01-page-5-exercise-1.open-response.json" with { type: "json" };
import publisherDisplay from "../src/data/ultimate-b2/authoring/unit-01-page-5-exercise-2.publisher-display.json" with { type: "json" };
import { buildUltimateB2ActivityNavigation } from "../src/apps/ultimate-b2-builder/activityBuilderNavigation.js";
import { ultimateB2ActivityEditorMetadata } from "../src/apps/ultimate-b2-builder/activityEditorMetadata.js";
import { ultimateB2StudentsBookAuthoringActivities } from "../src/data/ultimate-b2/studentsBookAuthoringCatalog.js";
import {
  normalizeUltimateB2Page5OpenResponseAuthoring,
  normalizeUltimateB2Page5PublisherDisplayAuthoring,
  normalizeUltimateB2Page5TeacherAnswers,
} from "../src/data/ultimate-b2/page5AuthoringSchema.js";
import teacherAnswers from "../netlify/functions/_ultimate-b2-unit1-opener-model-answers.json" with { type: "json" };

const openResponseId = "ultimate-b2-sb-u1-p1-o1";
const publisherDisplayId = "ultimate-b2-sb-u1-p1-o2";

async function fixtureServer() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "hhplms-page5-authoring-"));
  const openResponsePath = path.join(directory, "open-response.json");
  const publisherDisplayPath = path.join(directory, "publisher-display.json");
  const teacherAnswersPath = path.join(directory, "teacher-answers.json");
  await Promise.all([
    writeFile(openResponsePath, `${JSON.stringify(openResponse, null, 2)}\n`),
    writeFile(publisherDisplayPath, `${JSON.stringify(publisherDisplay, null, 2)}\n`),
    writeFile(teacherAnswersPath, `${JSON.stringify(teacherAnswers, null, 2)}\n`),
  ]);
  const server = await createServer({
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    plugins: [ultimateB2Page5BuilderPlugin({ openResponsePath, publisherDisplayPath, teacherAnswersPath })],
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  return { directory, server, base: `http://127.0.0.1:${server.httpServer.address().port}`, openResponsePath, publisherDisplayPath, teacherAnswersPath };
}

test("Activity Builder navigation follows authoritative Unit → Page / Spread → Exercise order", () => {
  const groups = buildUltimateB2ActivityNavigation(ultimateB2StudentsBookAuthoringActivities, ultimateB2ActivityEditorMetadata);
  assert.deepEqual(groups.map((unit) => unit.label), ["Unit 1", "Unit 2"]);
  const unit1 = groups[0];
  assert.equal(unit1.pages[0].pageLabel, "Page 5");
  assert.equal(unit1.pages[0].sectionTitle, "Unit opener");
  assert.deepEqual(unit1.pages[0].activities.map((activity) => activity.exerciseLabel), ["Exercise 1", "Exercise 2"]);
  assert.deepEqual(unit1.pages[0].activities.map((activity) => activity.activityKey), [openResponseId, publisherDisplayId]);
  const reading = unit1.pages.find((page) => page.pageSpread === "6-7" && page.sectionTitle === "Reading");
  assert.deepEqual(reading.activities.slice(0, 5).map((activity) => activity.activityKey), [
    "ultimate-b2-sb-u1-p2-o1", "ultimate-b2-sb-u1-p2-o2", "ultimate-b2-sb-u1-p2-o3", "ultimate-b2-sb-u1-p2-o4", "ultimate-b2-sb-u1-p2-o5",
  ]);
  assert.deepEqual(reading.activities.slice(0, 3).map((activity) => activity.editorLabel), ["Video", "Listening", "Multiple Choice"]);
  assert.equal(reading.activities[3].configurable, false);
  assert.equal(reading.activities[3].editorStatus, "Not configurable yet");
});

test("Page 5 schemas keep stable identities, allowlisted bindings, and exact fields", () => {
  assert.deepEqual(normalizeUltimateB2Page5OpenResponseAuthoring(openResponse), openResponse);
  assert.deepEqual(normalizeUltimateB2Page5PublisherDisplayAuthoring(publisherDisplay), publisherDisplay);
  assert.deepEqual(normalizeUltimateB2Page5TeacherAnswers(teacherAnswers), teacherAnswers);
  assert.throws(() => normalizeUltimateB2Page5OpenResponseAuthoring({ ...openResponse, arbitraryPath: "C:/escape" }), /unknown fields/);
  assert.throws(() => normalizeUltimateB2Page5OpenResponseAuthoring({ ...openResponse, questions: [{ ...openResponse.questions[0], id: "changed" }, ...openResponse.questions.slice(1)] }), /fixed/);
  assert.throws(() => normalizeUltimateB2Page5PublisherDisplayAuthoring({ ...publisherDisplay, headingArtworkBinding: "../../escape.png" }), /Unknown/);
  assert.throws(() => normalizeUltimateB2Page5PublisherDisplayAuthoring({ ...publisherDisplay, bullets: [] }), /1–8/);
  assert.throws(() => normalizeUltimateB2Page5TeacherAnswers({ ...teacherAnswers, modelAnswers: teacherAnswers.modelAnswers.map((answer, index) => index ? answer : { ...answer, text: "<script>alert(1)</script>" }) }), /HTML/);
});

test("Page 5 endpoint saves and reloads public prompts and Teacher-private answers without changing question IDs", async () => {
  const fixture = await fixtureServer();
  try {
    const url = `${fixture.base}/__hhplms/ultimate-b2-page-5-authoring?activityId=${openResponseId}`;
    const loaded = await fetch(url).then((response) => response.json());
    const ids = loaded.publicAuthoring.questions.map((question) => question.id);
    loaded.publicAuthoring.questions[0].prompt = "Edited isolated question?";
    loaded.teacherAuthoring.modelAnswers[0].text = "Edited isolated Teacher model answer.";
    const save = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(loaded) });
    assert.equal(save.status, 200);
    const reloaded = await fetch(url).then((response) => response.json());
    assert.equal(reloaded.publicAuthoring.questions[0].prompt, "Edited isolated question?");
    assert.equal(reloaded.teacherAuthoring.modelAnswers[0].text, "Edited isolated Teacher model answer.");
    assert.deepEqual(reloaded.publicAuthoring.questions.map((question) => question.id), ids);
    assert.equal(JSON.parse(await readFile(fixture.teacherAnswersPath, "utf8")).modelAnswers[0].text, "Edited isolated Teacher model answer.");

    assert.equal((await fetch(url, { method: "PUT" })).status, 405);
    assert.equal((await fetch(url, { method: "POST", body: JSON.stringify(loaded) })).status, 415);
    assert.equal((await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...loaded, path: "C:/escape" }) })).status, 400);
    assert.equal((await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...loaded, teacherAuthoring: { ...loaded.teacherAuthoring, modelAnswers: [] } }) })).status, 400);
    assert.equal((await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...loaded, padding: "x".repeat(25_000) }) })).status, 400);
  } finally {
    await fixture.server.close();
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test("Page 5 publisher bullets can be edited, added, reordered, deleted, and reloaded in order", async () => {
  const fixture = await fixtureServer();
  try {
    const url = `${fixture.base}/__hhplms/ultimate-b2-page-5-authoring?activityId=${publisherDisplayId}`;
    const loaded = await fetch(url).then((response) => response.json());
    loaded.publicAuthoring.bullets[0].text = "edited favourite";
    loaded.publicAuthoring.bullets.push({ id: "bullet-4", text: "new final point" });
    [loaded.publicAuthoring.bullets[0], loaded.publicAuthoring.bullets[1]] = [loaded.publicAuthoring.bullets[1], loaded.publicAuthoring.bullets[0]];
    loaded.publicAuthoring.bullets.splice(2, 1);
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(loaded) });
    assert.equal(response.status, 200);
    const reloaded = await fetch(url).then((result) => result.json());
    assert.deepEqual(reloaded.publicAuthoring.bullets.map((bullet) => bullet.text), ["how often you watch films, plays and TV programmes", "edited favourite", "new final point"]);
    assert.deepEqual(JSON.parse(await readFile(fixture.publisherDisplayPath, "utf8")), reloaded.publicAuthoring);
  } finally {
    await fixture.server.close();
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test("Page 5 model answers stay in Teacher payload/offline source and out of public/student authoring", async () => {
  const distinctive = "Films are an art form which involve many artistic processes";
  const teacherPayload = JSON.stringify(buildUltimateB2TeacherSolutionPayload(openResponseId));
  const [publicOpen, publicDisplay, studentRuntime, publicDataModule, teacherSource, webVerifier, studentVerifier] = await Promise.all([
    readFile("src/data/ultimate-b2/authoring/unit-01-page-5-exercise-1.open-response.json", "utf8"),
    readFile("src/data/ultimate-b2/authoring/unit-01-page-5-exercise-2.publisher-display.json", "utf8"),
    readFile("src/data/ultimate-b2/generated/students-book.runtime.json", "utf8"),
    readFile("src/data/ultimate-b2/page5AuthoringData.js", "utf8"),
    readFile("netlify/functions/_ultimate-b2-unit1-opener-model-answers.json", "utf8"),
    readFile("scripts/verify-web-bundle-safety.mjs", "utf8"),
    readFile("scripts/android/verify-student-bundle.mjs", "utf8"),
  ]);
  assert.match(teacherPayload, new RegExp(distinctive));
  assert.match(teacherSource, new RegExp(distinctive));
  assert.match(webVerifier, new RegExp(distinctive));
  assert.match(studentVerifier, new RegExp(distinctive));
  for (const publicSource of [publicOpen, publicDisplay, studentRuntime, publicDataModule]) assert.doesNotMatch(publicSource, new RegExp(distinctive));
});

test("Builder registry keeps supported drafts mounted and exposes focused Page 5 editors", async () => {
  const [shell, registry, metadata, openBuilder, displayBuilder, navigation] = await Promise.all([
    readFile("src/apps/ultimate-b2-builder/UltimateB2ActivityBuilder.jsx", "utf8"),
    readFile("src/apps/ultimate-b2-builder/activityEditorRegistry.js", "utf8"),
    readFile("src/apps/ultimate-b2-builder/activityEditorMetadata.js", "utf8"),
    readFile("src/apps/ultimate-b2-builder/UltimateB2OpenResponseBuilder.jsx", "utf8"),
    readFile("src/apps/ultimate-b2-builder/UltimateB2PublisherDisplayBuilder.jsx", "utf8"),
    readFile("src/apps/ultimate-b2-builder/UltimateB2ActivityNavigation.jsx", "utf8"),
  ]);
  assert.match(shell, /ultimateB2StudentsBookAuthoringActivities/);
  assert.match(shell, /Object\.entries\(ultimateB2ActivityEditorRegistry\)/);
  assert.match(shell, /hidden=\{selectedActivityId !== activityKey\}/);
  for (const label of ["Open response", "Publisher display", "Video", "Listening", "Multiple Choice"]) assert.match(metadata, new RegExp(label));
  assert.match(navigation, /Not configurable yet|editorStatus/);
  assert.match(openBuilder, /Content[\s\S]*Teacher Answers[\s\S]*Preview/);
  assert.match(openBuilder, /Unsaved changes/);
  assert.match(displayBuilder, /Add bullet[\s\S]*Move bullet[\s\S]*Delete bullet/);
  assert.match(displayBuilder, /Unsaved changes/);
});
