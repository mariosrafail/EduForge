import assert from "node:assert/strict";
import test from "node:test";

import {
  claimBuilderPageUpload,
  completeBuilderPageUpload,
  loadBuilderPages,
  mutateCanonicalBuilderPage,
  mutateBuilderPage,
  prepareBuilderPageUpload,
} from "../netlify-sites/ultimate-b2-builder/server/_builder-pages-store.js";

function sqlReturning(...responses) {
  return async () => responses.shift();
}

test("Pages store exposes PostgreSQL bigint revisions as safe JavaScript numbers", async () => {
  const loaded = await loadBuilderPages(sqlReturning([{ revision: "0" }], []), { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook" });
  assert.equal(loaded.revision, 0);
  assert.equal((await prepareBuilderPageUpload(sqlReturning([{ current_revision: "1" }]), {})).current_revision, 1);
  assert.equal((await claimBuilderPageUpload(sqlReturning([{ current_revision: 2 }]), {})).current_revision, 2);
  assert.equal((await completeBuilderPageUpload(sqlReturning([{ revision: "1" }]), {})).revision, 1);
  assert.equal((await mutateBuilderPage(sqlReturning([{ current_revision: "3" }]), {})).current_revision, 3);
});

test("Pages store preserves nullable outcome revisions", async () => {
  assert.equal((await prepareBuilderPageUpload(sqlReturning([{ current_revision: null }]), {})).current_revision, null);
  assert.equal((await claimBuilderPageUpload(sqlReturning([{ current_revision: null }]), {})).current_revision, null);
  assert.equal((await mutateBuilderPage(sqlReturning([{ current_revision: null }]), {})).current_revision, null);
});

test("Pages store rejects malformed, negative, fractional, and unsafe revisions", async () => {
  for (const value of ["abc", "-1", "1.2", Number.NaN, Number.POSITIVE_INFINITY, "9007199254740992"]) {
    await assert.rejects(
      prepareBuilderPageUpload(sqlReturning([{ current_revision: value }]), {}),
      /invalid_builder_page_revision/,
    );
  }
});

test("Canonical Students page mutations serialize materialization and normalize the resulting revision", async () => {
  const queries = [];
  const sql = async () => [];
  sql.transaction = async (build) => {
    const transaction = (strings, ...values) => {
      const query = { strings, values };
      queries.push(query);
      return query;
    };
    const built = build(transaction);
    assert.equal(built.length, 3);
    return [[{ locked: null }], [], [{ outcome: "saved", current_revision: "1" }]];
  };
  const result = await mutateCanonicalBuilderPage(sql, {
    bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book",
    pageKey: "ultimate-b2-students-book/pages/ub2-sb-unit-1-part-1", action: "metadata",
    expectedRevision: 0, clientMutationId: "10000000-0000-4000-8000-000000000001",
    pageMetadata: { label: "Edited", printedLabel: "2-3", sortOrder: 1 },
    builderUserId: "10000000-0000-4000-8000-000000000002",
    canonicalPage: {
      stableKey: "ultimate-b2-students-book/pages/ub2-sb-unit-1-part-1", unitNumber: 1,
      label: "Unit 1", printedLabel: "2-3", sortOrder: 1, checksumSha256: "a".repeat(64),
      mimeType: "image/png", width: 581, height: 794,
    },
  });
  assert.deepEqual(result, { outcome: "saved", current_revision: 1 });
  assert.equal(queries.length, 3);
  assert.match(queries[0].strings.join("?"), /pg_advisory_xact_lock/);
  assert.match(queries[1].strings.join("?"), /insert into builder_component_page_revisions/);
  assert.match(queries[2].strings.join("?"), /for update/);
  assert.match(queries[2].strings.join("?"), /insert into book_pages/);
  assert.match(queries[2].strings.join("?"), /revision_lock\.revision=/);
});

test("Canonical Students page mutations fail closed without transaction support or trusted baseline identity", async () => {
  const input = {
    bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", pageKey: "ultimate-b2-students-book/pages/one",
    action: "metadata", expectedRevision: 0, clientMutationId: "10000000-0000-4000-8000-000000000001",
    pageMetadata: {}, builderUserId: "10000000-0000-4000-8000-000000000002",
    canonicalPage: { stableKey: "ultimate-b2-students-book/pages/other", unitNumber: 1, label: "One", printedLabel: "1", sortOrder: 1, checksumSha256: "a".repeat(64), mimeType: "image/png", width: 1, height: 1 },
  };
  await assert.rejects(mutateCanonicalBuilderPage(async () => [], input), /builder_page_transaction_unavailable/);
  const sql = async () => [];
  sql.transaction = async () => [];
  await assert.rejects(mutateCanonicalBuilderPage(sql, input), /invalid_canonical_builder_page/);
});
