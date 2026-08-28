import assert from "node:assert/strict";
import test from "node:test";

import { buildBuilderPageAssetObjectKey, buildComponentReleaseAssetObjectKey } from "../lib/book-assets/object-keys.js";
import { builderDocumentSha256 } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import {
  compileUltimateB2ManagedComponentRelease,
  verifyUltimateB2ManagedComponentRelease,
} from "../netlify-sites/ultimate-b2-builder/server/_builder-managed-publication-compiler.js";
import { materializeNativeReleaseAssets } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-assets.js";
import { compileUltimateB2ComponentReleaseV2 } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-compiler-v2.js";
import { resolveNativeActivityKind } from "../netlify-sites/ultimate-b2-builder/server/_native-activity-registry.js";
import { createNativeOpenResponseQuestion } from "../src/data/native-activities/nativeOpenResponse.js";
import { nativeChildIdFromUuid } from "../src/data/native-activities/nativeChildIdentity.js";
import { createPublicationV2FixtureSources, publicationV2Fixture } from "./fixtures/publication-v2.js";

const bookSlug = "ultimate-b2";
const componentSlug = "ultimate-b2-workbook";
const checksum = "a".repeat(64);
const pageId = "wb-page-one";
const privateBucket = "private-assets";

function sources(requestedComponentSlug = componentSlug, requestedPageId = pageId) {
  const units = Array.from({ length: 10 }, (_, index) => ({
    id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    slug: `unit-${index + 1}`,
    title: `Unit ${index + 1}`,
    unit_number: index + 1,
    sort_order: index + 1,
  }));
  return {
    pages: {
      revision: 1,
      units,
      rows: [{
        id: "20000000-0000-4000-8000-000000000001",
        stable_key: `${requestedComponentSlug}/pages/${requestedPageId}`,
        label: "Workbook page one",
        sort_order: 1,
        source_metadata: { is_active: true, section_title: "Vocabulary", printed_label: "4" },
        unit_id: units[0].id,
        unit_slug: units[0].slug,
        unit_title: units[0].title,
        unit_number: 1,
        unit_sort_order: 1,
        asset_id: "30000000-0000-4000-8000-000000000001",
        asset_role: "page_image",
        object_key: buildBuilderPageAssetObjectKey({ bookSlug, componentSlug: requestedComponentSlug, pageId: requestedPageId, checksum, extension: ".png" }),
        storage_profile: "private",
        storage_bucket: privateBucket,
        publication_status: "draft",
        access_level: "internal",
        mime_type: "image/png",
        byte_size: 68,
        checksum_sha256: checksum,
        width: 1,
        height: 1,
      }],
    },
    documents: { hotspots: null, activityLifecycle: null },
    native: { index: null, activities: {}, assetRows: [] },
  };
}

function managedSourcesWithActivity(requestedComponentSlug, requestedPageId, activityId, teacherSentinel) {
  const input = sources(requestedComponentSlug, requestedPageId);
  const kind = resolveNativeActivityKind("open-response");
  const questionId = nativeChildIdFromUuid("q", requestedComponentSlug === "ultimate-b2-workbook"
    ? "40000000-0000-4000-8000-000000000001"
    : "50000000-0000-4000-8000-000000000001");
  const publicDocument = kind.createBlankPublic({ activityId, title: `${requestedComponentSlug} activity`, placement: { pageId: requestedPageId } });
  publicDocument.parts[0].interaction.questions = [{ ...createNativeOpenResponseQuestion(questionId), prompt: "Explain the component boundary." }];
  const teacherDocument = kind.createBlankTeacher({ activityId });
  teacherDocument.parts[0].solution.modelAnswers = [{ questionId, text: teacherSentinel }];
  const indexEntry = { activityId, kind: "open-response", placement: { pageId: requestedPageId }, sortOrder: 1 };
  const hotspotPayload = {
    schemaVersion: "1.0",
    packageSlug: bookSlug,
    componentSlug: requestedComponentSlug,
    pages: {
      [requestedPageId]: [{ id: `${requestedComponentSlug}-activity-hotspot`, unitNumber: 1, pageId: requestedPageId, left: 4, top: 4, width: 12, height: 12, label: "Component activity", actionType: "normalized_activity", activityKey: activityId }],
    },
  };
  input.documents.hotspots = { payload: hotspotPayload, revision: 3, sha256: builderDocumentSha256(hotspotPayload) };
  const indexPayload = { schemaVersion: "1.0", activities: [indexEntry] };
  input.native.index = { payload: indexPayload, revision: 2, sha256: builderDocumentSha256(indexPayload) };
  input.native.activities = {
    [activityId]: {
      index: indexEntry,
      public: { payload: publicDocument, revision: 4, sha256: builderDocumentSha256(publicDocument) },
      teacher: { payload: teacherDocument, revision: 4, sha256: builderDocumentSha256(teacherDocument) },
    },
  };
  return input;
}

