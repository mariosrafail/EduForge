import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { json } from "../netlify-sites/ultimate-b2-builder/server/_builder-auth.js";
import { createBuilderContentHandler } from "../netlify-sites/ultimate-b2-builder/server/_builder-content.js";
import { resolveBuilderContentResource } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-registry.js";
import { createBuilderNativeActivitiesHandler } from "../netlify-sites/ultimate-b2-builder/server/_builder-native-activities.js";

const actor = "10000000-0000-4000-8000-000000000001";
const root = "/builder/api/native-activities/books/ultimate-b2/components/ultimate-b2-students-book/create";
const pageId = "ub2-sb-unit-1-part-1";
const request = (overrides = {}) => ({ httpMethod: overrides.method || "POST", path: overrides.path || root, headers: { host: "builder.example", origin: "https://builder.example", cookie: "hh_builder_session=live", "content-type": "application/json", ...overrides.headers }, body: JSON.stringify(overrides.body || { kind: "open-response", pageId, title: "Native draft", clientMutationId: overrides.clientMutationId || randomUUID() }) });

function harness() {
  let indexState = null;
  const documents = new Map();
  const mutations = new Map();
  const pairMutations = new Map();
  const handler = createBuilderNativeActivitiesHandler({
    getDatabase: () => ({}),
    authorize: async (event) => event.headers.cookie === "hh_builder_session=live" ? { builderUser: { id: actor } } : { error: json(401, { error: "Unauthorized" }) },
    loadDocument: async (_sql, resource) => resource.documentType === "native_activity_index" ? indexState : documents.get(`${resource.documentType}:${resource.documentKey}`) || null,
    create: async (_sql, input) => {
      const replay = mutations.get(input.clientMutationId);
      if (replay) return replay.requestSha256 === input.requestSha256 ? { ...replay.result, outcome: "idempotent" } : { ...replay.result, outcome: "mutation_id_conflict" };
      if ((indexState?.revision || 0) !== input.expectedIndexRevision) return { outcome: "revision_conflict", indexRevision: indexState?.revision || 0 };
      if (documents.has(`native_activity_public:${input.activityId}`)) return { outcome: "identity_conflict", activityId: input.activityId };
      indexState = { revision: input.expectedIndexRevision + 1, source: "database", document: input.indexDocument };
      documents.set(`native_activity_public:${input.activityId}`, { revision: 1, source: "database", document: input.publicDocument });
      documents.set(`native_activity_teacher:${input.activityId}`, { revision: 1, source: "database", document: input.teacherDocument });
      const result = { outcome: "created", activityId: input.activityId, indexRevision: indexState.revision, publicRevision: 1, teacherRevision: 1 };
      mutations.set(input.clientMutationId, { requestSha256: input.requestSha256, result });
      return result;
    },
    validateAssets: async () => true,
    savePair: async (_sql, input) => {
      const replay = pairMutations.get(input.clientMutationId);
      if (replay) return replay.requestSha256 === input.requestSha256 ? { ...replay.result, outcome: "idempotent" } : { ...replay.result, outcome: "mutation_id_conflict" };
      const publicState = documents.get(`native_activity_public:${input.activityId}`);
      const teacherState = documents.get(`native_activity_teacher:${input.activityId}`);
      if (publicState.revision !== input.expectedPublicRevision || teacherState.revision !== input.expectedTeacherRevision) return { outcome: "revision_conflict", currentPublicRevision: publicState.revision, currentTeacherRevision: teacherState.revision };
      publicState.revision += 1; teacherState.revision += 1; publicState.document = input.publicDocument; teacherState.document = input.teacherDocument;
      const result = { outcome: "saved", publicRevision: publicState.revision, teacherRevision: teacherState.revision, currentPublicRevision: publicState.revision, currentTeacherRevision: teacherState.revision };
      pairMutations.set(input.clientMutationId, { requestSha256: input.requestSha256, result });
      return result;
    },
    logger: { error() {} },
  });
  return { handler, documents, getIndex: () => indexState };
}

test("native creation HTTP boundary rejects missing auth, wrong origin, unknown scope, kind, and placement", async () => {
  const { handler } = harness();
  assert.equal((await handler(request({ headers: { cookie: "" } }))).statusCode, 401);
  assert.equal((await handler(request({ headers: { origin: "https://attacker.example" } }))).statusCode, 403);
  assert.equal((await handler(request({ path: "/builder/api/native-activities/books/ultimate-b2/components/ultimate-b2-workbook/create" }))).statusCode, 404);
  assert.equal((await handler(request({ body: { kind: "matching", pageId, title: "x", clientMutationId: randomUUID() } }))).statusCode, 400);
  assert.equal((await handler(request({ body: { kind: "image", pageId: "unknown", title: "x", clientMutationId: randomUUID() } }))).statusCode, 400);
});

test("one create mutation produces index, public, and Teacher documents and replays the stable ID", async () => {
  const { handler, documents, getIndex } = harness();
  const clientMutationId = randomUUID();
  const first = await handler(request({ clientMutationId }));
  const replay = await handler(request({ clientMutationId }));
  assert.equal(first.statusCode, 200);
  const created = JSON.parse(first.body);
  assert.match(created.activityId, /^ultimate-b2-sb-u1-p1-o\d+$/);
  assert.equal(JSON.parse(replay.body).activityId, created.activityId);
  assert.equal(JSON.parse(replay.body).idempotent, true);
  assert.equal(getIndex().document.activities[0].activityId, created.activityId);
  assert.equal(documents.get(`native_activity_public:${created.activityId}`).document.parts[0].id, "part-1");
  assert.equal(documents.get(`native_activity_teacher:${created.activityId}`).document.parts[0].id, "part-1");
  const changed = await handler(request({ clientMutationId, body: { kind: "image", pageId, title: "Different", clientMutationId } }));
  assert.equal(changed.statusCode, 409);
  assert.equal(JSON.parse(changed.body).error, "mutation_id_conflict");
});

