import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createBuilderContentHandler, parseBuilderContentRoute } from "../netlify-sites/ultimate-b2-builder/server/_builder-content.js";
import { resolveBuilderContentResource } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-registry.js";
import { createBuilderPreviewHandler, parseBuilderPreviewRoute } from "../netlify-sites/ultimate-b2-builder/server/_builder-preview.js";
import {
  applyUltimateB2HostedOpenResponseDraft,
  createUltimateB2HostedOpenResponseSeed,
  normalizeUltimateB2HostedOpenResponseDraft,
  projectUltimateB2HostedOpenResponseDraftForAuthoring,
} from "../src/data/ultimate-b2/hostedOpenResponseDraft.js";
import { findStudentsBookImplementation } from "../src/data/ultimate-b2/studentsBookCatalog.js";
import { validateHostedOpenResponsePreviewEnvelope } from "../src/apps/android-teacher-offline/hostedOpenResponseDraftProvider.js";

const activityId = "ultimate-b2-sb-u1-p1-o1";
const unitTwoActivityId = "ultimate-b2-sb-u2-p1-o1";
const resourceRoute = `/builder/api/content/books/ultimate-b2/components/ultimate-b2-students-book/open-response/${activityId}`;
const previewRoute = `/builder/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/open-response/${activityId}`;

