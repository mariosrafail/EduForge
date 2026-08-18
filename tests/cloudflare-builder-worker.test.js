import assert from "node:assert/strict";
import test from "node:test";

import {
  BUILDER_DYNAMIC_ROUTE_PREFIXES,
  BUILDER_PLAYER_ROUTE_PREFIXES,
  createBuilderWorker,
  resolveBuilderWorkerRoute,
} from "../cloudflare/builder/worker.js";
import { PLAYER_MEDIA_RECORDS } from "../cloudflare/builder/player-media.js";
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

test("Builder Worker exposes only the explicit current Builder and Player namespaces", () => {
  assert.deepEqual(BUILDER_DYNAMIC_ROUTE_PREFIXES, [
    "/builder/api/auth", "/builder/api/content", "/builder/api/native-activities", "/builder/api/open-response-import",
    "/builder/api/preview-authorization", "/builder/api/publication", "/builder/api/ui-assets",
    "/builder/preview/native-activities", "/builder/preview/releases", "/builder/preview/content",
    "/builder/preview/open-response-import", "/builder/preview/open-response-teacher", "/builder/preview/open-response-assets", "/builder/preview/ui-assets",
  ]);
  assert.deepEqual(BUILDER_PLAYER_ROUTE_PREFIXES, [
    "/preview/native-activities", "/preview/releases", "/preview/content", "/preview/open-response-import",
    "/preview/open-response-teacher", "/preview/open-response-assets", "/preview/ui-assets",
  ]);
  assert.equal(resolveBuilderWorkerRoute("/.netlify/functions/builder-auth"), null);
  assert.equal(resolveBuilderWorkerRoute("/builder/api/unknown"), null);
  for (const prefix of BUILDER_PLAYER_ROUTE_PREFIXES) {
    const route = resolveBuilderWorkerRoute(`${prefix}/example`);
    assert.equal(route.playerFacing, true);
    assert.equal(route.compatibilityPath, `/builder${prefix}/example`);
  }
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
    if (pathname === "/player/index.html") return new Response("PLAYER_APPLICATION", { status: 200, headers: { "Content-Type": "text/html" } });
    return new Response("missing", { status: 404 });
  } } };
  const worker = createBuilderWorker();
  assert.equal(await (await worker.fetch(request("/", { cookie: null }), env)).text(), "BUILDER_APPLICATION");
  assert.equal(await (await worker.fetch(request("/player/", { cookie: null }), env)).text(), "PLAYER_APPLICATION");
  assert.equal(await (await worker.fetch(request("/player/library", { cookie: null }), env)).text(), "PLAYER_APPLICATION");
  const missingPlayerAsset = await worker.fetch(request("/player/assets/missing.js", { cookie: null }), env);
  assert.equal(missingPlayerAsset.status, 404);
  assert.deepEqual(calls, ["/", "/player/index.html", "/player/index.html", "/player/assets/missing.js"]);
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
