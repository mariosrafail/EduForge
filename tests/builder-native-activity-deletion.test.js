import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { compileUltimateB2ComponentReleaseV2 } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-compiler-v2.js";
import { builderDocumentSha256 } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { pruneUltimateB2ActivityHotspots } from "../scripts/ultimate-b2/hotspot-manifest.js";
import { createEmptyNativeActivityIndex, removeNativeActivityIndexEntry } from "../src/data/native-activities/nativeActivityPublic.js";
import { NATIVE_ACTIVITY_KINDS } from "../src/data/native-activities/nativeActivityKinds.js";
import { nextUltimateB2NativeActivityIdentity } from "../src/data/ultimate-b2/nativeActivityAdapter.js";
import { createPublicationV2FixtureSources, publicationV2Fixture } from "./fixtures/publication-v2.js";

const activityId = "ultimate-b2-sb-u1-p1-o98";
const otherId = "ultimate-b2-sb-u1-p1-o99";
const pageOne = "ub2-sb-unit-1-part-1";
const pageTwo = "ub2-sb-unit-1-part-2";
const hotspot = (id, activityKey, pageId, pageNumber) => ({
  id, unitNumber: 1, pageId, pageNumber, left: 10, top: 10, width: 10, height: 10,
  label: id, actionType: "normalized_activity", activityKey,
});

function manifest(pages = {}) {
  return { schemaVersion: "1.0", packageSlug: "ultimate-b2", componentSlug: "students-book", pages };
}

test("logical delete helpers remove only the active index entry and all matching page hotspots", () => {
  const index = { ...createEmptyNativeActivityIndex(), activities: [
    { activityId, kind: "open-response", placement: { pageId: pageOne }, sortOrder: 1 },
    { activityId: otherId, kind: "image", placement: { pageId: pageOne }, sortOrder: 2 },
  ] };
  const removed = removeNativeActivityIndexEntry(index, activityId, { allowedKinds: ["open-response", "image"] });
  assert.equal(removed.removed, true);
  assert.deepEqual(removed.index.activities.map((entry) => entry.activityId), [otherId]);
  assert.equal(index.activities.length, 2, "candidate derivation does not mutate the loaded index");

  const pruned = pruneUltimateB2ActivityHotspots(manifest({
    [pageOne]: [hotspot("delete-one", activityId, pageOne, 5), hotspot("keep", otherId, pageOne, 5)],
    [pageTwo]: [hotspot("delete-two", activityId, pageTwo, 6)],
  }), activityId);
  assert.equal(pruned.removedCount, 2);
  assert.deepEqual(Object.keys(pruned.manifest.pages), [pageOne]);
  assert.deepEqual(pruned.manifest.pages[pageOne].map((entry) => entry.activityKey), [otherId]);
  assert.deepEqual(pruneUltimateB2ActivityHotspots(manifest(), activityId), { manifest: manifest(), removedCount: 0 });
});

test("historical native document IDs remain occupied after logical deletion", () => {
  const placement = { pageId: pageOne };
  const next = nextUltimateB2NativeActivityIdentity({
    placement,
    nativeIndex: createEmptyNativeActivityIndex(),
    occupiedActivityIds: [activityId],
  });
  assert.notEqual(next, activityId);
  assert.ok(Number(next.match(/-o(\d+)$/)?.[1]) > 98);
});

