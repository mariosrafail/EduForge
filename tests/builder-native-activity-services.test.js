import assert from "node:assert/strict";
import test from "node:test";

import { builderDocumentSha256 } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { collectBuilderNativeActivityCatalogSources } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-store.js";
import { createPublicationV2FixtureSources, publicationV2Fixture } from "./fixtures/publication-v2.js";

function stored(documentType, documentKey, payload, revision = 1) {
  return {
    document_type: documentType, document_key: documentKey, schema_version: "1.0", revision,
    payload, payload_sha256: builderDocumentSha256(payload),
  };
}

test("dedicated native catalog collection reads only its trusted index and indexed pairs", async () => {
  const fixture = createPublicationV2FixtureSources();
  const entry = fixture.native.index.payload.activities[0];
  const publicPayload = fixture.native.activities[entry.activityId].public.payload;
  const teacherPayload = fixture.native.activities[entry.activityId].teacher.payload;
  const queries = [];
  const responses = [[{
    book_slug: "ultimate-b2", component_slug: "ultimate-b2-students-book",
    ...stored("native_activity_index", "default", { schemaVersion: "1.0", activities: [entry] }, 2),
  }], [
    stored("native_activity_public", entry.activityId, publicPayload, 3),
    stored("native_activity_teacher", entry.activityId, teacherPayload, 3),
  ]];
  const sql = async (strings) => { queries.push(strings.join("?")); return responses.shift(); };
  const sources = await collectBuilderNativeActivityCatalogSources(sql, {
    bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book",
  });
  assert.deepEqual(sources.native.index.payload.activities, [entry]);
  assert.deepEqual(sources.native.activities[entry.activityId].public.payload, publicPayload);
  assert.equal(queries.length, 2);
  assert.match(queries[0], /native_activity_index/);
  assert.match(queries[1], /native_activity_public/);
  assert.match(queries[1], /native_activity_teacher/);
  assert.doesNotMatch(queries.join("\n"), /open_response|teacher_ui|builder_open_response_imports|unit_extras/);
});

test("dedicated native catalog collection fails closed on an invalid index checksum", async () => {
  const fixture = createPublicationV2FixtureSources();
  const row = {
    book_slug: "ultimate-b2", component_slug: "ultimate-b2-students-book",
    ...stored("native_activity_index", "default", fixture.native.index.payload, 2), payload_sha256: "b".repeat(64),
  };
  const sql = async () => [row];
  await assert.rejects(
    collectBuilderNativeActivityCatalogSources(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book" }),
    /Native activity index is invalid/,
  );
});

test("dedicated native catalog collection does not fall back across components", async () => {
  let calls = 0;
  const sql = async () => { calls += 1; return []; };
  await assert.rejects(
    collectBuilderNativeActivityCatalogSources(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook" }),
    /Publication component is unavailable/,
  );
  assert.equal(calls, 1);
  assert.equal(publicationV2Fixture.openResponseId.startsWith("ultimate-b2-sb-"), true);
});
