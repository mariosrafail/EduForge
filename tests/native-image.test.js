import assert from "node:assert/strict";
import test from "node:test";

import { resolveNativeActivityKind, validateNativeActivityPair } from "../netlify-sites/ultimate-b2-builder/server/_native-activity-registry.js";
import { assessNativeImageReadiness } from "../src/data/native-activities/nativeImage.js";

const activityId = "ultimate-b2-sb-u1-p1-o98";
const kind = resolveNativeActivityKind("image");
const asset = { assetId: "10000000-0000-4000-8000-000000000004", checksumSha256: "a".repeat(64), role: "activity_artwork", slot: "asset-image" };

function pair() {
  return {
    publicDocument: kind.createBlankPublic({ activityId, title: "Native Image", placement: { pageId: "ub2-sb-unit-1-part-1" } }),
    teacherDocument: kind.createBlankTeacher({ activityId }),
  };
}

test("blank and complete Native Image document pairs normalize exactly", () => {
  const blank = pair();
  assert.equal(validateNativeActivityPair(blank.publicDocument, blank.teacherDocument), true);
  assert.deepEqual(blank.teacherDocument.parts[0].solution, { kind: "image" });
  const complete = pair();
  complete.publicDocument.assets = [asset];
  complete.publicDocument.parts[0].interaction = { kind: "image", image: { assetSlot: asset.slot, fit: "cover", decorative: false }, altText: "A labelled diagram." };
  assert.equal(validateNativeActivityPair(complete.publicDocument, complete.teacherDocument), true);
  assert.equal(kind.normalizePublic(complete.publicDocument).parts[0].interaction.image.fit, "cover");
});

test("Native Image rejects unknown fields, invalid states, stale assets, and non-minimal Teacher data", () => {
  const complete = pair(); complete.publicDocument.assets = [asset];
  complete.publicDocument.parts[0].interaction = { kind: "image", image: { assetSlot: asset.slot, fit: "contain", decorative: false }, altText: "Diagram" };
  const mutations = [
    (value) => { value.parts[0].interaction.html = "<img>"; },
    (value) => { value.parts[0].interaction.image.fit = "fill"; },
    (value) => { value.parts[0].interaction.image.assetSlot = "other"; },
    (value) => { value.assets[0].role = "background"; },
    (value) => { value.assets.push({ ...asset, assetId: "10000000-0000-4000-8000-000000000005", slot: "asset-other" }); },
  ];
  for (const mutate of mutations) { const invalid = structuredClone(complete.publicDocument); mutate(invalid); assert.throws(() => kind.normalizePublic(invalid)); }
  const staleBlank = pair().publicDocument; staleBlank.assets = [asset]; assert.throws(() => kind.normalizePublic(staleBlank));
  const privateExtra = pair().teacherDocument; privateExtra.parts[0].solution.answer = "leak"; assert.throws(() => kind.normalizeTeacher(privateExtra));
});

test("Native Image readiness is deterministic for blank, accessible, and decorative drafts", () => {
  const blank = pair().publicDocument;
  assert.deepEqual(assessNativeImageReadiness(blank), { ready: false, issues: ["Upload an image."] });
  blank.assets = [asset]; blank.parts[0].interaction.image = { assetSlot: asset.slot, fit: "contain", decorative: false };
  assert.match(assessNativeImageReadiness(blank).issues[0], /alt text/);
  blank.parts[0].interaction.altText = "Diagram";
  assert.deepEqual(assessNativeImageReadiness(blank), { ready: true, issues: [] });
  blank.parts[0].interaction.altText = ""; blank.parts[0].interaction.image.decorative = true;
  assert.deepEqual(assessNativeImageReadiness(blank), { ready: true, issues: [] });
});