test("post-delete compilation excludes retired activity, launch references, and now-unused assets without mutating the old release", () => {
  const sources = createPublicationV2FixtureSources();
  const oldRelease = compileUltimateB2ComponentReleaseV2(sources);
  const immutableSnapshot = oldRelease.stableJson;
  const removed = removeNativeActivityIndexEntry(sources.native.index.payload, publicationV2Fixture.imageId, { allowedKinds: NATIVE_ACTIVITY_KINDS });
  sources.native.index.payload = removed.index;
  sources.native.index.revision += 1;
  sources.native.index.sha256 = builderDocumentSha256(removed.index);
  const pruned = pruneUltimateB2ActivityHotspots(sources.documents.hotspots.payload, publicationV2Fixture.imageId);
  sources.documents.hotspots.payload = pruned.manifest;
  sources.documents.hotspots.revision += 1;
  sources.documents.hotspots.sha256 = builderDocumentSha256(pruned.manifest);
  const nextRelease = compileUltimateB2ComponentReleaseV2(sources);
  assert.equal(publicationV2Fixture.imageId in nextRelease.publicProjection.nativeActivities, false);
  assert.equal(publicationV2Fixture.imageId in nextRelease.teacherProjection.nativeActivities, false);
  assert.equal(Object.values(nextRelease.publicProjection.hotspots.pages).flat().some((entry) => entry.activityKey === publicationV2Fixture.imageId), false);
  assert.equal(nextRelease.publicProjection.assets.some((asset) => asset.sha256 === publicationV2Fixture.assetChecksum), false);
  assert.equal(oldRelease.stableJson, immutableSnapshot);
  assert.notEqual(nextRelease.releaseSha256, oldRelease.releaseSha256);
});

test("migration 042 makes retirement atomic, auditable, idempotent, and race-safe without deleting history", async () => {
  const [migration, manifestSource] = await Promise.all([
    readFile(new URL("../database/042_builder_native_activity_retirement.sql", import.meta.url), "utf8"),
    readFile(new URL("../database/MIGRATIONS.md", import.meta.url), "utf8"),
  ]);
  assert.match(manifestSource, /42\. `042_builder_native_activity_retirement\.sql`/);
  assert.match(migration, /create table if not exists builder_native_activity_deletion_mutations/);
  assert.match(migration, /before update or delete on builder_native_activity_deletion_mutations/);
  assert.match(migration, /create or replace function delete_builder_native_activity/);
  assert.match(migration, /pg_advisory_xact_lock[\s\S]*builder-native-activity-component:/);
  assert.match(migration, /pg_advisory_xact_lock[\s\S]*builder-publication-component:/);
  assert.match(migration, /pg_advisory_xact_lock[\s\S]*builder-document/);
  assert.match(migration, /builder_native_activity_is_active/);
  assert.match(migration, /builder_native_document_requires_active_index/);
  assert.match(migration, /builder_native_upload_requires_active_index/);
  assert.match(migration, /builder_native_draft_asset_requires_active_index/);
  assert.match(migration, /'native_activity_deleted'/);
  assert.doesNotMatch(migration, /delete\s+from\s+(?:builder_component_documents|builder_component_document_revisions|book_component_releases|book_assets)/i);
  assert.doesNotMatch(migration, /update\s+(?:builder_component_document_revisions|book_component_releases|book_assets)/i);
});

test("Builder exposes logical retirement for native and canonical activities and confirms retention and unsaved-work consequences", async () => {
  const [app, api] = await Promise.all([
    readFile(new URL("../src/apps/ultimate-b2-builder/HostedUltimateB2BuilderApp.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/apps/book-builder/hosted/builderNativeActivityApi.js", import.meta.url), "utf8"),
  ]);
  assert.match(app, /selection\?\.item\?\.retirable/);
  assert.match(app, /disabled=\{dirty\} title=\{dirty \? "Save or discard changes before moving this activity\."/);
  assert.match(app, /deleteNativeActivity/);
  assert.match(app, /retireCanonicalActivity/);
  assert.match(app, /Unsaved changes/);
  assert.match(app, /immutable historical releases will not be changed/);
  assert.match(app, /selection\?\.item\?\.title/);
  assert.match(app, /selection\?\.item\?\.id/);
  assert.match(api, /fetch\(`\$\{activityRoot\(bookSlug, componentSlug, activityId\)\}\/delete`/);
  assert.match(api, /body: JSON\.stringify\(\{ clientMutationId: newBuilderClientMutationId\(\) \}\)/);
  const deletionFunction = api.match(/export async function deleteNativeActivity[\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(deletionFunction, /publicDocument|teacherDocument|hotspotDocument|indexDocument/);
});