test("native documents are authenticated reads and paired writes are the only mutation boundary", async () => {
  const { handler: create, documents } = harness();
  const created = JSON.parse((await create(request())).body);
  const content = createBuilderContentHandler({
    getDatabase: () => ({}), authorize: async (event) => event.headers.cookie === "hh_builder_session=live" ? { builderUser: { id: actor } } : { error: json(401, { error: "Unauthorized" }) },
    loadDocument: async (_sql, resource) => documents.get(`${resource.documentType}:${resource.documentKey}`) || null,
    saveDocument: async (_sql, input) => { documents.set(`${input.resource.documentType}:${input.resource.documentKey}`, { revision: input.expectedRevision + 1, source: "database", document: input.document }); return { outcome: "saved", revision: input.expectedRevision + 1, currentRevision: input.expectedRevision + 1, document: input.document }; },
  });
  const path = (resource) => `/builder/api/content/books/ultimate-b2/components/ultimate-b2-students-book/${resource}/${created.activityId}`;
  const event = (resource, method = "GET", body = null, cookie = "hh_builder_session=live") => ({ httpMethod: method, path: path(resource), headers: { host: "builder.example", origin: "https://builder.example", cookie, "content-type": "application/json" }, body: body ? JSON.stringify(body) : "" });
  assert.equal((await content(event("native-activity-public", "GET", null, ""))).statusCode, 401);
  assert.equal((await content(event("native-activity-teacher", "GET", null, ""))).statusCode, 401);
  const publicDocument = documents.get(`native_activity_public:${created.activityId}`).document;
  const privatePublic = structuredClone(publicDocument); privatePublic.metadata.modelAnswer = "leak";
  const publicRejected = await content(event("native-activity-public", "PUT", { expectedRevision: 1, clientMutationId: randomUUID(), document: privatePublic }));
  assert.equal(JSON.parse(publicRejected.body).error, "private_document_key_rejected");
  const teacherDocument = documents.get(`native_activity_teacher:${created.activityId}`).document;
  const teacherSaved = await content(event("native-activity-teacher", "PUT", { expectedRevision: 1, clientMutationId: randomUUID(), document: teacherDocument }));
  assert.equal(teacherSaved.statusCode, 400);
  const changedKind = { ...publicDocument, kind: "image" };
  assert.equal((await content(event("native-activity-public", "PUT", { expectedRevision: 1, clientMutationId: randomUUID(), document: changedKind }))).statusCode, 400);
  assert.equal(await resolveBuilderContentResource("ultimate-b2", "ultimate-b2-students-book", "native-activity-public", "../../secret"), null);

  const imageCreated = JSON.parse((await create(request({ body: { kind: "image", pageId, title: "Image metadata", clientMutationId: randomUUID() } }))).body);
  const imagePublic = documents.get(`native_activity_public:${imageCreated.activityId}`).document; imagePublic.metadata.title = "Updated Image metadata";
  const imageSaved = await content({ httpMethod: "PUT", path: `/builder/api/content/books/ultimate-b2/components/ultimate-b2-students-book/native-activity-public/${imageCreated.activityId}`, headers: { host: "builder.example", origin: "https://builder.example", cookie: "hh_builder_session=live", "content-type": "application/json" }, body: JSON.stringify({ expectedRevision: 1, clientMutationId: randomUUID(), document: imagePublic }) });
  assert.equal(imageSaved.statusCode, 200);

  const questionId = `q-${"a".repeat(32)}`;
  publicDocument.parts[0].interaction.questions.push({ id: questionId, prompt: "Explain.", promptArea: { x: 20, y: 20, width: 400, height: 50 }, promptStyle: { fontFamily: "Arial", fontSize: 20, color: "#111827", align: "left" }, responseRegion: { id: `${questionId}-response`, ariaLabel: "Response for question 1", area: { x: 40, y: 100, width: 500, height: 120 }, presentation: { paddingX: 10, paddingY: 8, lineCount: 3, lineSpacing: 32, linePositions: [40, 72, 104], lineWidth: 480, answerFontFamily: "Arial", answerFontSizeMin: 12, answerFontSizeMax: 22, color: "#111827", align: "left" } } });
  teacherDocument.parts[0].solution.modelAnswers.push({ questionId, text: "A private answer." });
  const pairPath = `/builder/api/native-activities/books/ultimate-b2/components/ultimate-b2-students-book/activities/${created.activityId}/save`;
  const mutationId = randomUUID();
  const pairEvent = (body) => ({ httpMethod: "POST", path: pairPath, headers: { host: "builder.example", origin: "https://builder.example", cookie: "hh_builder_session=live", "content-type": "application/json" }, body: JSON.stringify(body) });
  const pairBody = { expectedPublicRevision: 1, expectedTeacherRevision: 1, clientMutationId: mutationId, publicDocument, teacherDocument };
  const saved = await create(pairEvent(pairBody));
  assert.equal(saved.statusCode, 200);
  assert.equal(JSON.parse(saved.body).publicRevision, 2);
  assert.equal(JSON.parse(saved.body).teacherRevision, 2);
  assert.equal(JSON.stringify(JSON.parse(saved.body).publicDocument).includes("private answer"), false);
  assert.equal(JSON.parse((await create(pairEvent(pairBody))).body).idempotent, true);
  const stale = await create(pairEvent({ ...pairBody, clientMutationId: randomUUID() }));
  assert.equal(stale.statusCode, 409);
});
