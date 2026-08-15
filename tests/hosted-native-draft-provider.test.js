import assert from "node:assert/strict";
import test from "node:test";

import {
  hostedNativeDraftAssetUrl,
  loadHostedNativeDraftPublicActivity,
  loadHostedNativeDraftTeacherActivity,
} from "../src/apps/android-teacher-offline/hostedNativeDraftProvider.js";
import { HOSTED_VIEWER_RUNTIME_MODES } from "../src/apps/android-teacher-offline/hostedReleasePreview.js";
import { createPublicationV2FixtureSources, publicationV2Fixture } from "./fixtures/publication-v2.js";

const authorization = `v2.abcdefghijklmnop.${"a".repeat(43)}`;
const context = { kind: HOSTED_VIEWER_RUNTIME_MODES.BUILDER_PREVIEW, teacherPreview: true, authorization };
const sources = createPublicationV2FixtureSources();

function envelope(activityId, audience) {
  const state = sources.native.activities[activityId];
  const selected = audience === "public" ? state.public : state.teacher;
  return {
    bookSlug: "ultimate-b2",
    componentSlug: "ultimate-b2-students-book",
    activityId,
    kind: state.index.kind,
    audience,
    schemaVersion: selected.payload.schemaVersion,
    revision: selected.revision,
    document: selected.payload,
  };
}

const response = (body, status = 200) => ({ status, ok: status >= 200 && status < 300, async json() { return structuredClone(body); } });

test("hosted native draft provider validates public and separately protected Teacher documents", async () => {
  const paths = [];
  const publicEntry = await loadHostedNativeDraftPublicActivity(publicationV2Fixture.openResponseId, {
    context,
    fetchImpl: async (path, init) => { paths.push({ path, init }); return response(envelope(publicationV2Fixture.openResponseId, "public")); },
  });
  assert.equal(publicEntry.kind, "open-response");
  assert.doesNotMatch(JSON.stringify(publicEntry), new RegExp(publicationV2Fixture.teacherSentinel));
  const teacherEntry = await loadHostedNativeDraftTeacherActivity(publicEntry, {
    context,
    fetchImpl: async (path, init) => { paths.push({ path, init }); return response(envelope(publicationV2Fixture.openResponseId, "teacher")); },
  });
  assert.match(JSON.stringify(teacherEntry), new RegExp(publicationV2Fixture.teacherSentinel));
  assert.match(paths[0].path, /\/public\?previewAuthorization=/);
  assert.match(paths[1].path, /\/teacher\?previewAuthorization=/);
  assert(paths.every(({ init }) => init.method === "GET" && init.credentials === "omit" && init.cache === "no-store"));
});

test("hosted native drafts are Builder-preview-only and image drafts never request Teacher data", async () => {
  let requests = 0;
  const bare = await loadHostedNativeDraftPublicActivity(publicationV2Fixture.imageId, {
    context: { kind: HOSTED_VIEWER_RUNTIME_MODES.BARE, teacherPreview: false },
    fetchImpl: async () => { requests += 1; return response({}); },
  });
  assert.equal(bare, null);
  const imageEntry = await loadHostedNativeDraftPublicActivity(publicationV2Fixture.imageId, {
    context,
    fetchImpl: async () => { requests += 1; return response(envelope(publicationV2Fixture.imageId, "public")); },
  });
  assert.equal(imageEntry.kind, "image");
  assert.equal(await loadHostedNativeDraftTeacherActivity(imageEntry, { context, fetchImpl: async () => { requests += 1; return response({}); } }), null);
  assert.equal(requests, 1);
});

test("hosted native draft provider fails closed on envelope drift and produces only protected asset URLs", async () => {
  const malformed = { ...envelope(publicationV2Fixture.openResponseId, "public"), extra: true };
  await assert.rejects(() => loadHostedNativeDraftPublicActivity(publicationV2Fixture.openResponseId, { context, fetchImpl: async () => response(malformed) }), /unsupported fields/);
  assert.match(hostedNativeDraftAssetUrl(publicationV2Fixture.imageId, publicationV2Fixture.assetId, context), /\/assets\/10000000-0000-4000-8000-000000000004\?previewAuthorization=/);
  assert.equal(hostedNativeDraftAssetUrl(publicationV2Fixture.imageId, publicationV2Fixture.assetId, { kind: HOSTED_VIEWER_RUNTIME_MODES.RELEASE_PREVIEW }), "");
});
