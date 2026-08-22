import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { applyUltimateB2ActivityLifecycle, createEmptyUltimateB2ActivityLifecycle, currentUltimateB2ActivityLifecycleEntry, normalizeUltimateB2ActivityLifecycle, updateUltimateB2ActivityLifecycle } from "../src/data/ultimate-b2/activityLifecycle.js";
import { buildActivityBuilderNavigation, findActivityBuilderItem } from "../src/apps/ultimate-b2-builder/activityBuilderNavigation.js";

const units = [
  { id: "u1", unitNumber: 1, lessons: [{ id: "source", pageLabel: "Page 1", exercises: [{ stableActivityId: "canonical-one", title: "One", activityType: "matching" }] }] },
  { id: "u2", unitNumber: 2, lessons: [{ id: "destination", pageLabel: "Page 2", exercises: [{ stableActivityId: "canonical-two", title: "Two", activityType: "image" }] }] },
];
const placements = [{ pageId: "page-one", unitNumber: 1, pageLabel: "Page 1" }, { pageId: "page-two", unitNumber: 2, pageLabel: "Page 2" }];

test("canonical lifecycle overlay retires or relocates stable source identities without mutating source", () => {
  const source = [{ activityKey: "canonical-one", pageId: "page-one", title: "One" }];
  const empty = createEmptyUltimateB2ActivityLifecycle();
  assert.deepEqual(currentUltimateB2ActivityLifecycleEntry(empty, "canonical-one", "page-one"), { status: "active", pageId: "page-one" });
  const moved = updateUltimateB2ActivityLifecycle(empty, "canonical-one", { status: "active", pageId: "page-two" });
  assert.deepEqual(applyUltimateB2ActivityLifecycle(source, moved), [{ activityKey: "canonical-one", pageId: "page-two", title: "One" }]);
  assert.deepEqual(source, [{ activityKey: "canonical-one", pageId: "page-one", title: "One" }]);
  const retired = updateUltimateB2ActivityLifecycle(moved, "canonical-one", { status: "retired", pageId: "page-two" });
  assert.deepEqual(applyUltimateB2ActivityLifecycle(source, retired), []);
  assert.throws(() => normalizeUltimateB2ActivityLifecycle({ ...empty, activities: { x: { status: "deleted", pageId: "page-one" } } }));
});

test("Builder navigation applies canonical retirement and cross-Unit placement while preserving identity", () => {
  const moved = { schemaVersion: "1.0", activities: { "canonical-one": { status: "active", pageId: "page-two" } } };
  const model = buildActivityBuilderNavigation({ units, placements, lifecycle: moved });
  assert.equal(findActivityBuilderItem(model, "canonical-one").page.id, "page-two");
  assert.equal(findActivityBuilderItem(model, "canonical-one").item.id, "canonical-one");
  assert.equal(findActivityBuilderItem(model, "canonical-one").item.retirable, true);
  const retired = { schemaVersion: "1.0", activities: { "canonical-one": { status: "retired", pageId: "page-one" } } };
  assert.equal(findActivityBuilderItem(buildActivityBuilderNavigation({ units, placements, lifecycle: retired }), "canonical-one"), null);
});

test("migration 043 is append-only, atomic, auditable, and blocks stale retired writes and hotspots", async () => {
  const migration = await readFile(new URL("../database/043_builder_activity_lifecycle.sql", import.meta.url), "utf8");
  assert.match(migration, /create table if not exists builder_activity_lifecycle_mutations/);
  assert.match(migration, /create or replace function mutate_builder_activity_lifecycle/);
  assert.match(migration, /pg_advisory_xact_lock[\s\S]*builder-publication-component/);
  assert.match(migration, /activity_lifecycle[\s\S]*native_activity_index[\s\S]*native_activity_public[\s\S]*hotspots/);
  assert.match(migration, /canonical activity is not active/);
  assert.match(migration, /hotspot target activity is not active/);
  assert.match(migration, /mutation_id_conflict/);
  assert.match(migration, /revision_conflict/);
  assert.match(migration, /authoritative_source_page_id<>expected_source_page_id/);
  assert.match(migration, /activity_.*retired/);
  assert.doesNotMatch(migration, /delete\s+from\s+(?:builder_component_documents|builder_component_document_revisions|book_component_releases|book_assets)/i);
  assert.doesNotMatch(migration, /update\s+(?:builder_component_document_revisions|book_component_releases|book_assets)/i);
});
