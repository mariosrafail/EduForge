import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import sharp from "sharp";

import { createReviewStudioApi } from "../scripts/book-builder/review-studio-api.mjs";
import {
  BOOK_BUILDER_API_ROOT,
  BOOK_BUILDER_SESSION_HEADER,
  BOOK_BUILDER_WRITE_HEADER,
} from "../scripts/book-builder/review-studio-security.mjs";
import { createBookBuilderStudioFixture } from "./helpers/book-builder-studio-fixture.mjs";

async function harness(t, { writeEnabled = true } = {}) {
  const fixture = await createBookBuilderStudioFixture();
  const api = createReviewStudioApi({
    workspace: fixture.workspace,
    writeEnabled,
    sessionToken: "teacher-project-test-session",
    writeToken: writeEnabled ? "teacher-project-test-write" : null,
  });
  const server = http.createServer((request, response) => api.dispatch(request, response));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fixture.cleanup();
  });
  const request = (route, init = {}) => fetch(`${origin}${BOOK_BUILDER_API_ROOT}${route}`, {
    ...init,
    headers: {
      Origin: origin,
      [BOOK_BUILDER_SESSION_HEADER]: api.sessionToken,
      ...(writeEnabled ? { [BOOK_BUILDER_WRITE_HEADER]: api.writeToken } : {}),
      ...(init.headers || {}),
    },
  });
  return { api, origin, request };
}

function jsonBody(value) {
  return { headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) };
}

test("Teacher Project API creates, lists, loads, imports, saves and serves only controlled assets", async (t) => {
  const { request } = await harness(t);
  const createdResponse = await request("/teacher-projects", { method: "POST", ...jsonBody({ projectId: "ultimate-b3", displayName: "Ultimate B3" }) });
  assert.equal(createdResponse.status, 201);
  let project = (await createdResponse.json()).project;
  assert.equal(project.shell.units.length, 10);
  assert.equal((await (await request("/teacher-projects")).json()).projects[0].projectId, "ultimate-b3");

  const png = await sharp({ create: { width: 4, height: 3, channels: 4, background: "#123456" } }).png().toBuffer();
  const importedResponse = await request("/teacher-projects/ultimate-b3/assets/import?section=background&slot=main&variant=image", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", "X-HHPLMS-Teacher-Asset-Name": "background.png" },
    body: png,
  });
  assert.equal(importedResponse.status, 201);
  const imported = await importedResponse.json();
  project = imported.project;
  project.shell.background = imported.asset.assetId;
  const savedResponse = await request("/teacher-projects/ultimate-b3/save", {
    method: "POST",
    ...jsonBody({ displayName: project.displayName, expectedRevision: project.revision, shell: project.shell }),
  });
  assert.equal(savedResponse.status, 200);
  project = (await savedResponse.json()).project;
  const content = await request(`/teacher-projects/ultimate-b3/assets/${imported.asset.assetId}/content`);
  assert.equal(content.status, 200);
  assert.equal(content.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await content.arrayBuffer()), png);
  const loaded = await (await request("/teacher-projects/ultimate-b3")).json();
  assert.equal(loaded.project.shell.background, imported.asset.assetId);
  assert.equal(loaded.project.revision, project.revision);
  assert.doesNotMatch(JSON.stringify(loaded), /[A-Z]:\\Users|\/home\//i);
});

test("Teacher Project API preserves local session, origin, method, traversal and write-capability boundaries", async (t) => {
  const { api, origin, request } = await harness(t);
  assert.equal((await fetch(`${origin}${BOOK_BUILDER_API_ROOT}/teacher-projects`, { headers: { Origin: origin } })).status, 401);
  assert.equal((await request("/teacher-projects", { method: "POST", headers: { "Content-Type": "application/json", [BOOK_BUILDER_WRITE_HEADER]: "wrong" }, body: "{}" })).status, 401);
  assert.equal((await request("/teacher-projects", { method: "PUT" })).status, 405);
  assert.equal((await request("/teacher-projects/..%2Fescape")).status, 400);
  assert.equal((await request("/teacher-projects/b3/command", { method: "POST", ...jsonBody({ command: "whoami" }) })).status, 404);
  assert.equal((await fetch(`${origin}${BOOK_BUILDER_API_ROOT}/teacher-projects`, { headers: { Origin: "http://evil.example", [BOOK_BUILDER_SESSION_HEADER]: api.sessionToken } })).status, 403);
});

