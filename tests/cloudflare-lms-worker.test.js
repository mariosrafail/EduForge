import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  invokeNetlifyHandler,
  netlifyResultToResponse,
  requestToNetlifyEvent,
} from "../cloudflare/shared/netlify-handler-adapter.js";
import worker, { LMS_PUBLIC_HANDLER_NAMES, resolveLmsRoute } from "../cloudflare/lms/worker.js";

test("Cloudflare Request maps to the legacy event without losing duplicate query values", async () => {
  const event = await requestToNetlifyEvent(new Request("https://lms.test/path?action=one&action=two&empty=", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": "203.0.113.8",
      "X-Nf-Client-Connection-Ip": "198.51.100.7",
      "X-Forwarded-For": "198.51.100.6",
    },
    body: JSON.stringify({ ok: true }),
  }));
  assert.equal(event.httpMethod, "POST");
  assert.equal(event.path, "/path");
  assert.equal(event.rawQuery, "action=one&action=two&empty=");
  assert.equal(event.queryStringParameters.action, "two");
  assert.deepEqual(event.multiValueQueryStringParameters.action, ["one", "two"]);
  assert.equal(event.body, '{"ok":true}');
  assert.equal(event.isBase64Encoded, false);
  assert.equal(event.headers["x-nf-client-connection-ip"], "203.0.113.8");
});

test("missing Cloudflare IP cannot fall through to spoofed legacy forwarding headers", async () => {
  const event = await requestToNetlifyEvent(new Request("https://lms.test/", {
    headers: { "X-Nf-Client-Connection-Ip": "198.51.100.7", "X-Forwarded-For": "198.51.100.6" },
  }));
  assert.equal(event.headers["x-nf-client-connection-ip"], "unknown");
});

test("request buffering is bounded and returns 413", async () => {
  let called = false;
  const response = await invokeNetlifyHandler(() => { called = true; }, new Request("https://lms.test/", {
    method: "POST",
    body: "12345",
  }), { maxBodyBytes: 4 });
  assert.equal(response.status, 413);
  assert.equal(called, false);
});

test("legacy results preserve response headers, redirects, binary data, and multiple cookies", async () => {
  const response = netlifyResultToResponse({
    statusCode: 302,
    headers: { Location: "/next", "Content-Type": "application/octet-stream", Vary: "Origin", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    multiValueHeaders: { "Set-Cookie": ["a=1; Path=/; HttpOnly", "b=2; Path=/; Secure"] },
    body: btoa("binary"),
    isBase64Encoded: true,
  });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/next");
  assert.equal(response.headers.get("vary"), "Origin");
  assert.deepEqual(response.headers.getSetCookie(), ["a=1; Path=/; HttpOnly", "b=2; Path=/; Secure"]);
  assert.equal(await response.text(), "binary");
  assert.equal(netlifyResultToResponse({ statusCode: 204, body: "ignored" }).body, null);
});

test("the LMS route map is explicit and excludes private, scheduled, and localhost-only handlers", () => {
  assert.deepEqual(LMS_PUBLIC_HANDLER_NAMES, [
    "account-email-dispatch", "account-invite", "account-set-password", "account-token-check", "activity",
    "auth-change-password", "auth-forgot-password", "auth-me", "auth-reset-password", "auth-revoke-sessions",
    "auth-signin", "auth-signout", "auth-signup", "auth-student-signup", "book-content", "book-licensing",
    "course", "lesson", "lesson-submit", "operational-health", "platform-admin", "platform-admin-auth",
    "school-adoption-report", "school-profile", "user", "user-import", "users",
  ]);
  for (const name of ["auth-me", "book-content", "operational-health", "account-email-dispatch"]) {
    assert.equal(resolveLmsRoute(`/.netlify/functions/${name}`)?.name, name);
  }
  for (const name of ["_auth-utils", "scheduled-lifecycle-cleanup", "scheduled-account-email-dispatch", "legacy-flash-proof", "ultimate-b2-media", "ultimate-b2-source-asset"]) {
    assert.equal(resolveLmsRoute(`/.netlify/functions/${name}`), null);
  }
});

test("unknown functions return JSON 404 and static requests remain on the asset boundary", async () => {
  let assetRequest;
  const env = { ASSETS: { fetch(request) { assetRequest = request; return new Response("asset"); } } };
  const missing = await worker.fetch(new Request("https://lms.test/.netlify/functions/_auth-utils"), env);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: "Function not found" });
  const asset = await worker.fetch(new Request("https://lms.test/assets/app-abc.js"), env);
  assert.equal(await asset.text(), "asset");
  assert.equal(new URL(assetRequest.url).pathname, "/assets/app-abc.js");
});

