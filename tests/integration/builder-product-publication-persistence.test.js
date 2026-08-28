import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

import { compileUltimateB2ComponentReleaseV2 } from "../../netlify-sites/ultimate-b2-builder/server/_builder-publication-compiler-v2.js";
import { compileUltimateB2ManagedComponentRelease } from "../../netlify-sites/ultimate-b2-builder/server/_builder-managed-publication-compiler.js";
import {
  collectUltimateB2ManagedPublicationSources,
  collectUltimateB2PublicationV2Sources,
  createComponentRelease,
  publishComponentRelease,
} from "../../netlify-sites/ultimate-b2-builder/server/_builder-publication-store.js";
import {
  productReleaseMemberSha256,
  productReleaseSha256,
  productReleaseSourceSha256,
  verifyProductReleaseEnvelope,
} from "../../netlify-sites/ultimate-b2-builder/server/_builder-product-publication-domain.js";
import { loadProductionMigrationManifest } from "../../scripts/_migration-readiness.mjs";

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL || "";
const enabled = Boolean(databaseUrl) && process.env.TEST_DATABASE_CONFIRMATION === "isolated-test-database";
const actor = "10000000-0000-4000-8000-000000000048";
const hash = (character) => character.repeat(64);

function scoped(base, schema) {
  const url = new URL(base);
  url.searchParams.set("options", `-c search_path=${schema}`);
  return url.toString();
}

function tag(pool) {
  return async (strings, ...values) => {
    let text = strings[0];
    for (let index = 0; index < values.length; index += 1) text += `$${index + 1}${strings[index + 1]}`;
    return (await pool.query(text, values)).rows;
  };
}

async function apply(pool, migrations) {
  for (const migration of migrations) {
    await pool.query("begin");
    try {
      await pool.query(migration.sql);
      await pool.query("insert into eduforge_migration_history(filename,checksum_sha256) values($1,$2)", [migration.filename, migration.checksum]);
      await pool.query("commit");
    } catch (error) {
      await pool.query("rollback").catch(() => {});
      throw error;
    }
  }
}

function componentInput(componentSlug, compilerId, releaseSchemaVersion, marker) {
  const sourceSnapshot = compilerId === "ultimate-b2-students-book-v2" ? null : {
    pages: { revision: 0 },
    hotspots: { revision: 0, sha256: hash(marker) },
    activityLifecycle: { revision: 0, sha256: hash(marker) },
    nativeIndex: { revision: 0, sha256: hash(marker) },
    nativeActivities: {},
  };
  return {
    componentSlug,
    compilerId,
    releaseSchemaVersion,
    releaseId: randomUUID(),
    compatibility: hash(marker),
    sourceSnapshot,
    sourceSnapshotSha256: hash(marker),
    publicProjection: { componentSlug, marker },
    publicProjectionSha256: hash(marker),
    teacherProjection: { componentSlug, marker },
    teacherProjectionSha256: hash(marker),
    assetManifest: [],
    releaseSha256: hash(marker),
    requestSha256: hash(marker),
  };
}

async function createProduct(pool, { productReleaseId, members, mutationId, requestSha256 = hash("9") }) {
  return (await pool.query(
    "select * from create_builder_product_release($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9)",
    [productReleaseId, "ultimate-b2", "1.0", "ultimate-b2-product-v1", JSON.stringify(members), requestSha256, "Atomic family", actor, mutationId],
  )).rows[0];
}

