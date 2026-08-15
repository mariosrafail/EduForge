import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { buildComponentReleaseAssetObjectKey } from "../lib/book-assets/object-keys.js";
import { materializeNativeReleaseAssets } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-assets.js";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
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