test("Platform Admin aliases and canonical SPA fallback preserve the Netlify contracts", async () => {
  assert.equal(resolveLmsRoute("/platform-admin/api/auth")?.name, "platform-admin-auth");
  assert.equal(resolveLmsRoute("/platform-admin/api/control")?.name, "platform-admin");
  const assetPaths = [];
  const env = { ASSETS: { fetch(request) {
    const pathname = new URL(request.url).pathname;
    assetPaths.push(pathname);
    if (pathname === "/platform-admin") return new Response(null, { status: 307, headers: { Location: "/platform-admin/" } });
    if (pathname === "/platform-admin/index.html") return new Response(null, { status: 307, headers: { Location: "/platform-admin/" } });
    if (pathname === "/platform-admin/") return new Response("PLATFORM_ADMIN_APPLICATION", { status: 200, headers: { "Content-Type": "text/html" } });
    if (pathname === "/platform-admin/app.js") return new Response("PLATFORM_ADMIN_ASSET", { status: 200, headers: { "Content-Type": "text/javascript" } });
    if (pathname === "/platform-admin/missing.js") return new Response("LMS_APPLICATION", { status: 200, headers: { "Content-Type": "text/html" } });
    return new Response("LMS_APPLICATION", { status: 200, headers: { "Content-Type": "text/html" } });
  } } };

  const redirect = await worker.fetch(new Request("https://lms.test/platform-admin"), env);
  assert.equal(redirect.status, 307);
  assert.equal(redirect.headers.get("location"), "/platform-admin/");
  const root = await worker.fetch(new Request("https://lms.test/platform-admin/"), env);
  assert.equal(root.status, 200);
  assert.equal(root.headers.get("location"), null);
  assert.equal(await root.text(), "PLATFORM_ADMIN_APPLICATION");
  const nested = await worker.fetch(new Request("https://lms.test/platform-admin/schools/one"), env);
  assert.equal(nested.status, 200);
  assert.equal(await nested.text(), "PLATFORM_ADMIN_APPLICATION");
  const asset = await worker.fetch(new Request("https://lms.test/platform-admin/app.js"), env);
  assert.equal(asset.status, 200);
  assert.equal(await asset.text(), "PLATFORM_ADMIN_ASSET");
  const missingAsset = await worker.fetch(new Request("https://lms.test/platform-admin/missing.js"), env);
  assert.equal(missingAsset.status, 404);
  assert.equal(assetPaths.includes("/platform-admin/index.html"), false);
  assert.deepEqual(assetPaths, [
    "/platform-admin", "/platform-admin/", "/platform-admin/", "/platform-admin/app.js", "/platform-admin/missing.js",
  ]);
});

test("Wrangler config is asset-first and contains no tracked runtime secrets", async () => {
  const source = await readFile(new URL("../cloudflare/lms/wrangler.jsonc", import.meta.url), "utf8");
  const config = JSON.parse(source);
  assert.equal(config.name, "lms");
  assert.equal(config.workers_dev, true);
  assert.equal(config.keep_vars, true);
  assert.deepEqual(config.assets.run_worker_first, ["/.netlify/functions/*", "/platform-admin/*"]);
  assert.equal(config.assets.not_found_handling, "single-page-application");
  assert.equal(config.routes, undefined);
  assert.equal(config.triggers, undefined);
  assert.equal(config.vars, undefined);
  assert.doesNotMatch(source, /DATABASE_URL|ACCOUNT_EMAIL_DISPATCH_SECRET|OPERATIONAL_MONITORING_SECRET/);
});
