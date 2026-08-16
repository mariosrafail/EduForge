import assert from "node:assert/strict";
import test from "node:test";

import { builderDocumentSha256 } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { compileUltimateB2ComponentReleaseV2 } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-compiler-v2.js";
import { resolvePublicationCompiler, verifyImmutableComponentRelease } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-compilers.js";
import {
  normalizeUltimateB2PublicReleaseV2Projection,
  normalizeUltimateB2ReleaseV2SourceSnapshot,
  normalizeUltimateB2TeacherReleaseV2Projection,
} from "../src/data/ultimate-b2/componentPublicationV2.js";
import { ultimateB2PublicationCanonicalSeeds } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-compiler.js";
import { compilePublicationV2Fixture, createPublicationV2FixtureSources, publicationV2Fixture } from "./fixtures/publication-v2.js";

function releaseRow(compiled) {
  return {
    compiler_id: compiled.compilerId,
    release_schema_version: compiled.releaseSchemaVersion,
    runtime_compatibility_sha256: compiled.compatibility,
    source_snapshot: compiled.sourceSnapshot,
    source_snapshot_sha256: compiled.sourceSnapshotSha256,
    public_projection: compiled.publicProjection,
    public_projection_sha256: compiled.publicProjectionSha256,
    teacher_projection: compiled.teacherProjection,
    teacher_projection_sha256: compiled.teacherProjectionSha256,
    asset_manifest: compiled.assetManifest,
    release_sha256: compiled.releaseSha256,
  };
}

function refreshSource(source) {
  source.sha256 = builderDocumentSha256(source.payload);
}

test("v2 source, public, and Teacher contracts are strict and integrity dispatch is compiler/schema-bound", () => {
  const compiled = compilePublicationV2Fixture();
  const seeds = ultimateB2PublicationCanonicalSeeds();
  assert.deepEqual(normalizeUltimateB2ReleaseV2SourceSnapshot(compiled.sourceSnapshot, seeds), compiled.sourceSnapshot);
  assert.deepEqual(normalizeUltimateB2PublicReleaseV2Projection(compiled.publicProjection, seeds), compiled.publicProjection);
  assert.deepEqual(normalizeUltimateB2TeacherReleaseV2Projection(compiled.teacherProjection, seeds, compiled.publicProjection), compiled.teacherProjection);
  assert.equal(verifyImmutableComponentRelease(releaseRow(compiled)).publicProjection.schemaVersion, "2.0");
  assert.equal(resolvePublicationCompiler(compiled.compilerId, "1.0"), null);
  assert.throws(() => verifyImmutableComponentRelease({ ...releaseRow(compiled), compiler_id: "unknown-compiler" }), /publication_compiler_mismatch/);

  for (const [value, normalize] of [
    [{ ...compiled.sourceSnapshot, unsupported: true }, (entry) => normalizeUltimateB2ReleaseV2SourceSnapshot(entry, seeds)],
    [{ ...compiled.publicProjection, unsupported: true }, (entry) => normalizeUltimateB2PublicReleaseV2Projection(entry, seeds)],
    [{ ...compiled.teacherProjection, unsupported: true }, (entry) => normalizeUltimateB2TeacherReleaseV2Projection(entry, seeds, compiled.publicProjection)],
  ]) assert.throws(() => normalize(value), /unsupported fields/);
  assert.doesNotMatch(JSON.stringify(compiled.publicProjection), new RegExp(publicationV2Fixture.teacherSentinel));
  assert.match(JSON.stringify(compiled.teacherProjection), new RegExp(publicationV2Fixture.teacherSentinel));
  const publicChoice = compiled.publicProjection.nativeActivities[publicationV2Fixture.singleChoiceId];
  const teacherChoice = compiled.teacherProjection.nativeActivities[publicationV2Fixture.singleChoiceId];
  assert.equal(publicChoice.kind, "single-choice");
  assert.equal(publicChoice.document.parts[0].interaction.questions.length, 2);
  assert.doesNotMatch(JSON.stringify(publicChoice), /correctOptionId|correctAnswers/);
  assert.equal(teacherChoice.document.parts[0].solution.correctAnswers.length, 2);
});

