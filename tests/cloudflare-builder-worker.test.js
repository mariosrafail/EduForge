import assert from "node:assert/strict";
import test from "node:test";

import {
  BUILDER_DYNAMIC_ROUTE_PREFIXES,
  BUILDER_PLAYER_ROUTE_PREFIXES,
  createBuilderWorker,
  resolveBuilderWorkerRoute,
} from "../cloudflare/builder/worker.js";
import { PLAYER_MEDIA_RECORDS } from "../cloudflare/builder/player-media.js";
import { buildBookAssetHostedTeacherUiPublicKey } from "../lib/book-assets/object-keys.js";
import {
  classifyBuilderPreviewAuthorization,
  issueBuilderPreviewAuthorization,
} from "../netlify-sites/ultimate-b2-builder/server/_builder-preview-authorization.js";

const secretEnvironment = { BUILDER_PREVIEW_AUTH_SECRET: "builder-preview-test-secret-with-more-than-thirty-two-bytes" };
const now = Date.UTC(2026, 7, 18, 12, 0, 0);
const intent = {
  bookSlug: "ultimate-b2",
  componentSlug: "ultimate-b2-students-book",
  view: "library",
  pageId: null,
  activityId: null,
  releaseId: null,
};
const scope = { action: "teacher-ui-draft", bookSlug: intent.bookSlug, componentSlug: intent.componentSlug };

function legacyResult(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function securityHandler(observations) {
  return async (event) => {
    observations.push(event);
    const decision = classifyBuilderPreviewAuthorization(event, scope, { environment: secretEnvironment, now });
    return legacyResult(decision.authorized ? 200 : 401, { code: decision.code, cookie: event.headers.cookie || null, path: event.path });
  };
}

function request(pathname, { cookie = "hh_builder_session=valid-builder-session", token = null, duplicateToken = false } = {}) {
  const url = new URL(pathname, "https://builder.hhplms.workers.dev");
  if (token) url.searchParams.append("previewAuthorization", token);
  if (duplicateToken && token) url.searchParams.append("previewAuthorization", token);
  return new Request(url, { headers: cookie ? { Cookie: cookie } : {} });
}

async function payload(response) {
  return response.json();
}

function playerMediaBucket({ missing = false } = {}) {
  const calls = [];
  const metadata = (record) => ({
    size: record.byteSize,
    httpEtag: '"player-media-etag"',
    writeHttpMetadata(headers) { headers.set("Content-Type", "application/octet-stream"); },
  });
  return {
    calls,
    async head(key) {
      calls.push({ operation: "head", key });
      const record = PLAYER_MEDIA_RECORDS.find((candidate) => candidate.objectKey === key);
      return missing || !record ? null : metadata(record);
    },
    async get(key, options) {
      calls.push({ operation: "get", key, options });
      const record = PLAYER_MEDIA_RECORDS.find((candidate) => candidate.objectKey === key);
      if (missing || !record) return null;
      const length = options?.range?.length || record.byteSize;
      const emittedLength = Math.min(length, 1024);
      return {
        ...metadata(record),
        body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(emittedLength)); controller.close(); } }),
      };
    },
  };
}

function teacherUiBucket({ missing = false } = {}) {
  const calls = [];
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const metadata = () => ({
    size: bytes.byteLength,
    httpEtag: '"teacher-ui-etag"',
    writeHttpMetadata(headers) { headers.set("Content-Type", "application/octet-stream"); },
  });
  return {
    calls,
    async head(key) { calls.push({ operation: "head", key }); return missing ? null : metadata(); },
    async get(key) {
      calls.push({ operation: "get", key });
      return missing ? null : { ...metadata(), body: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }) };
    },
  };
}

