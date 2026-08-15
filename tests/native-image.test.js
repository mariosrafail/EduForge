import assert from "node:assert/strict";
import test from "node:test";

import { resolveNativeActivityKind, validateNativeActivityPair } from "../netlify-sites/ultimate-b2-builder/server/_native-activity-registry.js";
import { mergeNativeManagedAssetReference } from "../src/data/native-activities/nativeActivityPublic.js";
import { assessNativeImageReadiness, duplicateNativeImage, removeNativeImage } from "../src/data/native-activities/nativeImage.js";

const activityId = "ultimate-b2-sb-u1-p1-o98";
const kind = resolveNativeActivityKind("image");
const asset = { assetId: "10000000-0000-4000-8000-000000000004", checksumSha256: "a".repeat(64), role: "activity_artwork", slot: "asset-image" };
const secondAsset = { assetId: "10000000-0000-4000-8000-000000000005", checksumSha256: "b".repeat(64), role: "activity_artwork", slot: "asset-second" };
const image = (id, assetSlot, order, overrides = {}) => ({ id: `img-${id.repeat(32)}`, assetSlot, area: { x: 10 + order * 20, y: 20 + order * 20, width: 320, height: 220 }, order, altText: `Image ${order + 1}`, decorative: false, fit: "contain", locked: false, ...overrides });

function pair() {
  return {
    publicDocument: kind.createBlankPublic({ activityId, title: "Native Image", placement: { pageId: "ub2-sb-unit-1-part-1" } }),
    teacherDocument: kind.createBlankTeacher({ activityId }),
  };
}

test("blank and multi-image Native Image document pairs normalize exactly", () => {
  const blank = pair();
  assert.equal(validateNativeActivityPair(blank.publicDocument, blank.teacherDocument), true);
  assert.deepEqual(blank.publicDocument.parts[0].interaction, { kind: "image", surface: { width: 1024, height: 582 }, images: [] });
  assert.deepEqual(blank.teacherDocument.parts[0].solution, { kind: "image" });
  const complete = pair();
  complete.publicDocument.assets = [asset, secondAsset];
  complete.publicDocument.parts[0].interaction.images = [image("a", asset.slot, 0, { fit: "cover" }), image("b", secondAsset.slot, 1, { locked: true })];
  assert.equal(validateNativeActivityPair(complete.publicDocument, complete.teacherDocument), true);
  const normalized = kind.normalizePublic(complete.publicDocument).parts[0].interaction;
  assert.equal(normalized.images[0].fit, "cover");
  assert.equal(normalized.images[1].locked, true);
});

test("legacy singular Native Image drafts normalize transparently to a stable full-surface instance", () => {
  const legacy = pair(); legacy.publicDocument.assets = [asset];
  legacy.publicDocument.parts[0].interaction = { kind: "image", image: { assetSlot: asset.slot, fit: "cover", decorative: false }, altText: "Legacy diagram" };
  const normalized = kind.normalizePublic(legacy.publicDocument).parts[0].interaction;
  assert.equal(normalized.images.length, 1);
  assert.match(normalized.images[0].id, /^img-[0-9a-f]{32}$/);
  assert.deepEqual(normalized.images[0].area, { x: 0, y: 0, width: 1024, height: 582 });
  assert.deepEqual({ fit: normalized.images[0].fit, altText: normalized.images[0].altText, locked: normalized.images[0].locked }, { fit: "cover", altText: "Legacy diagram", locked: false });
  const legacyBlank = pair(); legacyBlank.publicDocument.parts[0].interaction = { kind: "image", image: null, altText: "" };
  assert.deepEqual(kind.normalizePublic(legacyBlank.publicDocument).parts[0].interaction.images, []);
});

