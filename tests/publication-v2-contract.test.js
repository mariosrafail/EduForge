import assert from "node:assert/strict";
import test from "node:test";

import { builderDocumentSha256 } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import {
  compileUltimateB2ComponentReleaseV2,
  isUltimateB2PublicationV2NativeKind,
  reconstructUltimateB2PublicationV2Compatibility,
  resolveUltimateB2PublicationV2CompatibilityVariant,
  ultimateB2PublicationV2Compatibility,
  ultimateB2PublicationV2CompatibilityDescriptor,
  ULTIMATE_B2_PUBLICATION_V2_COMPATIBILITY_VARIANTS,
} from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-compiler-v2.js";
import {
  ReleaseCompatibilityVariantError,
  resolvePublicationCompiler,
  verifyImmutableComponentRelease,
} from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-compilers.js";
import {
  normalizeUltimateB2PublicReleaseV2Projection,
  normalizeUltimateB2ReleaseV2SourceSnapshot,
  normalizeUltimateB2TeacherReleaseV2Projection,
  ULTIMATE_B2_COMPONENT_RELEASE_V2_EXPANDED_NATIVE_KINDS,
  ULTIMATE_B2_COMPONENT_RELEASE_V2_COMPLETE_SENTENCES_NATIVE_KINDS,
  ULTIMATE_B2_COMPONENT_RELEASE_V2_INITIAL_NATIVE_KINDS,
  ULTIMATE_B2_COMPONENT_RELEASE_V2_LISTENING_NATIVE_KINDS,
  ULTIMATE_B2_COMPONENT_RELEASE_V2_DRAG_DROP_NATIVE_KINDS,
} from "../src/data/ultimate-b2/componentPublicationV2.js";
import { NATIVE_ACTIVITY_KINDS } from "../src/data/native-activities/nativeActivityKinds.js";
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

function historicalV2Release() {
  const sources = createPublicationV2FixtureSources();
  const laterNativeActivityIds = new Set([publicationV2Fixture.singleChoiceId, publicationV2Fixture.dragDropId]);
  sources.native.index.payload.activities = sources.native.index.payload.activities
    .filter((entry) => !laterNativeActivityIds.has(entry.activityId));
  for (const activityId of laterNativeActivityIds) delete sources.native.activities[activityId];
  sources.native.assetRows = sources.native.assetRows
    .filter((asset) => asset.id !== publicationV2Fixture.dragDropAssetId);
  delete sources.unitExtras;
  for (const hotspots of Object.values(sources.documents.hotspots.payload.pages)) {
    for (let index = hotspots.length - 1; index >= 0; index -= 1) {
      if (laterNativeActivityIds.has(hotspots[index].activityKey)) hotspots.splice(index, 1);
    }
  }
  refreshSource(sources.native.index);
  refreshSource(sources.documents.hotspots);

  const compiled = compileUltimateB2ComponentReleaseV2(sources);
  const historicalVariant = ULTIMATE_B2_PUBLICATION_V2_COMPATIBILITY_VARIANTS
    .find((variant) => variant.name === "initial-image-open-response");
  const { unitExtras: _sourceUnitExtras, pageLibrary: _sourcePageLibrary, ...sourceSnapshot } = compiled.sourceSnapshot;
  const { unitExtras: _publicUnitExtras, activePageIds: _activePageIds, ...currentPublicProjection } = compiled.publicProjection;
  const publicProjection = { ...currentPublicProjection, compatibility: historicalVariant.compatibility };
  return {
    ...compiled,
    compatibility: historicalVariant.compatibility,
    sourceSnapshot,
    sourceSnapshotSha256: builderDocumentSha256(sourceSnapshot),
    publicProjection,
    publicProjectionSha256: builderDocumentSha256(publicProjection),
    releaseSha256: builderDocumentSha256({
      compatibility: historicalVariant.compatibility,
      sourceSnapshot,
      publicProjection,
      teacherProjection: compiled.teacherProjection,
    }),
  };
}

function refreshReleaseHashes(release) {
  release.source_snapshot_sha256 = builderDocumentSha256(release.source_snapshot);
  release.public_projection_sha256 = builderDocumentSha256(release.public_projection);
  release.teacher_projection_sha256 = builderDocumentSha256(release.teacher_projection);
  release.release_sha256 = builderDocumentSha256({
    compatibility: release.runtime_compatibility_sha256,
    sourceSnapshot: release.source_snapshot,
    publicProjection: release.public_projection,
    teacherProjection: release.teacher_projection,
  });
}

