import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file) => readFile(file, "utf8");

test("migration 032 creates generic Builder documents and append-only revisions in manifest order", async () => {
  const [migration, manifest] = await Promise.all([
    read("database/032_builder_component_authoring.sql"),
    read("database/MIGRATIONS.md"),
  ]);
  assert.match(manifest, /31\. `031_builder_developer_auth\.sql`\s+32\. `032_builder_component_authoring\.sql`\s+33\. `033_builder_open_response_imports\.sql`\s+34\. `034_builder_teacher_ui_asset_uploads\.sql`\s+35\. `035_builder_component_publication\.sql`/);
  assert.match(migration, /create table if not exists builder_component_documents/);
  assert.match(migration, /create table if not exists builder_component_document_revisions/);
  assert.match(migration, /created_by_builder_user_id uuid not null references builder_users/);
  assert.match(migration, /updated_by_builder_user_id uuid not null references builder_users/);
  assert.match(migration, /changed_by_builder_user_id uuid not null references builder_users/);
  assert.doesNotMatch(migration, /(?:created|updated|changed)_by[^\n]*app_users/i);
  assert.match(migration, /builder_component_documents_component_package_fk[\s\S]*foreign key \(book_component_id, book_package_id\)[\s\S]*references book_components\(id, book_package_id\)/);
  assert.match(migration, /unique \(book_component_id, document_type, document_key\)/);
  assert.match(migration, /unique \(document_id, revision\)/);
  assert.match(migration, /unique \(document_id, client_mutation_id\)/);
  assert.match(migration, /payload_sha256 ~ '\^\[a-f0-9\]\{64\}\$'/);
  assert.match(migration, /builder_component_document_revisions_append_only/);
  assert.doesNotMatch(migration, /plain(?:text)?[_ -]?password|builder\.dev[1-5]@/i);
});

test("Task 9 migration creates immutable releases and a single mutable component head", async () => {
  const migration = await read("database/035_builder_component_publication.sql");
  assert.match(migration, /create table if not exists book_component_releases/);
  assert.match(migration, /unique \(book_component_id, release_number\)/);
  assert.match(migration, /create table if not exists book_component_publication_heads/);
  assert.match(migration, /create table if not exists book_component_publication_mutations/);
  assert.match(migration, /book_component_id uuid primary key/);
  assert.match(migration, /Book component releases are immutable/);
  assert.match(migration, /stale_release_preview/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('builder-publication-component:'/);
  assert.match(migration, /preview_release_created/);
  assert.match(migration, /release_published/);
  assert.doesNotMatch(migration, /book_asset_imports|update\s+book_assets|book_page_hotspots/i);
});

test("migration 038 reuses exact in-scope native content without weakening physical object uniqueness", async () => {
  const [migration, assetsMigration] = await Promise.all([
    read("database/038_builder_native_asset_reuse.sql"),
    read("database/018_book_assets.sql"),
  ]);
  const reuseLookup = migration.match(/select asset\.id, asset\.source_metadata->>'asset_slot'[\s\S]*?limit 1;/)?.[0] || "";
  for (const predicate of [
    /asset\.book_package_id=session\.book_package_id/,
    /asset\.book_component_id=session\.book_component_id/,
    /asset\.storage_bucket=requested_storage_bucket/,
    /asset\.object_key=requested_object_key/,
    /asset\.checksum_sha256=requested_checksum/,
    /asset\.mime_type=requested_mime_type/,
    /asset\.byte_size=requested_byte_size/,
    /asset\.width=requested_width/,
    /asset\.height=requested_height/,
    /asset\.asset_role='activity_artwork'/,
    /asset\.publication_status='draft'/,
    /asset\.storage_profile='private'/,
    /asset\.access_level='internal'/,
    /source_metadata->>'native_activity_id'=session\.activity_id/,
  ]) assert.match(reuseLookup, predicate);
  assert.doesNotMatch(reuseLookup, /source_metadata->>'asset_slot'=session\.asset_slot/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /requested_asset_slot[\s\S]*resolved_asset_slot[\s\S]*reused_existing_asset/);
  assert.match(assetsMigration, /create unique index if not exists book_assets_object_unique_idx on book_assets \(storage_bucket, object_key\)/);
  assert.doesNotMatch(migration, /drop\s+index|alter\s+table\s+book_assets\s+drop/i);
});

test("migration 032 performs concurrency, history, and audit in one atomic database call", async () => {
  const migration = await read("database/032_builder_component_authoring.sql");
  const saveFunction = migration.match(/create or replace function save_builder_component_document\([\s\S]*?\n\$\$;/)?.[0] || "";
  assert.match(saveFunction, /pg_advisory_xact_lock/);
  assert.match(saveFunction, /builder_users[\s\S]*status = 'active'[\s\S]*role = 'developer'/);
  assert.match(saveFunction, /for update/);
  assert.match(saveFunction, /expected_revision/);
  assert.match(saveFunction, /revision_conflict/);
  assert.match(saveFunction, /mutation_id_conflict/);
  assert.match(saveFunction, /insert into builder_component_document_revisions/);
  assert.match(saveFunction, /insert into builder_audit_log/);
  assert.match(saveFunction, /'builder_document_saved'/);
  assert.match(saveFunction, /'book_slug'[\s\S]*'component_slug'[\s\S]*'document_type'[\s\S]*'revision'[\s\S]*'source'/);
  assert.doesNotMatch(saveFunction.match(/jsonb_build_object\([\s\S]*?\n\s*\)/)?.[0] || "", /payload|password|token|answer|solution/i);
});

test("migration 033 adds narrow upload sessions plus separate public/Teacher import revisions", async () => {
  const migration = await read("database/033_builder_open_response_imports.sql");
  assert.match(migration, /create table if not exists builder_open_response_import_sessions/);
  assert.match(migration, /create table if not exists builder_open_response_imports/);
  assert.match(migration, /create table if not exists builder_open_response_import_revisions/);
  assert.match(migration, /public_projection jsonb not null/);
  assert.match(migration, /teacher_projection jsonb not null/);
  assert.match(migration, /file_descriptors jsonb not null/);
  assert.doesNotMatch(migration, /file_bytes|bytea|signed_url|access_key|secret_key/i);
  assert.match(migration, /unique \(book_component_id, activity_key, client_mutation_id\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /revision_conflict/);
  assert.match(migration, /builder_open_response_import_revisions_append_only/);
  assert.match(migration, /'builder_open_response_source_imported'/);
});
