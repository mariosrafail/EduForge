import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const builderPlayerMediaManifestPath = path.resolve("cloudflare/builder/player-media-manifest.json");
export const builderPlayerMediaManifest = JSON.parse(await readFile(builderPlayerMediaManifestPath, "utf8"));
export const BUILDER_PLAYER_MEDIA_BUCKET = "hhplms-book-public-dev";

async function sha256File(file) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => createReadStream(file).on("data", (chunk) => hash.update(chunk)).on("end", resolve).on("error", reject));
  return hash.digest("hex");
}

export async function validateBuilderPlayerMediaManifest() {
  const manifest = builderPlayerMediaManifest;
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.bucketName, BUILDER_PLAYER_MEDIA_BUCKET);
  assert.equal(manifest.binding, "PLAYER_MEDIA");
  assert.equal(manifest.objectPrefix, "cloudflare-player-media/ultimate-b2/");
  assert.equal(manifest.markerObjectKey, `${manifest.objectPrefix}manifest-v1.json`);
  assert.equal(manifest.objects.length, 7);
  assert.equal(new Set(manifest.objects.map(({ logicalKey }) => logicalKey)).size, 7);
  assert.equal(new Set(manifest.objects.map(({ objectKey }) => objectKey)).size, 7);
  assert.equal(new Set(manifest.objects.map(({ publicPath }) => publicPath)).size, 7);

  let totalBytes = 0;
  for (const record of manifest.objects) {
    assert.match(record.logicalKey, /^ultimate-b2\.students-book\./);
    assert.ok(record.objectKey.startsWith(manifest.objectPrefix));
    assert.ok(record.publicPath.startsWith("/player-media/ultimate-b2/"));
    assert.match(record.sha256, /^[a-f0-9]{64}$/);
    const source = path.resolve(record.sourcePath);
    const sourceStat = await stat(source);
    assert.equal(sourceStat.size, record.byteSize, `${record.logicalKey} byte size is stale`);
    assert.equal(await sha256File(source), record.sha256, `${record.logicalKey} SHA-256 is stale`);
    totalBytes += record.byteSize;
  }
  return { objectCount: manifest.objects.length, totalBytes };
}

const wranglerPath = path.resolve("node_modules/wrangler/bin/wrangler.js");

function wrangler(args, options = {}) {
  const result = spawnSync(process.execPath, [wranglerPath, ...args], {
    cwd: path.resolve("."),
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  return result;
}

export function preflightBuilderPlayerMediaBucket(bucketName = BUILDER_PLAYER_MEDIA_BUCKET) {
  if (bucketName !== BUILDER_PLAYER_MEDIA_BUCKET) throw new Error(`Refusing R2 access outside ${BUILDER_PLAYER_MEDIA_BUCKET}.`);
  const result = wrangler(["r2", "bucket", "info", bucketName, "--json"]);
  if (result.status !== 0) throw new Error(`R2 permission preflight failed:\n${result.stderr || result.stdout}`);
  const details = JSON.parse(result.stdout);
  if (details.name && details.name !== bucketName) throw new Error(`R2 preflight returned unexpected bucket ${details.name}.`);
  return { bucketName };
}

function markerPayload() {
  return {
    schemaVersion: 1,
    objects: builderPlayerMediaManifest.objects.map(({ logicalKey, objectKey, byteSize, sha256 }) => ({ logicalKey, objectKey, byteSize, sha256 })),
  };
}

function markerMatches(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function readRemoteMarker() {
  const objectPath = `${BUILDER_PLAYER_MEDIA_BUCKET}/${builderPlayerMediaManifest.markerObjectKey}`;
  const result = wrangler(["r2", "object", "get", objectPath, "--remote", "--pipe"]);
  if (result.status === 0) {
    try { return JSON.parse(result.stdout); } catch { return null; }
  }
  const diagnostic = `${result.stdout}\n${result.stderr}`;
  if (/not found|does not exist|NoSuchKey|10007/i.test(diagnostic)) return null;
  throw new Error(`Unable to read R2 media marker:\n${diagnostic}`);
}

export async function syncBuilderPlayerMedia(bucketName = BUILDER_PLAYER_MEDIA_BUCKET) {
  if (bucketName !== BUILDER_PLAYER_MEDIA_BUCKET) throw new Error(`Refusing R2 upload outside ${BUILDER_PLAYER_MEDIA_BUCKET}.`);
  const validation = await validateBuilderPlayerMediaManifest();
  preflightBuilderPlayerMediaBucket(bucketName);
  const expectedMarker = markerPayload();
  const remoteMarker = readRemoteMarker();
  if (markerMatches(remoteMarker, expectedMarker)) return { ...validation, uploadedObjects: 0, uploadedBytes: 0, skippedObjects: 7 };

  const remoteRecords = new Map((remoteMarker?.objects || []).map((record) => [record.objectKey, record]));
  const changed = builderPlayerMediaManifest.objects.filter((record) => {
    const remote = remoteRecords.get(record.objectKey);
    return !remote || remote.byteSize !== record.byteSize || remote.sha256 !== record.sha256;
  });
  for (const record of changed) {
    const objectPath = `${bucketName}/${record.objectKey}`;
    const result = wrangler([
      "r2", "object", "put", objectPath,
      "--remote",
      "--file", path.resolve(record.sourcePath),
      "--content-type", "video/mp4",
      "--cache-control", "public, max-age=0, must-revalidate",
      "--force",
    ], { stdio: "inherit", encoding: undefined });
    if (result.status !== 0) throw new Error(`R2 upload failed for ${record.logicalKey}.`);
  }

  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "hhplms-player-media-marker-"));
  try {
    const markerFile = path.join(temporaryDirectory, "manifest-v1.json");
    await writeFile(markerFile, `${JSON.stringify(expectedMarker, null, 2)}\n`, "utf8");
    const markerResult = wrangler([
      "r2", "object", "put", `${bucketName}/${builderPlayerMediaManifest.markerObjectKey}`,
      "--remote", "--file", markerFile, "--content-type", "application/json", "--cache-control", "no-store", "--force",
    ], { stdio: "inherit", encoding: undefined });
    if (markerResult.status !== 0) throw new Error("R2 marker upload failed after media uploads.");
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }

  return {
    ...validation,
    uploadedObjects: changed.length,
    uploadedBytes: changed.reduce((sum, record) => sum + record.byteSize, 0),
    skippedObjects: builderPlayerMediaManifest.objects.length - changed.length,
  };
}

async function main() {
  const mode = process.argv[2] || "--check";
  const bucketOptionIndex = process.argv.indexOf("--bucket");
  const bucketName = bucketOptionIndex >= 0 ? process.argv[bucketOptionIndex + 1] : BUILDER_PLAYER_MEDIA_BUCKET;
  if (bucketName !== BUILDER_PLAYER_MEDIA_BUCKET) throw new Error(`Refusing R2 operation outside ${BUILDER_PLAYER_MEDIA_BUCKET}.`);
  if (mode === "--check") console.log(JSON.stringify({ status: "valid", ...await validateBuilderPlayerMediaManifest() }));
  else if (mode === "--preflight") console.log(JSON.stringify({ status: "authorized", ...preflightBuilderPlayerMediaBucket(bucketName) }));
  else if (mode === "--sync") console.log(JSON.stringify({ status: "synchronized", ...await syncBuilderPlayerMedia(bucketName) }));
  else throw new Error(`Unknown Builder Player media mode: ${mode}`);
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
