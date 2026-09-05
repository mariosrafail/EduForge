import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

import { createBuilderNativeActivitiesHandler } from "../../netlify-sites/ultimate-b2-builder/server/_builder-native-activities.js";
import { createBuilderPagesHandler } from "../../netlify-sites/ultimate-b2-builder/server/_builder-pages.js";
import { loadProductionMigrationManifest } from "../../scripts/_migration-readiness.mjs";

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL || "";
const enabled = Boolean(databaseUrl) && process.env.TEST_DATABASE_CONFIRMATION === "isolated-test-database";
const actor = "10000000-0000-4000-8000-000000000056";
const activeB1Tuples = [
  ["ultimate-b1", "ultimate-b1-students-book"],
  ["ultimate-b1", "ultimate-b1-workbook"],
  ["ultimate-b1", "ultimate-b1-grammar-book"],
  ["ultimate-b1-plus", "ultimate-b1-plus-students-book"],
  ["ultimate-b1-plus", "ultimate-b1-plus-workbook"],
  ["ultimate-b1-plus", "ultimate-b1-plus-grammar-book"],
];
const activeTuples = [
  ["ultimate-b2", "ultimate-b2-students-book"],
  ["ultimate-b2", "ultimate-b2-workbook"],
  ["ultimate-b2", "ultimate-b2-grammar-book"],
  ...activeB1Tuples,
];

function scoped(base, schema) {
  const url = new URL(base);
  url.searchParams.set("options", `-c search_path=${schema}`);
  return url.toString();
}

function identityMap(rows, key = "slug", value = "id") {
  return Object.fromEntries(rows.map((row) => [row[key], row[value]]));
}

function queryText(strings, values) {
  let source = strings[0];
  for (let index = 0; index < values.length; index += 1) source += `$${index + 1}${strings[index + 1]}`;
  return source;
}

function tag(pool) {
  return async (strings, ...values) => (await pool.query(queryText(strings, values), values)).rows;
}

function builderEvent(path, { method = "GET", body = null } = {}) {
  return {
    httpMethod: method,
    path,
    headers: {
      host: "localhost:8888",
      ...(method === "POST" ? { origin: "http://localhost:8888", "content-type": "application/json" } : {}),
    },
    body: body === null ? "" : JSON.stringify(body),
  };
}

async function applyMigrations(pool, migrations) {
  for (const migration of migrations) {
    await pool.query("begin");
    try {
      await pool.query(migration.sql);
      await pool.query("commit");
    } catch (error) {
      await pool.query("rollback").catch(() => {});
      throw error;
    }
  }
}

async function preparePage(pool, { bookSlug, componentSlug, pageId, mode, expectedRevision, unitId = null }) {
  const uploadId = randomUUID();
  const clientMutationId = randomUUID();
  const pageKey = `${componentSlug}/pages/${pageId}`;
  const checksum = randomBytes(32).toString("hex");
  const result = await pool.query(`select * from prepare_builder_component_page_upload(
    $1::text,$2::text,$3::text,$4::text,$5::bigint,$6::uuid,$7::uuid,$8::text,
    $9::jsonb,$10::jsonb,$11::text,$12::uuid,$13::timestamptz
  )`, [
    bookSlug,
    componentSlug,
    pageKey,
    mode,
    expectedRevision,
    clientMutationId,
    uploadId,
    checksum,
    JSON.stringify({ label: `Page ${pageId}`, printedLabel: "1", sortOrder: 1, ...(unitId ? { unitId } : {}) }),
    JSON.stringify({ name: `${pageId}.png`, size: 1024, type: "image/png" }),
    `builder-page-assets/${bookSlug}/${componentSlug}/${pageId}/${uploadId}/staging/page-image`,
    actor,
    new Date(Date.now() + 600_000).toISOString(),
  ]);
  return { ...result.rows[0], bookSlug, componentSlug, pageId, pageKey, uploadId, clientMutationId, checksum };
}

