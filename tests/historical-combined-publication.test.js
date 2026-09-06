import assert from "node:assert/strict";
import test from "node:test";
import { verifyImmutableComponentRelease } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-compilers.js";
import { builderDocumentSha256, stableBuilderJson } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { historicalCombinedIdentity, historicalCombinedRelease, currentCombinedSources } from "./fixtures/historical-combined.js";
import { compileUltimateB2ComponentReleaseV2 } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-compiler-v2.js";
import { normalizeNativeAudioTextHotspots, nativeAudioTextFocusLayout, nativeAudioTextReadableHighlightArea } from "../src/data/native-activities/nativeAudioTextHotspots.js";
import { normalizeComponentPublicationEnvelope } from "../src/services/componentPublicationApi.js";

const choice = (release) => release.public_projection.nativeActivities[historicalCombinedIdentity.activityId].document;
const focus = (release) => choice(release).audioTextHotspots.hotspots;
const aggregate = (release) => ({ compatibility: release.runtime_compatibility_sha256, sourceSnapshot: release.source_snapshot, publicProjection: release.public_projection, teacherProjection: release.teacher_projection });
const sortedAssets = (assets) => [...assets].sort((a, b) => `${a.sha256}.${a.extension}.${a.role}`.localeCompare(`${b.sha256}.${b.extension}.${b.role}`));
function sealSynthetic(release) {
  for (const name of ["source_snapshot", "public_projection", "teacher_projection"]) release[`${name}_sha256`] = builderDocumentSha256(release[name]);
  release.release_sha256 = builderDocumentSha256(aggregate(release));
  return release;
}
function explicitRelease() {
  const release = historicalCombinedRelease();
  focus(release).forEach((hotspot, index) => { hotspot.focusLayout = index ? "natural-width" : "fixed-aspect"; });
  return sealSynthetic(release);
}

test("combined historical publication preserves its full frozen canonical identity", () => {
  const release = historicalCombinedRelease();
  assert.equal(builderDocumentSha256(release), historicalCombinedIdentity.artifactSha256);
  const before = stableBuilderJson(release);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const verified = verifyImmutableComponentRelease(release);
    assert.equal(verified.compatibility, historicalCombinedIdentity.compatibility);
    for (const [normalized, stored] of [["sourceSnapshot", "source_snapshot"], ["publicProjection", "public_projection"], ["teacherProjection", "teacher_projection"]]) {
      assert.equal(stableBuilderJson(verified[normalized]), stableBuilderJson(release[stored]));
      assert.equal(builderDocumentSha256(verified[normalized]), release[`${stored}_sha256`]);
    }
    assert.deepEqual(sortedAssets(verified.publicProjection.assets), release.asset_manifest);
    const normalizedAggregate = { compatibility: verified.compatibility, sourceSnapshot: verified.sourceSnapshot, publicProjection: verified.publicProjection, teacherProjection: verified.teacherProjection };
    assert.equal(stableBuilderJson(normalizedAggregate), stableBuilderJson(aggregate(release)));
    assert.equal(builderDocumentSha256(normalizedAggregate), release.release_sha256);
  }
  assert.equal(stableBuilderJson(release), before);
  assert.equal(Object.hasOwn(release.public_projection, "activePageIds"), false);
  assert.equal(Object.hasOwn(release.public_projection.unitExtras.units[0].categories, "audios"), false);
  assert.equal(Object.hasOwn(release.public_projection.unitExtras.pages[0].extrasVisibility, "audios"), false);
  assert.ok(focus(release).every((hotspot) => !Object.hasOwn(hotspot, "focusLayout")));
  const documents = Object.values(release.public_projection.nativeActivities).map((entry) => entry.document);
  assert.deepEqual(documents.map((doc) => doc.kind).sort(), ["image", "listening", "open-response", "single-choice"]);
  assert.equal(focus(release).length, 2);
  const listening = documents.find((doc) => doc.kind === "listening").parts[0].interaction;
  assert.ok(listening.artwork.length && listening.questions.length && listening.cues.length && listening.snippetHotspots.length && listening.panels.length === 2);
  const image = documents.find((doc) => doc.kind === "image");
  assert.ok(image.video && image.parts[0].interaction.contentText && image.parts[0].interaction.images.length);
  assert.ok(documents.find((doc) => doc.kind === "open-response").parts[0].interaction.presentation.panels.length > 1);
});

