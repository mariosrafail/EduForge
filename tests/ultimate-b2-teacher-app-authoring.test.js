import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { createServer } from "vite";

import { ultimateB2TeacherAppBuilderPlugin } from "../scripts/ultimate-b2/teacher-app-builder-vite-plugin.mjs";
import { teacherPackAssetSources } from "../scripts/android-teacher/pack-asset-sources.mjs";
import hotspotManifest from "../src/data/ultimate-b2/authoring/studentsBookHotspots.json" with { type: "json" };
import {
  buildUltimateB2TeacherAppAuthoring,
  getUltimateB2TeacherAppPage,
  normalizeUltimateB2TeacherAppOverrides,
  ultimateB2TeacherAppAuthoring,
  ultimateB2TeacherEditionDefinitions,
  ultimateB2TeacherExtrasDefinitions,
} from "../src/data/ultimate-b2/teacherAppAuthoring.js";
import { ultimateB2StudentsBookAuthoringActivities, ultimateB2StudentsBookAuthoringPages } from "../src/data/ultimate-b2/studentsBookAuthoringCatalog.js";

const root = path.resolve(import.meta.dirname, "..");
const emptyOverrides = { schemaVersion: "1.0", packageId: "ultimate-b2-students-book", assets: {} };
const knownPageId = "ub2-sb-unit-1-part-1";
const knownActivityId = "ultimate-b2-sb-u1-p1-o1";

test("canonical Teacher App model deterministically binds all current B2 pages and shell artwork", async () => {
  const rebuilt = buildUltimateB2TeacherAppAuthoring(emptyOverrides);
  assert.deepEqual(rebuilt, buildUltimateB2TeacherAppAuthoring(emptyOverrides));
  assert.equal(rebuilt.pages.length, 22);
  assert.equal(rebuilt.pages.filter((page) => page.unitNumber === 1).length, 10);
  assert.equal(rebuilt.pages.filter((page) => page.unitNumber === 2).length, 12);
  assert.equal(new Set(rebuilt.pages.map((page) => page.id)).size, 22);
  assert.equal(rebuilt.shell.units.length, 10);
  assert.deepEqual(rebuilt.shell.editions.map(({ id, label }) => ({ id, label })), ultimateB2TeacherEditionDefinitions.map(({ id, label }) => ({ id, label })));
  assert.deepEqual(rebuilt.shell.editions.map((edition) => edition.label), ["Students Book", "Workbook", "Grammar Book", "Extras"]);
  assert.equal(rebuilt.shell.extras.length, 14);
  assert.deepEqual(rebuilt.shell.extras.map(({ id, column, order }) => ({ id, column, order })), ultimateB2TeacherExtrasDefinitions.map(({ id, column, order }) => ({ id, column, order })));
  assert.equal(rebuilt.shell.toolbar.length, 18);
  assert.ok(rebuilt.shell.background.repositoryPath.endsWith("classroom-glacier.png"));
  assert.ok(rebuilt.shell.titleAnimation.gaf.repositoryPath.endsWith("logo.gaf"));
  assert.ok(rebuilt.shell.navigation.previousInternalDisabled.repositoryPath.endsWith("navibar-previous-internal-disabled.png"));
  for (const control of [...rebuilt.shell.editions, ...rebuilt.shell.extras]) {
    assert.ok(await readFile(path.join(root, control.normal.repositoryPath)));
    assert.ok(await readFile(path.join(root, control.active.repositoryPath)));
  }
  for (const page of rebuilt.pages) {
    assert.ok(await readFile(path.join(root, page.image.repositoryPath)));
    assert.equal(path.isAbsolute(page.image.repositoryPath), false);
    assert.equal(page.image.id, `page.${page.id}`);
  }
});

test("Workbook and Grammar Book independently alias the Students Book publisher artwork by default", () => {
  const defaults = buildUltimateB2TeacherAppAuthoring(emptyOverrides);
  const editions = Object.fromEntries(defaults.shell.editions.map((edition) => [edition.id, edition]));
  assert.deepEqual(Object.keys(editions), ["students-book", "workbook", "grammar-book", "extras"]);
  for (const id of ["students-book", "workbook", "grammar-book"]) {
    assert.match(editions[id].normal.repositoryPath, /students-book-normal\.png$/);
    assert.match(editions[id].active.repositoryPath, /students-book-hover-pressed\.png$/);
  }
  assert.match(editions.extras.normal.repositoryPath, /extras-normal\.png$/);
  assert.match(editions.extras.active.repositoryPath, /extras-hover-pressed\.png$/);
  assert.equal(new Set(Object.values(editions).map((edition) => edition.controlId)).size, 4);
  const workbookOverride = { repositoryPath: `src/assets/books/ultimate-b2/authoring/teacher-app/${"b".repeat(64)}.webp`, mediaType: "image/webp", sha256: "b".repeat(64), sizeBytes: 42, width: 301, height: 99, originalFilename: "future-workbook.webp" };
  const overridden = buildUltimateB2TeacherAppAuthoring({ ...emptyOverrides, assets: { "edition.workbook.normal": workbookOverride } });
  assert.equal(overridden.shell.editions.find((edition) => edition.id === "workbook").normal.repositoryPath, workbookOverride.repositoryPath);
  assert.match(overridden.shell.editions.find((edition) => edition.id === "grammar-book").normal.repositoryPath, /students-book-normal\.png$/);
});

