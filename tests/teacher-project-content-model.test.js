import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

import { TEACHER_PROJECT_LIMITS } from "../lib/teacher-project-builder/constants.js";
import { prepareTeacherProjectBuild } from "../lib/teacher-project-builder/build-staging.js";
import { createBlankTeacherContent, teacherProjectContentStatus } from "../lib/teacher-project-builder/content-schema.js";
import { createBlankTeacherProject, teacherProjectCompleteness, teacherProjectContentHash, validateTeacherProject } from "../lib/teacher-project-builder/schema.js";
import { TeacherProjectStore } from "../lib/teacher-project-builder/store.js";

const ids = Object.freeze([
  "entry-00000000-0000-4000-8000-000000000001",
  "entry-00000000-0000-4000-8000-000000000002",
  "entry-00000000-0000-4000-8000-000000000003",
]);

function metadata(assetId, suffix) {
  return {
    assetId,
    relativePath: `assets/pages/page-${suffix}.png`,
    originalFilename: `${suffix}.png`,
    mediaType: "image/png",
    sizeBytes: 8,
    sha256: suffix.padEnd(64, "0"),
    width: 2,
    height: 2,
    importedAt: "2026-08-09T10:00:00.000Z",
  };
}

function contentProject() {
  const project = createBlankTeacherProject({ projectId: "content-model", displayName: "Content Model", now: "2026-08-09T10:00:00.000Z" });
  const assetIds = ["asset-00000000000000000000000000000001", "asset-00000000000000000000000000000002"];
  project.assets[assetIds[0]] = metadata(assetIds[0], "1");
  project.assets[assetIds[1]] = metadata(assetIds[1], "2");
  project.content.studentsBook.units[0].entries = [
    { id: ids[0], sectionTitle: "", pageLabel: "5", layout: "single-page", image: assetIds[0] },
    { id: ids[1], sectionTitle: "Reading", pageLabel: "6–7", layout: "double-wide", image: assetIds[1] },
    { id: ids[2], sectionTitle: "Practice 1", pageLabel: "A1", layout: "double-pair", leftImage: assetIds[0], rightImage: assetIds[1] },
  ];
  return project;
}

test("Teacher content model accepts single, wide, and paired logical entries with publisher labels", () => {
  const project = validateTeacherProject(contentProject());
  const status = teacherProjectContentStatus(project.content);
  assert.deepEqual(status, { valid: true, unitCountWithContent: 1, entryCount: 3, completeEntryCount: 3, incompleteEntryCount: 0, issuesByUnit: {} });
  assert.equal(teacherProjectCompleteness(project).requiredCount, 106);
  assert.equal(project.content.studentsBook.units[0].entries[1].pageLabel, "6–7");
});

test("content order and stable IDs are independent of labels, titles, and image replacement", () => {
  const project = contentProject();
  const entries = project.content.studentsBook.units[0].entries;
  entries[0].pageLabel = "10"; entries[1].pageLabel = "2"; entries[2].pageLabel = "1";
  const before = teacherProjectContentHash(validateTeacherProject(structuredClone(project)));
  entries[0].sectionTitle = "Changed title";
  entries[0].image = entries[1].image;
  assert.deepEqual(entries.map((entry) => entry.id), ids);
  assert.deepEqual(entries.map((entry) => entry.pageLabel), ["10", "2", "1"]);
  assert.notEqual(teacherProjectContentHash(validateTeacherProject(project)), before);
});

test("misleading page labels preserve explicit 10 to 2 to 1 order across save and reload", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hh-teacher-order-")); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, "workspace"); await fs.mkdir(workspace);
  const store = new TeacherProjectStore({ workspace, now: () => "2026-08-09T10:00:00.000Z" });
  let project = await store.create({ projectId: "page-order", displayName: "Page Order" });
  const descriptor = { section: "pages", slot: "library", variant: "image", index: null };
  const png = await sharp({ create: { width: 40, height: 60, channels: 4, background: "#2468aa" } }).png().toBuffer();
  project = (await store.importAsset(project.projectId, { bytes: png, originalFilename: "page.png", descriptor })).project;
  const image = Object.keys(project.assets)[0];
  const content = structuredClone(project.content);
  content.studentsBook.units[0].entries = ["10", "2", "1"].map((pageLabel, index) => ({ id: ids[index], sectionTitle: "", pageLabel, layout: "single-page", image }));
  await store.save(project.projectId, { displayName: project.displayName, expectedRevision: project.revision, shell: project.shell, content });
  assert.deepEqual((await store.load(project.projectId)).content.studentsBook.units[0].entries.map((entry) => entry.pageLabel), ["10", "2", "1"]);
});