test("Builder Worker exposes only the explicit current Builder and Player namespaces", () => {
  assert.deepEqual(BUILDER_DYNAMIC_ROUTE_PREFIXES, [
    "/builder/api/auth", "/builder/api/content", "/builder/api/native-activities", "/builder/api/open-response-import",
    "/builder/api/preview-authorization", "/builder/api/publication", "/builder/api/ui-assets", "/builder/api/unit-extras", "/builder/api/pages",
    "/builder/preview/pages", "/builder/preview/authorization", "/builder/preview/native-activities", "/builder/preview/releases", "/builder/preview/content",
    "/builder/preview/open-response-import", "/builder/preview/open-response-teacher", "/builder/preview/open-response-assets", "/builder/preview/ui-assets",
  ]);
  assert.deepEqual(BUILDER_PLAYER_ROUTE_PREFIXES, [
    "/preview/pages", "/preview/authorization", "/preview/native-activities", "/preview/releases", "/preview/content", "/preview/open-response-import",
    "/preview/open-response-teacher", "/preview/open-response-assets",
  ]);
  assert.equal(resolveBuilderWorkerRoute("/.netlify/functions/builder-auth"), null);
  assert.equal(resolveBuilderWorkerRoute("/builder/api/unknown"), null);
  assert.equal(resolveBuilderWorkerRoute(`/preview/ui-assets/${"a".repeat(64)}.png`), null, "Teacher UI assets use the dedicated R2 route, not a Netlify compatibility handler");
  assert.equal(resolveBuilderWorkerRoute(`/preview/ui-assets-v2/${"a".repeat(64)}.png`), null, "Versioned Teacher UI assets use the dedicated R2 route, not a Netlify compatibility handler");
  for (const prefix of BUILDER_PLAYER_ROUTE_PREFIXES) {
    const route = resolveBuilderWorkerRoute(`${prefix}/example`);
    assert.equal(route.playerFacing, true);
    assert.equal(route.compatibilityPath, `/builder${prefix}/example`);
  }
});

test("managed Player page and authorization routes reach only their compatibility handlers without Builder cookies", async () => {
  const observations = [];
  const echo = async (event) => { observations.push(event); return legacyResult(200, { method: event.httpMethod, path: event.path, cookie: event.headers.cookie || null }); };
  const worker = createBuilderWorker({ handlers: { pages: echo, previewAuthorization: echo } });
  const catalogPath = "/preview/pages/books/ultimate-b2/components/ultimate-b2-workbook";
  const assetPath = `${catalogPath}/pages/wb-page-one/assets/40000000-0000-4000-8000-000000000001/preview`;
  for (const path of [catalogPath, assetPath]) {
    const result = await payload(await worker.fetch(request(path), {}));
    assert.deepEqual(result, { method: "GET", path: `/builder${path}`, cookie: null });
  }
  const exchange = await worker.fetch(new Request("https://builder.hhplms.workers.dev/preview/authorization/exchange", {
    method: "POST", headers: { Cookie: "hh_builder_session=must-not-cross", "Content-Type": "application/json" }, body: "{}",
  }), {});
  assert.deepEqual(await payload(exchange), { method: "POST", path: "/builder/preview/authorization/exchange", cookie: null });
  assert.equal(observations.every((event) => event.headers.cookie === undefined), true);
  assert.equal((await worker.fetch(request("/preview/not-a-capability"), {})).status, 404);
});

test("managed Player page routes reject missing and cross-component preview authorization", async () => {
  const pageId = "wb-page-one";
  const managedIntent = { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook", view: "page", pageId, activityId: null, releaseId: null };
  const token = issueBuilderPreviewAuthorization(managedIntent, { environment: secretEnvironment, now, nonce: "managed-page-route-nonce" }).token;
  const authorize = (action, includePage = false) => async (event) => {
    const componentSlug = event.path.includes("ultimate-b2-grammar-book") ? "ultimate-b2-grammar-book" : "ultimate-b2-workbook";
    const decision = classifyBuilderPreviewAuthorization(event, { action, bookSlug: "ultimate-b2", componentSlug, ...(includePage ? { pageId } : {}) }, { environment: secretEnvironment, now });
    return legacyResult(decision.authorized ? 200 : 401, decision);
  };
  const worker = createBuilderWorker({ handlers: { pages: async (event) => event.path.includes("/assets/") ? authorize("managed-page-asset", true)(event) : authorize("managed-page-catalog")(event) } });
  const catalog = "/preview/pages/books/ultimate-b2/components/ultimate-b2-workbook";
  const asset = `${catalog}/pages/${pageId}/assets/40000000-0000-4000-8000-000000000001/preview`;
  assert.equal((await worker.fetch(request(catalog), {})).status, 401);
  assert.equal((await worker.fetch(request(catalog, { token }), {})).status, 200);
  assert.equal((await worker.fetch(request(asset, { token }), {})).status, 200);
  const grammar = catalog.replace("workbook", "grammar-book");
  assert.equal((await worker.fetch(request(grammar, { token }), {})).status, 401);
});

test("v2 Teacher UI preview assets stream same-origin from the exact canonical public R2 key", async () => {
  const checksum = "b".repeat(64);
  const contentTypes = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", mp3: "audio/mpeg", wav: "audio/wav", gaf: "application/x-gaf" };
  const bucket = teacherUiBucket();
  const worker = createBuilderWorker({ handlers: { teacherUiAssets: async () => { throw new Error("Player Teacher UI assets must bypass the redirecting Netlify handler."); } } });
  for (const [extension, contentType] of Object.entries(contentTypes)) {
    const path = `/preview/ui-assets-v2/${checksum}.${extension}`;
    const response = await worker.fetch(request(`${path}?objectKey=private%2Fmust-not-be-used`, { cookie: null }), { PLAYER_MEDIA: bucket });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("content-type"), contentType);
    assert.equal(response.headers.get("content-length"), "4");
    assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("etag"), '"teacher-ui-etag"');
    assert.equal((await response.arrayBuffer()).byteLength, 4);
    assert.equal(bucket.calls.at(-1).key, buildBookAssetHostedTeacherUiPublicKey({ checksum, extension }));
  }
  assert.equal(bucket.calls.every(({ key }) => key.startsWith("publishers/hamilton-house/books/ultimate-b2/editions/students-book/versions/hosted-draft/components/ultimate-b2-students-book/teacher-ui/assets/")), true);
});

