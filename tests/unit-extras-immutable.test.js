import assert from "node:assert/strict";
import test from "node:test";
import { builderDocumentSha256, stableBuilderJson } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { verifyImmutableComponentRelease } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-compilers.js";
import { historicalUnitExtrasIdentity, historicalUnitExtrasRelease, currentUnitExtrasSources } from "./fixtures/historical-unit-extras.js";
import { normalizePublishedUltimateB2UnitExtras, normalizeUltimateB2UnitExtrasDocument, projectUltimateB2UnitExtrasForPublication, unitExtraAudiosForPage, unitExtrasForPage } from "../src/data/ultimate-b2/unitExtras.js";
import { compileUltimateB2ComponentReleaseV2, resolveUltimateB2PublicationV2CompatibilityVariant } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-compiler-v2.js";
import { normalizeComponentPublicationEnvelope } from "../src/services/componentPublicationApi.js";
import { loadHostedDraftUnitExtras, publishedUnitExtraAudioUrl } from "../src/apps/android-teacher-offline/hostedComponentReleaseProvider.js";
import { HOSTED_VIEWER_RUNTIME_MODES } from "../src/apps/android-teacher-offline/hostedReleasePreview.js";

const audioId = `audio-${"a".repeat(32)}`;
const audioReference = { assetId: "10000000-0000-4000-8000-000000000061", checksumSha256: "d".repeat(64), role: "unit_extra_audio", slot: audioId };
const audioEntry = { id: audioId, title: "Synthetic pronunciation", audio: { assetSlot: audioId, asset: audioReference } };
const audioDescriptor = { sha256: audioReference.checksumSha256, extension: "mp3", mediaType: "audio/mpeg", role: audioReference.role };

// Independent synthetic newer shapes: compute their hashes directly, without
// using the published normalizer to manufacture an expected representation.
function sealSynthetic(release) {
  release.public_projection_sha256 = builderDocumentSha256(release.public_projection);
  release.source_snapshot_sha256 = builderDocumentSha256(release.source_snapshot);
  release.teacher_projection_sha256 = builderDocumentSha256(release.teacher_projection);
  release.release_sha256 = builderDocumentSha256({ compatibility: release.runtime_compatibility_sha256, sourceSnapshot: release.source_snapshot, publicProjection: release.public_projection, teacherProjection: release.teacher_projection });
  return release;
}

function withExplicitAudio(nonEmpty = false) {
  const release = historicalUnitExtrasRelease();
  const extras = release.public_projection.unitExtras;
  extras.units[0].categories.audios = nonEmpty ? [structuredClone(audioEntry)] : [];
  extras.pages[0].extrasVisibility.audios = false;
  if (nonEmpty) {
    extras.pages.push({ pageId: "ub2-sb-unit-1-part-2", unitId: "unit-1", extrasVisibility: { videos: false, audios: true } });
    release.public_projection.assets.push({ ...audioDescriptor });
    release.asset_manifest.push({ ...audioDescriptor });
  }
  return sealSynthetic(release);
}

function envelope(release) {
  return { releaseId: historicalUnitExtrasIdentity.releaseId, releaseNumber: 1, releaseSchemaVersion: release.release_schema_version, compilerId: release.compiler_id, releaseSha256: release.release_sha256, compatibility: release.runtime_compatibility_sha256, projection: release.public_projection };
}

test("historical video-only Unit Extras retain their exact published canonical identity", () => {
  const release = historicalUnitExtrasRelease();
  assert.equal(builderDocumentSha256(release), historicalUnitExtrasIdentity.artifactSha256);
  const before = stableBuilderJson(release);
  const verified = verifyImmutableComponentRelease(release);
  assert.equal(stableBuilderJson(verified.publicProjection), stableBuilderJson(release.public_projection));
  assert.equal(builderDocumentSha256(verified.publicProjection), historicalUnitExtrasIdentity.publicSha256);
  assert.equal(builderDocumentSha256({ compatibility: verified.compatibility, sourceSnapshot: verified.sourceSnapshot, publicProjection: verified.publicProjection, teacherProjection: verified.teacherProjection }), historicalUnitExtrasIdentity.releaseSha256);
  assert.equal(Object.hasOwn(verified.publicProjection.unitExtras.units[0].categories, "audios"), false);
  assert.equal(Object.hasOwn(verified.publicProjection.unitExtras.pages[0].extrasVisibility, "audios"), false);
  assert.equal(stableBuilderJson(release), before);
});

