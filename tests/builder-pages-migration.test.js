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
