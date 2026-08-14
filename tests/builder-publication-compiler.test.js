import assert from "node:assert/strict";
import test from "node:test";

import { builderDocumentSha256 } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { compileUltimateB2ComponentRelease, ultimateB2PublicationCanonicalSeeds } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-compiler.js";
import { resolveBuilderContentResource } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-registry.js";
import { assertStudentSafeReleaseProjection, hydrateUltimateB2ReleaseImport } from "../src/data/ultimate-b2/componentPublication.js";
import { createUltimateB2HostedOpenResponseSeed } from "../src/data/ultimate-b2/hostedOpenResponseDraft.js";
import { findStudentsBookImplementation } from "../src/data/ultimate-b2/studentsBookCatalog.js";
import { normalizeUltimateB2HostedOpenResponseTeacherImport } from "../src/data/ultimate-b2/hostedOpenResponseImport.js";
import { createEmptyHostedTeacherUiDocument } from "../src/data/ultimate-b2/hostedTeacherUiDocument.js";
import { importUltimateB2HostedOpenResponseBundle } from "../scripts/ultimate-b2/open-response-hosted-import.js";
import { task6SourceBundle } from "./fixtures/open-response-task6.js";

const activityId = "ultimate-b2-sb-u2-p1-o1";

test("component release compiler materializes a deterministic canonical baseline", () => {
  const first = compileUltimateB2ComponentRelease();
  const second = compileUltimateB2ComponentRelease();
  assert.equal(first.releaseSha256, second.releaseSha256);
  assert.equal(first.sourceSnapshotSha256, second.sourceSnapshotSha256);
  assert.deepEqual(first.publicProjection, second.publicProjection);
  assert.equal(first.sourceSnapshot.hotspots.revision, 0);
  assert.equal(first.sourceSnapshot.teacherUi.revision, 0);
  assertStudentSafeReleaseProjection(first.publicProjection);
  for (const forbidden of ["acceptedAnswers", "teacherProjection", "modelAnswer", "rawXml", "archiveManifest", "signedUrl"]) assert.doesNotMatch(JSON.stringify(first.publicProjection), new RegExp(forbidden, "i"));
});

test("saved Open Response text changes release identity while retaining exact source revision", async () => {
  const resource = await resolveBuilderContentResource("ultimate-b2", "ultimate-b2-students-book", "open-response", activityId);
  const payload = structuredClone(resource.baseline());
  payload.questions[0].prompt = "Published version A";
  const releaseA = compileUltimateB2ComponentRelease({ documents: { openResponse: { [activityId]: { resource, revision: 7, sha256: builderDocumentSha256(payload), payload } } } });
  payload.questions[0].prompt = "Draft version B";
  const releaseB = compileUltimateB2ComponentRelease({ documents: { openResponse: { [activityId]: { resource, revision: 8, sha256: builderDocumentSha256(payload), payload } } } });
  assert.equal(releaseA.sourceSnapshot.openResponse[activityId].document.revision, 7);
  assert.equal(releaseA.publicProjection.activities[activityId].authoring.questions[0].prompt, "Published version A");
  assert.equal(releaseB.publicProjection.activities[activityId].authoring.questions[0].prompt, "Draft version B");
  assert.notEqual(releaseA.releaseSha256, releaseB.releaseSha256);
  assert.equal(releaseA.publicProjection.activities[activityId].authoring.questions[0].prompt, "Published version A");
});

test("release asset references hydrate only through an explicit trusted path policy", () => {
  const seed = createUltimateB2HostedOpenResponseSeed(findStudentsBookImplementation(activityId));
  const sha = "a".repeat(64);
  const imported = {
    schemaVersion: "1.0", activityId, surface: { width: 640, height: 480 },
    visualCapabilities: { instructionImage: null, showText: { enabled: false, showTextImage: null } },
    artworkLayers: [{ id: `${activityId}-artwork-1`, binding: `open-response.${activityId}.artwork.1.${sha.slice(0, 12)}`, asset: { sha256: sha, extension: "png", mediaType: "image/png", role: "open_response_artwork" }, sha256: sha, naturalSize: { width: 30, height: 20 }, area: { x: 20, y: 20, width: 30, height: 20 }, order: 0, altText: "", accessibilityStatus: "review-required" }],
    questions: seed.questions.map((question, index) => ({ id: question.id, prompt: question.prompt, promptArea: { x: 30, y: 70 + index * 100, width: 500, height: 28 }, promptStyle: { fontFamily: "Fira Sans", fontSize: 21, color: "#000000", align: "left" }, responseRegion: { id: `${question.id}-response`, ariaLabel: `Response ${index + 1}`, area: { x: 50, y: 100 + index * 100, width: 500, height: 48 }, presentation: { paddingX: 0, paddingY: 0, lineSpacing: 24, fontScale: 1, lineCount: 2, linePositions: [0, 24], lineWidth: 500, fontFamily: "Fira Sans", fontSize: 21, color: "#000000", align: "left" } } })),
  };
  const hydrated = hydrateUltimateB2ReleaseImport(imported, activityId, seed.questions.map((question) => question.id), (asset) => `/.netlify/functions/book-content?action=published-release-asset&bookSlug=ultimate-b2&componentSlug=ultimate-b2-students-book&releaseId=10000000-0000-4000-8000-000000000099&sha256=${asset.sha256}&extension=${asset.extension}`);
  assert.match(hydrated.artworkLayers[0].assetPath, /published-release-asset/);
  assert.throws(() => hydrateUltimateB2ReleaseImport(imported, activityId, seed.questions.map((question) => question.id), () => "https://attacker.example/file.png"), /identity is invalid/);
  assert.equal(Object.keys(ultimateB2PublicationCanonicalSeeds()).length >= 2, true);
});

