import assert from "node:assert/strict";
import test from "node:test";

import {
  claimBuilderPageUpload,
  completeBuilderPageUpload,
  loadBuilderPages,
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
