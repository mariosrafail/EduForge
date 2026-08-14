import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file) => readFile(file, "utf8");

test("migration 032 creates generic Builder documents and append-only revisions in manifest order", async () => {
  const [migration, manifest] = await Promise.all([
    read("database/032_builder_component_authoring.sql"),
    read("database/MIGRATIONS.md"),
  ]);
  assert.match(manifest, /31\. `031_builder_developer_auth\.sql`\s+32\. `032_builder_component_authoring\.sql`\s+33\. `033_builder_open_response_imports\.sql`/);
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
