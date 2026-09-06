import assert from "node:assert/strict";
import test from "node:test";
import { compilePublicationV2Fixture } from "./fixtures/publication-v2.js";
import { publishedManagedBookFixture } from "./fixtures/published-managed-book.js";
import { loadVerifiedPublishedBookFamily } from "../netlify/functions/_book-content/published-book-releases.js";
import { productReleaseMemberSha256, productReleaseSourceSha256, productReleaseSha256 } from "../netlify-sites/ultimate-b2-builder/server/_builder-product-publication-domain.js";

function familyFixture() {
  const productId = "10000000-0000-4000-8000-000000000100";
  const compiled = [compilePublicationV2Fixture(), publishedManagedBookFixture(), publishedManagedBookFixture("ultimate-b2-grammar-book")];
  const rows = compiled.map((release, index) => ({
    id: `10000000-0000-4000-8000-00000000000${index + 1}`, book_package_id: "package-id", component_slug: release.publicProjection.componentSlug, release_number: 1,
    compiler_id: release.compilerId, release_schema_version: release.releaseSchemaVersion, runtime_compatibility_sha256: release.compatibility,
    source_snapshot: release.sourceSnapshot, source_snapshot_sha256: release.sourceSnapshotSha256,
    public_projection: release.publicProjection, public_projection_sha256: release.publicProjectionSha256,
    teacher_projection: release.teacherProjection, teacher_projection_sha256: release.teacherProjectionSha256,
    asset_manifest: release.assetManifest, release_sha256: release.releaseSha256,
  }));
  const members = rows.map((row, index) => {
    const member = { componentSlug: row.component_slug, order: index + 1, status: "included", componentReleaseId: row.id, compilerId: row.compiler_id,
      releaseSchemaVersion: row.release_schema_version, releaseSha256: row.release_sha256, compatibility: row.runtime_compatibility_sha256, unavailableReason: null };
    return { ...member, memberSha256: productReleaseMemberSha256(member) };
  });
  const sourceSnapshotSha256 = productReleaseSourceSha256({ bookSlug: "ultimate-b2", releaseNumber: 1, members });
  const releaseSha256 = productReleaseSha256({ bookSlug: "ultimate-b2", releaseNumber: 1, compilerId: "ultimate-b2-product-v1", releaseSchemaVersion: "1.0", sourceSnapshotSha256, releaseNote: "", members });
  const productRows = members.map((member) => ({
    id: productId, release_number: 1, book_slug: "ultimate-b2", compiler_id: "ultimate-b2-product-v1", release_schema_version: "1.0",
    source_snapshot_sha256: sourceSnapshotSha256, release_sha256: releaseSha256, release_note: "", created_at: "2026-09-06T00:00:00Z",
    component_slug: member.componentSlug, member_order: member.order, member_status: member.status, component_release_id: member.componentReleaseId,
    component_compiler_id: member.compilerId, component_release_schema_version: member.releaseSchemaVersion, component_release_sha256: member.releaseSha256,
    runtime_compatibility_sha256: member.compatibility, member_sha256: member.memberSha256, unavailable_reason: null,
  }));
  const queries = [];
  const sql = async (strings) => {
    const query = strings.join("?"); queries.push(query);
    if (query.includes("from book_packages package")) return [{ package_id: "package-id", package_slug: "ultimate-b2", package_title: "Ultimate B2", product_release_id: productId }];
    if (query.includes("from book_product_releases product")) return productRows;
    if (query.includes("from book_product_release_members family_member")) return rows;
    throw new Error("Unexpected query: no fallback to mutable component heads is permitted");
  };
  return { rows, productRows, queries, productId, load: () => loadVerifiedPublishedBookFamily(sql, { role: "teacher" }, { allowed: ["package-id"] }) };
}

test("product family uses exact immutable members, including internal Grammar, without reading component latests", async () => {
  const fixture = familyFixture();
  const result = await fixture.load();
  assert.equal(result.length, 3);
  assert.deepEqual(result.map((item) => item.row.id), fixture.rows.map((row) => row.id));
  assert.ok(result.every((item) => item.productReleaseId === fixture.productId));
  assert.equal(fixture.queries.length, 3);
});

test("missing, swapped, or corrupted family members fail closed instead of mixing publications", async () => {
  const missing = familyFixture(); missing.rows.pop(); await assert.rejects(missing.load, /family_mismatch/);
  const swapped = familyFixture(); swapped.rows[1].id = swapped.rows[0].id; await assert.rejects(swapped.load, /family_mismatch/);
  const changed = familyFixture(); changed.productRows[1].member_sha256 = "a".repeat(64); await assert.rejects(changed.load, /fingerprint is invalid/);
});
