import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assertPublicBuilderDocument } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { validateBuilderNativeAssetReferences } from "../netlify-sites/ultimate-b2-builder/server/_builder-native-activity-store.js";
import { resolveNativeActivityKind, validateNativeActivityPair } from "../netlify-sites/ultimate-b2-builder/server/_native-activity-registry.js";
import { NATIVE_SUPPLEMENTAL_AUDIO_KINDS } from "../src/data/native-activities/nativeActivityKinds.js";
import { normalizeNativeRuntimePublicDocument } from "../src/data/native-activities/nativeActivityRuntimeValidation.js";
import {
  nativeActivityUsesManagedAssetSlot,
  nativeSupplementalAudioAssetRequirements,
  removeNativeManagedAssetReferenceIfUnused,
} from "../src/data/native-activities/nativeActivityPublic.js";
import { pauseSiblingNativeMedia } from "../src/components/native-readable-text/nativeMediaArbitration.js";

const audioReference = { assetId: "30000000-0000-4000-8000-000000000001", checksumSha256: "1".repeat(64), role: "activity_artwork", slot: "supplemental-audio" };
const imageReference = { assetId: "30000000-0000-4000-8000-000000000002", checksumSha256: "2".repeat(64), role: "activity_artwork", slot: "supplemental-reference" };
const supplementalAudio = {
  assetSlot: audioReference.slot,
  durationMs: 72_345,
  reference: { assetSlot: imageReference.slot, sourceWidth: 1_600, sourceHeight: 2_400, altText: "Transcript reference page" },
};

function publicDocument(kindName = "open-response") {
  const kind = resolveNativeActivityKind(kindName);
  const document = kind.createBlankPublic({ activityId: `${kindName}-supplemental`, title: "Supplemental audio", placement: { pageId: "page-1" } });
  document.assets = structuredClone([audioReference, imageReference]);
  document.supplementalAudio = structuredClone(supplementalAudio);
  return { kind, document };
}

