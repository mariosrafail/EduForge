import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { buildComponentReleaseAssetObjectKey } from "../lib/book-assets/object-keys.js";
import { materializeNativeReleaseAssets } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-assets.js";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const mp3 = Buffer.from([0xff, 0xfb, 0x90, 0x64, ...new Array(500).fill(0)]);
const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");
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

test("release asset materialization fails closed on source checksum or raster disagreement", async () => {
  const storage = {
    async head() { return { checksumSha256: "f".repeat(64), byteSize: png.length, contentType: "image/png" }; },
    async download() { return png; },
    async upload() { throw new Error("must not upload"); },
  };
  await assert.rejects(materializeNativeReleaseAssets(storage, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", nativeAssetSources: [{ descriptor, row }] }), /release_asset_unavailable/);
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
