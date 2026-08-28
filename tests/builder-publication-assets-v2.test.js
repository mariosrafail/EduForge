import assert from "node:assert/strict";
import test from "node:test";

import {
  buildComponentReleaseAssetObjectKey,
  buildNativeActivityAssetObjectKey,
  buildUnitExtraAssetObjectKey,
} from "../lib/book-assets/object-keys.js";
import { materializeNativeReleaseAssets } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-assets.js";

const bookSlug = "ultimate-b2";
const componentSlug = "ultimate-b2-students-book";
const privateBucket = "private-assets";
const checksum = "a".repeat(64);
const descriptor = { sha256: checksum, extension: "png", mediaType: "image/png", role: "activity_artwork" };
const row = {
  id: "10000000-0000-4000-8000-000000000020",
  checksum_sha256: checksum,
  asset_role: "activity_artwork",
  object_key: buildNativeActivityAssetObjectKey({ bookSlug, componentSlug, activityId: "native-activity", assetSlot: "background", checksum, extension: ".png" }),
  storage_profile: "private",
  storage_bucket: privateBucket,
  mime_type: "image/png",
  byte_size: 68,
  width: 1,
  height: 1,
  publication_status: "draft",
  access_level: "internal",
  source_metadata: { native_activity_id: "native-activity", asset_slot: "background" },
};

function storageWithCopy(copyVerifiedImmutable) {
  return {
    bucket(profile) { assert.equal(profile, "private"); return privateBucket; },
    copyVerifiedImmutable,
    async download() { throw new Error("Prepare must not download managed asset bodies"); },
    async upload() { throw new Error("Prepare must not upload managed asset bodies"); },
  };
}

function input(source = { descriptor, row }) {
  return { bookSlug, componentSlug, nativeAssetSources: [source] };
}

test("native draft assets materialize idempotently by server-side copy without reading object bodies", async () => {
  const copies = [];
  const storage = storageWithCopy(async (request) => { copies.push(request); return { reused: copies.length > 1 }; });
  await materializeNativeReleaseAssets(storage, input());
  await materializeNativeReleaseAssets(storage, input());
  assert.equal(copies.length, 2);
  assert.deepEqual(copies[0], {
    profile: "private",
    sourceObjectKey: row.object_key,
    destinationObjectKey: buildComponentReleaseAssetObjectKey({ bookSlug, componentSlug, checksum, extension: "png" }),
    expectedChecksumSha256: checksum,
    expectedByteSize: row.byte_size,
    expectedContentType: "image/png",
  });
  assert.equal(Object.hasOwn(copies[0], "body"), false);
});

test("Prepare work is body-size independent for a synthetic multi-gigabyte finalized asset", async () => {
  const hugeRow = { ...row, byte_size: 4_000_000_000 };
  let request;
  await materializeNativeReleaseAssets(storageWithCopy(async (value) => { request = value; return { reused: false }; }), input({ descriptor, row: hugeRow }));
  assert.equal(request.expectedByteSize, hugeRow.byte_size);
  assert.equal(Object.hasOwn(request, "body"), false);
});

test("private PNG, MP3, MP4, and PDF sources use canonical private keys and immutable release targets", async () => {
  const cases = [
    { checksum: "b".repeat(64), extension: "png", mediaType: "image/png", role: "activity_artwork", slot: "background", byteSize: 68 },
    { checksum: "c".repeat(64), extension: "mp3", mediaType: "audio/mpeg", role: "activity_artwork", slot: "listening-audio", byteSize: 25_000_000 },
    { checksum: "d".repeat(64), extension: "pdf", mediaType: "application/pdf", role: "activity_artwork", slot: "video-worksheet", byteSize: 50_000_000 },
    { checksum: "e".repeat(64), extension: "mp4", mediaType: "video/mp4", role: "unit_extra_video", slot: "unit-extra-video", byteSize: 900_000_000 },
  ];
  for (const candidate of cases) {
    const sourceDescriptor = { sha256: candidate.checksum, extension: candidate.extension, mediaType: candidate.mediaType, role: candidate.role };
    const sourceRow = candidate.role === "unit_extra_video" ? {
      ...row,
      checksum_sha256: candidate.checksum,
      asset_role: candidate.role,
      mime_type: candidate.mediaType,
      byte_size: candidate.byteSize,
      object_key: buildUnitExtraAssetObjectKey({ bookSlug, componentSlug, unitSlug: "unit-2", itemId: "video-one", checksum: candidate.checksum, extension: ".mp4" }),
      source_metadata: { unit_slug: "unit-2", unit_extra_item_id: "video-one", asset_slot: candidate.slot },
    } : {
      ...row,
      checksum_sha256: candidate.checksum,
      mime_type: candidate.mediaType,
      byte_size: candidate.byteSize,
      object_key: buildNativeActivityAssetObjectKey({ bookSlug, componentSlug, activityId: "native-activity", assetSlot: candidate.slot, checksum: candidate.checksum, extension: `.${candidate.extension}` }),
      source_metadata: { native_activity_id: "native-activity", asset_slot: candidate.slot },
    };
    let copied;
    await materializeNativeReleaseAssets(storageWithCopy(async (request) => { copied = request; return { reused: false }; }), input({ descriptor: sourceDescriptor, row: sourceRow }));
    assert.equal(copied.sourceObjectKey, sourceRow.object_key);
    assert.equal(copied.destinationObjectKey, `builder-release-assets/${bookSlug}/${componentSlug}/${candidate.checksum}.${candidate.extension}`);
    assert.equal(copied.expectedByteSize, candidate.byteSize);
  }
});