test("shared recognized compatibility preserves historical absence, explicit empty, and populated audio shapes", () => {
  const releases = [historicalUnitExtrasRelease(), withExplicitAudio(), withExplicitAudio(true)];
  assert.ok(resolveUltimateB2PublicationV2CompatibilityVariant(historicalUnitExtrasIdentity.compatibility)?.unitExtras);
  for (const release of releases) {
    assert.equal(release.runtime_compatibility_sha256, historicalUnitExtrasIdentity.compatibility);
    const before = stableBuilderJson(release);
    for (let run = 0; run < 3; run += 1) {
      const verified = verifyImmutableComponentRelease(release);
      assert.deepEqual(verified.publicProjection, release.public_projection);
      assert.equal(builderDocumentSha256(verified.sourceSnapshot), release.source_snapshot_sha256);
      assert.equal(builderDocumentSha256(verified.teacherProjection), release.teacher_projection_sha256);
      assert.deepEqual(normalizeComponentPublicationEnvelope(envelope(release)).projection, release.public_projection);
    }
    assert.equal(stableBuilderJson(release), before);
  }
  const empty = releases[1].public_projection.unitExtras;
  assert.deepEqual(empty.units[0].categories.audios, []);
  assert.equal(empty.pages[0].extrasVisibility.audios, false);
  const publication = normalizeComponentPublicationEnvelope(envelope(releases[2]));
  const first = { pageId: "ub2-sb-unit-1-part-1", unitNumber: 1 };
  const second = { pageId: "ub2-sb-unit-1-part-2", unitNumber: 1 };
  assert.equal(unitExtrasForPage(publication, first).length, 2);
  assert.deepEqual(unitExtraAudiosForPage(publication, first), []);
  assert.deepEqual(unitExtraAudiosForPage(publication, second), [audioEntry]);
  assert.deepEqual(unitExtrasForPage(publication, second), []);
});

test("adding or stripping even empty audio fields fails the stored immutable hashes", () => {
  for (const field of ["collection", "visibility", "both"]) {
    const historical = historicalUnitExtrasRelease();
    const explicit = withExplicitAudio();
    if (field !== "visibility") {
      historical.public_projection.unitExtras.units[0].categories.audios = [];
      delete explicit.public_projection.unitExtras.units[0].categories.audios;
    }
    if (field !== "collection") {
      historical.public_projection.unitExtras.pages[0].extrasVisibility.audios = false;
      delete explicit.public_projection.unitExtras.pages[0].extrasVisibility.audios;
    }
    for (const release of [historical, explicit]) assert.throws(() => verifyImmutableComponentRelease(release), (error) => {
      assert.deepEqual(error.failedIntegrityChecks, ["publicProjectionMatches", "releaseHashMatches"]);
      return true;
    });
  }
});

test("present malformed audio values never become empty at immutable or client normalization", () => {
  for (const value of [null, {}, "", false, 1, [null], [{}]]) {
    const release = withExplicitAudio();
    release.public_projection.unitExtras.units[0].categories.audios = value;
    sealSynthetic(release);
    assert.throws(() => verifyImmutableComponentRelease(release));
    assert.throws(() => normalizeComponentPublicationEnvelope(envelope(release)));
  }
  for (const value of [null, {}, [], "false", 0]) {
    const release = withExplicitAudio();
    release.public_projection.unitExtras.pages[0].extrasVisibility.audios = value;
    assert.throws(() => verifyImmutableComponentRelease(sealSynthetic(release)), /audio visibility/);
  }
});

test("audio identities, roles, fields, page ownership, and asset manifests remain strict even with matching hashes", () => {
  const mutations = [
    (r) => { r.public_projection.unitExtras.units[0].categories.audios[0].id = "invalid"; },
    (r) => { r.public_projection.unitExtras.units[0].categories.audios[0].audio.assetSlot = "other"; },
    (r) => { r.public_projection.unitExtras.units[0].categories.audios[0].audio.asset.slot = "other"; },
    (r) => { r.public_projection.unitExtras.units[0].categories.audios[0].audio.asset.assetId = "invalid"; },
    (r) => { r.public_projection.unitExtras.units[0].categories.audios[0].audio.asset.role = "native_teacher_answer"; },
    (r) => { r.public_projection.unitExtras.units[0].categories.audios[0].audio.secret = true; },
    (r) => { r.public_projection.unitExtras.units[0].categories.other = []; },
    (r) => { r.public_projection.unitExtras.pages[0].extrasVisibility.other = false; },
    (r) => { r.public_projection.unitExtras.pages[0].unitId = "unit-2"; },
    (r) => { r.public_projection.assets = r.public_projection.assets.filter((a) => a.role !== "unit_extra_audio"); },
    (r) => { r.asset_manifest = r.asset_manifest.filter((a) => a.role !== "unit_extra_audio"); },
    (r) => { r.public_projection.unitExtras.units[0].categories.audios.push(structuredClone(audioEntry)); },
  ];
  for (const mutate of mutations) {
    const release = withExplicitAudio(true); mutate(release);
    assert.throws(() => verifyImmutableComponentRelease(sealSynthetic(release)));
  }
  const unknown = withExplicitAudio(true);
  unknown.runtime_compatibility_sha256 = "f".repeat(64);
  unknown.public_projection.compatibility = unknown.runtime_compatibility_sha256;
  assert.throws(() => verifyImmutableComponentRelease(sealSynthetic(unknown)), /release_integrity_failed/);
});

