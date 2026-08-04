import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseAirDescriptorXml, readAirDescriptor } from "../lib/book-builder/air-descriptor.js";
import { AppRootResolutionError, resolveApplicationRoot } from "../lib/book-builder/app-root-resolver.js";
import { atomicWriteJson, readJsonFile, resolveProjectDirectory } from "../lib/book-builder/atomic-json-store.js";
import { detectSourceProfile } from "../lib/book-builder/profile-registry.js";
import { createProjectFromSource, inspectProject, rescanProject } from "../lib/book-builder/scanner-service.js";
import { buildSourceInventory } from "../lib/book-builder/source-inventory.js";
import { buildStructuralFingerprint, normalizeStructuralPath } from "../lib/book-builder/structural-fingerprint.js";

const temporaryRoots = [];
const repositoryRoot = path.resolve(import.meta.dirname, "..");

async function temporaryRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hhplms-book-builder-"));
  temporaryRoots.push(root);
  return root;
}

test.after(async () => {
  await Promise.all(temporaryRoots.map((root) => fs.rm(root, { recursive: true, force: true })));
});

function descriptor({ id = "com.calledutainment.hamilton.fictional", name = "Fictional Course", swf = "Fictional.swf" } = {}) {
  return `<?xml version="1.0" encoding="utf-8"?>
<application xmlns="http://ns.adobe.com/air/application/23.0">
  <id>${id}</id><name>${name}</name><versionNumber>2.3.0</versionNumber><versionLabel>Fixture</versionLabel><filename>Fictional</filename>
  <initialWindow><content>${swf}</content><title>${name}</title><aspectRatio>landscape</aspectRatio><renderMode>direct</renderMode><fullScreen>true</fullScreen><visible>true</visible></initialWindow>
</application>`;
}

function fakeSwf() {
  const value = Buffer.alloc(12);
  value.write("FWS", 0, "ascii"); value[3] = 23; value.writeUInt32LE(12, 4);
  return value;
}

async function writeFile(root, relative, value = "fixture") {
  const target = path.join(root, ...relative.split("/"));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, value);
  return target;
}

async function createAirApp(root, name = "Fictional.app", profile = "generic", descriptorOptions = {}) {
  const app = path.join(root, name);
  await writeFile(app, "Contents/Resources/META-INF/AIR/application.xml", descriptor(descriptorOptions));
  await writeFile(app, `Contents/Resources/${descriptorOptions.swf || "Fictional.swf"}`, fakeSwf());
  await writeFile(app, "Contents/Resources/assets/books/book1/readme.txt");
  if (profile === "ultimate") {
    for (const file of [
      "Contents/Resources/assets/home/common/home_params.iwb",
      "Contents/Resources/assets/home/common/logo_1.zip",
      "Contents/Resources/assets/books/book1/book_menu/common/book1_params.iwb",
      "Contents/Resources/assets/books/book1/unit/1/unit_params.iwb",
      "Contents/Resources/assets/books/book1/unit/1/part1/part_params.iwb",
      "Contents/Resources/assets/books/book1/unit/1/part1/obj1/obj_params.iwb",
      "Contents/Resources/assets/books/book1/unit/1/parts/HD/parts_part_1.png",
      "Contents/Resources/assets/books/book1/unit/1/parts/SD/parts_part_1.png",
    ]) await writeFile(app, file);
  }
  if (profile === "journey") {
    for (const exercise of ["MultipleChoice", "DragAndDrop", "Matching", "ShowAnswer"]) await writeFile(app, `Contents/Resources/assets/exercises/${exercise}/${exercise}.png`);
    await writeFile(app, "Contents/Resources/assets/books/book1/unit/1/parts/parts_part_1.png");
    await writeFile(app, "Contents/Resources/assets/books/book1/unit/1/part1/obj1/mc_BG.png");
    await writeFile(app, "Contents/Resources/assets/books/book1/unit/1/part1/obj1/mc_BG.xml", "<TextureAtlas/>");
  }
  return app;
}

async function scanFixture(app) {
  const resolution = await resolveApplicationRoot(app);
  const inventory = await buildSourceInventory(resolution.canonicalAppRoot, { mainSwfRelativePath: resolution.mainSwfRelativePath, concurrency: 2 });
  const fingerprint = await buildStructuralFingerprint({ inventory, descriptor: resolution.descriptor, mainSwfAbsolutePath: resolution.mainSwfAbsolutePath });
  return { resolution, inventory, fingerprint };
}

test("AIR descriptor parser handles namespaces and rejects malformed or entity-bearing XML", () => {
  const parsed = parseAirDescriptorXml(descriptor());
  assert.equal(parsed.airVersion, "23.0");
  assert.equal(parsed.mainSwfPath, "Fictional.swf");
  assert.throws(() => parseAirDescriptorXml("<application>"), /Malformed|missing/);
  assert.throws(() => parseAirDescriptorXml(`<!DOCTYPE x [<!ENTITY leak SYSTEM "file:///etc/passwd">]>${descriptor()}`), /entities/);
  assert.throws(() => parseAirDescriptorXml(descriptor({ swf: "../escape.swf" })), /escapes/);
});

