import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { buildBuilderPageAssetObjectKey } from "../lib/book-assets/object-keys.js";
import { auditBuilderPublicationAssets } from "../scripts/audit-builder-publication-assets.mjs";

test("publication source audit compiles fixtures, performs HEAD-only verification, and reports no storage identity", async () => {
  const checksum = "a".repeat(64);
  const descriptor = { sha256: checksum, extension: "png", mediaType: "image/png", role: "managed_page_image" };
  const objectKey = buildBuilderPageAssetObjectKey({ bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook", pageId: "page-one", checksum, extension: ".png" });
  const source = { descriptor, row: { id: randomUUID(), book_slug: "ultimate-b2", component_slug: "ultimate-b2-workbook", asset_role: "page_image", checksum_sha256: checksum,
    byte_size: 68, mime_type: "image/png", object_key: objectKey, storage_profile: "private", storage_bucket: "private-fixture",
    publication_status: "draft", access_level: "internal", source_metadata: { publication_page_id: "page-one" } } };
  const operations = [];
  const storage = {
    bucket: () => "private-fixture",
    async head(input) { operations.push(["head", input]); return { checksumSha256: checksum, byteSize: 68, contentType: "image/png" }; },
    async upload() { operations.push(["upload"]); }, async delete() { operations.push(["delete"]); }, async copyVerifiedImmutable() { operations.push(["copy"]); },
  };
  const messages = [];
  const reports = await auditBuilderPublicationAssets({
    sql: {}, storage, logger: { log(message) { messages.push(message); } },
    components: [{ componentSlug: "ultimate-b2-workbook", compiler: { collect: async () => ({}), compile: () => ({ assetManifest: [descriptor], nativeAssetSources: [source] }) } }],
  });
  assert.deepEqual(operations.map(([operation]) => operation), ["head"]);
  assert.deepEqual(reports, [{ componentSlug: "ultimate-b2-workbook", role: "managed_page_image", assetId: source.row.id, status: "verified" }]);
  assert.doesNotMatch(messages[0], /builder-page-assets|private-fixture|objectKey|bucket|etag|url/i);
});
