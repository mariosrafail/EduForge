import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

import { createBlankTeacherProject, teacherProjectCompleteness } from "../lib/teacher-project-builder/schema.js";
import { TeacherProjectStore } from "../lib/teacher-project-builder/store.js";
import { assignSoundGroup, teacherAssetUsage, teacherShellProgress } from "../src/apps/book-builder/teacher-projects/teacherProjectAuthoring.js";

function wavFixture() {
  const wav = Buffer.alloc(46); wav.write("RIFF", 0); wav.writeUInt32LE(38, 4); wav.write("WAVE", 8); wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8_000, 24); wav.writeUInt32LE(8_000, 28); wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write("data", 36); wav.writeUInt32LE(2, 40); wav[44] = 128; wav[45] = 128; return wav;
}
async function fixture(t) { const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "hh-teacher-authoring-")); t.after(() => fs.rm(workspace, { recursive: true, force: true })); return { workspace, store: new TeacherProjectStore({ workspace, now: () => "2026-08-09T10:00:00.000Z" }) }; }

test("default completeness remains 106 and is derived from actual toolbar length", () => {
  const project = createBlankTeacherProject({ projectId: "default", displayName: "Default" });
  assert.equal(teacherProjectCompleteness(project).requiredCount, 106); assert.equal(teacherShellProgress(project.shell).requiredCount, 106);
  const shorter = structuredClone(project); shorter.shell.toolbar = shorter.shell.toolbar.slice(0, 2);
  assert.equal(teacherProjectCompleteness(shorter).requiredCount, 58); assert.equal(teacherShellProgress(shorter.shell).requiredCount, 58);
});

test("one sound fills only empty Unit assignments and usage survives save/reload", async (t) => {
  const { store } = await fixture(t); let project = await store.create({ projectId: "sounds", displayName: "Sounds" });
  const imported = await store.importAsset("sounds", { bytes: wavFixture(), originalFilename: "button.wav", descriptor: { section: "audio", slot: "library", variant: "sound", index: null } }); project = imported.project;
  const shell = structuredClone(project.shell); shell.units[0].sound = imported.asset.assetId; assignSoundGroup(shell, "units", imported.asset.assetId, true);
  assert.ok(shell.units.every((item) => item.sound === imported.asset.assetId));
  project = await store.save("sounds", { displayName: project.displayName, expectedRevision: project.revision, shell, content: project.content });
  assert.ok((await store.load("sounds")).shell.units.every((item) => item.sound === imported.asset.assetId)); assert.equal(teacherAssetUsage(project.shell).get(imported.asset.assetId).length, 10);
  const editions = structuredClone(project.shell); assignSoundGroup(editions, "editions", imported.asset.assetId, false); assert.ok(editions.editions.every((item) => item.sound === imported.asset.assetId));
  const toolbar = structuredClone(project.shell); assignSoundGroup(toolbar, "toolbar", imported.asset.assetId, false); assert.ok(toolbar.toolbar.every((item) => item.sound === imported.asset.assetId));
});