test("page, hotspot and activity identity form one canonical relationship", () => {
  const page = getUltimateB2TeacherAppPage(knownPageId);
  const hotspotPage = ultimateB2StudentsBookAuthoringPages.find((candidate) => candidate.id === knownPageId);
  const activity = ultimateB2StudentsBookAuthoringActivities.find((candidate) => candidate.activityKey === knownActivityId);
  const hotspot = hotspotManifest.pages[knownPageId].find((candidate) => candidate.activityKey === knownActivityId);
  assert.equal(hotspotPage.assetBindingId, page.assetBindingId);
  assert.equal(activity.unitNumber, page.unitNumber);
  assert.equal(activity.pageSpread, page.spreadNumber);
  assert.equal(hotspot.activityKey, knownActivityId);
  const changed = buildUltimateB2TeacherAppAuthoring({ ...emptyOverrides, assets: { [page.assetBindingId]: {
    repositoryPath: `src/assets/books/ultimate-b2/authoring/teacher-app/${"a".repeat(64)}.webp`, mediaType: "image/webp", sha256: "a".repeat(64), sizeBytes: 42, width: 16, height: 16, originalFilename: "fixture.webp",
  } } });
  assert.equal(getUltimateB2TeacherAppPage(knownPageId, changed).id, knownPageId);
  assert.equal(hotspotManifest.pages[knownPageId].find((candidate) => candidate.id === hotspot.id).id, hotspot.id);
  assert.equal(activity.activityKey, knownActivityId);
});

test("strict override validation rejects unknown bindings, fields, paths and media roles", () => {
  assert.deepEqual(normalizeUltimateB2TeacherAppOverrides(emptyOverrides), emptyOverrides);
  assert.throws(() => normalizeUltimateB2TeacherAppOverrides({ ...emptyOverrides, extra: true }), /unknown fields/);
  assert.throws(() => normalizeUltimateB2TeacherAppOverrides({ ...emptyOverrides, assets: { unknown: {} } }), /Unknown/);
  const binding = { repositoryPath: "C:/escape.webp", mediaType: "image/webp", sha256: "a".repeat(64), sizeBytes: 1, width: 1, height: 1, originalFilename: "x.webp" };
  assert.throws(() => normalizeUltimateB2TeacherAppOverrides({ ...emptyOverrides, assets: { [`page.${knownPageId}`]: binding } }), /Unsafe repository path/);
  assert.throws(() => normalizeUltimateB2TeacherAppOverrides({ ...emptyOverrides, assets: { "sound.button": { ...binding, repositoryPath: `src/assets/books/ultimate-b2/authoring/teacher-app/${"a".repeat(64)}.webp` } } }), /Invalid media type/);
});

