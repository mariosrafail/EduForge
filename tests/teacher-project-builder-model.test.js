import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

import { stableJson } from "../lib/book-builder/stable-json.js";
import { TeacherProjectError } from "../lib/teacher-project-builder/errors.js";
import {
  createBlankTeacherProject,
  teacherProjectCompleteness,
  validateTeacherProject,
} from "../lib/teacher-project-builder/schema.js";
import { TeacherProjectStore } from "../lib/teacher-project-builder/store.js";

async function workspaceFixture(t) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "hh-teacher-project-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  return { workspace, store: new TeacherProjectStore({ workspace, now: () => "2026-08-08T12:00:00.000Z" }) };
}

test("blank Teacher APK projects use the strict versioned shell contract", () => {
  const project = createBlankTeacherProject({ projectId: "ultimate-b3", displayName: "Ultimate B3", now: "2026-08-08T12:00:00.000Z" });
  assert.equal(project.schemaVersion, "1.0");
  assert.equal(project.kind, "teacher-apk-project");
  assert.equal(project.shell.units.length, 10);
  assert.deepEqual(project.shell.editions.map(({ id }) => id), ["students-book", "workbook", "grammar-book", "extras"]);
  assert.equal(project.shell.toolbar.length, 18);
  assert.equal(teacherProjectCompleteness(project).complete, false);
  assert.match(stableJson(project), /^\{\n/);
});

test("Teacher APK project validation fails closed for IDs, unknown fields, paths, and malformed manifests", () => {
  assert.throws(() => createBlankTeacherProject({ projectId: "../b3", displayName: "B3" }), (error) => error instanceof TeacherProjectError && error.code === "invalid_teacher_project_id");
  const unknown = createBlankTeacherProject({ projectId: "b3", displayName: "B3" });
  unknown.shell.extraCss = "body{}";
  assert.throws(() => validateTeacherProject(unknown), /invalid_teacher_project_shell/);
  const absolute = createBlankTeacherProject({ projectId: "b3", displayName: "B3" });
  absolute.assets["asset-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"] = {
    assetId: "asset-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    relativePath: "C:/Users/example/background.png",
    originalFilename: "background.png",
    mediaType: "image/png",
    sizeBytes: 1,
    sha256: "a".repeat(64),
    width: 1,
    height: 1,
    importedAt: "2026-08-08T12:00:00.000Z",
  };
  assert.throws(() => validateTeacherProject(absolute), /invalid_teacher_asset_path/);
});

test("Teacher project store creates, lists, saves and reloads without changing identical revisions", async (t) => {
  const { store } = await workspaceFixture(t);
  const created = await store.create({ projectId: "ultimate-b3", displayName: "Ultimate B3" });
  assert.equal(created.revision, 1);
  await assert.rejects(() => store.create({ projectId: "ultimate-b3", displayName: "Duplicate" }), (error) => error.code === "teacher_project_already_exists");
  const same = await store.save("ultimate-b3", { displayName: created.displayName, expectedRevision: 1, shell: created.shell });
  assert.equal(same.revision, 1);
  const changed = await store.save("ultimate-b3", { displayName: "Ultimate B3 Teacher", expectedRevision: 1, shell: created.shell });
  assert.equal(changed.revision, 2);
  assert.equal((await store.load("ultimate-b3")).displayName, "Ultimate B3 Teacher");
  assert.deepEqual((await store.list()).projects.map(({ projectId }) => projectId), ["ultimate-b3"]);
  await assert.rejects(() => store.save("ultimate-b3", { displayName: "Conflict", expectedRevision: 1, shell: created.shell }), (error) => error.code === "teacher_project_revision_conflict");
});

test("Teacher project roots and assets cannot escape through symlinks", async (t) => {
  const { workspace, store } = await workspaceFixture(t);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "hh-teacher-outside-"));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "teacher-projects"));
  try {
    await fs.symlink(outside, path.join(workspace, "teacher-projects", "escape"), "junction");
  } catch (error) {
    if (["EPERM", "EACCES"].includes(error.code)) return;
    throw error;
  }
  await assert.rejects(() => store.load("escape"), (error) => error.code === "teacher_project_not_found");
});

test("raster import validates bytes, records portable metadata, replaces safely, and deduplicates shared audio", async (t) => {
  const { workspace, store } = await workspaceFixture(t);
  let project = await store.create({ projectId: "b3", displayName: "B3" });
  const png = await sharp({ create: { width: 3, height: 2, channels: 4, background: "#2468aa" } }).png().toBuffer();
  const first = await store.importAsset("b3", {
    bytes: png,
    originalFilename: "C:\\Users\\publisher\\background.png",
    descriptor: { section: "background", slot: "main", variant: "image", index: null },
  });
  project = first.project;
  assert.equal(first.asset.mediaType, "image/png");
  assert.deepEqual([first.asset.width, first.asset.height], [3, 2]);
  assert.match(first.asset.relativePath, /^assets\/background\/main-[a-f0-9]{12}\.png$/);
  assert.equal(first.asset.originalFilename, "background.png");
  assert.doesNotMatch(stableJson(project), /Users|publisher/);
  const duplicate = await store.importAsset("b3", {
    bytes: png,
    originalFilename: "another.png",
    descriptor: { section: "background", slot: "main", variant: "image", index: null },
  });
  assert.equal(duplicate.deduplicated, true);
  assert.equal(duplicate.project.revision, project.revision);
  await assert.rejects(() => store.importAsset("b3", {
    bytes: Buffer.from("<svg><script/></svg>"),
    originalFilename: "fake.png",
    descriptor: { section: "background", slot: "main", variant: "image", index: null },
  }), (error) => error.code === "invalid_teacher_raster");
  const target = path.join(workspace, "teacher-projects", "b3", ...first.asset.relativePath.split("/"));
  assert.deepEqual(await fs.readFile(target), png);

  const wav = Buffer.alloc(46);
  wav.write("RIFF", 0); wav.writeUInt32LE(38, 4); wav.write("WAVE", 8);
  wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8_000, 24); wav.writeUInt32LE(8_000, 28); wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34);
  wav.write("data", 36); wav.writeUInt32LE(2, 40); wav[44] = 128; wav[45] = 128;
  const sound1 = await store.importAsset("b3", { bytes: wav, originalFilename: "click.wav", descriptor: { section: "audio", slot: "library", variant: "sound", index: null } });
  const sound2 = await store.importAsset("b3", { bytes: wav, originalFilename: "same.wav", descriptor: { section: "audio", slot: "library", variant: "sound", index: null } });
  assert.equal(sound1.asset.assetId, sound2.asset.assetId);
  assert.equal(sound2.deduplicated, true);
});
