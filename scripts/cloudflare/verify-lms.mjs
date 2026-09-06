import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { createGzip } from "node:zlib";
import os from "node:os";
import path from "node:path";

import { scanWebBundle } from "../verify-web-bundle-safety.mjs";
import { LMS_PUBLIC_HANDLER_NAMES } from "../../cloudflare/lms/worker.js";
import { verifyLmsPageAssets } from "./lms-page-assets.mjs";
import { verifyLmsPageRouting } from "./lms-page-routing.mjs";

const root = path.resolve("dist-cloudflare/lms");
const configSource = await readFile(path.resolve("cloudflare/lms/wrangler.jsonc"), "utf8");
const config = JSON.parse(configSource);
assert.equal(config.name, "lms");
assert.equal(config.workers_dev, true);
assert.equal(config.keep_vars, true);
assert.equal(config.assets.directory, "../../dist-cloudflare/lms");
assert.equal(config.assets.binding, "ASSETS");
assert.deepEqual(config.assets.run_worker_first, ["/.netlify/functions/*", "/platform-admin/*"]);
assert.equal(config.assets.not_found_handling, "single-page-application");
assert.deepEqual(config.compatibility_flags, ["nodejs_compat"]);
for (const forbidden of ["routes", "route", "domains", "domain", "triggers", "vars", "secrets", "DATABASE_URL", "SECRET", "TOKEN", "PASSWORD"]) {
  assert.equal(Object.hasOwn(config, forbidden), false, `Wrangler config must not contain ${forbidden}`);
}
assert.doesNotMatch(configSource, /DATABASE_URL|"[^"]*(?:secret|token|password)[^"]*"\s*:/i);

await Promise.all([
  stat(path.join(root, "index.html")),
  stat(path.join(root, "platform-admin/index.html")),
]);
const webBundle = await scanWebBundle(root);
assert.deepEqual(webBundle.findings, [], "LMS static bundle contains prohibited content");
const canonicalPageCount = await verifyLmsPageAssets(root);

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
assert.ok(LMS_PUBLIC_HANDLER_NAMES.length > 0);

const temporaryOutput = await mkdtemp(path.join(os.tmpdir(), "hhplms-lms-wrangler-"));
try {
  const metafilePath = path.join(temporaryOutput, "metafile.json");
  const result = spawnSync(process.execPath, [
    path.resolve("node_modules/wrangler/bin/wrangler.js"),
    "deploy",
    "--config", path.resolve("cloudflare/lms/wrangler.jsonc"),
    "--dry-run",
    "--outdir", temporaryOutput,
    "--metafile", metafilePath,
  ], { cwd: path.resolve("."), encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Wrangler LMS dry-run failed:\n${result.stdout}\n${result.stderr}`);
  assert.match(`${result.stdout}\n${result.stderr}`, /lms/i);

  const metafile = JSON.parse(await readFile(metafilePath, "utf8"));
  const normalizedInputs = Object.keys(metafile.inputs || {}).map((input) => input.replaceAll("\\", "/"));
  const forbiddenInput = normalizedInputs.find((input) => /(?:^|\/)sharp(?:\/|$)|detect-libc|\.node$/.test(input));
  assert.equal(forbiddenInput, undefined, `Forbidden native/runtime dependency in LMS Worker graph: ${forbiddenInput}`);
  assert.equal(normalizedInputs.find((input) => /\.(png|jpe?g|webp)$/i.test(input)), undefined, "Page binaries belong in ASSETS, not the Worker module");

  // Nodemailer's CommonJS entrypoint eagerly references every transport. Its
  // unused sendmail transport is therefore bundled even though LMS dispatches
  // through SMTP. Keep this exception exact so any application/native-process
  // dependency still fails verification.
  const childProcessInput = "node-built-in-modules:child_process";
  const childProcessInputs = normalizedInputs.filter((input) => /child_process/.test(input));
  const childProcessImporters = Object.entries(metafile.inputs || {})
    .filter(([, input]) => input.imports?.some((entry) => entry.path === childProcessInput))
    .map(([input]) => input.replaceAll("\\", "/"));
  if (childProcessInputs.length > 0) {
    assert.deepEqual(childProcessInputs, [childProcessInput]);
    assert.deepEqual(childProcessImporters, ["../../node_modules/nodemailer/lib/sendmail-transport/index.js"]);
  }

  const emitted = (await readdir(temporaryOutput)).filter((name) => name.endsWith(".js"));
  assert.equal(emitted.length, 1, `Expected one emitted LMS Worker module, found ${emitted.length}`);
  const workerFile = path.join(temporaryOutput, emitted[0]);
  const workerSource = await readFile(workerFile, "utf8");
  assert.doesNotMatch(workerSource, /detect-libc|["'`/\\][^"'`\s]*\.node\b|node:child_process|require\(["'](?:node:)?fs["']\)/i);
  assert.equal(workerSource.match(/from "child_process";/g)?.length || 0, childProcessInputs.length);

  const workerUncompressedBytes = (await stat(workerFile)).size;
  const workerCompressedBytes = await new Promise((resolve, reject) => {
    let size = 0;
    createReadStream(workerFile)
      .pipe(createGzip())
      .on("data", (chunk) => { size += chunk.length; })
      .on("end", () => resolve(size))
      .on("error", reject);
  });
  assert.ok(workerCompressedBytes < 3 * 1024 * 1024, `Compressed LMS Worker exceeds 3 MiB: ${workerCompressedBytes}`);
  console.log(JSON.stringify({
    status: "safe",
    worker: "lms",
    workerUncompressedBytes,
    workerCompressedBytes,
    metafileInputCount: normalizedInputs.length,
    staticAssetCount: files.length,
    canonicalPageCount,
    largestStaticAsset: {
      path: path.relative(root, files[0].absolute).replaceAll("\\", "/"),
      bytes: files[0].size,
    },
  }, null, 2));
} finally {
  await rm(temporaryOutput, { recursive: true, force: true });
}
console.log(JSON.stringify(await verifyLmsPageRouting()));