test("duplication is self-contained, revision 1, hash-identical, and omits exports/build state", async (t) => {
  const { workspace, store } = await fixture(t); let source = await store.create({ projectId: "ultimate-b3", displayName: "Ultimate B3" });
  const png = await sharp({ create: { width: 4, height: 3, channels: 4, background: "#245678" } }).png().toBuffer();
  const image = await store.importAsset(source.projectId, { bytes: png, originalFilename: "background.png", descriptor: { section: "background", slot: "main", variant: "image", index: null } }); source = image.project;
  const pageBytes = await sharp({ create: { width: 40, height: 60, channels: 4, background: "#7b326e" } }).png().toBuffer();
  const page = await store.importAsset(source.projectId, { bytes: pageBytes, originalFilename: "page-5.png", descriptor: { section: "pages", slot: "library", variant: "image", index: null } }); source = page.project;
  const shell = structuredClone(source.shell); shell.background = image.asset.assetId;
  const content = structuredClone(source.content); content.studentsBook.units[0].entries.push({ id: "entry-00000000-0000-4000-8000-000000000001", sectionTitle: "", pageLabel: "5", layout: "single-page", image: page.asset.assetId });
  source = await store.save(source.projectId, { displayName: source.displayName, expectedRevision: source.revision, shell, content });
  const sourceDirectory = path.join(workspace, "teacher-projects", source.projectId); await fs.writeFile(path.join(sourceDirectory, "exports", "source.apk"), "not-an-apk"); await fs.mkdir(path.join(sourceDirectory, ".build")); await fs.writeFile(path.join(sourceDirectory, ".build", "state.json"), "{}");
  const duplicate = await store.duplicate(source.projectId, { projectId: "ultimate-b4", displayName: "Ultimate B4" });
  assert.equal(duplicate.projectId, "ultimate-b4"); assert.equal(duplicate.displayName, "Ultimate B4"); assert.equal(duplicate.revision, 1); assert.deepEqual(duplicate.shell, source.shell); assert.deepEqual(duplicate.content, source.content); assert.deepEqual(duplicate.assets, source.assets); assert.equal((await store.load(source.projectId)).displayName, "Ultimate B3");
  const destination = path.join(workspace, "teacher-projects", duplicate.projectId); const copiedAsset = path.join(destination, ...image.asset.relativePath.split("/")); const copiedPage = path.join(destination, ...page.asset.relativePath.split("/"));
  assert.deepEqual(await fs.readFile(copiedAsset), png); assert.deepEqual(await fs.readFile(copiedPage), pageBytes); assert.equal((await fs.lstat(copiedAsset)).isSymbolicLink(), false); assert.deepEqual(await fs.readdir(path.join(destination, "exports")), []); await assert.rejects(() => fs.access(path.join(destination, ".build")));
  await assert.rejects(() => store.duplicate(source.projectId, { projectId: "ultimate-b4", displayName: "Conflict" }), (error) => error.code === "teacher_project_already_exists");
  await assert.rejects(() => store.duplicate(source.projectId, { projectId: "../escape", displayName: "Unsafe" }), (error) => error.code === "invalid_teacher_project_id"); await assert.rejects(() => store.duplicate("../escape", { projectId: "safe", displayName: "Unsafe source" }), (error) => error.code === "invalid_teacher_project_id");
});

test("referenced assets cannot be removed; replacement leaves a removable orphan", async (t) => {
  const { store } = await fixture(t); let project = await store.create({ projectId: "cleanup", displayName: "Cleanup" });
  const firstBytes = await sharp({ create: { width: 2, height: 2, channels: 4, background: "red" } }).png().toBuffer(); const secondBytes = await sharp({ create: { width: 2, height: 2, channels: 4, background: "blue" } }).png().toBuffer();
  const first = await store.importAsset("cleanup", { bytes: firstBytes, originalFilename: "first.png", descriptor: { section: "background", slot: "main", variant: "image", index: null } }); project = first.project;
  let shell = structuredClone(project.shell); shell.background = first.asset.assetId; project = await store.save("cleanup", { displayName: project.displayName, expectedRevision: project.revision, shell, content: project.content });
  await assert.rejects(() => store.removeAsset("cleanup", first.asset.assetId, project.revision), (error) => error.code === "teacher_asset_still_referenced");
  const second = await store.importAsset("cleanup", { bytes: secondBytes, originalFilename: "second.png", descriptor: { section: "background", slot: "main", variant: "image", index: null } }); project = second.project;
  shell = structuredClone(project.shell); shell.background = second.asset.assetId; project = await store.save("cleanup", { displayName: project.displayName, expectedRevision: project.revision, shell, content: project.content }); project = await store.removeAsset("cleanup", first.asset.assetId, project.revision);
  assert.equal(project.assets[first.asset.assetId], undefined); assert.ok(project.assets[second.asset.assetId]);
});

test("shared sound removal stays blocked until every saved reference is cleared", async (t) => {
  const { store } = await fixture(t); let project = await store.create({ projectId: "shared-audio", displayName: "Shared Audio" });
  const imported = await store.importAsset("shared-audio", { bytes: wavFixture(), originalFilename: "shared.wav", descriptor: { section: "audio", slot: "library", variant: "sound", index: null } }); project = imported.project;
  let shell = structuredClone(project.shell); assignSoundGroup(shell, "units", imported.asset.assetId, false); assignSoundGroup(shell, "toolbar", imported.asset.assetId, false);
  project = await store.save(project.projectId, { displayName: project.displayName, expectedRevision: project.revision, shell, content: project.content });
  await assert.rejects(() => store.removeAsset(project.projectId, imported.asset.assetId, project.revision), (error) => error.code === "teacher_asset_still_referenced");
  shell = structuredClone(project.shell); assignSoundGroup(shell, "units", null, false); assignSoundGroup(shell, "toolbar", null, false);
  project = await store.save(project.projectId, { displayName: project.displayName, expectedRevision: project.revision, shell, content: project.content }); project = await store.removeAsset(project.projectId, imported.asset.assetId, project.revision);
  assert.equal(project.assets[imported.asset.assetId], undefined);
});
