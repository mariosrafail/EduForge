import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { json } from "../netlify-sites/ultimate-b2-builder/server/_builder-auth.js";
import { createBuilderContentHandler } from "../netlify-sites/ultimate-b2-builder/server/_builder-content.js";
import { builderDocumentSha256 } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { resolveBuilderContentResource } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-registry.js";
import { createBuilderNativeActivitiesHandler } from "../netlify-sites/ultimate-b2-builder/server/_builder-native-activities.js";
import { NATIVE_ACTIVITY_KINDS } from "../src/data/native-activities/nativeActivityKinds.js";

const actor = "10000000-0000-4000-8000-000000000001";
const components = [
  { componentSlug: "ultimate-b2-workbook", pageId: "ultimate-b2-wb-unit-1-page-1", prefix: "ultimate-b2-wb-" },
  { componentSlug: "ultimate-b2-grammar-book", pageId: "ultimate-b2-gb-unit-1-page-1", prefix: "ultimate-b2-gb-" },
];

function event(path, { method = "GET", body = null } = {}) {
  return {
    httpMethod: method, path,
    headers: { host: "builder.example", origin: "https://builder.example", cookie: "live", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : "",
  };
}

function componentHarness() {
  const states = Object.fromEntries(components.map(({ componentSlug }) => [componentSlug, {
    index: { revision: 1, document: { schemaVersion: "1.0", activities: [] } },
    lifecycle: { revision: 1, document: { schemaVersion: "1.0", activities: {} } },
    documents: new Map(), mutations: new Map(),
    pageDeleted: false,
  }]));
  const scopes = [];
  const sql = async (strings, ...values) => {
    const stableKey = values.find((value) => typeof value === "string" && value.includes("/pages/"));
    const component = components.find(({ componentSlug, pageId }) => stableKey === `${componentSlug}/pages/${pageId}`);
    return component ? [{ stable_key: stableKey, sort_order: 10, source_metadata: { is_active: !states[component.componentSlug].pageDeleted, is_deleted: states[component.componentSlug].pageDeleted }, unit_id: "10000000-0000-4000-8000-000000000001", unit_number: 1, unit_title: "Unit 1" }] : [];
  };
  const loadDocument = async (_sql, resource) => {
    const state = states[resource.componentSlug]; if (!state) return null;
    if (resource.documentType === "native_activity_index") return state.index;
    if (resource.documentType === "activity_lifecycle") return state.lifecycle;
    if (resource.documentType === "hotspots") return { revision: 1, document: resource.baseline() };
    return state.documents.get(`${resource.documentType}:${resource.documentKey}`) || null;
  };
  const handler = createBuilderNativeActivitiesHandler({
    getDatabase: () => sql,
    authorize: async (request) => request.headers.cookie === "live" ? { builderUser: { id: actor } } : { error: json(401, { error: "Unauthorized" }) },
    loadDocument,
    loadKnownActivityIds: async (_sql, scope) => [...states[scope.componentSlug].documents.keys()].filter((key) => key.startsWith("native_activity_public:")).map((key) => key.split(":")[1]),
    create: async (_sql, input) => {
      const state = states[input.componentSlug]; const replay = state.mutations.get(input.clientMutationId);
      if (replay) return replay.requestSha256 === input.requestSha256 ? { ...replay.result, outcome: "idempotent" } : { ...replay.result, outcome: "mutation_id_conflict" };
      state.index = { revision: state.index.revision + 1, document: input.indexDocument };
      state.documents.set(`native_activity_public:${input.activityId}`, { revision: 1, document: input.publicDocument });
      state.documents.set(`native_activity_teacher:${input.activityId}`, { revision: 1, document: input.teacherDocument });
      const result = { outcome: "created", activityId: input.activityId, indexRevision: state.index.revision, publicRevision: 1, teacherRevision: 1 };
      state.mutations.set(input.clientMutationId, { requestSha256: input.requestSha256, result }); return result;
    },
    collectCatalog: async (_sql, scope) => {
      scopes.push(scope); const state = states[scope.componentSlug];
      const source = (stored) => ({ revision: stored.revision, payload: stored.document, sha256: builderDocumentSha256(stored.document) });
      return { native: { index: source(state.index), activities: Object.fromEntries(state.index.document.activities.map((entry) => [entry.activityId, {
        index: entry, public: source(state.documents.get(`native_activity_public:${entry.activityId}`)), teacher: source(state.documents.get(`native_activity_teacher:${entry.activityId}`)),
      }])), assetRows: [] } };
    },
    logger: { error() {} },
  });
  const content = createBuilderContentHandler({
    getDatabase: () => sql,
    authorize: async () => ({ builderUser: { id: actor } }),
    loadDocument,
  });
  return { handler, content, scopes, states };
}

test("Workbook and Grammar create every registered native kind and reload only their own catalog", async () => {
  const { handler, content, scopes, states } = componentHarness();
  for (const component of components) {
    const root = `/builder/api/native-activities/books/ultimate-b2/components/${component.componentSlug}`;
    for (const kind of NATIVE_ACTIVITY_KINDS) {
      const clientMutationId = randomUUID();
      const body = { kind, pageId: component.pageId, title: `${component.componentSlug} ${kind}`, clientMutationId };
      const first = await handler(event(`${root}/create`, { method: "POST", body }));
      assert.equal(first.statusCode, 200, first.body);
      const created = JSON.parse(first.body); assert.match(created.activityId, new RegExp(`^${component.prefix}`));
      if (kind === NATIVE_ACTIVITY_KINDS[0]) {
        const replay = await handler(event(`${root}/create`, { method: "POST", body }));
        assert.equal(JSON.parse(replay.body).activityId, created.activityId); assert.equal(JSON.parse(replay.body).idempotent, true);
        const conflict = await handler(event(`${root}/create`, { method: "POST", body: { ...body, title: "different" } }));
        assert.equal(conflict.statusCode, 409);
      }
      for (const resource of ["native-activity-public", "native-activity-teacher"]) {
        const loaded = await content(event(`/builder/api/content/books/ultimate-b2/components/${component.componentSlug}/${resource}/${created.activityId}`));
        assert.equal(loaded.statusCode, 200); assert.equal(JSON.parse(loaded.body).componentSlug, component.componentSlug);
      }
    }
    const catalog = await handler(event(`${root}/catalog`));
    assert.equal(catalog.statusCode, 200, catalog.body);
    const payload = JSON.parse(catalog.body);
    assert.deepEqual({ bookSlug: payload.bookSlug, componentSlug: payload.componentSlug }, { bookSlug: "ultimate-b2", componentSlug: component.componentSlug });
    assert.equal(payload.activities.length, NATIVE_ACTIVITY_KINDS.length);
    assert.equal(payload.activities.every(({ activityId }) => activityId.startsWith(component.prefix)), true);
    assert.equal(new Set(payload.activities.map(({ activityId }) => activityId)).size, NATIVE_ACTIVITY_KINDS.length);
    states[component.componentSlug].pageDeleted = true;
    const recovered = await handler(event(`${root}/catalog`));
    assert.equal(recovered.statusCode, 200, recovered.body);
    assert.equal(JSON.parse(recovered.body).activities.every((activity) => activity.sourcePageId === component.pageId && activity.assignment.state === "unassigned" && activity.assignment.reason === "page-deleted"), true);
    const rejectedDestination = await handler(event(`${root}/create`, { method: "POST", body: { kind: "image", pageId: component.pageId, title: "Must reject deleted destination", clientMutationId: randomUUID() } }));
    assert.equal(rejectedDestination.statusCode, 400);
    states[component.componentSlug].pageDeleted = false;
  }
  assert.deepEqual(scopes, components.flatMap(({ componentSlug }) => [{ bookSlug: "ultimate-b2", componentSlug }, { bookSlug: "ultimate-b2", componentSlug }]));
  assert.equal([...states[components[0].componentSlug].documents.keys()].some((key) => key.includes("-gb-")), false);
  assert.equal([...states[components[1].componentSlug].documents.keys()].some((key) => key.includes("-wb-")), false);
});

test("client source pins catalog identity, route generations, visible errors, and scope-bearing editor keys", async () => {
  const [api, app] = await Promise.all([
    readFile(new URL("../src/apps/book-builder/hosted/builderNativeActivityApi.js", import.meta.url), "utf8"),
    readFile(new URL("../src/apps/ultimate-b2-builder/HostedUltimateB2BuilderApp.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(api, /value\.bookSlug !== bookSlug \|\| value\.componentSlug !== componentSlug/);
  assert.match(api, /getNativeActivityCatalogResult/); assert.match(api, /return \(await getNativeActivityCatalogResult\(identity, options\)\)\.activities/);
  assert.match(app, /scopeGenerationRef/); assert.match(app, /generation !== scopeGenerationRef\.current/);
  assert.match(app, /controller\.signal\.aborted/); assert.match(app, /activities could not be loaded/);
  assert.match(app, /catalogDiagnostics/); assert.match(app, /Other activities remain available/); assert.match(app, />Retry</);
  assert.match(app, /key={`\$\{scopeKey}:\$\{selectedId}:\$\{nativeSelected\.placement\?\.pageId}`}/);
  assert.doesNotMatch(app, /loadCatalogs\(controller\.signal\)\.catch\(\(\) => \{\}\)/);
});

test("content registry rejects cross-component public and Teacher identities before storage", async () => {
  for (const [componentSlug, foreignId] of [
    ["ultimate-b2-workbook", "ultimate-b2-sb-u1-p1-o4"],
    ["ultimate-b2-workbook", "ultimate-b2-gb-unit-1-page-1-o1"],
    ["ultimate-b2-grammar-book", "ultimate-b2-wb-unit-1-page-1-o1"],
  ]) for (const resource of ["native-activity-public", "native-activity-teacher"]) {
    assert.equal(await resolveBuilderContentResource("ultimate-b2", componentSlug, resource, foreignId), null);
  }
});
