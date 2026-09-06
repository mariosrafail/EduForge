import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getPublishedPageImage } from "../netlify/functions/_book-content/published-page-image.js";
import { historicalCombinedRelease } from "./fixtures/historical-combined.js";
import manifest from "../src/data/ultimate-b2/generated/students-book-page-assets.json" with { type: "json" };
import { lmsCanonicalPageAssetPath } from "../shared/lmsCanonicalPages.js";
import { verifyCanonicalPageBytes } from "../scripts/cloudflare/lms-page-assets.mjs";
import worker from "../cloudflare/lms/worker.js";
import { createPublicationV2FixtureSources } from "./fixtures/publication-v2.js";
import { compileUltimateB2ComponentReleaseV2 } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-compiler-v2.js";

const page = manifest.pages[0];
const query = { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", releaseId: "10000000-0000-4000-8000-000000000001", pageId: page.pageId, sha256: page.checksumSha256 };
const bytes = await readFile(new URL(`../${page.repositoryPath}`, import.meta.url));
const boundary = (body = bytes, status = 200, type = page.mimeType) => ({ assets: { fetch: async (request) => {
  assert.equal(new URL(request.url).pathname, lmsCanonicalPageAssetPath(page));
  assert.equal(request.headers.has("cookie"), false);
  return new Response(body, { status, headers: { "Content-Type": type } });
} }, origin: "https://lms.test" });
const sql = async (strings) => { assert.ok(strings.join("").includes("book_component_publication_events")); assert.ok(!strings.join("").includes("publication_heads")); return [historicalCombinedRelease()]; };

test("canonical page GET/HEAD verifies an exact historical release without old registry or latest lookup", async () => {
  for (const method of ["GET", "HEAD"]) {
    const result = await getPublishedPageImage(sql, query, { ...boundary(), method });
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("Content-Type"), page.mimeType);
    assert.equal(result.headers.get("Cache-Control"), "private, no-store");
    assert.equal(result.headers.get("Content-Length"), String(bytes.length));
    assert.deepEqual(Buffer.from(await result.arrayBuffer()), method === "HEAD" ? Buffer.alloc(0) : bytes);
  }
});

test("canonical page delivery rejects substitution, missing publication and tampered historical integrity", async () => {
  for (const changes of [{ pageId: "../draft" }, { componentSlug: "ultimate-b2-workbook" }, { bookSlug: "other" }, { sha256: "0".repeat(64) }, { releaseId: "invalid" }]) {
    assert.equal((await getPublishedPageImage(() => { throw new Error("must not query"); }, { ...query, ...changes }, boundary())).statusCode, 404);
  }
  assert.equal((await getPublishedPageImage(async () => [], query, boundary())).statusCode, 404);
  const row = historicalCombinedRelease(); row.public_projection.nativeActivities["ultimate-b2-sb-u1-p1-o97"].document.audioTextHotspots.hotspots[0].focusLayout = "fixed-aspect";
  await assert.rejects(() => getPublishedPageImage(async () => [row], query, boundary()), /release_integrity_failed/);
});

test("canonical page storage fails closed on missing, HTML, MIME, truncation, oversize and checksum corruption", async () => {
  const corrupt = Buffer.from(bytes); corrupt[corrupt.length - 1] ^= 1;
  for (const options of [boundary(null, 404), boundary("<html>SPA</html>", 200, "text/html"), boundary(bytes, 200, "image/jpeg"), boundary(bytes.subarray(1)), boundary(Buffer.concat([bytes, Buffer.from([0])])), boundary(corrupt), {}]) {
    assert.equal((await getPublishedPageImage(sql, query, options)).statusCode, 503);
  }
});

test("an inactive canonical page cannot be fetched from an otherwise valid published release", async () => {
  const sources = createPublicationV2FixtureSources();
  sources.pages = { revision: 1, rows: [{ stable_key: page.pageId, source_metadata: { is_deleted: true } }] };
  const compiled = compileUltimateB2ComponentReleaseV2(sources);
  const row = { release_schema_version: compiled.releaseSchemaVersion, compiler_id: compiled.compilerId, runtime_compatibility_sha256: compiled.compatibility,
    source_snapshot: compiled.sourceSnapshot, source_snapshot_sha256: compiled.sourceSnapshotSha256, public_projection: compiled.publicProjection, public_projection_sha256: compiled.publicProjectionSha256,
    teacher_projection: compiled.teacherProjection, teacher_projection_sha256: compiled.teacherProjectionSha256, asset_manifest: compiled.assetManifest, release_sha256: compiled.releaseSha256 };
  assert.equal((await getPublishedPageImage(async () => [row], query, boundary())).statusCode, 404);
});

test("canonical build boundary checks decoded dimensions, MIME, size and checksum", async () => {
  await verifyCanonicalPageBytes(bytes, page);
  for (const changes of [{ width: page.width + 1 }, { height: page.height + 1 }, { byteSize: bytes.length + 1 }, { mimeType: "image/jpeg" }, { checksumSha256: "0".repeat(64) }]) await assert.rejects(() => verifyCanonicalPageBytes(bytes, { ...page, ...changes }));
});

test("internal packaged page keys cannot bypass the LMS Worker through direct static access", async () => {
  const assets = { fetch: () => { throw new Error("must not reach ASSETS"); } };
  for (const method of ["GET", "HEAD"]) {
    const response = await worker.fetch(new Request(`https://lms.test${lmsCanonicalPageAssetPath(page)}`, { method }), { ASSETS: assets });
    assert.equal(response.status, 404);
  }
});
