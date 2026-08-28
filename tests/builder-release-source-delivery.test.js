import assert from "node:assert/strict";
import test from "node:test";

import { parseReleaseAssetRange, servePinnedReleaseSourceAsset } from "../netlify-sites/ultimate-b2-builder/server/_builder-release-source-delivery.js";

const pin = { byte_size: 10, media_type: "video/mp4", object_key: "private/never-visible.mp4" };

function bucket() {
  const calls = [];
  const object = { size: 10, body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(10)); controller.close(); } }) };
  return { calls, async head(key) { calls.push(["head", key]); return object; }, async get(key, options) { calls.push(["get", key, options]); return object; } };
}

function input(method = "GET", range = null, sourceBucket = bucket()) {
  const request = new Request("https://builder.example/preview/releases/opaque", { method, headers: range ? { Range: range } : {} });
  return { sourceBucket, value: { event: { httpMethod: method }, context: { cloudflare: { request, releaseSourceAssets: sourceBucket } }, pin } };
}

test("pinned release delivery streams same-origin GET, HEAD, and 206 ranges without exposing storage identity", async () => {
  const full = input();
  const fullResponse = await servePinnedReleaseSourceAsset(full.value);
  assert.equal(fullResponse.status, 200);
  assert.equal((await fullResponse.arrayBuffer()).byteLength, 10);
  assert.equal(fullResponse.headers.get("content-type"), "video/mp4");
  assert.equal(fullResponse.headers.get("accept-ranges"), "bytes");
  assert.doesNotMatch(JSON.stringify(Object.fromEntries(fullResponse.headers)), /never-visible|private\//);

  const ranged = input("GET", "bytes=2-5");
  const rangedResponse = await servePinnedReleaseSourceAsset(ranged.value);
  assert.equal(rangedResponse.status, 206);
  assert.equal(rangedResponse.headers.get("content-range"), "bytes 2-5/10");
  assert.deepEqual(ranged.sourceBucket.calls, [["get", pin.object_key, { range: { offset: 2, length: 4 } }]]);

  const headed = input("HEAD", "bytes=-3");
  const headResponse = await servePinnedReleaseSourceAsset(headed.value);
  assert.equal(headResponse.status, 206);
  assert.equal(headResponse.body, null);
  assert.equal(headResponse.headers.get("content-range"), "bytes 7-9/10");
});

test("pinned release delivery fails closed for invalid ranges, missing bindings, missing objects, and size substitution", async () => {
  assert.deepEqual(parseReleaseAssetRange("bytes=0-4", 10), { offset: 0, length: 5 });
  assert.equal(parseReleaseAssetRange("bytes=9-2", 10), false);
  const invalid = await servePinnedReleaseSourceAsset(input("GET", "bytes=20-30").value);
  assert.equal(invalid.status, 416);
  assert.equal(invalid.headers.get("content-range"), "bytes */10");
  assert.equal((await servePinnedReleaseSourceAsset({ event: { httpMethod: "GET" }, context: {}, pin })).status, 503);
  const missing = { head: async () => null, get: async () => null };
  assert.equal((await servePinnedReleaseSourceAsset(input("GET", null, missing).value)).status, 409);
  const substituted = { get: async () => ({ size: 11, body: new ReadableStream() }) };
  assert.equal((await servePinnedReleaseSourceAsset(input("GET", null, substituted).value)).status, 409);
});
