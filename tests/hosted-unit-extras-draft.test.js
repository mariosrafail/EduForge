import assert from "node:assert/strict";
import test from "node:test";

import { loadHostedDraftUnitExtras, publishedUnitExtraVideoUrl } from "../src/apps/android-teacher-offline/hostedComponentReleaseProvider.js";
import { HOSTED_VIEWER_RUNTIME_MODES } from "../src/apps/android-teacher-offline/hostedReleasePreview.js";
import { nativeChildIdFromUuid } from "../src/data/native-activities/nativeChildIdentity.js";
import { unitExtrasForPage } from "../src/data/ultimate-b2/unitExtras.js";

const identity = Object.freeze({ bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book" });
const authorization = `v2.${Buffer.from("unit-extra-draft-scope").toString("base64url")}.${"a".repeat(43)}`;
const context = Object.freeze({ kind: HOSTED_VIEWER_RUNTIME_MODES.BUILDER_PREVIEW, teacherPreview: true, authorization });
const assetId = "10000000-0000-4000-8000-000000000041";
const videoId = nativeChildIdFromUuid("video", "10000000-0000-4000-8000-000000000042");
const asset = Object.freeze({ assetId, checksumSha256: "b".repeat(64), role: "unit_extra_video", slot: videoId });
const document = Object.freeze({
  schemaVersion: "1.0",
  units: [{ unitId: "unit-1", unitNumber: 1, categories: { videos: [{ id: videoId, title: "Captioned Extra", video: { assetSlot: videoId, asset, durationMs: 5_840, cues: [{ id: nativeChildIdFromUuid("cue", "10000000-0000-4000-8000-000000000044"), startMs: 0, endMs: 2_000, text: "Saved Draft caption." }] } }] } }],
  pages: [{ pageId: "ub2-sb-unit-1-part-1", unitId: "unit-1", extrasVisibility: { videos: true } }],
});

test("Saved Draft Unit Extras load from an authorized Draft document and retain Draft-scoped media identity", async () => {
  const calls = [];
  const publication = await loadHostedDraftUnitExtras({
    context, identity,
    fetchImpl: async (url, options) => {
      calls.push([url, options]);
      return { ok: true, status: 200, json: async () => ({ bookSlug: identity.bookSlug, componentSlug: identity.componentSlug, resource: "unit-extras", schemaVersion: "1.0", revision: 7, source: "database", document }) };
    },
  });
  assert.equal(publication.kind, "draft");
  assert.equal(publication.revision, 7);
  assert.match(calls[0][0], /^\/preview\/content\/books\/ultimate-b2\/components\/ultimate-b2-students-book\/unit-extras\?previewAuthorization=v2\./);
  assert.deepEqual(calls[0][1], { method: "GET", credentials: "omit", cache: "no-store", signal: undefined });
  assert.deepEqual(unitExtrasForPage(publication, { unitNumber: 1, pageId: "ub2-sb-unit-1-part-1" }).map((entry) => entry.id), [videoId]);
  const mediaUrl = publishedUnitExtraVideoUrl(publication, asset);
  assert.match(mediaUrl, new RegExp(`^/preview/unit-extras/books/ultimate-b2/components/ultimate-b2-students-book/units/unit-1/videos/${videoId}/assets/${assetId}/preview\\?previewAuthorization=v2\\.`));
  assert.doesNotMatch(mediaUrl, /release|productRelease|memberSha/);
});

test("Saved Draft Unit Extras reject envelope drift and never load for a release or another component", async () => {
  await assert.rejects(loadHostedDraftUnitExtras({ context, identity, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ bookSlug: identity.bookSlug, componentSlug: identity.componentSlug, resource: "unit-extras", schemaVersion: "1.0", revision: 1, source: "repository", document }) }) }), /identity is invalid/);
  let calls = 0;
  const none = await loadHostedDraftUnitExtras({ context: { kind: HOSTED_VIEWER_RUNTIME_MODES.RELEASE_PREVIEW }, identity, fetchImpl: async () => { calls += 1; } });
  assert.deepEqual(none, { kind: "none" });
  assert.equal(calls, 0);
});