async function completePage(pool, prepared) {
  const claimed = await pool.query(
    "select * from claim_builder_component_page_upload($1::uuid,$2::bigint,$3::uuid,$4::uuid)",
    [prepared.uploadId, prepared.current_revision, prepared.clientMutationId, actor],
  );
  assert.equal(claimed.rows[0].outcome, "claimed");
  const checksum = randomBytes(32).toString("hex");
  const completed = await pool.query(`select * from complete_builder_component_page_upload(
    $1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::bigint,$7::text,$8::int,$9::int
  )`, [
    prepared.uploadId,
    actor,
    `builder-page-assets/${prepared.bookSlug}/${prepared.componentSlug}/${prepared.pageId}/assets/${checksum}.png`,
    "private-assets",
    "image/png",
    1024,
    checksum,
    581,
    794,
  ]);
  assert.equal(completed.rows[0].outcome, "saved");
  return completed.rows[0];
}

test("migration 056 adds isolated idempotent B1/B1+ shells and preserves the exact page policy", { skip: !enabled }, async (t) => {
  const schema = `builder_b1_shells_${randomBytes(8).toString("hex")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`create schema "${schema}"`);
  const pool = new Pool({ connectionString: scoped(databaseUrl, schema), max: 4 });
  t.after(async () => {
    await pool.end();
    await admin.query(`drop schema if exists "${schema}" cascade`);
    await admin.end();
  });

  const migrations = await loadProductionMigrationManifest();
  const migrationIndex = migrations.findIndex(({ filename }) => filename === "056_ultimate_b1_managed_package_shells.sql");
  assert.ok(migrationIndex > 0, "The canonical manifest must contain migration 056 and its prerequisites");
  const migration056 = migrations[migrationIndex];
  await applyMigrations(pool, migrations.slice(0, migrationIndex));

  const packagesBefore = identityMap((await pool.query(
    "select slug,id from book_packages where slug in ('ultimate-b1','ultimate-b1-plus') order by slug",
  )).rows);
  const componentsBefore = identityMap((await pool.query(`select component.slug,component.id
    from book_components component
    join book_packages package on package.id=component.book_package_id
    where package.slug in ('ultimate-b1','ultimate-b1-plus')
    order by component.slug`)).rows);
  assert.deepEqual(Object.keys(packagesBefore), ["ultimate-b1", "ultimate-b1-plus"]);
  assert.deepEqual(Object.keys(componentsBefore), [
    "ultimate-b1-plus-students-book",
    "ultimate-b1-plus-workbook",
    "ultimate-b1-students-book",
    "ultimate-b1-workbook",
  ]);

  await applyMigrations(pool, [migration056]);

  assert.deepEqual(identityMap((await pool.query(
    "select slug,id from book_packages where slug in ('ultimate-b1','ultimate-b1-plus') order by slug",
  )).rows), packagesBefore);
  const componentsAfter = (await pool.query(`select package.slug package_slug,component.slug,component.id,component.title,
      component.component_type,component.cover_asset_path,component.sort_order
    from book_components component
    join book_packages package on package.id=component.book_package_id
    where package.slug in ('ultimate-b1','ultimate-b1-plus')
    order by package.slug,component.sort_order`)).rows;
  assert.deepEqual(componentsAfter.map(({ package_slug, slug, title, component_type, cover_asset_path, sort_order }) => ({ package_slug, slug, title, component_type, cover_asset_path, sort_order })), [
    { package_slug: "ultimate-b1", slug: "ultimate-b1-students-book", title: "Ultimate English B1 Students Book", component_type: "students_book", cover_asset_path: null, sort_order: 1 },
    { package_slug: "ultimate-b1", slug: "ultimate-b1-workbook", title: "Ultimate English B1 Workbook", component_type: "workbook", cover_asset_path: null, sort_order: 2 },
    { package_slug: "ultimate-b1", slug: "ultimate-b1-grammar-book", title: "Ultimate English B1 Grammar Book", component_type: "grammar_book", cover_asset_path: null, sort_order: 3 },
    { package_slug: "ultimate-b1", slug: "ultimate-b1-test-book", title: "Ultimate English B1 Test Book", component_type: "test_book", cover_asset_path: null, sort_order: 4 },
    { package_slug: "ultimate-b1-plus", slug: "ultimate-b1-plus-students-book", title: "Ultimate English B1+ Students Book", component_type: "students_book", cover_asset_path: null, sort_order: 1 },
    { package_slug: "ultimate-b1-plus", slug: "ultimate-b1-plus-workbook", title: "Ultimate English B1+ Workbook", component_type: "workbook", cover_asset_path: null, sort_order: 2 },
    { package_slug: "ultimate-b1-plus", slug: "ultimate-b1-plus-grammar-book", title: "Ultimate English B1+ Grammar Book", component_type: "grammar_book", cover_asset_path: null, sort_order: 3 },
    { package_slug: "ultimate-b1-plus", slug: "ultimate-b1-plus-test-book", title: "Ultimate English B1+ Test Book", component_type: "test_book", cover_asset_path: null, sort_order: 4 },
  ]);
  for (const [slug, id] of Object.entries(componentsBefore)) {
    assert.equal(componentsAfter.find((component) => component.slug === slug).id, id);
  }

  const units = (await pool.query(`select package.slug package_slug,component.slug component_slug,unit.id,
      unit.title,unit.slug,unit.unit_number,unit.sort_order
    from units unit
    join book_components component on component.id=unit.book_component_id
    join book_packages package on package.id=component.book_package_id
    where package.slug in ('ultimate-b1','ultimate-b1-plus')
    order by package.slug,component.sort_order,unit.unit_number`)).rows;
  assert.equal(units.length, 60);
  for (const [bookSlug, componentSlug] of activeB1Tuples) {
    const componentUnits = units.filter((unit) => unit.package_slug === bookSlug && unit.component_slug === componentSlug);
    assert.deepEqual(componentUnits.map(({ title, slug, unit_number, sort_order }) => ({ title, slug, unit_number, sort_order })),
      Array.from({ length: 10 }, (_, index) => ({ title: `Unit ${index + 1}`, slug: `unit-${index + 1}`, unit_number: index + 1, sort_order: index + 1 })));
  }
  assert.equal(units.some((unit) => unit.component_slug.endsWith("test-book")), false);

  const empty = (await pool.query(`select
    (select count(*)::int from book_pages where book_package_id in (select id from book_packages where slug in ('ultimate-b1','ultimate-b1-plus'))) pages,
    (select count(*)::int from book_assets where book_package_id in (select id from book_packages where slug in ('ultimate-b1','ultimate-b1-plus'))) assets,
    (select count(*)::int from book_page_hotspots where package_slug in ('ultimate-b1','ultimate-b1-plus')) hotspots,
    (select count(*)::int from book_activities where package_slug in ('ultimate-b1','ultimate-b1-plus')) legacy_activities,
    (select count(*)::int from book_media_assets where package_slug in ('ultimate-b1','ultimate-b1-plus')) legacy_media,
    (select count(*)::int from builder_component_documents where book_package_id in (select id from book_packages where slug in ('ultimate-b1','ultimate-b1-plus'))) documents,
    (select count(*)::int from book_component_releases where book_package_id in (select id from book_packages where slug in ('ultimate-b1','ultimate-b1-plus'))) component_releases,
    (select count(*)::int from book_component_publication_heads where book_package_id in (select id from book_packages where slug in ('ultimate-b1','ultimate-b1-plus'))) component_heads,
    (select count(*)::int from book_product_releases where book_package_id in (select id from book_packages where slug in ('ultimate-b1','ultimate-b1-plus'))) product_releases,
    (select count(*)::int from book_product_publication_heads where book_package_id in (select id from book_packages where slug in ('ultimate-b1','ultimate-b1-plus'))) product_heads,
    (select count(*)::int from book_access where book_package_id in (select id from book_packages where slug in ('ultimate-b1','ultimate-b1-plus'))) entitlements,
    (select count(*)::int from activation_codes where book_package_id in (select id from book_packages where slug in ('ultimate-b1','ultimate-b1-plus'))) activation_codes`)).rows[0];
  assert.deepEqual(empty, {
    pages: 0,
    assets: 0,
    hotspots: 0,
    legacy_activities: 0,
    legacy_media: 0,
    documents: 0,
    component_releases: 0,
    component_heads: 0,
    product_releases: 0,
    product_heads: 0,
    entitlements: 0,
    activation_codes: 0,
  });

  const componentIds = identityMap(componentsAfter);
  const unitIds = identityMap(units.map((unit) => ({
    identity: `${unit.package_slug}/${unit.component_slug}/${unit.slug}`,
    id: unit.id,
  })), "identity", "id");
  await applyMigrations(pool, [migration056]);
  assert.deepEqual(identityMap((await pool.query(`select component.slug,component.id
    from book_components component join book_packages package on package.id=component.book_package_id
    where package.slug in ('ultimate-b1','ultimate-b1-plus') order by component.slug`)).rows), componentIds);
  const unitsAfterReplay = (await pool.query(`select package.slug package_slug,component.slug component_slug,unit.slug,unit.id
    from units unit join book_components component on component.id=unit.book_component_id
    join book_packages package on package.id=component.book_package_id
    where package.slug in ('ultimate-b1','ultimate-b1-plus') order by package.slug,component.slug,unit.slug`)).rows;
  assert.equal(unitsAfterReplay.length, 60);
  assert.deepEqual(identityMap(unitsAfterReplay.map((unit) => ({
    identity: `${unit.package_slug}/${unit.component_slug}/${unit.slug}`,
    id: unit.id,
  })), "identity", "id"), unitIds);

  for (const [bookSlug, componentSlug] of activeTuples) {
    const resolved = await pool.query(
      "select * from resolve_builder_page_component($1::text,$2::text)",
      [bookSlug, componentSlug],
    );
    assert.equal(resolved.rowCount, 1, `${bookSlug}/${componentSlug} must resolve`);
  }
  for (const [bookSlug, componentSlug] of [
    ["ultimate-b1", "ultimate-b1-test-book"],
    ["ultimate-b1-plus", "ultimate-b1-plus-test-book"],
    ["ultimate-b1", "ultimate-b1-plus-workbook"],
    ["ultimate-b1-plus", "ultimate-b1-workbook"],
    ["ultimate-b2", "ultimate-b1-workbook"],
    ["unknown-book", "unknown-component"],
  ]) {
    const resolved = await pool.query(
      "select * from resolve_builder_page_component($1::text,$2::text)",
      [bookSlug, componentSlug],
    );
    assert.equal(resolved.rowCount, 0, `${bookSlug}/${componentSlug} must stay closed`);
  }

  await pool.query("insert into builder_users(id,full_name,email,password_hash) values($1,'B1 Shell Actor','b1-shell-actor@example.test','hash')", [actor]);
  const sql = tag(pool);
  const authorize = async () => ({ builderUser: { id: actor } });
  const logger = { error() {}, warn() {} };
  const pagesHandler = createBuilderPagesHandler({ getDatabase: () => sql, authorize, logger });
  const nativeHandler = createBuilderNativeActivitiesHandler({ getDatabase: () => sql, authorize, logger });
  const unitOneByTuple = new Map(units.filter((unit) => unit.unit_number === 1).map((unit) => [`${unit.package_slug}/${unit.component_slug}`, unit.id]));
  const pageIds = new Map();
  const activityIds = new Map();
  for (const [bookSlug, componentSlug] of activeB1Tuples) {
    const tuple = `${bookSlug}/${componentSlug}`;
    const pageRoot = `/builder/api/pages/books/${bookSlug}/components/${componentSlug}`;
    const nativeRoot = `/builder/api/native-activities/books/${bookSlug}/components/${componentSlug}`;
    const initialPagesResponse = await pagesHandler(builderEvent(pageRoot));
    assert.equal(initialPagesResponse.statusCode, 200, initialPagesResponse.body);
    const initialPages = JSON.parse(initialPagesResponse.body);
    assert.deepEqual({ bookSlug: initialPages.component.bookSlug, componentSlug: initialPages.component.componentSlug }, { bookSlug, componentSlug });
    assert.deepEqual(initialPages.pages, []);
    assert.deepEqual(initialPages.deletedPages, []);
    assert.deepEqual(initialPages.units.map(({ unitNumber }) => unitNumber), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const initialNativeResponse = await nativeHandler(builderEvent(`${nativeRoot}/catalog`));
    assert.equal(initialNativeResponse.statusCode, 200, initialNativeResponse.body);
    assert.deepEqual(JSON.parse(initialNativeResponse.body).activities, []);

    const pageId = `first-${componentSlug}`;
    pageIds.set(tuple, pageId);
    const unitId = unitOneByTuple.get(tuple);
    const missingReplace = await preparePage(pool, { bookSlug, componentSlug, pageId: `missing-${componentSlug}`, mode: "replace", expectedRevision: 0, unitId });
    assert.equal(missingReplace.outcome, "page_state_conflict");
    const prepared = await preparePage(pool, { bookSlug, componentSlug, pageId, mode: "create", expectedRevision: 0, unitId });
    assert.equal(prepared.outcome, "prepared");
    const completed = await completePage(pool, prepared);
    assert.equal(completed.revision, "1");
    const saved = (await pool.query(`select page.unit_id,page.source_metadata,asset.book_package_id,asset.book_component_id
      from book_pages page join book_assets asset on asset.page_id=page.id and asset.publication_status='draft'
      where page.book_component_id=$1 and page.stable_key=$2`, [componentIds[componentSlug], prepared.pageKey])).rows[0];
    assert.equal(saved.unit_id, unitId);
    assert.equal(saved.source_metadata.is_active, true);
    assert.equal(saved.source_metadata.is_override, false);
    const duplicateCreate = await preparePage(pool, { bookSlug, componentSlug, pageId, mode: "create", expectedRevision: 1, unitId });
    assert.equal(duplicateCreate.outcome, "page_state_conflict");
    const allowedReplace = await preparePage(pool, { bookSlug, componentSlug, pageId, mode: "replace", expectedRevision: 1, unitId });
    assert.equal(allowedReplace.outcome, "prepared");

    const reloadedPagesResponse = await pagesHandler(builderEvent(pageRoot));
    assert.equal(reloadedPagesResponse.statusCode, 200, reloadedPagesResponse.body);
    const reloadedPages = JSON.parse(reloadedPagesResponse.body);
    assert.deepEqual(reloadedPages.pages.map((page) => page.id), [pageId]);
    assert.equal(reloadedPages.pages[0].componentSlug, componentSlug);
    assert.equal(reloadedPages.pages[0].unitId, unitId);
    assert.equal(reloadedPages.pages[0].unitNumber, 1);

    const createdActivityResponse = await nativeHandler(builderEvent(`${nativeRoot}/create`, {
      method: "POST",
      body: { kind: "open-response", pageId, title: `First ${componentSlug} activity`, clientMutationId: randomUUID() },
    }));
    assert.equal(createdActivityResponse.statusCode, 200, createdActivityResponse.body);
    const createdActivity = JSON.parse(createdActivityResponse.body);
    activityIds.set(tuple, createdActivity.activityId);
    const reloadedNativeResponse = await nativeHandler(builderEvent(`${nativeRoot}/catalog`));
    assert.equal(reloadedNativeResponse.statusCode, 200, reloadedNativeResponse.body);
    const reloadedNative = JSON.parse(reloadedNativeResponse.body);
    assert.deepEqual({ bookSlug: reloadedNative.bookSlug, componentSlug: reloadedNative.componentSlug }, { bookSlug, componentSlug });
    assert.deepEqual(reloadedNative.activities.map(({ activityId }) => activityId), [createdActivity.activityId]);
  }

  for (let index = 0; index < activeB1Tuples.length; index += 1) {
    const [sourceBookSlug, sourceComponentSlug] = activeB1Tuples[index];
    const [foreignBookSlug, foreignComponentSlug] = activeB1Tuples[(index + 1) % activeB1Tuples.length];
    const sourceTuple = `${sourceBookSlug}/${sourceComponentSlug}`;
    const sourcePageId = pageIds.get(sourceTuple);
    const sourceActivityId = activityIds.get(sourceTuple);
    const foreignPageDelete = await pagesHandler(builderEvent(
      `/builder/api/pages/books/${foreignBookSlug}/components/${foreignComponentSlug}/pages/${sourcePageId}/delete`,
      { method: "POST", body: { expectedRevision: 1, expectedHotspotRevision: 0, clientMutationId: randomUUID(), metadata: {} } },
    ));
    assert.equal(foreignPageDelete.statusCode, 404, foreignPageDelete.body);
    const sourcePages = JSON.parse((await pagesHandler(builderEvent(
      `/builder/api/pages/books/${sourceBookSlug}/components/${sourceComponentSlug}`,
    ))).body);
    assert.deepEqual(sourcePages.pages.map((page) => page.id), [sourcePageId]);

    const foreignNativeDelete = await nativeHandler(builderEvent(
      `/builder/api/native-activities/books/${foreignBookSlug}/components/${foreignComponentSlug}/activities/${sourceActivityId}/delete`,
      { method: "POST", body: { clientMutationId: randomUUID() } },
    ));
    assert.equal(foreignNativeDelete.statusCode, 404, foreignNativeDelete.body);
    const sourceNative = JSON.parse((await nativeHandler(builderEvent(
      `/builder/api/native-activities/books/${sourceBookSlug}/components/${sourceComponentSlug}/catalog`,
    ))).body);
    assert.deepEqual(sourceNative.activities.map(({ activityId }) => activityId), [sourceActivityId]);
  }

  for (const [bookSlug, componentSlug] of activeB1Tuples) {
    const tuple = `${bookSlug}/${componentSlug}`;
    const pageId = pageIds.get(tuple);
    const activityId = activityIds.get(tuple);
    const nativeRoot = `/builder/api/native-activities/books/${bookSlug}/components/${componentSlug}`;
    const deletedActivityResponse = await nativeHandler(builderEvent(`${nativeRoot}/activities/${activityId}/delete`, {
      method: "POST",
      body: { clientMutationId: randomUUID() },
    }));
    assert.equal(deletedActivityResponse.statusCode, 200, deletedActivityResponse.body);
    const emptyNative = JSON.parse((await nativeHandler(builderEvent(`${nativeRoot}/catalog`))).body);
    assert.deepEqual(emptyNative.activities, []);

    const pageRoot = `/builder/api/pages/books/${bookSlug}/components/${componentSlug}`;
    const deletedPageResponse = await pagesHandler(builderEvent(`${pageRoot}/pages/${pageId}/delete`, {
      method: "POST",
      body: { expectedRevision: 1, expectedHotspotRevision: 0, clientMutationId: randomUUID(), metadata: {} },
    }));
    assert.equal(deletedPageResponse.statusCode, 200, deletedPageResponse.body);
    const deletedPageState = JSON.parse(deletedPageResponse.body);
    assert.deepEqual(deletedPageState.pages, []);
    assert.deepEqual(deletedPageState.deletedPages.map((page) => page.id), [pageId]);
    const reloadedDeletedPageState = JSON.parse((await pagesHandler(builderEvent(pageRoot))).body);
    assert.deepEqual(reloadedDeletedPageState.pages, []);
    assert.deepEqual(reloadedDeletedPageState.deletedPages.map((page) => page.id), [pageId]);
  }

  for (const [bookSlug, componentSlug] of [
    ["ultimate-b1", "ultimate-b1-test-book"],
    ["ultimate-b1-plus", "ultimate-b1-plus-test-book"],
    ["ultimate-b1", "ultimate-b1-plus-workbook"],
    ["unknown-book", "unknown-component"],
  ]) {
    const rejected = await preparePage(pool, { bookSlug, componentSlug, pageId: "forbidden", mode: "create", expectedRevision: 0 });
    assert.equal(rejected.outcome, "resource_not_found");
  }

  const b2StudentCreate = await preparePage(pool, {
    bookSlug: "ultimate-b2",
    componentSlug: "ultimate-b2-students-book",
    pageId: "ub2-sb-unit-1-part-1",
    mode: "create",
    expectedRevision: 0,
  });
  assert.equal(b2StudentCreate.outcome, "operation_not_allowed");
  const b2StudentReplace = await preparePage(pool, {
    bookSlug: "ultimate-b2",
    componentSlug: "ultimate-b2-students-book",
    pageId: "ub2-sb-unit-1-part-1",
    mode: "replace",
    expectedRevision: 0,
  });
  assert.equal(b2StudentReplace.outcome, "prepared");
  const b2StudentCompleted = await completePage(pool, b2StudentReplace);
  assert.equal(b2StudentCompleted.revision, "1");
  const b2StudentMetadata = (await pool.query("select source_metadata from book_pages where stable_key=$1", [b2StudentReplace.pageKey])).rows[0].source_metadata;
  assert.equal(b2StudentMetadata.is_override, true);
  assert.equal(b2StudentMetadata.is_active, true);

  for (const componentSlug of ["ultimate-b2-workbook", "ultimate-b2-grammar-book"]) {
    const unitId = (await pool.query(`select unit.id from units unit
      join book_components component on component.id=unit.book_component_id
      join book_packages package on package.id=component.book_package_id
      where package.slug='ultimate-b2' and component.slug=$1 and unit.unit_number=1`, [componentSlug])).rows[0].id;
    const prepared = await preparePage(pool, { bookSlug: "ultimate-b2", componentSlug, pageId: `preserved-${componentSlug}`, mode: "create", expectedRevision: 0, unitId });
    assert.equal(prepared.outcome, "prepared");
    const completed = await completePage(pool, prepared);
    assert.equal(completed.revision, "1");
  }
});