test("root resolver accepts direct and nested apps and excludes wrapper files", async () => {
  const root = await temporaryRoot();
  const direct = await createAirApp(root, "Direct.app", "ultimate");
  const directResult = await resolveApplicationRoot(direct);
  assert.equal(directResult.canonicalAppRelativePath, ".");
  const wrapper = path.join(root, "Installer Wrapper");
  await writeFile(wrapper, "setup.exe");
  await createAirApp(wrapper, "Nested.app", "ultimate");
  const nested = await resolveApplicationRoot(wrapper);
  assert.equal(nested.canonicalAppRelativePath, "Nested.app");
  assert.equal(nested.outerWrapper, true);
  const inventory = await buildSourceInventory(nested.canonicalAppRoot, { mainSwfRelativePath: nested.mainSwfRelativePath });
  assert.equal(inventory.entries.some((entry) => entry.path === "setup.exe"), false);
});

test("root resolver blocks multiple apps, fake apps, missing paths, and non-directories", async () => {
  const root = await temporaryRoot();
  const wrapper = path.join(root, "wrapper");
  await createAirApp(wrapper, "One.app"); await createAirApp(wrapper, "Two.app");
  await assert.rejects(() => resolveApplicationRoot(wrapper), (error) => error instanceof AppRootResolutionError && error.code === "multiple_app_roots");
  const fake = path.join(root, "Fake.app"); await fs.mkdir(fake);
  await assert.rejects(() => resolveApplicationRoot(fake), /No valid AIR/);
  await assert.rejects(() => resolveApplicationRoot(path.join(root, "missing")), /does not exist/);
  const file = await writeFile(root, "file.txt");
  await assert.rejects(() => resolveApplicationRoot(file), /directory/);
});

test("descriptor content symlinks and escaping paths fail safely", async (context) => {
  const root = await temporaryRoot();
  const outside = await writeFile(root, "outside.swf", fakeSwf());
  const app = path.join(root, "Escape.app");
  await writeFile(app, "Contents/Resources/META-INF/AIR/application.xml", descriptor({ swf: "link.swf" }));
  try { await fs.symlink(outside, path.join(app, "Contents/Resources/link.swf")); }
  catch (error) { context.skip(`Symlink creation unavailable: ${error.code}`); return; }
  await assert.rejects(() => readAirDescriptor(app), /non-symlink/);
});

test("inventory is deterministic, bounded, cancellable, and does not follow symlinks", async (context) => {
  const root = await temporaryRoot();
  const app = await createAirApp(root, "Inventory.app", "ultimate");
  await writeFile(app, "Contents/Frameworks/Adobe AIR.framework/runtime.bin");
  await writeFile(app, "Contents/Resources/assets/videos/large.mp4", Buffer.alloc(600_000));
  try { await fs.symlink(path.join(app, "Contents/Resources"), path.join(app, "Contents/Resources/assets/link"), "junction"); } catch {}
  const first = await scanFixture(app);
  const second = await scanFixture(app);
  assert.equal(first.inventory.structuralDigest, second.inventory.structuralDigest);
  assert.equal(first.inventory.summary.fileCount, second.inventory.entries.length);
  assert.equal(first.inventory.entries.find((entry) => entry.category === "framework").safetyCategory, "framework");
  assert.equal(first.inventory.entries.find((entry) => entry.path.endsWith("large.mp4")).hashState, "deferred");
  await assert.rejects(() => buildSourceInventory(app, { maxFiles: 1 }), /safety limit/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => buildSourceInventory(app, { signal: controller.signal }), /cancelled/);
  assert.equal(first.inventory.diagnostics.some((item) => item.code === "symlink_skipped") || process.platform === "win32", true);
  void context;
});

test("structural normalization handles separators, case, and numeric segments", () => {
  assert.equal(normalizeStructuralPath("Contents\\Resources\\assets\\books\\book1\\unit\\10\\part2\\obj3\\image_9.png"), "contents/resources/assets/books/book{n}/unit/{n}/part{part}/obj{obj}/image_{n}.png");
});

test("profile registry uses structural evidence rather than title strings", async () => {
  const root = await temporaryRoot();
  const ultimate = await scanFixture(await createAirApp(root, "Anything.app", "ultimate"));
  const journey = await scanFixture(await createAirApp(root, "Different.app", "journey"));
  const generic = await scanFixture(await createAirApp(root, "Ultimate English B1.app", "generic"));
  assert.equal(detectSourceProfile(ultimate.fingerprint).id, "ultimate-air-v2");
  assert.equal(detectSourceProfile(journey.fingerprint).id, "journey-air-v1");
  assert.equal(detectSourceProfile(generic.fingerprint).id, "generic-air-fallback");
  const conflicting = structuredClone(ultimate.fingerprint); conflicting.features.hasJourneyExerciseTemplates = true;
  assert.equal(detectSourceProfile(conflicting).id, "generic-air-fallback");
});