test("historical absence and explicit conflicting focus modes preserve shape independently of runtime inference", () => {
  for (const height of [284.18, 800]) for (const mode of [undefined, "fixed-aspect", "natural-width"]) {
    const document = choice(historicalCombinedRelease());
    const hotspot = document.audioTextHotspots.hotspots[0];
    hotspot.readableFocusArea.height = height;
    if (mode !== undefined) hotspot.focusLayout = mode;
    const before = stableBuilderJson(document);
    const normalized = normalizeNativeAudioTextHotspots(document.audioTextHotspots, document);
    assert.deepEqual(normalized, document.audioTextHotspots);
    assert.equal(Object.hasOwn(normalized.hotspots[0], "focusLayout"), mode !== undefined);
    assert.equal(nativeAudioTextFocusLayout(normalized.hotspots[0]), mode ?? (height === 284.18 ? "fixed-aspect" : "natural-width"));
    assert.equal(stableBuilderJson(document), before);
  }
  const release = explicitRelease();
  assert.deepEqual(verifyImmutableComponentRelease(release).publicProjection, release.public_projection);
  assert.equal(release.runtime_compatibility_sha256, historicalCombinedIdentity.compatibility);
  const envelope = { releaseId: "20000000-0000-4000-8000-000000000071", releaseNumber: 1, releaseSchemaVersion: release.release_schema_version, compilerId: release.compiler_id, compatibility: release.runtime_compatibility_sha256, releaseSha256: release.release_sha256, projection: release.public_projection };
  assert.deepEqual(normalizeComponentPublicationEnvelope(envelope).projection, release.public_projection);
});

test("adding, stripping or changing explicit focus layout fails immutable hashes even when presentation is equivalent", () => {
  const added = historicalCombinedRelease(); focus(added)[0].focusLayout = "fixed-aspect";
  const stripped = explicitRelease(); delete focus(stripped)[0].focusLayout;
  const changed = explicitRelease(); focus(changed)[1].focusLayout = "fixed-aspect";
  for (const release of [added, stripped, changed]) assert.throws(() => verifyImmutableComponentRelease(release), (error) => {
    assert.deepEqual(error.failedIntegrityChecks, ["publicProjectionMatches", "releaseHashMatches"]);
    assert.equal(error.integrityChecks.sourceSnapshotMatches, true);
    assert.equal(error.integrityChecks.teacherProjectionMatches, true);
    return true;
  });
});

test("invalid present modes and hotspot topology are rejected even with recomputed synthetic hashes", () => {
  const mutations = [
    ...[null, "", "unknown", 0, false, [], {}, undefined].map((value) => (r) => { focus(r)[0].focusLayout = value; }),
    (r) => { focus(r)[0].extra = true; },
    (r) => { focus(r)[0].id = "invalid"; },
    (r) => { focus(r)[1].id = focus(r)[0].id; },
    (r) => { focus(r)[0].panelId = "missing-panel"; },
    (r) => { focus(r)[0].activityArea.x = 1200; },
    (r) => { focus(r)[0].readableFocusArea.height = 2000; },
    (r) => { focus(r)[0].audioAssetSlot = "missing-audio"; },
    (r) => { focus(r)[0].audioAssetSlot = choice(r).readableText.assetSlot; },
    (r) => { choice(r).assets.find((asset) => asset.slot === focus(r)[0].audioAssetSlot).role = "native_teacher_answer"; },
    (r) => { r.asset_manifest.pop(); },
  ];
  for (const mutate of mutations) {
    const release = historicalCombinedRelease(); mutate(release);
    assert.throws(() => verifyImmutableComponentRelease(sealSynthetic(release)));
  }
});

test("optional no-audio and absent, null, explicit highlight semantics remain unchanged", () => {
  for (const mode of ["absent", "null", "explicit"]) {
    const document = choice(historicalCombinedRelease());
    const hotspot = document.audioTextHotspots.hotspots[0];
    hotspot.audioAssetSlot = "";
    if (mode === "absent") delete hotspot.readableHighlightArea;
    if (mode === "null") hotspot.readableHighlightArea = null;
    const normalized = normalizeNativeAudioTextHotspots(document.audioTextHotspots, document).hotspots[0];
    assert.deepEqual(normalized, hotspot);
    assert.equal(Object.hasOwn(normalized, "focusLayout"), false);
    assert.equal(Object.hasOwn(normalized, "readableHighlightArea"), mode !== "absent");
    assert.equal(Boolean(nativeAudioTextReadableHighlightArea(normalized)), mode !== "null");
  }
});

test("current explicit authoring compiles and verifies without replacing the selected modes", () => {
  const sources = currentCombinedSources();
  const before = stableBuilderJson(sources);
  const compiled = compileUltimateB2ComponentReleaseV2(sources);
  assert.deepEqual(compiled.publicProjection.nativeActivities[historicalCombinedIdentity.activityId].document.audioTextHotspots, sources.native.activities[historicalCombinedIdentity.activityId].public.payload.audioTextHotspots);
  const row = { compiler_id: compiled.compilerId, release_schema_version: compiled.releaseSchemaVersion, runtime_compatibility_sha256: compiled.compatibility, source_snapshot: compiled.sourceSnapshot, public_projection: compiled.publicProjection, teacher_projection: compiled.teacherProjection, asset_manifest: compiled.assetManifest };
  assert.deepEqual(verifyImmutableComponentRelease(sealSynthetic(row)).publicProjection, compiled.publicProjection);
  assert.equal(stableBuilderJson(sources), before);
});
