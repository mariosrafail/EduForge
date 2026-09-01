import assert from "node:assert/strict";
import test from "node:test";

import { getNativeActivityCatalog, getNativeActivityCatalogResult } from "../src/apps/book-builder/hosted/builderNativeActivityApi.js";

const identity = { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book" };
const activity = { activityId: "ultimate-b2-sb-u1-p1-o1", kind: "open-response", placement: { pageId: "ub2-sb-unit-1-part-1" }, title: "Valid", ready: true, issues: [] };
const diagnostic = { activityId: "ultimate-b2-sb-u1-p1-o2", kind: "open-response", pageId: "ub2-sb-unit-1-part-1", code: "pair_missing", stage: "pair-load", loadable: false, ready: false };

function response(value) { return { ok: true, json: async () => value }; }

test("catalog client exposes a richer result while preserving the activities-array API", async () => {
  const originalFetch = globalThis.fetch;
  const envelope = { schemaVersion: "1.0", ...identity, activities: [activity], invalidActivities: [diagnostic] };
  globalThis.fetch = async () => response(envelope);
  try {
    assert.deepEqual(await getNativeActivityCatalogResult(identity), { activities: [activity], invalidActivities: [diagnostic] });
    assert.deepEqual(await getNativeActivityCatalog(identity), [activity]);
  } finally { globalThis.fetch = originalFetch; }
});

test("catalog client rejects diagnostics that could smuggle raw or private fields", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => response({ schemaVersion: "1.0", ...identity, activities: [activity], invalidActivities: [{ ...diagnostic, teacherAnswer: "private" }] });
  try {
    await assert.rejects(getNativeActivityCatalogResult(identity), /diagnostics are invalid/);
  } finally { globalThis.fetch = originalFetch; }
});
