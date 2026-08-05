import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test from "node:test";

import { defaultBookBuilderWorkspace } from "../lib/book-builder/source-binding.js";
import { createReviewStudioApi, validateLocalRequest } from "../scripts/book-builder/review-studio-api.mjs";
import { BOOK_BUILDER_API_ROOT, BOOK_BUILDER_SESSION_HEADER } from "../scripts/book-builder/review-studio-security.mjs";
import { SYNTHETIC_TEACHER_SECRET, createBookBuilderStudioFixture } from "./helpers/book-builder-studio-fixture.mjs";

async function createApiHarness(t, options = {}) {
  const fixture = await createBookBuilderStudioFixture();
  await options.setup?.(fixture);
  const reads = [];
  const apiOptions = { ...options };
  delete apiOptions.setup;
  const api = createReviewStudioApi({ workspace: fixture.workspace, sessionToken: "synthetic-session-token", onArtifactRead: (entry) => reads.push(entry), ...apiOptions });
  const server = http.createServer(async (request, response) => {
    if (!await api.dispatch(request, response)) { response.statusCode = 404; response.end("not found"); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await fixture.cleanup(); });
  const request = (route, init = {}) => fetch(`${origin}${BOOK_BUILDER_API_ROOT}${route}`, {
    ...init,
    headers: { Origin: origin, [BOOK_BUILDER_SESSION_HEADER]: api.sessionToken, ...(init.headers || {}) },
  });
  return { api, fixture, reads, origin, request };
}

async function json(response) {
  const payload = await response.json();
  return { response, payload, serialized: JSON.stringify(payload) };
}

test("default Book Builder workspace remains the local application-data location", () => {
  assert.equal(defaultBookBuilderWorkspace({ LOCALAPPDATA: "C:\\LocalData" }, "win32"), path.join("C:\\LocalData", "HamiltonHouseLMS", "BookBuilder"));
});

test("bootstrap and project listing expose only a safe read-only workspace projection", async (t) => {
  const { origin, request } = await createApiHarness(t);
  const bootstrap = await json(await fetch(`${origin}${BOOK_BUILDER_API_ROOT}/bootstrap`, { headers: { Origin: origin } }));
  assert.equal(bootstrap.response.status, 200);
  assert.equal(bootstrap.payload.readOnly, true);
  assert.equal(bootstrap.payload.milestone, "4B2A");
  assert.equal(bootstrap.payload.writeEnabled, false);
  assert.equal(Object.hasOwn(bootstrap.payload, "writeCapability"), false);
  assert.equal(bootstrap.payload.sessionToken, "synthetic-session-token");
  assert.doesNotMatch(bootstrap.serialized, /[A-Z]:\\|\/Users\/|\/home\//i);
  const projects = await json(await request("/projects"));
  assert.equal(projects.response.status, 200);
  assert.deepEqual(projects.payload.projects.map((item) => item.projectId), ["fictional-00-older-ultimate", "fictional-journey-control", "fictional-ultimate-review"]);
  assert.equal(projects.payload.diagnostics[0].projectId, "fictional-corrupt-project");
  assert.equal(projects.payload.projects.find((item) => item.projectId === "fictional-ultimate-review").reviewSummary.total, 5007);
  assert.doesNotMatch(projects.serialized, new RegExp(SYNTHETIC_TEACHER_SECRET));
  assert.doesNotMatch(projects.serialized, /canonicalApplicationRealPath|selectedOuterPath/i);
});

test("an empty explicit workspace returns a useful empty project list", async (t) => {
  const { request } = await createApiHarness(t, { setup: async (fixture) => {
    await fs.rm(path.join(fixture.workspace, "projects"), { recursive: true, force: true });
    await fs.mkdir(path.join(fixture.workspace, "projects"));
  } });
  const projects = await (await request("/projects")).json();
  assert.deepEqual(projects, { projects: [], diagnostics: [] });
});

test("all project view families return bounded sanitized models", async (t) => {
  const { request } = await createApiHarness(t);
  const project = "/projects/fictional-ultimate-review";
  const overview = await json(await request(`${project}/overview`));
  assert.equal(overview.response.status, 200);
  assert.equal(overview.payload.scan.factCount, 25);
  assert.equal(overview.payload.limitations.readOnly, true);
  const components = await json(await request(`${project}/components?pageSize=1&hasPages=true`));
  assert.equal(components.payload.items.length, 1);
  assert.equal(components.payload.pagination.pageSize, 1);
  const pages = await json(await request(`${project}/pages?pageSize=1`));
  assert.equal(pages.payload.items.length, 1);
  assert.equal(pages.payload.selected.hotspots.length, 48);
  assert.equal(pages.payload.selected.hotspots.filter((item) => item.geometry).length, 24);
  assert.equal(pages.payload.selected.hotspots[0].geometry.width, 0.1);
  assert.match(pages.payload.selected.variants[0].previewId, /^preview_/);
  const menu = await json(await request(`${project}/menu`));
  assert.equal(menu.payload.buttons.length, 3);
  assert.equal(menu.payload.gaf.status, "static-evidence-only");
  assert.equal(menu.payload.startupIntro.distinctFromMenuTitle, true);
  assert.ok(menu.payload.previews.length >= 1);
  const activities = await json(await request(`${project}/activities?pageSize=25&page=2`));
  assert.equal(activities.payload.items.length, 25);
  assert.equal(activities.payload.pagination.total, 152);
  assert.equal(activities.payload.selected.questions[0].prompt.startsWith("Fictional question"), true);
  assert.deepEqual(activities.payload.selected.draggableLabels, ["Fictional draggable"]);
  assert.equal(activities.payload.selected.content.title.valueOrigin, "missing");
  assert.equal(activities.payload.selected.content.instructions.valueOrigin, "detected");
  assert.equal(activities.payload.selected.content.questions[0].options[0].textField.valueOrigin, "detected");
  assert.doesNotMatch(activities.serialized, /"(?:correct|accepted|scoring|publisherId)[^"]*"\s*:/i);
  const reviews = await json(await request(`${project}/reviews?groupBy=reason&pageSize=10`));
  assert.equal(reviews.payload.summary.total, 5007);
  assert.ok(reviews.payload.groups.length <= 100);
  assert.ok(reviews.payload.selectedGroup.items.length <= 10);
  const clusters = await json(await request(`${project}/reviews?groupBy=cluster&pageSize=10`));
  assert.equal(clusters.payload.items[0].candidateCount, 120);
  const diff = await json(await request(`${project}/diff?changeType=added&pageSize=1`));
  assert.equal(diff.payload.summary.added, 2);
  assert.equal(diff.payload.items.length, 1);
  for (const result of [overview, components, pages, menu, activities, reviews, clusters, diff]) {
    assert.doesNotMatch(result.serialized, new RegExp(SYNTHETIC_TEACHER_SECRET));
    assert.doesNotMatch(result.serialized, /[A-Z]:\\|\/Users\/|\/home\//i);
  }
});

test("hierarchy APIs expose component-scoped Units without a global numeric union", async (t) => {
  const { request } = await createApiHarness(t);
  const base = "/projects/fictional-ultimate-review";
  const unscoped = await json(await request(`${base}/pages`));
  assert.equal(unscoped.payload.pagination.total, 4);
  assert.equal(unscoped.payload.filters.unitFilterEnabled, false);
  assert.deepEqual(unscoped.payload.filters.unitOptions, []);
  const options = unscoped.payload.filters.componentOptions;
  const studentsBook = options.find((item) => item.effectiveRole === "students_book");
  const workbook = options.find((item) => item.effectiveRole === "workbook");
  const grammarBook = options.find((item) => item.effectiveRole === "grammar_book");
  const tests = options.find((item) => item.effectiveRole === "tests");
  assert.deepEqual(options.filter((item) => ["students_book", "workbook", "grammar_book"].includes(item.effectiveRole)).map((item) => item.label).sort(), ["Grammar Book", "Students Book", "Workbook"]);

  const scoped = async (family, component) => json(await request(`${base}/${family}?component=${encodeURIComponent(component.value)}`));
  const studentPages = await scoped("pages", studentsBook);
  const workbookPages = await scoped("pages", workbook);
  const grammarPages = await scoped("pages", grammarBook);
  const testPages = await scoped("pages", tests);
  assert.deepEqual(studentPages.payload.filters.unitOptions.map((item) => item.label), ["Unit 1", "Unit 2", "Unit 3", "Unit 4"]);
  assert.deepEqual(workbookPages.payload.filters.unitOptions.map((item) => item.label), ["Unit 1", "Unit 2"]);
  assert.deepEqual(grammarPages.payload.filters.unitOptions.map((item) => item.label), ["Unit 1", "Unit 2", "Unit 3"]);
  assert.deepEqual(testPages.payload.filters.unitOptions.map((item) => item.label), ["Group 1", "Group 2"]);
  assert.equal(testPages.payload.pagination.total, 0);
  assert.notEqual(studentPages.payload.filters.unitOptions[0].value, workbookPages.payload.filters.unitOptions[0].value);
  assert.notEqual(workbookPages.payload.filters.unitOptions[0].value, grammarPages.payload.filters.unitOptions[0].value);
  assert.equal(studentPages.payload.items.every((item) => item.hierarchy.effectiveRole === "students_book"), true);
  assert.equal(workbookPages.payload.items.every((item) => item.hierarchy.effectiveRole === "workbook"), true);
  assert.equal(grammarPages.payload.items.every((item) => item.hierarchy.effectiveRole === "grammar_book"), true);

  const workbookActivities = await scoped("activities", workbook);
  const grammarActivities = await scoped("activities", grammarBook);
  assert.equal(workbookActivities.payload.pagination.total, 32);
  assert.equal(grammarActivities.payload.pagination.total, 20);
  assert.equal(workbookActivities.payload.items.every((item) => item.componentKey === workbook.value), true);
  assert.equal(grammarActivities.payload.items.every((item) => item.componentKey === grammarBook.value), true);

  const studentUnit = studentPages.payload.filters.unitOptions[0];
  const workbookUnit = workbookPages.payload.filters.unitOptions[0];
  const studentComponentReviews = await json(await request(`${base}/reviews?groupBy=unit&component=${encodeURIComponent(studentsBook.value)}`));
  const workbookComponentReviews = await json(await request(`${base}/reviews?groupBy=unit&component=${encodeURIComponent(workbook.value)}`));
  const studentReviewGroup = studentComponentReviews.payload.groups[0];
  const workbookReviewGroup = workbookComponentReviews.payload.groups[0];
  assert.ok(studentReviewGroup);
  assert.ok(workbookReviewGroup);
  assert.notEqual(studentReviewGroup.id, workbookReviewGroup.id);
  assert.match(studentReviewGroup.label, /^Students Book .* Unit \d+$/);
  assert.match(workbookReviewGroup.label, /^Workbook .* Unit \d+$/);
  const studentReviews = await json(await request(`${base}/reviews?groupBy=unit&component=${encodeURIComponent(studentsBook.value)}&unit=${encodeURIComponent(studentReviewGroup.id)}`));
  const workbookReviews = await json(await request(`${base}/reviews?groupBy=unit&component=${encodeURIComponent(workbook.value)}&unit=${encodeURIComponent(workbookReviewGroup.id)}`));
  assert.equal(studentReviews.payload.groups.every((group) => group.id === studentReviewGroup.id), true);
  assert.equal(workbookReviews.payload.groups.every((group) => group.id === workbookReviewGroup.id), true);

  assert.equal((await request(`${base}/pages?unit=1`)).status, 400);
  assert.equal((await request(`${base}/pages?component=not-a-component`)).status, 400);
  assert.equal((await request(`${base}/pages?component=${encodeURIComponent(workbook.value)}&unit=${encodeURIComponent(studentUnit.value)}`)).status, 400);
  for (const response of [unscoped, studentPages, workbookPages, grammarPages, testPages, workbookActivities, grammarActivities, studentReviews, workbookReviews]) {
    assert.doesNotMatch(response.serialized, new RegExp(SYNTHETIC_TEACHER_SECRET));
    assert.doesNotMatch(response.serialized, /[A-Z]:\\|\/Users\/|\/home\//i);
  }
});

test("an older Ultimate project derives the same hierarchy without a persisted hierarchy artifact", async (t) => {
  const { request } = await createApiHarness(t);
  const base = "/projects/fictional-00-older-ultimate";
  const overview = await json(await request(`${base}/overview`));
  const pages = await json(await request(`${base}/pages`));
  assert.equal(overview.payload.hierarchy.available, true);
  assert.equal(overview.payload.hierarchy.summary.componentCount, 4);
  assert.deepEqual(pages.payload.filters.componentOptions.map((item) => item.effectiveRole).sort(), ["grammar_book", "students_book", "tests", "workbook"]);
  assert.deepEqual(pages.payload.filters.unitOptions, []);
  assert.doesNotMatch(overview.serialized, new RegExp(SYNTHETIC_TEACHER_SECRET));
});

test("Journey-like projects use safe unavailable states for unsupported profile artifacts", async (t) => {
  const { request } = await createApiHarness(t);
  const project = "/projects/fictional-journey-control";
  assert.equal((await json(await request(`${project}/overview`))).response.status, 200);
  assert.equal((await json(await request(`${project}/components`))).payload.available, false);
  assert.equal((await json(await request(`${project}/pages`))).payload.available, false);
  assert.equal((await json(await request(`${project}/menu`))).payload.available, false);
  assert.equal((await json(await request(`${project}/activities`))).payload.available, false);
  assert.equal((await json(await request(`${project}/reviews`))).payload.available, false);
});

test("older Ultimate projects retain supported views and expose explicit activity capability gaps", async (t) => {
  const { request } = await createApiHarness(t);
  const project = "/projects/fictional-00-older-ultimate";
  assert.equal((await json(await request(`${project}/overview`))).response.status, 200);
  assert.equal((await json(await request(`${project}/components`))).payload.available, true);
  assert.equal((await json(await request(`${project}/pages`))).payload.available, true);
  assert.equal((await json(await request(`${project}/menu`))).payload.available, true);
  assert.equal((await json(await request(`${project}/activities`))).payload.available, false);
  const clusters = await json(await request(`${project}/reviews?groupBy=cluster`));
  assert.equal(clusters.payload.clustersAvailable, false);
  assert.equal(clusters.payload.pagination.total, 0);
  assert.doesNotMatch(clusters.serialized, new RegExp(SYNTHETIC_TEACHER_SECRET));
});

test("security boundary rejects bad sessions, origins, hosts, methods, traversal and arbitrary artifact routes", async (t) => {
  const { origin, request } = await createApiHarness(t);
  assert.equal((await fetch(`${origin}${BOOK_BUILDER_API_ROOT}/projects`, { headers: { Origin: origin } })).status, 401);
  assert.equal((await request("/projects", { headers: { [BOOK_BUILDER_SESSION_HEADER]: "wrong" } })).status, 401);
  assert.equal((await request("/projects", { headers: { Origin: "http://evil.example" } })).status, 403);
  assert.equal((await request("/projects", { method: "POST" })).status, 405);
  assert.equal((await request("/projects/..%2F..%2Finternal/overview")).status, 400);
  assert.equal((await request("/projects/fictional-ultimate-review/internal")).status, 404);
  assert.equal((await request("/projects/fictional-ultimate-review/file?filename=book-project.json")).status, 404);
  const invalidHost = await new Promise((resolve, reject) => {
    const address = new URL(origin);
    const call = http.request({ hostname: address.hostname, port: address.port, path: `${BOOK_BUILDER_API_ROOT}/bootstrap`, headers: { Host: "evil.example", Origin: "http://evil.example" } }, resolve);
    call.on("error", reject); call.end();
  });
  assert.equal(invalidHost.statusCode, 403);
  invalidHost.resume();
  assert.throws(() => validateLocalRequest({ socket: { remoteAddress: "10.0.0.7" }, headers: { host: "127.0.0.1:4177" } }), /local_request_required/);
});

test("API responses are no-store, nosniff, stack-free and never enable wildcard CORS", async (t) => {
  const { request } = await createApiHarness(t);
  const response = await request("/projects/not-present/overview");
  const body = await response.text();
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.doesNotMatch(body, /\bat\s+\w+|review-studio-workspace\.mjs|[A-Z]:\\/i);
});

test("pagination and filter inputs are bounded and validated", async (t) => {
  const { request } = await createApiHarness(t);
  const base = "/projects/fictional-ultimate-review/activities";
  assert.equal((await request(`${base}?pageSize=101`)).status, 400);
  assert.equal((await request(`${base}?pageSize=-1`)).status, 400);
  assert.equal((await request(`${base}?component=..%2Finternal`)).status, 400);
  const response = await json(await request(`${base}?pageSize=100&page=2`));
  assert.equal(response.payload.items.length, 52);
  assert.equal(response.payload.pagination.pageSize, 100);
});

test("opaque page and materialized preview IDs serve only verified raster bytes", async (t) => {
  const { fixture, request } = await createApiHarness(t);
  const base = "/projects/fictional-ultimate-review";
  const pages = await (await request(`${base}/pages`)).json();
  const pagePreviewId = pages.selected.variants[0].previewId;
  const pagePreview = await request(`${base}/preview/${pagePreviewId}`);
  assert.equal(pagePreview.status, 200);
  assert.equal(pagePreview.headers.get("content-type"), "image/png");
  assert.ok((await pagePreview.arrayBuffer()).byteLength > 0);
  const menu = await (await request(`${base}/menu`)).json();
  const materializedPreview = await request(`${base}/preview/${menu.previews[0].previewId}`);
  assert.equal(materializedPreview.status, 200);
  assert.equal(materializedPreview.headers.get("content-type"), "image/png");
  assert.equal((await request(`${base}/preview/preview_unknown`)).status, 404);
  await fs.writeFile(fixture.ultimate.sourcePreview, Buffer.from("changed"));
  assert.equal((await request(`${base}/preview/${pagePreviewId}`)).status, 409);
});

test("preview allowlist ignores forbidden types and rejects source or materialized symlink escapes", async (t) => {
  const { fixture, request } = await createApiHarness(t);
  const base = "/projects/fictional-ultimate-review";
  const profileRoot = path.join(fixture.ultimate.projectRoot, "profiles", "ultimate-air-v2");
  const menuRoot = path.join(profileRoot, "review-assets", "menu");
  await fs.writeFile(path.join(menuRoot, "forbidden.svg"), "<svg/>", "utf8");
  const menuBefore = await (await request(`${base}/menu`)).json();
  assert.equal(menuBefore.previews.some((item) => item.label === "forbidden.svg"), false);
  const outsideRaster = path.join(fixture.root, "outside-preview.png");
  await fs.writeFile(outsideRaster, Buffer.from("not-a-real-raster"));
  const materializedLink = path.join(menuRoot, "escape.png");
  const sourceLinkTarget = path.join(fixture.root, "outside-source-preview.png");
  await fs.writeFile(sourceLinkTarget, Buffer.from("not-a-real-raster"));
  try {
    await fs.symlink(outsideRaster, materializedLink);
    const menuAfter = await (await request(`${base}/menu`)).json();
    assert.equal(menuAfter.previews.some((item) => item.label === "escape.png"), false);
    const pages = await (await request(`${base}/pages`)).json();
    const previewId = pages.selected.variants[0].previewId;
    await fs.rm(fixture.ultimate.sourcePreview);
    await fs.symlink(sourceLinkTarget, fixture.ultimate.sourcePreview);
    assert.equal((await request(`${base}/preview/${previewId}`)).status, 404);
  } catch (error) {
    if (!["EPERM", "EACCES"].includes(error.code)) throw error;
    t.diagnostic("Symlink escape checks are covered by path guards; creation is unavailable here.");
  }
});

test("ordinary requests never open local bindings or internal Teacher artifacts", async (t) => {
  const { reads, request } = await createApiHarness(t);
  const base = "/projects/fictional-ultimate-review";
  await request("/projects");
  await request(`${base}/overview`);
  await request(`${base}/activities?pageSize=25`);
  assert.equal(reads.some((entry) => entry.relativePath === "local-source-binding.json"), false);
  assert.equal(reads.some((entry) => entry.relativePath.includes("internal") || /solution|answer-evidence/i.test(entry.relativePath)), false);
});

test("cache entries invalidate after project manifest mtime changes", async (t) => {
  const { fixture, request } = await createApiHarness(t);
  const route = "/projects/fictional-ultimate-review/overview";
  assert.equal((await (await request(route)).json()).project.revision, 3);
  const manifestPath = path.join(fixture.ultimate.projectRoot, "book-project.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  manifest.revision = 4;
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const future = new Date(Date.now() + 2000);
  await fs.utimes(manifestPath, future, future);
  assert.equal((await (await request(route)).json()).project.revision, 4);
});

test("symlink project directories are not listed or opened", async (t) => {
  const { fixture, request } = await createApiHarness(t);
  const link = path.join(fixture.workspace, "projects", "fictional-symlink-project");
  try { await fs.symlink(fixture.ultimate.projectRoot, link, "junction"); } catch (error) {
    if (["EPERM", "EACCES"].includes(error.code)) { t.skip("Symlink creation is unavailable in this environment."); return; }
    throw error;
  }
  const projects = await (await request("/projects")).json();
  assert.equal(projects.projects.some((item) => item.projectId === "fictional-symlink-project"), false);
  assert.equal((await request("/projects/fictional-symlink-project/overview")).status, 404);
});