test("migration 048 backfills truthful legacy families and publishes exact three-member products atomically", { skip: !enabled, timeout: 120_000 }, async (t) => {
  const schema = `builder_product_publication_${randomBytes(8).toString("hex")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`create schema "${schema}"`);
  const pool = new Pool({ connectionString: scoped(databaseUrl, schema), max: 4 });
  t.after(async () => {
    await pool.end();
    await admin.query(`drop schema if exists "${schema}" cascade`);
    await admin.end();
  });

  const migrations = await loadProductionMigrationManifest();
  const productMigrationIndex = migrations.findIndex((migration) => migration.filename === "048_ultimate_b2_product_publication.sql");
  assert.equal(productMigrationIndex, migrations.length - 1);
  await pool.query("create table eduforge_migration_history(filename text primary key,checksum_sha256 text not null,applied_at timestamptz not null default now())");
  await apply(pool, migrations.slice(0, productMigrationIndex));
  await pool.query("insert into builder_users(id,full_name,email,password_hash) values($1,'Product Publication Integration','product-publication@example.test','not-a-real-login-hash')", [actor]);
  const sql = tag(pool);

  const legacyCompiled = compileUltimateB2ComponentReleaseV2(await collectUltimateB2PublicationV2Sources(sql));
  const legacyCreated = await createComponentRelease(sql, {
    bookSlug: "ultimate-b2",
    componentSlug: "ultimate-b2-students-book",
    ...legacyCompiled,
    requestSha256: legacyCompiled.releaseSha256,
    releaseNote: "Students only",
    clientMutationId: randomUUID(),
    builderUserId: actor,
  });
  assert.equal(legacyCreated.outcome, "created");
  const legacyPublished = await publishComponentRelease(sql, {
    bookSlug: "ultimate-b2",
    componentSlug: "ultimate-b2-students-book",
    releaseId: legacyCreated.releaseId,
    expectedHeadRevision: 0,
    requestSha256: hash("8"),
    builderUserId: actor,
    clientMutationId: randomUUID(),
  });
  assert.equal(legacyPublished.outcome, "published");

  await apply(pool, migrations.slice(productMigrationIndex));
  const legacy = (await pool.query(`
    select product.id,product.release_number,product.compiler_id,product.release_schema_version,
      product.source_snapshot_sha256,product.release_sha256,coalesce(product.release_note,'') release_note,product.created_at,
      jsonb_agg(jsonb_build_object(
        'componentSlug',component.slug,'order',member.member_order,'status',member.member_status,
        'componentReleaseId',member.component_release_id,'compilerId',member.component_compiler_id,
        'releaseSchemaVersion',member.component_release_schema_version,'releaseSha256',member.component_release_sha256,
        'compatibility',member.runtime_compatibility_sha256,'memberSha256',member.member_sha256,
        'unavailableReason',member.unavailable_reason
      ) order by member.member_order) members
    from book_product_releases product
    join book_product_release_members member on member.product_release_id=product.id
    join book_components component on component.id=member.book_component_id
    where product.compiler_id='ultimate-b2-product-legacy-v1'
    group by product.id
  `)).rows[0];
  const legacyEnvelope = verifyProductReleaseEnvelope({
    id: legacy.id,
    number: Number(legacy.release_number),
    bookSlug: "ultimate-b2",
    compilerId: legacy.compiler_id,
    releaseSchemaVersion: legacy.release_schema_version,
    sourceSnapshotSha256: legacy.source_snapshot_sha256,
    releaseSha256: legacy.release_sha256,
    releaseNote: legacy.release_note,
    createdAt: legacy.created_at.toISOString(),
    members: legacy.members.map((member) => ({ ...member, order: Number(member.order) })),
  });
  assert.equal(legacyEnvelope.members[0].componentReleaseId, legacyCreated.releaseId);
  assert.deepEqual(legacyEnvelope.members.slice(1).map((member) => [member.status, member.unavailableReason]), [
    ["unavailable", "not_in_legacy_release"],
    ["unavailable", "not_in_legacy_release"],
  ]);
  assert.equal((await pool.query("select head_revision from book_product_publication_heads")).rows[0].head_revision, "1");
  const legacyRepublish = (await pool.query("select * from publish_builder_product_release($1,$2,$3,$4,$5,$6)", ["ultimate-b2", legacy.id, 1, hash("5"), actor, randomUUID()])).rows[0];
  assert.equal(legacyRepublish.outcome, "incomplete_product_release");

  const studentsCompiled = compileUltimateB2ComponentReleaseV2(await collectUltimateB2PublicationV2Sources(sql));
  const students = { ...componentInput("ultimate-b2-students-book", "ultimate-b2-students-book-v2", "2.0", "a"), ...studentsCompiled, releaseId: randomUUID(), requestSha256: studentsCompiled.releaseSha256 };
  const workbook = { ...compileUltimateB2ManagedComponentRelease(await collectUltimateB2ManagedPublicationSources(sql, "ultimate-b2-workbook"), "ultimate-b2-workbook"), componentSlug: "ultimate-b2-workbook", releaseId: randomUUID(), requestSha256: hash("b") };
  const grammar = { ...compileUltimateB2ManagedComponentRelease(await collectUltimateB2ManagedPublicationSources(sql, "ultimate-b2-grammar-book"), "ultimate-b2-grammar-book"), componentSlug: "ultimate-b2-grammar-book", releaseId: randomUUID(), requestSha256: hash("c") };
  assert.equal(workbook.publicProjection.units.length, 10);
  assert.equal(grammar.publicProjection.units.length, 10);
  const members = [students, workbook, grammar];
  const mutationId = randomUUID();
  const productReleaseId = randomUUID();
  const before = (await pool.query("select count(*)::int count from book_component_releases")).rows[0].count;
  const created = await createProduct(pool, { productReleaseId, members, mutationId });
  assert.equal(created.outcome, "created");
  assert.equal(created.product_release_number, "2");
  assert.equal(created.members.length, 3);
  assert.equal((await createProduct(pool, { productReleaseId, members, mutationId })).outcome, "idempotent");
  assert.equal((await createProduct(pool, { productReleaseId, members, mutationId, requestSha256: hash("7") })).outcome, "mutation_id_conflict");
  assert.equal((await pool.query("select count(*)::int count from book_component_releases")).rows[0].count, before + 3);

  const malformed = structuredClone(members);
  malformed[2].compilerId = "wrong-compiler";
  await assert.rejects(createProduct(pool, { productReleaseId: randomUUID(), members: malformed, mutationId: randomUUID() }), /product member identity is invalid/);
  assert.equal((await pool.query("select count(*)::int count from book_component_releases")).rows[0].count, before + 3);

  const memberRows = created.members.map((member) => ({ ...member, order: Number(member.order) }));
  for (const member of memberRows) assert.equal(member.memberSha256, productReleaseMemberSha256(member));
  assert.equal(created.source_snapshot_sha256, productReleaseSourceSha256({ bookSlug: "ultimate-b2", releaseNumber: 2, members: memberRows }));
  assert.equal(created.release_sha256, productReleaseSha256({ compilerId: "ultimate-b2-product-v1", releaseSchemaVersion: "1.0", bookSlug: "ultimate-b2", releaseNumber: 2, sourceSnapshotSha256: created.source_snapshot_sha256, releaseNote: "Atomic family", members: memberRows }));

  const publishMutation = randomUUID();
  const published = (await pool.query("select * from publish_builder_product_release($1,$2,$3,$4,$5,$6)", ["ultimate-b2", productReleaseId, 1, hash("6"), actor, publishMutation])).rows[0];
  assert.equal(published.outcome, "published");
  assert.equal(published.head_revision, "2");
  assert.equal((await pool.query("select count(*)::int count from book_component_publication_heads")).rows[0].count, 3);
  assert.deepEqual((await pool.query(`
    select component.slug,release.id release_id from book_component_publication_heads head
    join book_components component on component.id=head.book_component_id
    join book_component_releases release on release.id=head.release_id
    where component.slug in ('ultimate-b2-students-book','ultimate-b2-workbook','ultimate-b2-grammar-book') order by component.sort_order
  `)).rows.map((row) => [row.slug, row.release_id]), memberRows.map((member) => [member.componentSlug, member.componentReleaseId]));
  assert.equal((await pool.query("select * from publish_builder_product_release($1,$2,$3,$4,$5,$6)", ["ultimate-b2", productReleaseId, 1, hash("6"), actor, publishMutation])).rows[0].outcome, "idempotent");

  await assert.rejects(pool.query("update book_product_releases set release_note='changed' where id=$1", [productReleaseId]), /immutable/);
  await assert.rejects(pool.query("delete from book_product_release_members where product_release_id=$1", [productReleaseId]), /immutable/);
  await assert.rejects(pool.query("delete from book_component_releases where id=$1", [workbook.releaseId]), /immutable/);
});