test("release materialization fails closed with safe diagnostics for invalid source identity and storage failures", async () => {
  const codedError = (code, message = "private source key must stay private") => Object.assign(new Error(message), { code });
  const scenarios = [
    { name: "wrong asset role", source: { descriptor, row: { ...row, asset_role: "other_role" } }, failureClass: "source_asset_role_mismatch" },
    { name: "wrong row checksum", source: { descriptor, row: { ...row, checksum_sha256: "f".repeat(64) } }, failureClass: "source_checksum_mismatch" },
    { name: "wrong storage profile", source: { descriptor, row: { ...row, storage_profile: "public" } }, failureClass: "source_storage_policy_mismatch" },
    { name: "wrong storage bucket", source: { descriptor, row: { ...row, storage_bucket: "other-private" } }, failureClass: "source_storage_bucket_mismatch" },
    { name: "noncanonical source key", source: { descriptor, row: { ...row, object_key: "builder-native-assets/staging/source.png" } }, failureClass: "source_identity_mismatch" },
    { name: "unsupported role", source: { descriptor: { ...descriptor, role: "future_private_asset" }, row }, failureClass: "unsupported_asset_role" },
    { name: "missing source", source: { descriptor, row }, copyError: codedError("source_object_missing"), failureClass: "source_object_missing" },
    { name: "wrong source size", source: { descriptor, row }, copyError: codedError("source_byte_size_mismatch"), failureClass: "source_byte_size_mismatch" },
    { name: "wrong source checksum", source: { descriptor, row }, copyError: codedError("source_checksum_mismatch"), failureClass: "source_checksum_mismatch" },
    { name: "wrong immutable checksum", source: { descriptor, row }, copyError: codedError("immutable_checksum_mismatch"), failureClass: "immutable_checksum_mismatch" },
    { name: "safe provider classification", source: { descriptor, row }, copyError: Object.assign(codedError("copy_invalid_request", "private bucket source destination CopySource ETag Authorization Cookie"), { providerStatus: 400, providerCode: "InvalidArgument", bucket: "private-assets", sourceObjectKey: row.object_key }), failureClass: "copy_invalid_request", providerStatus: 400, providerCode: "InvalidArgument" },
    { name: "unknown storage failure", source: { descriptor, row }, copyError: new Error("secret key"), failureClass: "storage_copy_failure" },
  ];
  for (const scenario of scenarios) {
    const storage = storageWithCopy(async () => { if (scenario.copyError) throw scenario.copyError; throw new Error("copy must not run"); });
    await assert.rejects(materializeNativeReleaseAssets(storage, input(scenario.source)), (error) => {
      assert.equal(error.code, "release_asset_unavailable", scenario.name);
      assert.equal(error.assetId, scenario.source.row.id, scenario.name);
      assert.equal(error.assetRole, scenario.source.descriptor.role, scenario.name);
      assert.equal(error.assetStage, "materialize", scenario.name);
      assert.equal(error.failureClass, scenario.failureClass, scenario.name);
      assert.equal(error.providerStatus, scenario.providerStatus, scenario.name);
      assert.equal(error.providerCode, scenario.providerCode, scenario.name);
      assert.doesNotMatch(JSON.stringify(error), /builder-native-assets|private source key|secret key|private-assets|CopySource|ETag|Authorization|Cookie/i, scenario.name);
      return true;
    });
  }
});