test("Teacher Project API duplicates only by source ID into a self-contained revision-one project", async (t) => {
  const { request } = await harness(t);
  await request("/teacher-projects", { method: "POST", ...jsonBody({ projectId: "ultimate-b3", displayName: "Ultimate B3" }) });
  const png = await sharp({ create: { width: 4, height: 3, channels: 4, background: "#123456" } }).png().toBuffer();
  const importedResponse = await request("/teacher-projects/ultimate-b3/assets/import?section=background&slot=main&variant=image", { method: "POST", headers: { "Content-Type": "application/octet-stream", "X-HHPLMS-Teacher-Asset-Name": "background.png" }, body: png });
  const imported = await importedResponse.json();
  const sourceShell = structuredClone(imported.project.shell); sourceShell.background = imported.asset.assetId;
  await request("/teacher-projects/ultimate-b3/save", { method: "POST", ...jsonBody({ displayName: "Ultimate B3", expectedRevision: imported.project.revision, shell: sourceShell }) });
  const response = await request("/teacher-projects/ultimate-b3/duplicate", { method: "POST", ...jsonBody({ projectId: "ultimate-b4", displayName: "Ultimate B4" }) });
  assert.equal(response.status, 201);
  const duplicate = (await response.json()).project;
  assert.equal(duplicate.projectId, "ultimate-b4"); assert.equal(duplicate.revision, 1); assert.deepEqual(duplicate.shell, sourceShell); assert.ok(duplicate.assets[imported.asset.assetId]);
  assert.deepEqual(Buffer.from(await (await request(`/teacher-projects/ultimate-b4/assets/${imported.asset.assetId}/content`)).arrayBuffer()), png);
  assert.equal((await request("/teacher-projects/ultimate-b3/duplicate", { method: "POST", ...jsonBody({ projectId: "ultimate-b4", displayName: "Conflict" }) })).status, 409);
  assert.equal((await request("/teacher-projects/ultimate-b3/duplicate", { method: "POST", ...jsonBody({ projectId: "../escape", displayName: "Unsafe" }) })).status, 400);
});

test("read-only Review Studio can list Teacher Projects but cannot create, import, save, remove, export or run", async (t) => {
  const { request } = await harness(t, { writeEnabled: false });
  assert.equal((await request("/teacher-projects")).status, 200);
  assert.equal((await request("/teacher-projects", { method: "POST", ...jsonBody({ projectId: "b3", displayName: "B3" }) })).status, 403);
  for (const route of [
    "/teacher-projects/b3/save",
    "/teacher-projects/b3/duplicate",
    "/teacher-projects/b3/assets/import?section=background&slot=main&variant=image",
    "/teacher-projects/b3/assets/asset-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/remove",
    "/teacher-projects/b3/export",
    "/teacher-projects/b3/run",
  ]) {
    const response = await request(route, { method: "POST", ...jsonBody({}) });
    assert.ok([403, 404].includes(response.status), `${route} should not mutate in read-only mode`);
  }
});

test("Teacher asset import rejects MIME tricks, malformed bytes and oversized declarations", async (t) => {
  const { api, origin, request } = await harness(t);
  await request("/teacher-projects", { method: "POST", ...jsonBody({ projectId: "b3", displayName: "B3" }) });
  const route = "/teacher-projects/b3/assets/import?section=background&slot=main&variant=image";
  assert.equal((await request(route, { method: "POST", headers: { "Content-Type": "image/png" }, body: Buffer.from("not png") })).status, 415);
  assert.equal((await request(route, { method: "POST", headers: { "Content-Type": "application/octet-stream", "X-HHPLMS-Teacher-Asset-Name": "fake.png" }, body: Buffer.from("<svg/>") })).status, 400);
  const declaredStatus = await new Promise((resolve, reject) => {
    const address = new URL(origin);
    const call = http.request({
      hostname: address.hostname,
      port: address.port,
      method: "POST",
      path: `${BOOK_BUILDER_API_ROOT}${route}`,
      headers: {
        Host: address.host,
        Origin: origin,
        [BOOK_BUILDER_SESSION_HEADER]: api.sessionToken,
        [BOOK_BUILDER_WRITE_HEADER]: api.writeToken,
        "Content-Type": "application/octet-stream",
        "Content-Length": 20 * 1024 * 1024,
      },
    }, (response) => { response.resume(); resolve(response.statusCode); });
    call.on("error", reject);
    call.end();
  });
  assert.equal(declaredStatus, 413);
});