test("v2 compatibility variants and capability sets are frozen and reproducible", () => {
  assert.deepEqual(
    ULTIMATE_B2_PUBLICATION_V2_COMPATIBILITY_VARIANTS.map(({ name, nativeKinds }) => ({ name, nativeKinds })),
    [
      { name: "initial-image-open-response", nativeKinds: ULTIMATE_B2_COMPONENT_RELEASE_V2_INITIAL_NATIVE_KINDS },
      { name: "single-choice-expanded", nativeKinds: ULTIMATE_B2_COMPONENT_RELEASE_V2_EXPANDED_NATIVE_KINDS },
      { name: "complete-sentences-expanded", nativeKinds: ULTIMATE_B2_COMPONENT_RELEASE_V2_COMPLETE_SENTENCES_NATIVE_KINDS },
      { name: "listening-expanded", nativeKinds: ULTIMATE_B2_COMPONENT_RELEASE_V2_LISTENING_NATIVE_KINDS },
      { name: "drag-drop-expanded", nativeKinds: ULTIMATE_B2_COMPONENT_RELEASE_V2_DRAG_DROP_NATIVE_KINDS },
      { name: "unit-extras-expanded", nativeKinds: ULTIMATE_B2_COMPONENT_RELEASE_V2_DRAG_DROP_NATIVE_KINDS },
      { name: "page-lifecycle-expanded", nativeKinds: ULTIMATE_B2_COMPONENT_RELEASE_V2_DRAG_DROP_NATIVE_KINDS },
    ],
  );
  for (const variant of ULTIMATE_B2_PUBLICATION_V2_COMPATIBILITY_VARIANTS) {
    const options = { unitExtras: variant.unitExtras === true, pageLifecycle: variant.pageLifecycle === true };
    const descriptor = ultimateB2PublicationV2CompatibilityDescriptor(variant.nativeKinds, options);
    assert.deepEqual(descriptor.nativeKinds, variant.nativeKinds);
    assert.ok(builderDocumentSha256(descriptor) === variant.compatibility, `${variant.name} compatibility descriptor drifted`);
    assert.ok(reconstructUltimateB2PublicationV2Compatibility(variant.nativeKinds, options) === variant.compatibility, `${variant.name} compatibility reconstruction drifted`);
    assert.equal(resolveUltimateB2PublicationV2CompatibilityVariant(variant.compatibility), variant);
  }
  const expanded = ULTIMATE_B2_PUBLICATION_V2_COMPATIBILITY_VARIANTS.at(-1);
  assert.ok(ultimateB2PublicationV2Compatibility() === expanded.compatibility);
  assert.deepEqual(ULTIMATE_B2_COMPONENT_RELEASE_V2_EXPANDED_NATIVE_KINDS, ["image", "open-response", "single-choice"]);
  assert.deepEqual(ULTIMATE_B2_COMPONENT_RELEASE_V2_COMPLETE_SENTENCES_NATIVE_KINDS, ["complete-sentences", "image", "open-response", "single-choice"]);
  assert.deepEqual(ULTIMATE_B2_COMPONENT_RELEASE_V2_LISTENING_NATIVE_KINDS, ["complete-sentences", "image", "listening", "open-response", "single-choice"]);
  assert.deepEqual(ULTIMATE_B2_COMPONENT_RELEASE_V2_DRAG_DROP_NATIVE_KINDS, ["complete-sentences", "drag-drop", "image", "listening", "open-response", "single-choice"]);
  assert.equal(isUltimateB2PublicationV2NativeKind("future-native-kind"), false);
  assert.ok(reconstructUltimateB2PublicationV2Compatibility([...NATIVE_ACTIVITY_KINDS, "future-native-kind"]) !== ultimateB2PublicationV2Compatibility());
});