test("local import and save endpoint persists a validated replacement without changing IDs or hotspots", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "hhplms-b2-teacher-app-"));
  const configPath = path.join(directory, "src/data/ultimate-b2/authoring/teacherAppAssetOverrides.json");
  const assetRoot = path.join(directory, "src/assets/books/ultimate-b2/authoring/teacher-app");
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(emptyOverrides, null, 2)}\n`);
  const server = await createServer({ configFile: false, appType: "custom", logLevel: "silent", plugins: [ultimateB2TeacherAppBuilderPlugin({ repositoryRoot: directory, configPath, assetRoot })], server: { host: "127.0.0.1", port: 0 } });
  await server.listen();
  try {
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    const id = `page.${knownPageId}`;
    const fixture = await sharp({ create: { width: 24, height: 16, channels: 4, background: "#39a0d8" } }).png().toBuffer();
    const imported = await fetch(`${base}/__hhplms/ultimate-b2-teacher-app-import?id=${encodeURIComponent(id)}`, { method: "POST", headers: { "Content-Type": "image/png", "X-Original-Filename": encodeURIComponent("fixture.png") }, body: fixture }).then((response) => response.json());
    assert.equal(imported.id, id);
    assert.equal(imported.override.mediaType, "image/png");
    assert.equal(path.isAbsolute(imported.override.repositoryPath), false);
    assert.deepEqual(JSON.parse(await readFile(configPath, "utf8")), emptyOverrides, "import alone must not change the saved binding");
    const shellFixture = await sharp({ create: { width: 32, height: 18, channels: 4, background: "#17314b" } }).webp().toBuffer();
    const shellImported = await fetch(`${base}/__hhplms/ultimate-b2-teacher-app-import?id=background.main`, { method: "POST", headers: { "Content-Type": "image/webp", "X-Original-Filename": encodeURIComponent("background.webp") }, body: shellFixture }).then((response) => response.json());
    const extrasId = "extras.progress-checks.active";
    const extrasFixture = await sharp({ create: { width: 320, height: 81, channels: 4, background: "#79c925" } }).png().toBuffer();
    const extrasImported = await fetch(`${base}/__hhplms/ultimate-b2-teacher-app-import?id=${encodeURIComponent(extrasId)}`, { method: "POST", headers: { "Content-Type": "image/png", "X-Original-Filename": encodeURIComponent("progress-checks-active.png") }, body: extrasFixture }).then((response) => response.json());
    const savedCandidate = { ...emptyOverrides, assets: { [id]: imported.override, "background.main": shellImported.override, [extrasId]: extrasImported.override } };
    const savedResponse = await fetch(`${base}/__hhplms/ultimate-b2-teacher-app`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(savedCandidate) });
    assert.equal(savedResponse.status, 200);
    const reloaded = await fetch(`${base}/__hhplms/ultimate-b2-teacher-app`).then((response) => response.json());
    assert.equal(reloaded.model.pages.find((page) => page.id === knownPageId).image.repositoryPath, imported.override.repositoryPath);
    assert.equal(reloaded.model.pages.find((page) => page.id === knownPageId).id, knownPageId);
    assert.equal(reloaded.model.shell.background.repositoryPath, shellImported.override.repositoryPath);
    assert.equal(reloaded.model.shell.extras.find((item) => item.id === "progress-checks").active.repositoryPath, extrasImported.override.repositoryPath);
    assert.equal(reloaded.model.shell.extras.find((item) => item.id === "progress-checks").controlId, "extras:progress-checks");
    assert.equal(reloaded.model.shell.units[0].controlId, "unit:unit-1");
    assert.deepEqual(hotspotManifest.pages[knownPageId], hotspotManifest.pages[knownPageId]);
    const served = await fetch(`${base}/__hhplms/ultimate-b2-teacher-app-asset?id=${encodeURIComponent(id)}`);
    assert.equal(served.status, 200);
    assert.deepEqual(Buffer.from(await served.arrayBuffer()), fixture);
    const servedExtras = await fetch(`${base}/__hhplms/ultimate-b2-teacher-app-asset?id=${encodeURIComponent(extrasId)}`);
    assert.deepEqual(Buffer.from(await servedExtras.arrayBuffer()), extrasFixture);
    assert.equal((await fetch(`${base}/__hhplms/ultimate-b2-teacher-app-import?id=unknown`, { method: "POST", body: fixture })).status, 404);
    assert.equal((await fetch(`${base}/__hhplms/ultimate-b2-teacher-app-import?id=${encodeURIComponent(id)}`, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: fixture })).status, 400);
  } finally { await server.close(); await rm(directory, { recursive: true, force: true }); }
});

test("runtime and Teacher pack resolve the same canonical page binding", async () => {
  const page = ultimateB2TeacherAppAuthoring.pages.find((candidate) => candidate.id === knownPageId);
  const pack = teacherPackAssetSources().find((candidate) => candidate.pageId === knownPageId);
  assert.equal(pack.logicalKey, page.logicalAssetIdentity);
  assert.equal(path.normalize(pack.sourcePath), path.join(root, page.image.repositoryPath));
  const [runtimeResolver, shellResolver, hotspotBuilder, builderShell] = await Promise.all([
    readFile(path.join(root, "src/data/ultimate-b2/ultimateB2PageAssets.teacher-offline.js"), "utf8"),
    readFile(path.join(root, "src/apps/android-teacher-offline/legacyClassroomAssets.js"), "utf8"),
    readFile(path.join(root, "src/apps/ultimate-b2-builder/UltimateB2HotspotBuilder.jsx"), "utf8"),
    readFile(path.join(root, "src/apps/ultimate-b2-builder/UltimateB2BuilderApp.jsx"), "utf8"),
  ]);
  assert.match(runtimeResolver, /getUltimateB2TeacherAppPageByPart/);
  assert.match(shellResolver, /ultimateB2TeacherAppAuthoring/);
  assert.match(shellResolver, /authored\.shell\.extras/);
  assert.match(hotspotBuilder, /page\.assetBindingId/);
  assert.deepEqual([...builderShell.matchAll(/>(Hotspot Builder|Activity Builder|UI Controller)</g)].map((match) => match[1]), ["Hotspot Builder", "Activity Builder", "UI Controller"]);
  assert.doesNotMatch(builderShell, />Teacher App</);
  assert.match(builderShell, /hidden=\{tab !== "teacher-app"\}/);
});
