import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { scanWebBundle } from "../verify-web-bundle-safety.mjs";
import { LMS_PUBLIC_HANDLER_NAMES } from "../../cloudflare/lms/worker.js";

const root = path.resolve("dist-cloudflare/lms");
const configSource = await readFile(path.resolve("cloudflare/lms/wrangler.jsonc"), "utf8");
const config = JSON.parse(configSource);
assert.equal(config.name, "lms");
assert.equal(config.assets.directory, "../../dist-cloudflare/lms");
assert.deepEqual(config.assets.run_worker_first, ["/.netlify/functions/*", "/platform-admin/*"]);
assert.equal(config.assets.not_found_handling, "single-page-application");
assert.deepEqual(config.compatibility_flags, ["nodejs_compat"]);
for (const forbidden of ["routes", "route", "triggers", "vars", "DATABASE_URL", "SECRET", "TOKEN", "PASSWORD"]) {
  assert.equal(Object.hasOwn(config, forbidden), false, `Wrangler config must not contain ${forbidden}`);
}
assert.doesNotMatch(configSource, /DATABASE_URL|"[^"]*(?:secret|token|password)[^"]*"\s*:/i);

await Promise.all([
  stat(path.join(root, "index.html")),
  stat(path.join(root, "platform-admin/index.html")),
]);
await scanWebBundle(root);

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
console.log(`Cloudflare LMS verification passed: ${files.length} static assets; largest ${path.relative(root, files[0].absolute)} (${files[0].size} bytes).`);