test("hosted Open Response resource support is catalog-derived, keyed, and canonically seeded", async () => {
  for (const id of [activityId, unitTwoActivityId]) {
    const resource = await resolveBuilderContentResource("ultimate-b2", "ultimate-b2-students-book", "open-response", id);
    const activity = findStudentsBookImplementation(id);
    assert.equal(resource.documentType, "open_response");
    assert.equal(resource.documentKey, id);
    assert.equal(resource.previewRequiresStored, true);
    assert.deepEqual(resource.baseline(), createUltimateB2HostedOpenResponseSeed(activity));
    assert.equal(resource.baseline().questions.length, 3);
  }
  assert.equal(await resolveBuilderContentResource("ultimate-b2", "ultimate-b2-students-book", "open-response", "ultimate-b2-sb-u1-p1-o2"), null);
  assert.equal(await resolveBuilderContentResource("ultimate-b2", "ultimate-b2-students-book", "hotspots", "unexpected-key"), null);
  assert.deepEqual(parseBuilderContentRoute({ path: resourceRoute }), { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", resource: "open-response", documentKey: activityId });
  assert.deepEqual(parseBuilderPreviewRoute({ path: previewRoute }), { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", resource: "open-response", documentKey: activityId });
});

test("hosted Open Response schema permits only stable public text fields", () => {
  const activity = findStudentsBookImplementation(activityId);
  const seed = createUltimateB2HostedOpenResponseSeed(activity);
  const edited = structuredClone(seed);
  edited.questions[0].prompt = "A newly edited public prompt";
  assert.equal(normalizeUltimateB2HostedOpenResponseDraft(edited, seed).questions[0].prompt, edited.questions[0].prompt);
  assert.equal(applyUltimateB2HostedOpenResponseDraft(activity, edited).runtime.questions[0].prompt, edited.questions[0].prompt);
  const legacy = { ...seed, visibleInstructionText: "Historical student instruction" };
  assert.equal(normalizeUltimateB2HostedOpenResponseDraft(legacy, seed).visibleInstructionText, legacy.visibleInstructionText);
  assert.equal(projectUltimateB2HostedOpenResponseDraftForAuthoring(legacy).visibleInstructionText, "");

  for (const mutate of [
    (value) => { value.teacherSolutions = []; },
    (value) => { value.questions[0].modelAnswer = "private"; },
    (value) => { value.questions[0].id = "different"; },
    (value) => { value.questions[0].prompt = "https://external.example/content"; },
    (value) => { value.questions[0].prompt = "<script>alert('x')</script>"; },
    (value) => { value.visibleInstructionText = "C:\\private\\source.xml"; },
    (value) => { value.questions.pop(); },
  ]) {
    const invalid = structuredClone(seed);
    mutate(invalid);
    assert.throws(() => normalizeUltimateB2HostedOpenResponseDraft(invalid, seed));
  }
});

test("authenticated keyed API seeds revision zero and public preview exposes saved revisions only", async () => {
  const resource = await resolveBuilderContentResource("ultimate-b2", "ultimate-b2-students-book", "open-response", activityId);
  let stored = null;
  const content = createBuilderContentHandler({
    getDatabase: () => ({}),
    authorize: async () => ({ builderUser: { id: "10000000-0000-4000-8000-000000000001" } }),
    loadDocument: async () => stored,
    saveDocument: async (_sql, input) => {
      stored = { revision: 1, source: "database", document: input.document };
      return { outcome: "saved", revision: 1, currentRevision: 1, document: input.document };
    },
    logger: { error() {} },
  });
  const baselineResponse = await content({ httpMethod: "GET", path: resourceRoute, headers: {} });
  const baseline = JSON.parse(baselineResponse.body);
  assert.equal(baseline.revision, 0);
  assert.equal(baseline.source, "repository");
  assert.equal(baseline.documentKey, activityId);

  const preview = createBuilderPreviewHandler({ getDatabase: () => ({}), loadDocument: async () => stored, logger: { error() {} } });
  assert.equal((await preview({ httpMethod: "GET", path: previewRoute, headers: {} })).statusCode, 404);

  const edited = resource.baseline();
  edited.questions[0].prompt = "Persisted Viewer prompt";
  const saved = await content({
    httpMethod: "PUT",
    path: resourceRoute,
    headers: { host: "builder.example", origin: "https://builder.example", "content-type": "application/json" },
    body: JSON.stringify({ expectedRevision: 0, clientMutationId: "10000000-0000-4000-8000-000000000011", document: edited }),
  });
  assert.equal(saved.statusCode, 200);
  const previewResponse = await preview({ httpMethod: "GET", path: previewRoute, headers: {} });
  const envelope = JSON.parse(previewResponse.body);
  assert.equal(previewResponse.statusCode, 200);
  assert.equal(validateHostedOpenResponsePreviewEnvelope(envelope, activityId).questions[0].prompt, "Persisted Viewer prompt");
  assert.doesNotMatch(previewResponse.body, /teacherSolution|modelAnswer|acceptedAnswer|sourceFile|repositoryPath/i);
});

test("hosted editor stays slim and Viewer integration is no-store, fail-safe, and teacher-answer separate", async () => {
  const [editor, workspace, provider, embedded, normalized, localEditor] = await Promise.all([
    readFile("src/apps/ultimate-b2-builder/HostedOpenResponseEditor.jsx", "utf8"),
    readFile("src/apps/book-builder/hosted/HostedActivityWorkspace.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/hostedOpenResponseDraftProvider.js", "utf8"),
    readFile("src/apps/android-teacher-offline/TeacherOfflineEmbeddedActivity.jsx", "utf8"),
    readFile("src/components/lms/activities/ultimate-b2/NormalizedStudentsBookActivity.jsx", "utf8"),
    readFile("src/apps/ultimate-b2-builder/UltimateB2OpenResponseBuilder.jsx", "utf8"),
  ]);
  assert.match(editor, /expectedRevision: revision/);
  assert.match(editor, /Conflict — unsaved changes retained/);
  assert.match(editor, /onSaved\?\.\(payload\.revision\)/);
  assert.match(workspace, /setViewerRefresh/);
  assert.doesNotMatch(workspace, /b2-hosted-review-banner/);
  assert.match(workspace, /Read-only canonical activity/);
  assert.match(provider, /credentials: "omit"/);
  assert.match(provider, /cache: "no-store"/);
  assert.match(provider, /response\.status === 404/);
  assert.match(embedded, /activityPublicDraft=\{hostedOpenResponseDraft\}/);
  assert.match(normalized, /getOfflineTeacherSolution/);
  assert.match(editor, /prepareOpenResponseImport/);
  assert.match(editor, /Save or deliberately reload your unsaved text edits/);
  assert.doesNotMatch(`${editor}\n${workspace}`, /UltimateB2OpenResponseBuilder|FormData|repositoryFileTarget|android-teacher-offline/);
  assert.match(localEditor, /Open Response/);
});