test("Teacher UI v1/v2 R2 routes are GET/HEAD-only, exact, missing-safe, and binding-fail-closed", async () => {
  const checksum = "c".repeat(64);
  const path = `/preview/ui-assets-v2/${checksum}.png`;
  const bucket = teacherUiBucket();
  const env = { PLAYER_MEDIA: bucket, ASSETS: { fetch: async () => new Response("missing", { status: 404 }) } };
  const worker = createBuilderWorker();
  const head = await worker.fetch(new Request(new URL(path, "https://builder.hhplms.workers.dev"), { method: "HEAD" }), env);
  assert.equal(head.status, 200);
  assert.equal(head.body, null);
  assert.equal(head.headers.get("content-length"), "4");
  assert.equal(bucket.calls.at(-1).operation, "head");
  assert.equal((await worker.fetch(request(`/preview/ui-assets/${checksum}.png`, { cookie: null }), env)).status, 200, "v1 remains available for backward compatibility");

  const mutation = await worker.fetch(new Request(new URL(path, "https://builder.hhplms.workers.dev"), { method: "POST", body: "no" }), env);
  assert.equal(mutation.status, 405);
  assert.equal(mutation.headers.get("allow"), "GET, HEAD");
  assert.equal(bucket.calls.length, 2);

  for (const invalidPath of [
    `/preview/ui-assets-v2/${checksum}.svg`,
    `/preview/ui-assets-v2/${checksum}.png/private-key`,
    "/preview/ui-assets-v2/../../private/key",
    `/preview/ui-assets-v2/${checksum.toUpperCase()}.png`,
  ]) assert.equal((await worker.fetch(request(invalidPath, { cookie: null }), env)).status, 404);
  assert.equal(bucket.calls.length, 2);
  assert.equal((await worker.fetch(request(path, { cookie: null }), { PLAYER_MEDIA: teacherUiBucket({ missing: true }) })).status, 404);
  assert.equal((await worker.fetch(request(path, { cookie: null }), {})).status, 503);
});

test("Player preview ignores a valid Builder cookie when authorization is missing", async () => {
  const observations = [];
  const worker = createBuilderWorker({ handlers: { preview: securityHandler(observations) } });
  const response = await worker.fetch(request("/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/teacher-ui"), {});
  assert.equal(response.status, 401);
  assert.deepEqual(await payload(response), { code: "token_missing", cookie: null, path: "/builder/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/teacher-ui" });
  assert.equal(observations[0].headers.cookie, undefined);
});