test("v2 output ordering and content-addressed image reuse are deterministic and exact", () => {
  const firstSources = createPublicationV2FixtureSources();
  const secondSources = createPublicationV2FixtureSources();
  secondSources.native.activities = Object.fromEntries(Object.entries(secondSources.native.activities).reverse());
  secondSources.native.assetRows.reverse();
  const first = compileUltimateB2ComponentReleaseV2(firstSources);
  const second = compileUltimateB2ComponentReleaseV2(secondSources);
  assert.equal(first.releaseSha256, second.releaseSha256);
  assert.equal(first.publicProjection.nativeActivities[publicationV2Fixture.imageId].document.parts[0].interaction.images.length, 2);
  assert.equal(first.assetManifest.filter((asset) => asset.role === "activity_artwork").length, 1);

  const extraAsset = structuredClone(first.publicProjection);
  extraAsset.assets.push({ sha256: "b".repeat(64), extension: "png", mediaType: "image/png", role: "activity_artwork" });
  assert.throws(() => normalizeUltimateB2PublicReleaseV2Projection(extraAsset, ultimateB2PublicationCanonicalSeeds()), /asset manifest is inconsistent/);
});

test("Single Choice private key changes deterministically change source and release identity", () => {
  const first = compilePublicationV2Fixture({ singleChoiceCorrectOptionIndexes: [1, 2] });
  const same = compilePublicationV2Fixture({ singleChoiceCorrectOptionIndexes: [1, 2] });
  const changed = compilePublicationV2Fixture({ singleChoiceCorrectOptionIndexes: [0, 2] });
  assert.equal(first.releaseSha256, same.releaseSha256);
  assert.notEqual(first.releaseSha256, changed.releaseSha256);
  assert.notEqual(first.sourceSnapshotSha256, changed.sourceSnapshotSha256);
  assert.deepEqual(first.publicProjection.nativeActivities[publicationV2Fixture.singleChoiceId], changed.publicProjection.nativeActivities[publicationV2Fixture.singleChoiceId]);
});

test("referenced native publication readiness rejects incomplete Open Response, Image, and Single Choice drafts", () => {
  const cases = [];
  const zeroQuestions = createPublicationV2FixtureSources();
  zeroQuestions.native.activities[publicationV2Fixture.openResponseId].public.payload.parts[0].interaction.questions = [];
  zeroQuestions.native.activities[publicationV2Fixture.openResponseId].teacher.payload.parts[0].solution.modelAnswers = [];
  cases.push(zeroQuestions);

  const emptyPrompt = createPublicationV2FixtureSources();
  emptyPrompt.native.activities[publicationV2Fixture.openResponseId].public.payload.parts[0].interaction.questions[0].prompt = "";
  cases.push(emptyPrompt);

  const emptyAnswer = createPublicationV2FixtureSources();
  emptyAnswer.native.activities[publicationV2Fixture.openResponseId].teacher.payload.parts[0].solution.modelAnswers[0].text = "";
  cases.push(emptyAnswer);

  const missingImageAlt = createPublicationV2FixtureSources();
  missingImageAlt.native.activities[publicationV2Fixture.imageId].public.payload.parts[0].interaction.images[0].altText = "";
  cases.push(missingImageAlt);

  const zeroImages = createPublicationV2FixtureSources();
  zeroImages.native.activities[publicationV2Fixture.imageId].public.payload.parts[0].interaction.images = [];
  zeroImages.native.activities[publicationV2Fixture.imageId].public.payload.assets = [];
  zeroImages.native.assetRows = [];
  cases.push(zeroImages);

  const tooFewOptions = createPublicationV2FixtureSources();
  tooFewOptions.native.activities[publicationV2Fixture.singleChoiceId].public.payload.parts[0].interaction.questions[0].options.splice(1);
  cases.push(tooFewOptions);

  const emptyOption = createPublicationV2FixtureSources();
  emptyOption.native.activities[publicationV2Fixture.singleChoiceId].public.payload.parts[0].interaction.questions[0].options[0].text = "";
  cases.push(emptyOption);

  const forgedAnswer = createPublicationV2FixtureSources();
  forgedAnswer.native.activities[publicationV2Fixture.singleChoiceId].teacher.payload.parts[0].solution.correctAnswers[0].correctOptionId = forgedAnswer.native.activities[publicationV2Fixture.singleChoiceId].public.payload.parts[0].interaction.questions[1].options[0].id;
  cases.push(forgedAnswer);

  const missingAnswer = createPublicationV2FixtureSources();
  missingAnswer.native.activities[publicationV2Fixture.singleChoiceId].teacher.payload.parts[0].solution.correctAnswers.pop();
  cases.push(missingAnswer);

  for (const sources of cases) {
    for (const entry of Object.values(sources.native.activities)) {
      refreshSource(entry.public);
      refreshSource(entry.teacher);
    }
    assert.throws(() => compileUltimateB2ComponentReleaseV2(sources), (error) => ["native_activity_not_ready", "native_activity_pair_invalid"].includes(error.code));
  }
  assert.equal(compilePublicationV2Fixture().publicProjection.nativeActivities[publicationV2Fixture.imageId].document.parts[0].interaction.images.length, 2);
});