function releaseRow(compiled) {
  return {
    compiler_id: compiled.compilerId,
    release_schema_version: compiled.releaseSchemaVersion,
    runtime_compatibility_sha256: compiled.compatibility,
    source_snapshot: compiled.sourceSnapshot,
    source_snapshot_sha256: compiled.sourceSnapshotSha256,
    public_projection: compiled.publicProjection,
    public_projection_sha256: compiled.publicProjectionSha256,
    teacher_projection: compiled.teacherProjection,
    teacher_projection_sha256: compiled.teacherProjectionSha256,
    asset_manifest: compiled.assetManifest,
    release_sha256: compiled.releaseSha256,
  };
}

test("managed compiler includes exact Units, pages, hotspots, and immutable page assets", () => {
  const compiled = compileUltimateB2ManagedComponentRelease(sources(), componentSlug);
  assert.equal(compiled.compilerId, "ultimate-b2-workbook-v1");
  assert.equal(compiled.publicProjection.units.length, 10);
  assert.equal(compiled.publicProjection.pages.length, 1);
  assert.equal(compiled.publicProjection.pages[0].unitSlug, "unit-1");
  assert.deepEqual(compiled.assetManifest, [{ sha256: checksum, extension: "png", mediaType: "image/png", role: "managed_page_image" }]);
  assert.equal(compiled.nativeAssetSources[0].row.source_metadata.publication_page_id, pageId);
  assert.doesNotThrow(() => verifyUltimateB2ManagedComponentRelease(releaseRow(compiled), componentSlug));

  const forged = releaseRow(compiled);
  forged.public_projection = structuredClone(forged.public_projection);
  forged.public_projection.pages[0].label = "forged";
  assert.throws(() => verifyUltimateB2ManagedComponentRelease(forged, componentSlug), /release_integrity_failed/);
});

test("managed compiler rejects active pages without an exact Unit or finalized image", () => {
  const noUnit = sources();
  noUnit.pages.rows[0].unit_id = null;
  assert.throws(() => compileUltimateB2ManagedComponentRelease(noUnit, componentSlug), /managed_page_not_ready/);
  const unfinished = sources();
  unfinished.pages.rows[0].publication_status = "pending";
  assert.throws(() => compileUltimateB2ManagedComponentRelease(unfinished, componentSlug), /managed_page_not_ready/);
});

test("managed compiler fails closed on cross-component native activity identities", () => {
  for (const [requestedComponent, foreignActivityId] of [
    ["ultimate-b2-workbook", "ultimate-b2-sb-u1-p1-o4"],
    ["ultimate-b2-workbook", "ultimate-b2-gb-unit-1-page-1-o1"],
    ["ultimate-b2-grammar-book", "ultimate-b2-wb-unit-1-page-1-o1"],
  ]) {
    const input = sources();
    input.native.index = { revision: 2, sha256: "b".repeat(64), payload: { schemaVersion: "1.0", activities: [{ activityId: foreignActivityId, kind: "image", placement: { pageId }, sortOrder: 1 }] } };
    assert.throws(() => compileUltimateB2ManagedComponentRelease(input, requestedComponent), /outside its component/);
  }
});