test("Player preview rejects malformed, expired, wrong-scope, and duplicate authorization despite a Builder cookie", async () => {
  const worker = createBuilderWorker({ handlers: { preview: securityHandler([]) } });
  const expired = issueBuilderPreviewAuthorization(intent, { environment: secretEnvironment, now: now - 600_000, nonce: "expired-token-nonce" }).token;
  const wrongScope = issueBuilderPreviewAuthorization({ ...intent, bookSlug: "another-book" }, { environment: secretEnvironment, now, nonce: "wrong-scope-token-nonce" }).token;
  for (const [token, duplicate, code] of [
    ["malformed", false, "token_malformed"],
    [expired, false, "token_expired"],
    [wrongScope, false, "scope_mismatch"],
    [wrongScope, true, "token_malformed"],
  ]) {
    const response = await worker.fetch(request("/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/teacher-ui", { token, duplicateToken: duplicate }), {});
    assert.equal(response.status, 401);
    assert.equal((await payload(response)).code, code);
  }
});

test("correct scoped Player authorization reaches canonical logic without the Builder cookie", async () => {
  const observations = [];
  const worker = createBuilderWorker({ handlers: { preview: securityHandler(observations) } });
  const token = issueBuilderPreviewAuthorization(intent, { environment: secretEnvironment, now, nonce: "correct-scope-token-nonce" }).token;
  const response = await worker.fetch(request("/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/teacher-ui", { token }), {});
  assert.equal(response.status, 200);
  assert.equal((await payload(response)).code, "authorized");
  assert.equal(observations[0].headers.cookie, undefined);
  assert.deepEqual(observations[0].multiValueQueryStringParameters.previewAuthorization, [token]);
});

test("Builder preview and Builder API preserve the Builder session cookie", async () => {
  const seen = [];
  const echo = async (event) => { seen.push(event); return legacyResult(200, { cookie: event.headers.cookie, path: event.path }); };
  const worker = createBuilderWorker({ handlers: { preview: echo, auth: echo } });
  const preview = await payload(await worker.fetch(request("/builder/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/hotspots"), {}));
  const api = await payload(await worker.fetch(request("/builder/api/auth?action=me"), {}));
  assert.equal(preview.cookie, "hh_builder_session=valid-builder-session");
  assert.equal(api.cookie, "hh_builder_session=valid-builder-session");
  assert.equal(seen[0].path, "/builder/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/hotspots");
  assert.equal(seen[1].path, "/builder/api/auth");
});

test("static composition keeps Builder and Player fallbacks isolated", async () => {
  const calls = [];
  const env = { ASSETS: { async fetch(assetRequest) {
    const pathname = new URL(assetRequest.url).pathname;
    calls.push(pathname);
    if (pathname === "/" || pathname === "/index.html") return new Response("BUILDER_APPLICATION", { status: 200, headers: { "Content-Type": "text/html" } });
    if (pathname === "/player/index.html") return new Response(null, { status: 307, headers: { Location: "/player/" } });
    if (pathname === "/player/") return new Response("PLAYER_APPLICATION", { status: 200, headers: { "Content-Type": "text/html" } });
    return new Response("missing", { status: 404 });
  } } };
  const worker = createBuilderWorker();
  assert.equal(await (await worker.fetch(request("/", { cookie: null }), env)).text(), "BUILDER_APPLICATION");
  const playerRedirect = await worker.fetch(request("/player?view=library", { cookie: null }), env);
  assert.equal(playerRedirect.status, 307);
  assert.equal(playerRedirect.headers.get("location"), "https://builder.hhplms.workers.dev/player/?view=library");
  const playerRoot = await worker.fetch(request("/player/", { cookie: null }), env);
  assert.equal(playerRoot.status, 200);
  assert.equal(playerRoot.headers.get("location"), null);
  assert.equal(await playerRoot.text(), "PLAYER_APPLICATION");
  const playerRoute = await worker.fetch(request("/player/library", { cookie: null }), env);
  assert.equal(playerRoute.status, 200);
  assert.equal(playerRoute.headers.get("location"), null);
  assert.equal(await playerRoute.text(), "PLAYER_APPLICATION");
  const missingPlayerAsset = await worker.fetch(request("/player/assets/missing.js", { cookie: null }), env);
  assert.equal(missingPlayerAsset.status, 404);
  assert.deepEqual(calls, ["/", "/player/", "/player/", "/player/assets/missing.js"]);
  assert.equal(calls.includes("/player/index.html"), false);
});

