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
