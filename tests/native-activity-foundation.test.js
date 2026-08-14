import assert from "node:assert/strict";
import test from "node:test";

import { assertPublicBuilderDocument } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { NATIVE_ACTIVITY_KINDS, normalizeNativeActivityPublicDocument, normalizeNativeActivityTeacherDocument, resolveNativeActivityKind, validateNativeActivityPair } from "../netlify-sites/ultimate-b2-builder/server/_native-activity-registry.js";
import { createEmptyNativeActivityIndex, normalizeNativeActivityIndex, normalizeNativeManagedAssetReference } from "../src/data/native-activities/nativeActivityPublic.js";
import { ultimateB2NativeActivityAdapter, ultimateB2NativeActivityPlacements } from "../src/data/ultimate-b2/nativeActivityAdapter.js";

const placement = ultimateB2NativeActivityPlacements[0];
const activityId = "ultimate-b2-sb-u1-p1-o99";

test("registered native kinds create deterministic, separate one-Part public and Teacher drafts", () => {
  assert.deepEqual(NATIVE_ACTIVITY_KINDS, ["open-response", "image"]);
  for (const kindName of NATIVE_ACTIVITY_KINDS) {
    const kind = resolveNativeActivityKind(kindName);
    const firstPublic = kind.createBlankPublic({ activityId, title: `New ${kind.label}`, placement });
    const secondPublic = kind.createBlankPublic({ activityId, title: `New ${kind.label}`, placement });
    const teacher = kind.createBlankTeacher({ activityId, placement });
    assert.deepEqual(firstPublic, secondPublic);
    assert.equal(firstPublic.parts.length, 1);
    assert.equal(firstPublic.parts[0].id, "part-1");
    assert.equal(teacher.parts[0].id, "part-1");
    assert.equal(firstPublic.kind, kindName);
    assert.equal(teacher.kind, kindName);
    assert.equal(validateNativeActivityPair(firstPublic, teacher), true);
    assert.doesNotThrow(() => assertPublicBuilderDocument(firstPublic));
    assert.equal(JSON.stringify(firstPublic).includes("modelAnswers"), false);
  }
  assert.equal(resolveNativeActivityKind("multiple-choice"), null);
});

test("native public and Teacher schemas reject missing, extra, duplicate, and mismatched Part structures", () => {
  const kind = resolveNativeActivityKind("open-response");
  const publicDocument = kind.createBlankPublic({ activityId, title: "Draft", placement });
  const teacherDocument = kind.createBlankTeacher({ activityId, placement });
  for (const invalid of [
    { ...publicDocument, parts: [] },
    { ...publicDocument, parts: [...publicDocument.parts, structuredClone(publicDocument.parts[0])] },
    { ...publicDocument, parts: [{ ...publicDocument.parts[0], id: "part-2" }] },
    { ...publicDocument, unexpected: true },
  ]) assert.throws(() => normalizeNativeActivityPublicDocument(invalid, activityId));
  assert.throws(() => normalizeNativeActivityTeacherDocument({ ...teacherDocument, parts: [] }, activityId));
  assert.throws(() => normalizeNativeActivityTeacherDocument({ ...teacherDocument, unexpected: true }, activityId));
  assert.throws(() => validateNativeActivityPair(publicDocument, { ...teacherDocument, activityId: `${activityId}-other` }));
  assert.throws(() => normalizeNativeActivityPublicDocument({ ...publicDocument, kind: "image" }, activityId));
});

test("native public safety and managed asset references fail closed", () => {
  const kind = resolveNativeActivityKind("image");
  const document = kind.createBlankPublic({ activityId, title: "Image draft", placement });
  document.metadata.modelAnswer = "must not escape";
  assert.throws(() => assertPublicBuilderDocument(document));
  const reference = { assetId: "10000000-0000-4000-8000-000000000001", checksumSha256: "a".repeat(64), role: "activity_image", slot: "main-image" };
  assert.deepEqual(normalizeNativeManagedAssetReference(reference), reference);
  assert.throws(() => normalizeNativeManagedAssetReference({ ...reference, assetId: "../file" }));
  assert.throws(() => normalizeNativeManagedAssetReference({ ...reference, checksumSha256: "bad" }));
  assert.throws(() => normalizeNativeManagedAssetReference({ ...reference, repositoryPath: "private/file.png" }));
});

test("native index is exact, deterministic, and Ultimate B2 identity remains adapter-owned", () => {
  const empty = createEmptyNativeActivityIndex();
  assert.deepEqual(empty, { schemaVersion: "1.0", activities: [] });
  const normalized = normalizeNativeActivityIndex({ schemaVersion: "1.0", activities: [
    { activityId: "ultimate-b2-sb-u1-p1-o10", kind: "image", placement: { pageId: placement.pageId }, sortOrder: 12 },
    { activityId: "ultimate-b2-sb-u1-p1-o9", kind: "open-response", placement: { pageId: placement.pageId }, sortOrder: 11 },
  ] }, { allowedKinds: NATIVE_ACTIVITY_KINDS });
  assert.deepEqual(normalized.activities.map((entry) => entry.activityId), ["ultimate-b2-sb-u1-p1-o9", "ultimate-b2-sb-u1-p1-o10"]);
  assert.throws(() => normalizeNativeActivityIndex({ schemaVersion: "1.0", activities: [normalized.activities[0], normalized.activities[0]] }, { allowedKinds: NATIVE_ACTIVITY_KINDS }));
  assert.throws(() => normalizeNativeActivityIndex({ schemaVersion: "1.0", activities: [{ ...normalized.activities[0], kind: "matching" }] }, { allowedKinds: NATIVE_ACTIVITY_KINDS }));
  assert.match(ultimateB2NativeActivityAdapter.nextActivityId({ placement, nativeIndex: normalized }), /^ultimate-b2-sb-u1-p1-o\d+$/);
});