test("Player media streams an allowlisted full GET and returns metadata-only HEAD", async () => {
  const record = PLAYER_MEDIA_RECORDS[0];
  const bucket = playerMediaBucket();
  const worker = createBuilderWorker();
  const full = await worker.fetch(request(record.publicPath, { cookie: null }), { PLAYER_MEDIA: bucket });
  assert.equal(full.status, 200);
  assert.equal(full.headers.get("content-type"), "video/mp4");
  assert.equal(full.headers.get("content-length"), String(record.byteSize));
  assert.equal(full.headers.get("accept-ranges"), "bytes");
  assert.equal(full.headers.get("etag"), '"player-media-etag"');
  assert.ok(full.body);

  const head = await worker.fetch(new Request(new URL(record.publicPath, "https://builder.hhplms.workers.dev"), { method: "HEAD" }), { PLAYER_MEDIA: bucket });
  assert.equal(head.status, 200);
  assert.equal(head.body, null);
  assert.equal(head.headers.get("content-length"), String(record.byteSize));
  assert.deepEqual(bucket.calls.map(({ operation }) => operation), ["get", "head"]);
});

test("Player media supports prefix, suffix, and open-ended single byte ranges", async () => {
  const record = PLAYER_MEDIA_RECORDS[0];
  const bucket = playerMediaBucket();
  const worker = createBuilderWorker();
  const ranged = async (range) => worker.fetch(new Request(new URL(record.publicPath, "https://builder.hhplms.workers.dev"), { headers: { Range: range } }), { PLAYER_MEDIA: bucket });

  const prefix = await ranged("bytes=0-1023");
  assert.equal(prefix.status, 206);
  assert.equal(prefix.headers.get("content-range"), `bytes 0-1023/${record.byteSize}`);
  assert.equal(prefix.headers.get("content-length"), "1024");
  assert.equal((await prefix.arrayBuffer()).byteLength, 1024);

  const suffix = await ranged("bytes=-32");
  assert.equal(suffix.status, 206);
  assert.equal(suffix.headers.get("content-range"), `bytes ${record.byteSize - 32}-${record.byteSize - 1}/${record.byteSize}`);
  assert.equal(suffix.headers.get("content-length"), "32");

  const openEnded = await ranged("bytes=100-");
  assert.equal(openEnded.status, 206);
  assert.equal(openEnded.headers.get("content-range"), `bytes 100-${record.byteSize - 1}/${record.byteSize}`);
  assert.deepEqual(bucket.calls.map(({ options }) => options.range), [
    { offset: 0, length: 1024 },
    { offset: record.byteSize - 32, length: 32 },
    { offset: 100, length: record.byteSize - 100 },
  ]);
});

test("Player media rejects invalid ranges, unknown objects, missing objects, and mutations", async () => {
  const record = PLAYER_MEDIA_RECORDS[0];
  const bucket = playerMediaBucket();
  const worker = createBuilderWorker();
  const invalid = await worker.fetch(new Request(new URL(record.publicPath, "https://builder.hhplms.workers.dev"), { headers: { Range: `bytes=${record.byteSize}-` } }), { PLAYER_MEDIA: bucket });
  assert.equal(invalid.status, 416);
  assert.equal(invalid.headers.get("content-range"), `bytes */${record.byteSize}`);
  assert.equal(bucket.calls.length, 0);

  const duplicate = await worker.fetch(new Request(new URL(record.publicPath, "https://builder.hhplms.workers.dev"), { headers: { Range: "bytes=0-1,4-5" } }), { PLAYER_MEDIA: bucket });
  assert.equal(duplicate.status, 416);
  assert.equal(bucket.calls.length, 0);

  const unknown = await worker.fetch(request("/player-media/ultimate-b2/unknown.mp4", { cookie: null }), { PLAYER_MEDIA: bucket });
  assert.equal(unknown.status, 404);
  assert.equal(bucket.calls.length, 0);

  const mutation = await worker.fetch(new Request(new URL(record.publicPath, "https://builder.hhplms.workers.dev"), { method: "PUT", body: "no" }), { PLAYER_MEDIA: bucket });
  assert.equal(mutation.status, 405);
  assert.equal(mutation.headers.get("allow"), "GET, HEAD");
  assert.equal(bucket.calls.length, 0);

  const missing = await worker.fetch(request(record.publicPath, { cookie: null }), { PLAYER_MEDIA: playerMediaBucket({ missing: true }) });
  assert.equal(missing.status, 404);
});
