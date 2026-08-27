import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildComponentReleaseAssetObjectKey } from "../lib/book-assets/object-keys.js";
import { inspectManagedMp4 } from "../lib/book-assets/video-inspection.js";
import { materializeNativeReleaseAssets } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-assets.js";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const mp3 = Buffer.from([0xff, 0xfb, 0x90, 0x64, ...new Array(500).fill(0)]);
const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");
const mp4 = await readFile(new URL("../src/assets/books/ultimate-b2/teacher-offline-media/ultimate-b2-startup-intro.mp4", import.meta.url));
const inspectedMp4 = inspectManagedMp4(mp4);
const checksum = createHash("sha256").update(png).digest("hex");
const descriptor = { sha256: checksum, extension: "png", mediaType: "image/png", role: "activity_artwork" };
const row = { object_key: "builder-native-assets/source.png", byte_size: png.length, width: 1, height: 1 };

test("native draft bytes materialize idempotently to a private component release content address", async () => {
  const uploads = [];
  const storage = {
    async head({ objectKey }) {
      assert.equal(objectKey, row.object_key);
      return { checksumSha256: checksum, byteSize: png.length, contentType: "image/png" };
    },
    async download({ objectKey }) { assert.equal(objectKey, row.object_key); return png; },
    async upload(input) { uploads.push(input); return { reused: uploads.length > 1 }; },
  };
  const input = { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", nativeAssetSources: [{ descriptor, row }] };
  await materializeNativeReleaseAssets(storage, input);
  await materializeNativeReleaseAssets(storage, input);
  assert.equal(uploads.length, 2);
  assert.equal(uploads[0].profile, "private");
  assert.equal(uploads[0].objectKey, buildComponentReleaseAssetObjectKey({ bookSlug: input.bookSlug, componentSlug: input.componentSlug, checksum, extension: "png" }));
  assert.equal(uploads[0].objectKey, `builder-release-assets/ultimate-b2/ultimate-b2-students-book/${checksum}.png`);
});

test("release asset materialization fails closed with safe diagnostics for missing, wrong-size, wrong-checksum, and unsupported sources", async () => {
  const input = (source, storage) => materializeNativeReleaseAssets(storage, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", nativeAssetSources: [source] });
  const scenarios = [
    {
      name: "missing source",
      source: { descriptor, row: { ...row, id: "10000000-0000-4000-8000-000000000020" } },
      storage: { async head() { throw new Error("private source key must stay private"); } },
      failureClass: "source_object_missing",
    },
    {
      name: "wrong byte size",
      source: { descriptor, row: { ...row, id: "10000000-0000-4000-8000-000000000021" } },
      storage: { async head() { return { checksumSha256: checksum, byteSize: png.length + 1, contentType: "image/png" }; } },
      failureClass: "source_byte_size_mismatch",
    },
    {
      name: "wrong SHA-256",
      source: { descriptor, row: { ...row, id: "10000000-0000-4000-8000-000000000022" } },
      storage: { async head() { return { checksumSha256: "f".repeat(64), byteSize: png.length, contentType: "image/png" }; } },
      failureClass: "source_checksum_mismatch",
    },
    {
      name: "unsupported role",
      source: { descriptor: { ...descriptor, role: "future_private_asset" }, row: { ...row, id: "10000000-0000-4000-8000-000000000023" } },
      storage: { async head() { throw new Error("must not inspect unsupported roles"); } },
      failureClass: "unsupported_asset_role",
    },
  ];
  for (const scenario of scenarios) {
    await assert.rejects(input(scenario.source, scenario.storage), (error) => {
      assert.equal(error.code, "release_asset_unavailable", scenario.name);
      assert.equal(error.assetId, scenario.source.row.id, scenario.name);
      assert.equal(error.assetRole, scenario.source.descriptor.role, scenario.name);
      assert.equal(error.assetStage, "materialize", scenario.name);
      assert.equal(error.failureClass, scenario.failureClass, scenario.name);
      assert.doesNotMatch(JSON.stringify(error), /builder-native-assets\/source\.png|private source key/i, scenario.name);
      return true;
    });
  }
});

test("managed Unit Extra MP4 bytes materialize to the immutable private release namespace", async () => {
  const unitExtraDescriptor = { sha256: inspectedMp4.checksumSha256, extension: "mp4", mediaType: "video/mp4", role: "unit_extra_video" };
  const unitExtraRow = {
    id: "10000000-0000-4000-8000-000000000024",
    object_key: "builder-unit-extra-assets/source.mp4",
    byte_size: inspectedMp4.byteSize,
    duration_seconds: inspectedMp4.durationMs / 1_000,
    width: null,
    height: null,
  };
  const uploads = [];
  const storage = {
    async head() { return { checksumSha256: inspectedMp4.checksumSha256, byteSize: inspectedMp4.byteSize, contentType: "video/mp4" }; },
    async download() { return mp4; },
    async upload(input) { uploads.push(input); return { reused: false }; },
  };
  await materializeNativeReleaseAssets(storage, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", nativeAssetSources: [{ descriptor: unitExtraDescriptor, row: unitExtraRow }] });
  assert.equal(uploads.length, 1);
  assert.deepEqual({ profile: uploads[0].profile, objectKey: uploads[0].objectKey, contentType: uploads[0].contentType, byteSize: uploads[0].byteSize }, {
    profile: "private",
    objectKey: `builder-release-assets/ultimate-b2/ultimate-b2-students-book/${inspectedMp4.checksumSha256}.mp4`,
    contentType: "video/mp4",
    byteSize: inspectedMp4.byteSize,
  });
});

test("managed MP3 bytes materialize to the immutable private release content address", async () => {
  const audioChecksum = createHash("sha256").update(mp3).digest("hex");
  const audioDescriptor = { sha256: audioChecksum, extension: "mp3", mediaType: "audio/mpeg", role: "activity_artwork" };
  const audioRow = { object_key: "builder-native-assets/source.mp3", byte_size: mp3.length, width: null, height: null };
  const uploads = [];
  const storage = {
    async head() { return { checksumSha256: audioChecksum, byteSize: mp3.length, contentType: "audio/mpeg" }; },
    async download() { return mp3; },
    async upload(input) { uploads.push(input); return { reused: false }; },
  };
  await materializeNativeReleaseAssets(storage, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", nativeAssetSources: [{ descriptor: audioDescriptor, row: audioRow }] });
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].objectKey, `builder-release-assets/ultimate-b2/ultimate-b2-students-book/${audioChecksum}.mp3`);
  assert.equal(uploads[0].contentType, "audio/mpeg");
});

test("validated worksheet PDF bytes materialize to the immutable private release content address", async () => {
  const pdfChecksum = createHash("sha256").update(pdf).digest("hex");
  const pdfDescriptor = { sha256: pdfChecksum, extension: "pdf", mediaType: "application/pdf", role: "activity_artwork" };
  const pdfRow = { object_key: "builder-native-assets/video-worksheet.pdf", byte_size: pdf.length, width: null, height: null };
  const uploads = [];
  const storage = {
    async head() { return { checksumSha256: pdfChecksum, byteSize: pdf.length, contentType: "application/pdf" }; },
    async download() { return pdf; },
    async upload(input) { uploads.push(input); return { reused: false }; },
  };
  await materializeNativeReleaseAssets(storage, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", nativeAssetSources: [{ descriptor: pdfDescriptor, row: pdfRow }] });
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].objectKey, `builder-release-assets/ultimate-b2/ultimate-b2-students-book/${pdfChecksum}.pdf`);
  assert.equal(uploads[0].contentType, "application/pdf");
});
