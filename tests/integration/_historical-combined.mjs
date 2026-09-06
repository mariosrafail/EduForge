import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { historicalCombinedIdentity, historicalCombinedRelease } from "../fixtures/historical-combined.js";
import { publishedManagedBookFixture } from "../fixtures/published-managed-book.js";
import { productReleaseMemberSha256, productReleaseSourceSha256, productReleaseSha256 } from "../../netlify-sites/ultimate-b2-builder/server/_builder-product-publication-domain.js";
import { getStudentAssignmentDetail } from "../../netlify/functions/_book-content/published-book-actions.js";
import { verifyHistoricalUnitExtrasPersistence } from "./_historical-unit-extras.mjs";

// Real relational families in the owning test's disposable PostgreSQL schema.
// Every family uses distinct immutable members; only synthetic heads move.
export async function verifyHistoricalCombinedPersistence(context) {
  const { pool, sql, scope, builderId, insertRelease, publishRelease, student } = context;
  async function publishFamily({ releaseId, releaseNumber, compiled }) {
    const records = [{ componentId: scope.component_id, releaseId, compiled }];
    for (const componentSlug of ["ultimate-b2-workbook", "ultimate-b2-grammar-book"]) {
      const componentId = (await pool.query("select id from book_components where book_package_id=$1 and slug=$2", [scope.package_id, componentSlug])).rows[0].id;
      const memberCompiled = publishedManagedBookFixture(componentSlug);
      const member = await insertRelease(pool, { packageId: scope.package_id, componentId, builderId, releaseNumber, fixture: { compiled: memberCompiled } });
      const head = (await pool.query("select release_id,head_revision from book_component_publication_heads where book_component_id=$1", [componentId])).rows[0];
      await publishRelease(pool, { packageId: scope.package_id, componentId, builderId, releaseId: member.releaseId, previousReleaseId: head?.release_id || null, revision: Number(head?.head_revision || 0) + 1 });
      records.push({ componentId, releaseId: member.releaseId, compiled: memberCompiled });
    }
    const members = records.map(({ releaseId: componentReleaseId, compiled: c }, index) => {
      const member = { componentSlug: c.publicProjection.componentSlug, order: index + 1, status: "included", componentReleaseId, compilerId: c.compilerId, releaseSchemaVersion: c.releaseSchemaVersion, releaseSha256: c.releaseSha256, compatibility: c.compatibility, unavailableReason: null };
      return { ...member, memberSha256: productReleaseMemberSha256(member) };
    });
    const productId = randomUUID();
    const sourceHash = productReleaseSourceSha256({ bookSlug: "ultimate-b2", releaseNumber, members });
    const releaseHash = productReleaseSha256({ bookSlug: "ultimate-b2", releaseNumber, compilerId: "ultimate-b2-product-v1", releaseSchemaVersion: "1.0", sourceSnapshotSha256: sourceHash, releaseNote: "", members });
    await pool.query("insert into book_product_releases(id,book_package_id,release_number,release_schema_version,compiler_id,source_snapshot_sha256,release_sha256,request_sha256,client_mutation_id,release_note,created_by_builder_user_id) values($1,$2,$3,'1.0','ultimate-b2-product-v1',$4,$5,$5,$6,'',$7)", [productId, scope.package_id, releaseNumber, sourceHash, releaseHash, randomUUID(), builderId]);
    for (const [index, member] of members.entries()) await pool.query("insert into book_product_release_members(product_release_id,book_package_id,book_component_id,member_order,member_status,component_release_id,component_compiler_id,component_release_schema_version,component_release_sha256,runtime_compatibility_sha256,member_sha256) values($1,$2,$3,$4,'included',$5,$6,$7,$8,$9,$10)", [productId, scope.package_id, records[index].componentId, member.order, member.componentReleaseId, member.compilerId, member.releaseSchemaVersion, member.releaseSha256, member.compatibility, member.memberSha256]);
    const head = (await pool.query("select product_release_id,head_revision from book_product_publication_heads where book_package_id=$1", [scope.package_id])).rows[0];
    const revision = Number(head?.head_revision || 0);
    await pool.query("insert into book_product_publication_events(book_package_id,previous_product_release_id,product_release_id,expected_head_revision,resulting_head_revision,request_sha256,client_mutation_id,published_by_builder_user_id) values($1,$2,$3,$4,$5,$6,$7,$8)", [scope.package_id, head?.product_release_id || null, productId, revision, revision + 1, releaseHash, randomUUID(), builderId]);
    await pool.query("insert into book_product_publication_heads(book_package_id,product_release_id,head_revision,published_by_builder_user_id) values($1,$2,$3,$4) on conflict(book_package_id) do update set product_release_id=excluded.product_release_id,head_revision=excluded.head_revision", [scope.package_id, productId, revision + 1, builderId]);
  }
  await verifyHistoricalUnitExtrasPersistence({ ...context, fixture: {
    release: historicalCombinedRelease(), identity: historicalCombinedIdentity, releaseNumber: 201, publishFamily, allPublicAssets: true,
    tamper: (compiled) => { compiled.publicProjection.nativeActivities[historicalCombinedIdentity.activityId].document.audioTextHotspots.hotspots[0].focusLayout = "fixed-aspect"; },
    assertReads: (books, targets) => {
      assert.deepEqual(books.books.map((book) => book.componentSlug).sort(), ["ultimate-b2-students-book", "ultimate-b2-workbook"]);
      const students = books.books.find((book) => book.componentSlug === "ultimate-b2-students-book");
      assert.equal(students.activities.length, 4);
      assert.ok(students.productReleaseId);
      const nativeTargets = targets.targets.filter((target) => target.componentSlug === "ultimate-b2-students-book");
      assert.deepEqual(nativeTargets.map((target) => [target.target.nativeActivityId, target.nativeKind, target.assignable]).sort(), [
        ["ultimate-b2-sb-u1-p1-o95", "listening", true], ["ultimate-b2-sb-u1-p1-o97", "single-choice", true],
        ["ultimate-b2-sb-u1-p1-o98", "image", false], ["ultimate-b2-sb-u1-p1-o99", "open-response", true],
      ]);
      assert.ok(targets.targets.every((target) => target.componentSlug !== "ultimate-b2-grammar-book" && target.componentSlug !== "ultimate-b2-test-book"));
    },
  } });
  const assignment = (await pool.query("select id from activity_assignments where native_activity_id=$1 order by created_at desc limit 1", [historicalCombinedIdentity.activityId])).rows[0];
  assert.equal((await getStudentAssignmentDetail(sql, { ...student, school_id: randomUUID() }, { assignmentId: assignment.id })).statusCode, 404);
}
