import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { unstable_dev } from "wrangler";
import manifest from "../../src/data/ultimate-b2/generated/students-book-page-assets.json" with { type: "json" };
import { lmsCanonicalPageAssetPath } from "../../shared/lmsCanonicalPages.js";

// Exercise the real local Workers asset router, including URL normalization.
// The second, temporary Worker only proves the private ASSETS binding resolves
// these emitted bytes. Application authorization is covered by the DB browser test.
export async function verifyLmsPageRouting() {
  const options = { config: path.resolve("cloudflare/lms/wrangler.jsonc"), local: true, ip: "127.0.0.1", port: 0, inspectorPort: 0, persist: false, logLevel: "error", experimental: { disableExperimentalWarning: true, disableDevRegistry: true, watch: false } };
  const page = manifest.pages[0], key = lmsCanonicalPageAssetPath(page);
  let server = await unstable_dev(path.resolve("cloudflare/lms/worker.js"), options);
  try {
    for (const method of ["GET", "HEAD"]) {
      for (const url of [key, key.replace(".netlify", "%2Enetlify"), key.replace("functions", "%66unctions"), key.replace("/_canonical", "%2F_canonical"), `/${key}`, `${key}/`, `${key}?ignored=1`]) {
        const response = await fetch(`http://${server.address}:${server.port}${url}`, { method });
        assert.equal(response.status, 404, `${method} ${url}: internal image must remain inaccessible`);
        assert.notEqual(response.headers.get("Content-Type"), page.mimeType);
        await response.arrayBuffer();
      }
    }
  } finally { await server.stop(); }
  const temporary = await mkdtemp(path.join(os.tmpdir(), "hhplms-page-binding-"));
  try {
    const script = path.join(temporary, "probe.mjs");
    await writeFile(script, `export default { fetch(request, env) { return env.ASSETS.fetch(new Request(new URL(${JSON.stringify(key)}, request.url))); } };`);
    server = await unstable_dev(script, options);
    try {
      const response = await fetch(`http://${server.address}:${server.port}/.netlify/functions/binding-probe`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("Content-Type"), page.mimeType);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.length, page.byteSize);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), page.checksumSha256);
    } finally { await server.stop(); }
  } finally { await rm(temporary, { recursive: true, force: true }); }
  return { directAndNormalizedRequestsDenied: 14, bindingChecksumVerified: true };
}