test("logical duplicates share one canonical managed asset root until final use is removed", () => {
  const complete = pair(); complete.publicDocument.assets = mergeNativeManagedAssetReference([], asset);
  complete.publicDocument.parts[0].interaction.images.push(image("a", asset.slot, 0));
  const duplicate = duplicateNativeImage(complete.publicDocument.parts[0].interaction, `img-${"a".repeat(32)}`, `img-${"b".repeat(32)}`);
  assert.equal(duplicate.assetSlot, asset.slot);
  assert.equal(duplicate.order, 1);
  assert.equal(duplicate.locked, false);
  assert.deepEqual({ x: duplicate.area.x, y: duplicate.area.y }, { x: 26, y: 36 });
  assert.equal(kind.normalizePublic(complete.publicDocument).assets.length, 1);
  removeNativeImage(complete.publicDocument, duplicate.id);
  assert.equal(complete.publicDocument.assets.length, 1);
  removeNativeImage(complete.publicDocument, `img-${"a".repeat(32)}`);
  assert.deepEqual(complete.publicDocument.assets, []);
  assert.deepEqual(complete.publicDocument.parts[0].interaction.images, []);
});

test("canonical finalize references are reused for same-image reuploads without duplicate roots", () => {
  const complete = pair();
  complete.publicDocument.assets = mergeNativeManagedAssetReference([], asset);
  complete.publicDocument.assets = mergeNativeManagedAssetReference(complete.publicDocument.assets, asset);
  complete.publicDocument.parts[0].interaction.images = [image("a", asset.slot, 0), image("b", asset.slot, 1)];
  assert.equal(kind.normalizePublic(complete.publicDocument).assets.length, 1);
  removeNativeImage(complete.publicDocument, `img-${"a".repeat(32)}`); removeNativeImage(complete.publicDocument, `img-${"b".repeat(32)}`);
  complete.publicDocument.assets = mergeNativeManagedAssetReference(complete.publicDocument.assets, asset);
  complete.publicDocument.parts[0].interaction.images = [image("c", asset.slot, 0)];
  assert.equal(kind.normalizePublic(complete.publicDocument).assets.length, 1);
});

test("Native Image rejects unknown fields, malformed geometry and order, stale roots, and non-minimal Teacher data", () => {
  const complete = pair(); complete.publicDocument.assets = [asset, secondAsset];
  complete.publicDocument.parts[0].interaction.images = [image("a", asset.slot, 0), image("b", secondAsset.slot, 1)];
  const mutations = [
    (value) => { value.parts[0].interaction.html = "<img>"; },
    (value) => { value.parts[0].interaction.images[0].fit = "fill"; },
    (value) => { value.parts[0].interaction.images[0].locked = "yes"; },
    (value) => { value.parts[0].interaction.images[0].assetSlot = "other"; },
    (value) => { value.parts[0].interaction.images[0].area.width = 2_000; },
    (value) => { value.parts[0].interaction.images[1].order = 0; },
    (value) => { value.parts[0].interaction.images[1].id = value.parts[0].interaction.images[0].id; },
    (value) => { value.assets[0].role = "background"; },
    (value) => { value.assets.push({ ...asset, assetId: "10000000-0000-4000-8000-000000000006" }); },
    (value) => { value.parts[0].interaction.images.pop(); },
  ];
  for (const mutate of mutations) { const invalid = structuredClone(complete.publicDocument); mutate(invalid); assert.throws(() => kind.normalizePublic(invalid)); }
  const privateExtra = pair().teacherDocument; privateExtra.parts[0].solution.answer = "leak"; assert.throws(() => kind.normalizeTeacher(privateExtra));
});

test("Native Image readiness requires one image and alt text for each nondecorative instance", () => {
  const blank = pair().publicDocument;
  assert.deepEqual(assessNativeImageReadiness(blank), { ready: false, issues: ["Add at least one image."] });
  blank.assets = [asset, secondAsset]; blank.parts[0].interaction.images = [image("a", asset.slot, 0, { altText: "" }), image("b", secondAsset.slot, 1, { altText: "", decorative: true })];
  assert.deepEqual(assessNativeImageReadiness(blank).issues, ["Image 1 needs alt text or must be marked decorative."]);
  blank.parts[0].interaction.images[0].altText = "Diagram";
  assert.deepEqual(assessNativeImageReadiness(blank), { ready: true, issues: [] });
});
