import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("page migration reuses book_pages/book_assets and enforces scoped revisions and developer actors", async () => {
  const sql = await readFile("database/045_builder_component_pages.sql", "utf8");
  assert.match(sql, /references book_pages\(id\)/i);
  assert.match(sql, /references book_assets\(id\)/i);
  assert.match(sql, /status='active' and role='developer'/i);
  assert.match(sql, /component\.slug in \('ultimate-b2-students-book','ultimate-b2-workbook'\)/i);
  assert.match(sql, /page_referenced/i);
  assert.match(sql, /storage_profile='private'/i);
  assert.match(sql, /access_level='internal'/i);
  assert.doesNotMatch(sql, /create table if not exists (?!builder_component_page_)(?:pages|page_assets)/i);
});

test("migration 052 preserves only canonical Students Book Unit Extras references", async () => {
  const migration051 = await readFile("database/051_builder_page_deletion_lifecycle.sql", "utf8");
  const migration052 = await readFile("database/052_builder_page_unit_extras_preservation.sql", "utf8");

  assert.match(migration052, /create or replace function delete_builder_component_page_lifecycle\(/i);
  assert.doesNotMatch(migration052, /create or replace function restore_builder_students_page\(/i);
  assert.match(migration052, /requested_book_slug='ultimate-b2'[\s\S]*requested_component_slug='ultimate-b2-students-book'[\s\S]*document_type='unit_extras'[\s\S]*document_key='default'/i);
  assert.match(migration052, /document_type not in \('hotspots','native_activity_index','native_activity_public','native_activity_teacher','activity_lifecycle','open_response'\)/i);
  assert.match(migration052, /return query select 'unsupported_page_reference'/i);
  assert.doesNotMatch(migration052, /(?:update|delete from)\s+builder_component_documents[\s\S]*unit_extras/i);
  assert.doesNotMatch(migration052, /unit_extra_video/i);
  assert.match(migration051, /and document_type not in \('hotspots','native_activity_index','native_activity_public','native_activity_teacher','activity_lifecycle','open_response'\)/i);
  assert.doesNotMatch(migration051, /document_type='unit_extras'/i);
});

test("migration 053 completes restore, permanent tombstones, and independent Student overrides", async () => {
  const sql = await readFile("database/053_builder_page_lifecycle_completion.sql", "utf8");
  assert.match(sql, /create or replace function restore_builder_component_page\(/i);
  assert.match(sql, /create or replace function purge_builder_component_page\(/i);
  assert.match(sql, /is_permanently_deleted/i);
  assert.match(sql, /restorable_asset_id/i);
  assert.match(sql, /has_metadata_override/i);
  assert.match(sql, /has_image_override/i);
  assert.match(sql, /storage_profile='private'[\s\S]*access_level='internal'/i);
  assert.match(sql, /hotspots_restored',false/i);
  assert.doesNotMatch(sql, /delete\s+from\s+(?:book_pages|book_assets|builder_audit_log|builder_component_releases)/i);
});

test("migration 056 provisions only empty B1 shells and keeps page authorization tuple-scoped", async () => {
  const sql = await readFile("database/056_ultimate_b1_managed_package_shells.sql", "utf8");
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
  const resolverStart = sql.indexOf("create or replace function resolve_builder_page_component");
  const prepareStart = sql.indexOf("create or replace function prepare_builder_component_page_upload");
  assert.notEqual(resolverStart, -1);
  assert.notEqual(prepareStart, -1);
  const resolver = sql.slice(resolverStart, prepareStart);
  const resolverTuples = [...resolver.matchAll(/\('([^']+)','([^']+)'\)/g)].map((match) => match.slice(1));
  assert.deepEqual(resolverTuples, activeTuples);
  assert.doesNotMatch(resolver, /test-book/i);

  const unitSeedStart = sql.indexOf("with active_component_seed");
  const unitSeedEnd = sql.indexOf("-- Page authoring");
  const unitSeed = sql.slice(unitSeedStart, unitSeedEnd);
  const unitSeedTuples = [...unitSeed.matchAll(/\('([^']+)','([^']+)'\)/g)].map((match) => match.slice(1));
  assert.deepEqual(unitSeedTuples, activeB1Tuples);
  assert.match(unitSeed, /cross join generate_series\(1,10\)/i);

  assert.match(sql, /\('ultimate-b1','Ultimate English B1 Grammar Book','ultimate-b1-grammar-book','grammar_book',3\)/);
  assert.match(sql, /\('ultimate-b1','Ultimate English B1 Test Book','ultimate-b1-test-book','test_book',4\)/);
  assert.match(sql, /\('ultimate-b1-plus','Ultimate English B1\+ Grammar Book','ultimate-b1-plus-grammar-book','grammar_book',3\)/);
  assert.match(sql, /\('ultimate-b1-plus','Ultimate English B1\+ Test Book','ultimate-b1-plus-test-book','test_book',4\)/);
  assert.match(sql, /requested_book_slug='ultimate-b2' and requested_component_slug='ultimate-b2-students-book' and requested_mode<>'replace'/i);
  assert.match(sql, /requested_mode='create'[\s\S]*page_row\.id is not null[\s\S]*requested_mode='replace'[\s\S]*page_row\.id is null/i);
  assert.doesNotMatch(sql, /insert into\s+(?:book_pages|book_assets|book_page_hotspots|book_activities|book_media_assets|builder_component_documents|book_component_releases|book_product_releases|book_access|activation_codes)\b/i);
  assert.doesNotMatch(sql, /prepare_builder_unit_extra_asset_upload|builder_product_|book_component_release/i);
});