test("a reconstructed pre-Single-Choice v2 release preserves every stored document hash and verifies its historical aggregate", () => {
  const compiled = historicalV2Release();
  const release = releaseRow(compiled);
  const storedHashes = {
    source: release.source_snapshot_sha256,
    public: release.public_projection_sha256,
    teacher: release.teacher_projection_sha256,
    aggregate: release.release_sha256,
  };
  const verified = verifyImmutableComponentRelease(release);
  assert.deepEqual({
    compatibilityMatches: release.runtime_compatibility_sha256 === verified.compatibility,
    sourceSnapshotMatches: builderDocumentSha256(verified.sourceSnapshot) === release.source_snapshot_sha256,
    publicProjectionMatches: builderDocumentSha256(verified.publicProjection) === release.public_projection_sha256,
    teacherProjectionMatches: builderDocumentSha256(verified.teacherProjection) === release.teacher_projection_sha256,
    releaseHashMatches: builderDocumentSha256({
      compatibility: verified.compatibility,
      sourceSnapshot: verified.sourceSnapshot,
      publicProjection: verified.publicProjection,
      teacherProjection: verified.teacherProjection,
    }) === release.release_sha256,
  }, {
    compatibilityMatches: true,
    sourceSnapshotMatches: true,
    publicProjectionMatches: true,
    teacherProjectionMatches: true,
    releaseHashMatches: true,
  });
  assert.deepEqual(Object.keys(verified.sourceSnapshot.nativeActivities).sort(), [publicationV2Fixture.imageId, publicationV2Fixture.openResponseId].sort());
  assert.deepEqual(Object.keys(verified.publicProjection.nativeActivities).sort(), [publicationV2Fixture.imageId, publicationV2Fixture.openResponseId].sort());
  assert.deepEqual(Object.keys(verified.teacherProjection.nativeActivities).sort(), [publicationV2Fixture.imageId, publicationV2Fixture.openResponseId].sort());
  assert.ok(builderDocumentSha256(verified.sourceSnapshot) === storedHashes.source);
  assert.ok(builderDocumentSha256(verified.publicProjection) === storedHashes.public);
  assert.ok(builderDocumentSha256(verified.teacherProjection) === storedHashes.teacher);
  assert.ok(builderDocumentSha256({
    compatibility: verified.compatibility,
    sourceSnapshot: verified.sourceSnapshot,
    publicProjection: verified.publicProjection,
    teacherProjection: verified.teacherProjection,
  }) === storedHashes.aggregate);
  assert.deepEqual({
    source: release.source_snapshot_sha256,
    public: release.public_projection_sha256,
    teacher: release.teacher_projection_sha256,
    aggregate: release.release_sha256,
  }, storedHashes);
});

test("the historical v2 variant rejects Single Choice in source, public, and Teacher identities", () => {
  const expanded = compilePublicationV2Fixture();
  const mutations = [
    (release) => { release.source_snapshot.nativeActivities[publicationV2Fixture.singleChoiceId] = structuredClone(expanded.sourceSnapshot.nativeActivities[publicationV2Fixture.singleChoiceId]); },
    (release) => { release.public_projection.nativeActivities[publicationV2Fixture.singleChoiceId] = structuredClone(expanded.publicProjection.nativeActivities[publicationV2Fixture.singleChoiceId]); },
    (release) => { release.teacher_projection.nativeActivities[publicationV2Fixture.singleChoiceId] = structuredClone(expanded.teacherProjection.nativeActivities[publicationV2Fixture.singleChoiceId]); },
  ];
  for (const mutate of mutations) {
    const release = releaseRow(historicalV2Release());
    release.source_snapshot = structuredClone(release.source_snapshot);
    release.public_projection = structuredClone(release.public_projection);
    release.teacher_projection = structuredClone(release.teacher_projection);
    mutate(release);
    refreshReleaseHashes(release);
    assert.throws(() => verifyImmutableComponentRelease(release), /unsupported by this release compatibility variant/);
  }
});

test("the expanded v2 variant verifies Single Choice but unknown stored compatibility remains fail-closed", () => {
  const expanded = compilePublicationV2Fixture();
  const verified = verifyImmutableComponentRelease(releaseRow(expanded));
  assert.equal(verified.publicProjection.nativeActivities[publicationV2Fixture.singleChoiceId].kind, "single-choice");

  const release = releaseRow(expanded);
  const unknownCompatibility = "0".repeat(64);
  release.runtime_compatibility_sha256 = unknownCompatibility;
  release.public_projection = { ...release.public_projection, compatibility: unknownCompatibility };
  refreshReleaseHashes(release);
  assert.ok(builderDocumentSha256({
    compatibility: release.runtime_compatibility_sha256,
    sourceSnapshot: release.source_snapshot,
    publicProjection: release.public_projection,
    teacherProjection: release.teacher_projection,
  }) === release.release_sha256);
  assert.equal(resolveUltimateB2PublicationV2CompatibilityVariant(unknownCompatibility), null);
  assert.throws(() => verifyImmutableComponentRelease(release), (error) => error instanceof ReleaseCompatibilityVariantError && error.code === "release_integrity_failed");
  const diagnostic = JSON.stringify(new ReleaseCompatibilityVariantError());
  assert.doesNotMatch(diagnostic, new RegExp(publicationV2Fixture.teacherSentinel));
  assert.doesNotMatch(diagnostic, /publicProjection|teacherProjection|sourceSnapshot|[a-f0-9]{64}/i);
});

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
  assert.equal(first.assetManifest.filter((asset) => asset.role === "activity_artwork" && asset.sha256 === publicationV2Fixture.assetChecksum).length, 1);

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