test("content schema rejects duplicate IDs, invalid layouts, wrong shapes, unknown fields, and overflow", () => {
  const duplicate = contentProject(); duplicate.content.studentsBook.units[0].entries[1].id = ids[0];
  assert.throws(() => validateTeacherProject(duplicate), /duplicate_teacher_page_entry_id/);
  const layout = contentProject(); layout.content.studentsBook.units[0].entries[0].layout = "facing-pages";
  assert.throws(() => validateTeacherProject(layout), /invalid_teacher_page_layout/);
  const shape = contentProject(); shape.content.studentsBook.units[0].entries[0].rightImage = null;
  assert.throws(() => validateTeacherProject(shape), /invalid_teacher_page_entry/);
  const unknown = contentProject(); unknown.content.studentsBook.units[0].entries[0].hotspots = [];
  assert.throws(() => validateTeacherProject(unknown), /invalid_teacher_page_entry/);
  const overflow = contentProject();
  overflow.content.studentsBook.units[0].entries = Array.from({ length: TEACHER_PROJECT_LIMITS.entriesPerUnit + 1 }, (_, index) => ({
    id: `entry-00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    sectionTitle: "", pageLabel: String(index + 1), layout: "single-page", image: "asset-00000000000000000000000000000001",
  }));
  assert.throws(() => validateTeacherProject(overflow), /invalid_teacher_content_unit/);
});

test("empty content is valid while incomplete entries are saveable and block export completeness", () => {
  const project = createBlankTeacherProject({ projectId: "draft-pages", displayName: "Draft Pages" });
  assert.equal(teacherProjectContentStatus(project.content).valid, true);
  project.content.studentsBook.units[0].entries.push({ id: ids[0], sectionTitle: "Reading", pageLabel: "", layout: "double-pair", leftImage: null, rightImage: null });
  validateTeacherProject(project);
  const status = teacherProjectCompleteness(project).contentStatus;
  assert.equal(status.valid, false);
  assert.equal(status.incompleteEntryCount, 1);
  assert.deepEqual(status.issuesByUnit["unit-1"][0].issues, ["Page label missing", "Left page image missing", "Right page image missing"]);
});

test("build validation fails closed with actionable Unit content issues", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hh-teacher-incomplete-build-")); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, "workspace"); await fs.mkdir(workspace);
  const store = new TeacherProjectStore({ workspace, now: () => "2026-08-09T10:00:00.000Z" });
  let project = await store.create({ projectId: "incomplete-pages", displayName: "Incomplete Pages" });
  const content = structuredClone(project.content);
  content.studentsBook.units[1].entries.push({ id: ids[0], sectionTitle: "Reading", pageLabel: "6-7", layout: "double-pair", leftImage: null, rightImage: null });
  project = await store.save(project.projectId, { displayName: project.displayName, expectedRevision: project.revision, shell: project.shell, content });
  await assert.rejects(() => prepareTeacherProjectBuild({ store, projectId: project.projectId }), (error) => {
    assert.equal(error.code, "incomplete_teacher_project");
    assert.deepEqual(error.details.contentIssues["unit-2"][0].issues, ["Left page image missing", "Right page image missing"]);
    return true;
  });
});

test("strict v1 manifests load in memory as v2 and persist only after a genuine mutation", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hh-teacher-v1-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, "workspace"); await fs.mkdir(workspace);
  const store = new TeacherProjectStore({ workspace, now: () => "2026-08-09T10:00:00.000Z" });
  const current = await store.create({ projectId: "legacy-v1", displayName: "Legacy V1" });
  const manifestPath = store.manifestPath("legacy-v1");
  const legacy = structuredClone(current); legacy.schemaVersion = "1.0"; delete legacy.content;
  await fs.writeFile(manifestPath, `${JSON.stringify(legacy, null, 2)}\n`);
  const beforeLoad = structuredClone(legacy);
  validateTeacherProject(legacy);
  assert.deepEqual(legacy, beforeLoad);
  const loaded = await store.load("legacy-v1");
  assert.equal(loaded.schemaVersion, "2.0");
  assert.equal(loaded.revision, 1);
  assert.deepEqual(loaded.content, createBlankTeacherContent());
  assert.equal(JSON.parse(await fs.readFile(manifestPath, "utf8")).schemaVersion, "1.0");
  const saved = await store.save("legacy-v1", { displayName: "Legacy V1 migrated", expectedRevision: 1, shell: loaded.shell, content: loaded.content });
  assert.equal(saved.schemaVersion, "2.0");
  assert.equal(saved.revision, 2);
  assert.equal(JSON.parse(await fs.readFile(manifestPath, "utf8")).schemaVersion, "2.0");
  const invalidLegacy = { ...legacy, content: createBlankTeacherContent() };
  assert.throws(() => validateTeacherProject(invalidLegacy), /invalid_teacher_project/);
});

test("page raster imports stay contained, deduplicate, and cannot be removed while referenced", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hh-teacher-pages-")); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, "workspace"); await fs.mkdir(workspace);
  const store = new TeacherProjectStore({ workspace, now: () => "2026-08-09T10:00:00.000Z" });
  let project = await store.create({ projectId: "page-assets", displayName: "Page Assets" });
  const descriptor = { section: "pages", slot: "library", variant: "image", index: null };
  const png = await sharp({ create: { width: 40, height: 60, channels: 4, background: "#cc2244" } }).png().toBuffer();
  const jpeg = await sharp({ create: { width: 41, height: 61, channels: 3, background: "#2244cc" } }).jpeg().toBuffer();
  const webp = await sharp({ create: { width: 42, height: 62, channels: 4, background: "#22cc44" } }).webp().toBuffer();
  const imported = await store.importAsset(project.projectId, { bytes: png, originalFilename: "C:\\Users\\publisher\\5.png", descriptor });
  const importedJpeg = await store.importAsset(project.projectId, { bytes: jpeg, originalFilename: "6.jpg", descriptor });
  const importedWebp = await store.importAsset(project.projectId, { bytes: webp, originalFilename: "7.webp", descriptor });
  const duplicate = await store.importAsset(project.projectId, { bytes: png, originalFilename: "duplicate.png", descriptor });
  assert.equal(duplicate.deduplicated, true);
  assert.match(imported.asset.relativePath, /^assets\/pages\/page-[a-f0-9]{12}\.png$/);
  assert.equal(imported.asset.originalFilename, "5.png");
  assert.match(importedJpeg.asset.relativePath, /^assets\/pages\/page-[a-f0-9]{12}\.jpg$/);
  assert.equal(importedJpeg.asset.mediaType, "image/jpeg");
  assert.match(importedWebp.asset.relativePath, /^assets\/pages\/page-[a-f0-9]{12}\.webp$/);
  assert.equal(importedWebp.asset.mediaType, "image/webp");
  project = importedWebp.project;
  const content = structuredClone(project.content);
  content.studentsBook.units[0].entries.push({ id: ids[0], sectionTitle: "", pageLabel: "5", layout: "single-page", image: imported.asset.assetId });
  project = await store.save(project.projectId, { displayName: project.displayName, expectedRevision: project.revision, shell: project.shell, content });
  await assert.rejects(() => store.removeAsset(project.projectId, imported.asset.assetId, project.revision), (error) => error.code === "teacher_asset_still_referenced");
  const cleared = structuredClone(project.content); cleared.studentsBook.units[0].entries = [];
  project = await store.save(project.projectId, { displayName: project.displayName, expectedRevision: project.revision, shell: project.shell, content: cleared });
  project = await store.removeAsset(project.projectId, imported.asset.assetId, project.revision);
  assert.equal(project.assets[imported.asset.assetId], undefined);
  await assert.rejects(() => store.importAsset(project.projectId, { bytes: Buffer.from("<svg/>"), originalFilename: "page.svg", descriptor }), /invalid_teacher_raster/);
  await assert.rejects(() => store.importAsset(project.projectId, { bytes: Buffer.from("not an image"), originalFilename: "bad.png", descriptor }), /invalid_teacher_raster/);
});