test("Supplemental MP3 is one strict public capability on the six allowlisted native kinds", () => {
  assert.deepEqual(NATIVE_SUPPLEMENTAL_AUDIO_KINDS, ["image", "open-response", "single-choice", "complete-sentences", "listening", "drag-drop"]);
  for (const kindName of NATIVE_SUPPLEMENTAL_AUDIO_KINDS) {
    const { kind, document } = publicDocument(kindName);
    const normalized = kind.normalizePublic(document);
    assert.deepEqual(normalized.supplementalAudio, supplementalAudio);
    assert.deepEqual(nativeSupplementalAudioAssetRequirements(normalized), [
      { slot: audioReference.slot, mediaType: "audio/mpeg", label: "Supplemental MP3" },
      { slot: imageReference.slot, width: 1_600, height: 2_400, label: "Supplemental audio reference" },
    ]);
    assert.doesNotThrow(() => assertPublicBuilderDocument(normalized));
    assert.doesNotMatch(JSON.stringify(normalized), /previewUrl|objectKey|signedUrl|teacherSolution|https?:\/\//i);

    const withoutReference = structuredClone(document);
    delete withoutReference.supplementalAudio.reference;
    withoutReference.assets = withoutReference.assets.filter((asset) => asset.slot !== imageReference.slot);
    assert.deepEqual(kind.normalizePublic(withoutReference).supplementalAudio, {
      assetSlot: audioReference.slot,
      durationMs: supplementalAudio.durationMs,
    });

    const absent = structuredClone(document);
    delete absent.supplementalAudio;
    absent.assets = [];
    assert.equal(Object.hasOwn(kind.normalizePublic(absent), "supplementalAudio"), false);
  }
});

test("Oldschool Listening and malformed or forged supplemental media fail closed", () => {
  const oldschool = publicDocument("oldschool-listening");
  assert.throws(() => oldschool.kind.normalizePublic(oldschool.document), /not supported/);
  assert.throws(() => validateNativeActivityPair(oldschool.document, oldschool.kind.createBlankTeacher({ activityId: oldschool.document.activityId })), /not supported/);
  assert.throws(() => normalizeNativeRuntimePublicDocument(oldschool.document, { activityId: oldschool.document.activityId, kind: "oldschool-listening" }), /not supported/);

  const mutations = [
    (value) => { value.supplementalAudio.extra = true; },
    (value) => { value.supplementalAudio.url = "https://private.example/audio.mp3"; },
    (value) => { value.supplementalAudio.assetSlot = "missing"; },
    (value) => { delete value.supplementalAudio.assetSlot; },
    (value) => { value.supplementalAudio.durationMs = 0; },
    (value) => { value.assets[0].role = "teacher_solution"; },
    (value) => { value.supplementalAudio.reference.extra = true; },
    (value) => { value.supplementalAudio.reference.assetSlot = value.supplementalAudio.assetSlot; },
    (value) => { value.supplementalAudio.reference.sourceWidth = 0; },
    (value) => { value.supplementalAudio.reference.sourceHeight = 8_193; },
    (value) => { value.supplementalAudio.reference.altText = ""; },
    (value) => { value.supplementalAudio.reference.url = "https://private.example/reference.png"; },
  ];
  for (const mutate of mutations) {
    const { kind, document } = publicDocument();
    mutate(document);
    assert.throws(() => kind.normalizePublic(document));
  }
});

test("Supplemental managed assets enforce activity ownership, MP3 MIME, and reference dimensions", async () => {
  const { kind, document } = publicDocument();
  const normalized = kind.normalizePublic(document);
  const rows = [
    { id: audioReference.assetId, checksum_sha256: audioReference.checksumSha256, asset_role: audioReference.role, publication_status: "draft", access_level: "internal", storage_profile: "private", source_metadata: { native_activity_id: document.activityId, asset_slot: audioReference.slot }, mime_type: "audio/mpeg", byte_size: 1024, width: null, height: null },
    { id: imageReference.assetId, checksum_sha256: imageReference.checksumSha256, asset_role: imageReference.role, publication_status: "draft", access_level: "internal", storage_profile: "private", source_metadata: { native_activity_id: document.activityId, asset_slot: imageReference.slot }, mime_type: "image/png", byte_size: 2048, width: 1_600, height: 2_400 },
  ];
  const input = { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", activityId: document.activityId, assets: normalized.assets, requirements: nativeSupplementalAudioAssetRequirements(normalized) };
  await assert.doesNotReject(() => validateBuilderNativeAssetReferences(async () => rows, input));
  await assert.rejects(() => validateBuilderNativeAssetReferences(async () => [{ ...rows[0], mime_type: "audio/wav" }, rows[1]], input), /media type/);
  await assert.rejects(() => validateBuilderNativeAssetReferences(async () => [rows[0], { ...rows[1], width: 800 }], input), /dimensions/);
  await assert.rejects(() => validateBuilderNativeAssetReferences(async () => [{ ...rows[0], source_metadata: { ...rows[0].source_metadata, native_activity_id: "other" } }, rows[1]], input), /not owned/);

  assert.equal(nativeActivityUsesManagedAssetSlot(normalized, audioReference.slot), true);
  assert.equal(nativeActivityUsesManagedAssetSlot(normalized, imageReference.slot), true);
  delete normalized.supplementalAudio.reference;
  removeNativeManagedAssetReferenceIfUnused(normalized, imageReference.slot);
  assert.equal(normalized.assets.some((asset) => asset.slot === imageReference.slot), false);
});

test("media arbitration pauses only siblings inside the active native-activity scope", () => {
  let siblingPauses = 0;
  let externalPauses = 0;
  const scope = { querySelectorAll: () => [active, sibling] };
  const active = { pause() {}, closest: () => scope };
  const sibling = { pause: () => { siblingPauses += 1; } };
  const external = { pause: () => { externalPauses += 1; } };
  pauseSiblingNativeMedia(active);
  assert.equal(siblingPauses, 1);
  assert.equal(externalPauses, 0);
  assert.equal(scope.querySelectorAll().includes(external), false);
});

test("Builder, common runtime, legacy player, and Teacher shell expose the supplemental capability without Oldschool authoring", async () => {
  const paths = [
    "../src/apps/book-builder/hosted/NativeImageEditor.jsx",
    "../src/apps/book-builder/hosted/NativeOpenResponseEditor.jsx",
    "../src/apps/book-builder/hosted/NativeSingleChoiceEditor.jsx",
    "../src/apps/book-builder/hosted/NativeCompleteSentencesEditor.jsx",
    "../src/apps/book-builder/hosted/NativeListeningEditor.jsx",
    "../src/apps/book-builder/hosted/NativeDragDropEditor.jsx",
  ];
  const editors = await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  for (const editor of editors) {
    assert.match(editor, /NativeSupplementalAudioEditor/);
    assert.match(editor, /Supplemental MP3/);
    assert.match(editor, /supplementalAudioIncomplete/);
    assert.match(editor, /NativeReadableTextPresentation/);
  }
  assert.match(editors[4], /!oldschool[^\n]*<NativeSupplementalAudioEditor/);

  const [presentation, supplementalRuntime, hotspotRuntime, player, listening, video, teacher] = await Promise.all([
    readFile(new URL("../src/components/native-readable-text/NativeReadableTextPresentation.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/native-readable-text/NativeSupplementalAudioPresentation.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/native-readable-text/NativeAudioTextHotspots.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/listening-player/LegacyListeningPlayer.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/native-listening/NativeListeningSurface.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/native-video/NativeVideoPlayer.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/apps/android-teacher-offline/TeacherOfflineEmbeddedActivity.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(presentation, /<NativeSupplementalAudioPresentation/);
  assert.match(supplementalRuntime, /LegacyListeningPlayer/);
  assert.match(supplementalRuntime, /NativeVerticalScrollViewport/);
  assert.match(supplementalRuntime, /presentationView !== "video"/);
  assert.match(supplementalRuntime, /command\.type === "reset-activity"/);
  assert.match(hotspotRuntime, /pauseSiblingNativeMedia/);
  assert.match(player, /extraAction = null/);
  assert.match(listening, /pauseSiblingNativeMedia/);
  assert.match(video, /pauseSiblingNativeMedia/);
  assert.match(teacher, /onWorksheetActionChange: onVideoWorksheetActionChange/);
});