test("local project creation, unchanged rescan, inspect, and portable redaction work", async () => {
  const root = await temporaryRoot();
  const source = await createAirApp(path.join(root, "sources"), "Project.app", "ultimate");
  const workspace = path.join(root, "workspace");
  const created = await createProjectFromSource({ source, workspace, projectId: "fixture-project", repositoryRoot, now: "2026-08-05T01:00:00.000Z" });
  assert.equal(created.project.selectedProfile.id, "ultimate-air-v2");
  const serialized = await fs.readFile(path.join(created.projectDirectory, "book-project.json"), "utf8");
  assert.equal(serialized.includes(source), false);
  assert.equal(serialized.includes(os.userInfo().username), false);
  const rescanned = await rescanProject({ projectDirectory: created.projectDirectory, repositoryRoot, now: "2026-08-05T02:00:00.000Z" });
  assert.deepEqual(rescanned.diff, { schemaVersion: "1.0", fromRevision: 1, toRevision: 2, added: [], changed: [], removed: [], staleDecisions: [] });
  assert.equal((await inspectProject(created.projectDirectory)).portable.revision, 2);
});

test("changed source produces a changed fact without source writes by the scanner", async () => {
  const root = await temporaryRoot();
  const source = await createAirApp(path.join(root, "sources"), "Changed.app", "ultimate");
  const workspace = path.join(root, "workspace");
  const created = await createProjectFromSource({ source, workspace, projectId: "changed-project", repositoryRoot });
  const beforeCount = (await buildSourceInventory(source, { mainSwfRelativePath: created.resolution.mainSwfRelativePath })).summary.fileCount;
  await writeFile(source, "Contents/Resources/assets/books/book1/unit/2/unit_params.iwb", "changed");
  const rescanned = await rescanProject({ projectDirectory: created.projectDirectory, repositoryRoot });
  assert.equal(rescanned.diff.added.length + rescanned.diff.changed.length > 0, true);
  assert.equal(rescanned.scan.inventory.summary.fileCount, beforeCount + 1);
});

test("atomic storage rejects revision conflicts, corrupted JSON, traversal IDs, and repository workspaces", async () => {
  const root = await temporaryRoot();
  const workspace = path.join(root, "workspace");
  const directory = resolveProjectDirectory(workspace, "safe-project");
  const target = path.join(directory, "book-project.json");
  await atomicWriteJson(target, { revision: 1 }, { allowedRoot: directory });
  await assert.rejects(() => atomicWriteJson(target, { revision: 2 }, { allowedRoot: directory, expectedRevision: 9 }), /Revision conflict/);
  await fs.writeFile(target, "not json");
  await assert.rejects(() => readJsonFile(target), /Corrupted JSON/);
  assert.throws(() => resolveProjectDirectory(workspace, "../escape"), /safe identifier/);
  const source = await createAirApp(root, "RepoWrite.app", "generic");
  await assert.rejects(() => createProjectFromSource({ source, workspace: path.join(repositoryRoot, ".builder-output"), projectId: "no-repo-write", repositoryRoot }), /outside the repository/);
});

function runCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(repositoryRoot, "scripts/book-builder/cli.mjs"), ...args], { cwd: repositoryRoot, windowsHide: true });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("CLI supports help, scan, inspect, rescan, and blocking errors", async () => {
  const root = await temporaryRoot();
  const source = await createAirApp(path.join(root, "sources"), "Cli.app", "ultimate");
  const workspace = path.join(root, "workspace");
  assert.match((await runCli(["--help"])).stdout, /Usage:/);
  const scanned = await runCli(["scan", "--source", source, "--workspace", workspace, "--project-id", "cli-project"]);
  assert.equal(scanned.code, 0, scanned.stderr);
  const output = JSON.parse(scanned.stdout);
  const inspected = await runCli(["inspect", "--project", output.outputDirectory]);
  assert.equal(JSON.parse(inspected.stdout).portable.projectId, "cli-project");
  const rescanned = await runCli(["rescan", "--project", output.outputDirectory]);
  assert.deepEqual(JSON.parse(rescanned.stdout), { status: "rescanned", outputDirectory: output.outputDirectory, revision: 2, added: 0, changed: 0, removed: 0, staleDecisions: 0 });
  const failed = await runCli(["scan", "--source", path.join(root, "missing"), "--workspace", workspace]);
  assert.notEqual(failed.code, 0);
  assert.match(failed.stderr, /missing_source/);
});

test("critical source hashes remain unchanged across a scan", async () => {
  const root = await temporaryRoot();
  const source = await createAirApp(path.join(root, "sources"), "Protected.app", "ultimate");
  const resolution = await resolveApplicationRoot(source);
  const critical = [resolution.descriptorAbsolutePath, resolution.mainSwfAbsolutePath];
  const before = await Promise.all(critical.map(async (file) => createHash("sha256").update(await fs.readFile(file)).digest("hex")));
  await createProjectFromSource({ source, workspace: path.join(root, "workspace"), projectId: "protected", repositoryRoot });
  const after = await Promise.all(critical.map(async (file) => createHash("sha256").update(await fs.readFile(file)).digest("hex")));
  assert.deepEqual(after, before);
});