test("product member inputs keep Students, Workbook, and Grammar activities and Teacher data strictly local", () => {
  const workbookActivityId = "ultimate-b2-wb-unit-1-page-1-o1";
  const grammarActivityId = "ultimate-b2-gb-unit-1-page-1-o1";
  const workbookSentinel = "WORKBOOK_PRIVATE_TEACHER_SENTINEL";
  const grammarSentinel = "GRAMMAR_PRIVATE_TEACHER_SENTINEL";
  const students = compileUltimateB2ComponentReleaseV2(createPublicationV2FixtureSources());
  const workbook = compileUltimateB2ManagedComponentRelease(
    managedSourcesWithActivity("ultimate-b2-workbook", "workbook-page-one", workbookActivityId, workbookSentinel),
    "ultimate-b2-workbook",
  );
  const grammar = compileUltimateB2ManagedComponentRelease(
    managedSourcesWithActivity("ultimate-b2-grammar-book", "grammar-page-one", grammarActivityId, grammarSentinel),
    "ultimate-b2-grammar-book",
  );

  assert.ok(students.publicProjection.nativeActivities[publicationV2Fixture.openResponseId]);
  assert.deepEqual(Object.keys(workbook.publicProjection.nativeActivities), [workbookActivityId]);
  assert.deepEqual(Object.keys(grammar.publicProjection.nativeActivities), [grammarActivityId]);
  for (const member of [students, workbook, grammar]) {
    const publicJson = JSON.stringify(member.publicProjection);
    assert.equal(publicJson.includes(publicationV2Fixture.teacherSentinel), false);
    assert.equal(publicJson.includes(workbookSentinel), false);
    assert.equal(publicJson.includes(grammarSentinel), false);
  }
  assert.equal(workbook.teacherProjection.nativeActivities[workbookActivityId].document.parts[0].solution.modelAnswers[0].text, workbookSentinel);
  assert.equal(grammar.teacherProjection.nativeActivities[grammarActivityId].document.parts[0].solution.modelAnswers[0].text, grammarSentinel);
  assert.equal(workbook.publicProjection.nativeActivities[grammarActivityId], undefined);
  assert.equal(grammar.publicProjection.nativeActivities[workbookActivityId], undefined);
  assert.equal(workbook.publicProjection.nativeActivities[publicationV2Fixture.openResponseId], undefined);
  assert.equal(grammar.publicProjection.nativeActivities[publicationV2Fixture.openResponseId], undefined);
  assert.equal(students.publicProjection.nativeActivities[workbookActivityId], undefined);
  assert.equal(students.publicProjection.nativeActivities[grammarActivityId], undefined);
});

test("managed page materialization verifies its canonical mutable source and immutable target", async () => {
  const compiled = compileUltimateB2ManagedComponentRelease(sources(), componentSlug);
  let copied;
  const storage = {
    bucket(profile) { assert.equal(profile, "private"); return privateBucket; },
    async copyVerifiedImmutable(request) { copied = request; return { reused: false }; },
  };
  await materializeNativeReleaseAssets(storage, { bookSlug, componentSlug, nativeAssetSources: compiled.nativeAssetSources });
  assert.deepEqual(copied, {
    profile: "private",
    sourceObjectKey: buildBuilderPageAssetObjectKey({ bookSlug, componentSlug, pageId, checksum, extension: ".png" }),
    destinationObjectKey: buildComponentReleaseAssetObjectKey({ bookSlug, componentSlug, checksum, extension: "png" }),
    expectedChecksumSha256: checksum,
    expectedByteSize: 68,
    expectedContentType: "image/png",
  });
});