test("current MP3/MP4 compiler output retains authoring defaults and rejects foreign Unit asset ownership", () => {
  const sources = currentUnitExtrasSources();
  const authored = sources.unitExtras.document.payload;
  const before = structuredClone(authored);
  const normalized = normalizeUltimateB2UnitExtrasDocument(authored);
  assert.deepEqual(authored, before);
  assert.deepEqual(normalized.units[0].categories.audios, []);
  assert.equal(normalized.pages[0].extrasVisibility.audios, false);
  authored.units[0].categories.audios = [{ id: audioId, title: audioEntry.title, assetSlot: audioId, asset: audioReference, fileName: "synthetic.mp3", byteSize: 1234 }];
  authored.pages[0].extrasVisibility.audios = true;
  sources.unitExtras.document.sha256 = builderDocumentSha256(authored);
  sources.unitExtras.assetRows.push({ ...sources.unitExtras.assetRows[0], id: audioReference.assetId, checksum_sha256: audioReference.checksumSha256, asset_role: audioReference.role, mime_type: "audio/mpeg", byte_size: 1234, object_key: "synthetic/unit-extra.mp3", source_metadata: { unit_slug: "unit-1", unit_extra_item_id: audioId, asset_slot: audioId } });
  const compiled = compileUltimateB2ComponentReleaseV2(sources);
  assert.deepEqual(compiled.publicProjection.unitExtras, projectUltimateB2UnitExtrasForPublication(authored));
  const row = { compiler_id: compiled.compilerId, release_schema_version: compiled.releaseSchemaVersion, runtime_compatibility_sha256: compiled.compatibility, source_snapshot: compiled.sourceSnapshot, public_projection: compiled.publicProjection, teacher_projection: compiled.teacherProjection, asset_manifest: compiled.assetManifest };
  assert.deepEqual(verifyImmutableComponentRelease(sealSynthetic(row)).publicProjection, compiled.publicProjection);
  assert.equal(compiled.publicProjection.assets.some((asset) => asset.role === "unit_extra_audio"), true);
  sources.unitExtras.assetRows.at(-1).source_metadata.unit_slug = "unit-2";
  assert.throws(() => compileUltimateB2ComponentReleaseV2(sources), /unit_extra_audio_asset_invalid/);
});

test("Saved Draft Unit Extras and immutable client consumers safely retain absent audio collections", async () => {
  const release = historicalUnitExtrasRelease();
  const context = { kind: HOSTED_VIEWER_RUNTIME_MODES.BUILDER_PREVIEW, authorization: `v1.synthetic.${"a".repeat(43)}` };
  const identity = { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book" };
  const load = (document) => loadHostedDraftUnitExtras({ context, identity, fetchImpl: async () => new Response(JSON.stringify({ ...identity, resource: "unit-extras", schemaVersion: "1.0", source: "database", revision: 2, document }), { status: 200 }) });
  const draft = await load(release.public_projection.unitExtras);
  assert.equal(draft.kind, "draft");
  assert.equal(Object.hasOwn(draft, "releaseId"), false);
  assert.deepEqual(draft.projection.unitExtras, release.public_projection.unitExtras);
  assert.equal(publishedUnitExtraAudioUrl(draft, audioReference), "");
  assert.deepEqual(unitExtraAudiosForPage(normalizeComponentPublicationEnvelope(envelope(release)), { pageId: "ub2-sb-unit-1-part-1", unitNumber: 1 }), []);
  const malformed = structuredClone(release.public_projection.unitExtras);
  malformed.units[0].categories.audios = null;
  await assert.rejects(load(malformed), /audios are invalid/);
});