test("effective composition is canonical then source import then saved public text", async () => {
  const resource = await resolveBuilderContentResource("ultimate-b2", "ultimate-b2-students-book", "open-response", activityId);
  const seed = resource.baseline();
  const publicProjection = {
    schemaVersion: "1.0", activityId, surface: { width: 640, height: 480 }, visualCapabilities: { instructionImage: null, showText: { enabled: false, showTextImage: null } }, artworkLayers: [],
    questions: seed.questions.map((question, index) => ({ id: question.id, prompt: `Imported prompt ${index + 1}`, promptArea: { x: 30, y: 70 + index * 100, width: 500, height: 28 }, promptStyle: { fontFamily: "Fira Sans", fontSize: 21, color: "#000000", align: "left" }, responseRegion: { id: `${question.id}-response`, ariaLabel: `Response ${index + 1}`, area: { x: 50, y: 100 + index * 100, width: 500, height: 48 }, presentation: { paddingX: 0, paddingY: 0, lineSpacing: 24, fontScale: 1, lineCount: 2, linePositions: [0, 24], lineWidth: 500, fontFamily: "Fira Sans", fontSize: 21, color: "#000000", align: "left" } } })),
  };
  const teacherProjection = { schemaVersion: "1.0", activityId, answers: seed.questions.map((question, index) => ({ questionId: question.id, text: `Model ${index + 1}` })) };
  normalizeUltimateB2HostedOpenResponseTeacherImport(teacherProjection, activityId, seed.questions.map((question) => question.id));
  const importedOnly = compileUltimateB2ComponentRelease({ imports: { [activityId]: { revision: 3, fingerprint: "c".repeat(64), publicProjection, teacherProjection } } });
  assert.equal(importedOnly.publicProjection.activities[activityId].authoring.questions[0].prompt, "Imported prompt 1");
  const draft = structuredClone(seed); draft.questions[0].prompt = "Saved Task 5 wins";
  const withDraft = compileUltimateB2ComponentRelease({ documents: { openResponse: { [activityId]: { resource, revision: 4, sha256: builderDocumentSha256(draft), payload: draft } } }, imports: { [activityId]: { revision: 3, fingerprint: "c".repeat(64), publicProjection, teacherProjection } } });
  assert.equal(withDraft.publicProjection.activities[activityId].authoring.questions[0].prompt, "Saved Task 5 wins");
  assert.equal(withDraft.teacherProjection.solutions[activityId].answers[0].text, "Model 1");
});

test("Task 6 artwork is represented once by immutable identity and Teacher answers stay private", async () => {
  const seed = createUltimateB2HostedOpenResponseSeed(findStudentsBookImplementation(activityId));
  const imported = await importUltimateB2HostedOpenResponseBundle({ activityId, files: await task6SourceBundle(), expectedQuestionIds: seed.questions.map((question) => question.id), assetPathFor: (sha, extension) => `/preview/open-response-assets/${sha}${extension}` });
  const compiled = compileUltimateB2ComponentRelease({ imports: { [activityId]: { revision: 5, fingerprint: imported.fingerprint, publicProjection: imported.publicProjection, teacherProjection: imported.teacherProjection } } });
  assert.equal(compiled.assetManifest.length, 1);
  assert.equal(compiled.publicProjection.assets.length, 1);
  assert.equal(compiled.publicProjection.activities[activityId].import.artworkLayers[0].asset.sha256, imported.publicProjection.artworkLayers[0].sha256);
  assert.equal("assetPath" in compiled.publicProjection.activities[activityId].import.artworkLayers[0], false);
  assert.doesNotMatch(JSON.stringify(compiled.publicProjection), /Imported model/i);
  assert.match(compiled.teacherProjection.solutions[activityId].answers[0].text, /Imported model/);
});

test("saved Task 7 UI is pinned only in the Teacher projection and release asset manifest", () => {
  const sha256 = "d".repeat(64);
  const document = { ...createEmptyHostedTeacherUiDocument(), assets: { "background.main": { sha256, extension: "png", mediaType: "image/png", sizeBytes: 68, width: 1, height: 1, originalFilename: "background.png" } } };
  const compiled = compileUltimateB2ComponentRelease({ documents: { teacherUi: { revision: 6, sha256: builderDocumentSha256(document), payload: document } } });
  assert.equal(compiled.sourceSnapshot.teacherUi.revision, 6);
  assert.equal(compiled.teacherProjection.ui.assets["background.main"].sha256, sha256);
  assert.equal(compiled.assetManifest.some((asset) => asset.sha256 === sha256 && asset.role === "teacher_ui"), true);
  assert.equal(compiled.publicProjection.assets.some((asset) => asset.sha256 === sha256), false);
  assert.doesNotMatch(JSON.stringify(compiled.publicProjection), /background\.main/);
});
