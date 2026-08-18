import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { createGzip } from "node:zlib";
import os from "node:os";
import path from "node:path";

import { scanWebBundle } from "../verify-web-bundle-safety.mjs";
import {
  builderPlayerMediaManifest,
  validateBuilderPlayerMediaManifest,
} from "./builder-player-media.mjs";

const root = path.resolve("dist-cloudflare/builder");
const configPath = path.resolve("cloudflare/builder/wrangler.jsonc");
const configSource = await readFile(configPath, "utf8");
const config = JSON.parse(configSource);
const expectedWorkerFirst = [
  "/builder/api/*",
  "/builder/preview/*",
  "/preview/*",
  "/player-media/*",
  "/player",
  "/player/*",
  "!/player/assets/*",
];

assert.equal(config.name, "builder");
assert.equal(config.keep_vars, true);
assert.equal(config.workers_dev, true);
assert.deepEqual(config.compatibility_flags, ["nodejs_compat"]);
assert.equal(config.assets.directory, "../../dist-cloudflare/builder");
assert.equal(config.assets.binding, "ASSETS");
assert.equal(config.assets.not_found_handling, "none");
assert.deepEqual(config.assets.run_worker_first, expectedWorkerFirst);
assert.deepEqual(config.r2_buckets, [{ binding: "PLAYER_MEDIA", bucket_name: "hhplms-book-public-dev" }]);
for (const forbidden of ["routes", "route", "domains", "domain", "triggers", "vars"]) {
  assert.equal(Object.hasOwn(config, forbidden), false, `Wrangler config must not contain ${forbidden}`);
}
assert.doesNotMatch(configSource, /(?:CLOUDFLARE_ACCOUNT_ID|CLOUDFLARE_API_TOKEN|DATABASE_URL|BUILDER_AUTH_RATE_LIMIT_SALT|BUILDER_PREVIEW_AUTH_SECRET|BOOK_ASSET_S3_ACCESS_KEY_ID|BOOK_ASSET_S3_SECRET_ACCESS_KEY)\s*[":=]/);

const cloudflareEntries = await readdir(path.resolve("cloudflare"), { withFileTypes: true });
const workerConfigs = [];
for (const entry of cloudflareEntries) {
  if (!entry.isDirectory()) continue;
  const candidate = path.resolve("cloudflare", entry.name, "wrangler.jsonc");
  const source = await readFile(candidate, "utf8").catch(() => null);
  if (source) workerConfigs.push(JSON.parse(source).name);
}
assert.deepEqual(workerConfigs.sort(), ["builder", "lms"]);

const builderHtml = await readFile(path.join(root, "index.html"), "utf8");
const playerHtml = await readFile(path.join(root, "player/index.html"), "utf8");
assert.match(builderHtml, /(?:src|href)="\/assets\//);
assert.doesNotMatch(builderHtml, /(?:src|href)="\/player\/assets\//);
assert.match(playerHtml, /(?:src|href)="\/player\/assets\//);
assert.doesNotMatch(playerHtml, /(?:src|href)="\/assets\//);
assert.notEqual(builderHtml, playerHtml);

const bundleSafety = await scanWebBundle(root, { allowTeacherAnswers: true });
assert.deepEqual(bundleSafety.findings, []);

const files = [];
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await visit(absolute);
    else if (entry.isFile()) files.push({ absolute, size: (await stat(absolute)).size });
  }
}
await visit(root);
files.sort((left, right) => right.size - left.size);
assert.ok(files.some(({ absolute }) => path.relative(root, absolute).replaceAll("\\", "/").startsWith("player/assets/")));
assert.ok(files.every(({ size }) => size <= 25 * 1024 * 1024), "Every Worker Static Asset must be at most 25 MiB");
await validateBuilderPlayerMediaManifest();
for (const record of builderPlayerMediaManifest.objects) {
  assert.equal(files.some(({ size }) => size === record.byteSize), false, `${record.logicalKey} payload must not be a Static Asset`);
}

const combinedStaticSource = (await Promise.all(files
  .filter(({ absolute }) => /\.(?:html|js|css)$/.test(absolute))
  .map(({ absolute }) => readFile(absolute, "utf8")))).join("\n");
assert.match(combinedStaticSource, /https:\/\/builder\.hhplms\.workers\.dev\/player\//);
assert.ok(combinedStaticSource.includes("/player-media/ultimate-b2/"));
for (const record of builderPlayerMediaManifest.objects) {
  assert.ok(combinedStaticSource.includes(path.posix.basename(record.publicPath)), `${record.logicalKey} Cloudflare media URL is missing`);
}

const hostedViewerSource = await readFile(path.resolve("src/apps/book-builder/hosted/hostedViewerPreviewUrl.js"), "utf8");
assert.match(hostedViewerSource, /https:\/\/hhplms-viewer\.netlify\.app\//);
assert.match(hostedViewerSource, /new URL\(HOSTED_VIEWER_BASE_URL\)\.origin/);

const temporaryOutput = await mkdtemp(path.join(os.tmpdir(), "hhplms-builder-wrangler-"));
let workerFile;
let metafile;
try {
  const metafilePath = path.join(temporaryOutput, "metafile.json");
  const result = spawnSync(process.execPath, [
    path.resolve("node_modules/wrangler/bin/wrangler.js"),
    "deploy",
    "--config", configPath,
    "--dry-run",
    "--outdir", temporaryOutput,
    "--metafile", metafilePath,
  ], { cwd: path.resolve("."), encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Wrangler dry-run failed:\n${result.stdout}\n${result.stderr}`);
  assert.match(`${result.stdout}\n${result.stderr}`, /builder/i);
  assert.match(`${result.stdout}\n${result.stderr}`, /PLAYER_MEDIA/);

  metafile = JSON.parse(await readFile(metafilePath, "utf8"));
  const inputs = Object.keys(metafile.inputs || {});
  const normalizedInputs = inputs.map((input) => input.replaceAll("\\", "/"));
  assert.ok(normalizedInputs.some((input) => input.includes("@neondatabase/serverless")), "Worker graph must retain the Neon Worker-compatible client");
  assert.ok(normalizedInputs.some((input) => input.includes("@aws-sdk/client-s3")), "Worker graph must retain the AWS S3 Worker-compatible client");
  const forbiddenInput = normalizedInputs.find((input) => /(?:^|\/)sharp(?:\/|$)|detect-libc|\.node$|child_process/.test(input));
  assert.equal(forbiddenInput, undefined, `Forbidden native/runtime dependency in Worker graph: ${forbiddenInput}`);

  const emitted = (await readdir(temporaryOutput)).filter((name) => name.endsWith(".js"));
  assert.equal(emitted.length, 1, `Expected one emitted Worker module, found ${emitted.length}`);
  workerFile = path.join(temporaryOutput, emitted[0]);
  const workerSource = await readFile(workerFile, "utf8");
  assert.doesNotMatch(workerSource, /detect-libc|["'`/\\][^"'`\s]*\.node\b|node:child_process|child_process|require\(["'](?:node:)?fs["']\)/i);

  const uncompressedSize = (await stat(workerFile)).size;
  const compressedSize = await new Promise((resolve, reject) => {
    let size = 0;
    createReadStream(workerFile)
      .pipe(createGzip())
      .on("data", (chunk) => { size += chunk.length; })
      .on("end", () => resolve(size))
      .on("error", reject);
  });
  console.log(JSON.stringify({
    status: "safe",
    worker: "builder",
    workerUncompressedBytes: uncompressedSize,
    workerCompressedBytes: compressedSize,
    metafileInputCount: Object.keys(metafile.inputs || {}).length,
    staticAssetCount: files.length,
    largestStaticAsset: {
      path: path.relative(root, files[0].absolute).replaceAll("\\", "/"),
      bytes: files[0].size,
    },
  }, null, 2));
} finally {
  await rm(temporaryOutput, { recursive: true, force: true });
}
