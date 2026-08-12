import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  assertStudentSafe,
  copyFileIfMissingOrIdentical,
  fileRecord,
  normalizeWorkspaceRelativePath,
  resolveInsideWorkspace,
  resolveUltimateB2ContentRoot,
  sha256,
  verifyFileRecord,
} from "./content-workspace.mjs";
import { ultimateB2TeacherAppAuthoring } from "../../src/data/ultimate-b2/teacherAppAuthoring.js";
import {
  projectStudentReadingActivity,
  projectTeacherReadingSolution,
} from "../../src/data/ultimate-b2/readingExerciseProjections.js";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const sourceApplicationRoot = path.join(repositoryRoot, "Ultimate English B2.app");
const command = process.argv[2] || "status";
const writeProjection = process.argv.includes("--write");

const json = async (file) => JSON.parse(await readFile(file, "utf8"));
const repositoryPath = (relative) => path.join(repositoryRoot, ...relative.split("/"));
const unitFolder = (number) => `unit-${String(number).padStart(2, "0")}`;
const mediaType = (file) => ({
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".mp4": "video/mp4", ".xml": "application/xml",
  ".iwb": "application/octet-stream", ".gaf": "application/x-gaf", ".swf": "application/x-shockwave-flash",
}[path.extname(file).toLowerCase()] || "application/octet-stream");

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

async function filesBelow(root) {
  if (!await exists(root)) return [];
  const found = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(candidate);
      else if (entry.isFile()) found.push(candidate);
    }
  }
  await visit(root);
  return found.sort();
}

async function writeDeterministic(file, bytes) {
  const payload = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const current = await readFile(file).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
  if (current && sha256(current) !== sha256(payload)) throw new Error(`Refusing to overwrite different workspace content during copy-first migration: ${file}`);
  if (!current) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, payload, { flag: "wx" });
  }
  return payload;
}

async function replaceGeneratedIndex(file, bytes) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, bytes, { flag: "wx" });
  await rename(temporary, file);
}

function inferredRecordMetadata(workspacePath) {
  const classification = workspacePath.includes("/student-runtime/") || workspacePath.startsWith("students-book/pages/") ? "student-runtime"
    : workspacePath.includes("/teacher-private/") || workspacePath.startsWith("shared-media/teacher-private/") ? "teacher-private"
      : workspacePath.includes("/source-private/") ? "source-private" : "authoring";
  return { logicalId: `ultimate-b2.workspace.${sha256(Buffer.from(workspacePath)).slice(0, 20)}`, role: "workspace-content", classification, mediaType: mediaType(workspacePath) };
}

async function reindexWorkspace(workspaceRoot, { announce = true } = {}) {
  const indexPath = await resolveInsideWorkspace(workspaceRoot, "00-manifest/content-index.json", { allowMissing: true });
  const previous = await json(indexPath).catch(() => ({ records: [] }));
  const previousByPath = new Map((previous.records || []).map((record) => [record.workspacePath, record]));
  const excluded = new Set(["00-manifest/content-index.json", "00-manifest/checksums.sha256"]);
  const files = (await filesBelow(workspaceRoot)).filter((file) => {
    const relative = path.relative(workspaceRoot, file).replaceAll("\\", "/");
    return !excluded.has(relative) && !relative.startsWith("00-manifest/pending-projections/");
  });
  const records = [];
  for (const file of files) {
    const workspacePath = path.relative(workspaceRoot, file).replaceAll("\\", "/");
    const previousRecord = previousByPath.get(workspacePath);
    records.push(await fileRecord(file, workspaceRoot, previousRecord ? Object.fromEntries(Object.entries(previousRecord).filter(([key]) => !["workspacePath", "sha256", "sizeBytes"].includes(key))) : inferredRecordMetadata(workspacePath)));
  }
  records.sort((left, right) => left.workspacePath.localeCompare(right.workspacePath));
  await replaceGeneratedIndex(indexPath, `${JSON.stringify({ schemaVersion: "1.0", bookId: "ultimate-b2", records }, null, 2)}\n`);
  const checksumTargets = [...records, await fileRecord(indexPath, workspaceRoot)].sort((left, right) => left.workspacePath.localeCompare(right.workspacePath));
  const checksumsPath = await resolveInsideWorkspace(workspaceRoot, "00-manifest/checksums.sha256", { allowMissing: true });
  await replaceGeneratedIndex(checksumsPath, `${checksumTargets.map((record) => `${record.sha256}  ${record.workspacePath}`).join("\n")}\n`);
  if (announce) console.log(JSON.stringify({ command: "index", workspace: "configured-content-root", records: records.length, deleted: 0 }, null, 2));
  return records;
}

function safeActivityId(value) {
  const id = String(value || "");
  if (!/^ultimate-b2-sb-u\d+-p\d+-o\d+$/.test(id)) throw new Error(`Unsafe or unstable activity ID: ${id}`);
  return id;
}

function sourceBasePath(value) {
  const relative = String(value || "").split("#", 1)[0].replaceAll("\\", "/");
  if (!relative.startsWith("Contents/Resources/")) return null;
  return normalizeWorkspaceRelativePath(relative, "Publisher source path");
}

function uiCategory(id) {
  const prefix = String(id).split(".", 1)[0];
  return ({ background: "backgrounds", branding: "branding", title: "branding", unit: "book-menu", edition: "book-menu", extra: "book-menu", navigation: "navigation", navibar: "navigation", toolbar: "toolbar", player: "media-player", sound: "sounds", control: "toolbar" })[prefix] || "other";
}

function logicalFilename(id, source) {
  const extension = path.extname(source).toLowerCase();
  return `${id.replace(/[^A-Za-z0-9.-]+/g, "-")}${extension}`;
}

async function migration() {
  const workspaceRoot = resolveUltimateB2ContentRoot(process.env, { required: true });
  if (!await exists(sourceApplicationRoot)) throw new Error("The local recovered Ultimate English B2 application is required for curated source copying.");
  await mkdir(workspaceRoot, { recursive: true });

  const records = [];
  const counters = { pages: 0, ui: 0, activitySource: 0, studentRuntime: 0, teacherPrivate: 0, sharedMedia: 0, generatedManifests: 0, unresolvedSources: 0 };
  const byteCounters = Object.fromEntries(Object.keys(counters).map((key) => [key, 0]));

  async function copy(source, workspaceRelative, metadata) {
    const destination = await resolveInsideWorkspace(workspaceRoot, workspaceRelative, { allowMissing: true });
    const result = await copyFileIfMissingOrIdentical(source, destination);
    records.push(await fileRecord(destination, workspaceRoot, metadata));
    if (metadata.counter) {
      counters[metadata.counter] += 1;
      byteCounters[metadata.counter] += result.sizeBytes;
    }
    return records.at(-1);
  }

  async function generate(workspaceRelative, value, metadata) {
    if (metadata.classification === "student-runtime") assertStudentSafe(value, workspaceRelative);
    const destination = await resolveInsideWorkspace(workspaceRoot, workspaceRelative, { allowMissing: true });
    const bytes = await writeDeterministic(destination, `${JSON.stringify(value, null, 2)}\n`);
    records.push(await fileRecord(destination, workspaceRoot, metadata));
    if (metadata.counter) {
      counters[metadata.counter] += 1;
      byteCounters[metadata.counter] += bytes.length;
    }
    return records.at(-1);
  }

  const studentsBook = await json(repositoryPath("src/data/ultimate-b2/generated/students-book.runtime.json"));
  assertStudentSafe(studentsBook, "Students Book structure");
  const pageContext = new Map();
  for (const unit of studentsBook.units) {
    for (const page of unit.pages) {
      const source = repositoryPath(page.pageImage.localHdAssetPath);
      const destination = `students-book/pages/${unitFolder(unit.number)}/${path.basename(source)}`;
      await copy(source, destination, {
        logicalId: page.pageImage.identity,
        role: "page-image",
        classification: "student-runtime",
        mediaType: mediaType(source),
        repositoryPath: page.pageImage.localHdAssetPath,
        unitNumber: unit.number,
        pageId: page.id,
        printedPages: page.pageNumbers,
        counter: "pages",
      });
      for (const activity of page.activities) pageContext.set(activity.id, { unit, page, activity });
    }
  }
  await generate("students-book/structure/book.json", studentsBook, { logicalId: "ultimate-b2.students-book.structure", role: "book-structure", classification: "student-runtime", sourceStatus: "repository-projection", counter: "generatedManifests" });

  const hotspotSource = repositoryPath("src/data/ultimate-b2/authoring/studentsBookHotspots.json");
  await copy(hotspotSource, "students-book/hotspots/hotspots.json", { logicalId: "ultimate-b2.students-book.hotspots", role: "hotspot-authoring", classification: "authoring", repositoryPath: "src/data/ultimate-b2/authoring/studentsBookHotspots.json" });

  const uiAssets = {};
  for (const [id, binding] of Object.entries(ultimateB2TeacherAppAuthoring.assets).sort(([left], [right]) => left.localeCompare(right))) {
    if (binding.role === "page") continue;
    const source = repositoryPath(binding.repositoryPath);
    const workspaceRelative = `interactive-ui/${uiCategory(id)}/${logicalFilename(id, source)}`;
    const record = await copy(source, workspaceRelative, { logicalId: id, role: binding.role, classification: "student-runtime", mediaType: binding.mediaType, repositoryPath: binding.repositoryPath, counter: "ui" });
    uiAssets[id] = { workspacePath: record.workspacePath, repositoryPath: binding.repositoryPath, mediaType: binding.mediaType, sha256: record.sha256, sizeBytes: record.sizeBytes };
  }
  await generate("interactive-ui/ui-assets.json", { schemaVersion: "1.0", packageId: "ultimate-b2-students-book", assets: uiAssets }, { logicalId: "ultimate-b2.interactive-ui.assets", role: "ui-manifest", classification: "authoring", counter: "generatedManifests" });
  const repositoryOverrides = await json(repositoryPath("src/data/ultimate-b2/authoring/teacherAppAssetOverrides.json"));
  await generate("interactive-ui/ui-config.json", repositoryOverrides, { logicalId: "ultimate-b2.interactive-ui.config", role: "ui-config", classification: "authoring", repositoryPath: "src/data/ultimate-b2/authoring/teacherAppAssetOverrides.json", counter: "generatedManifests" });

  const runtimeById = new Map();
  for (const unitNumber of [1, 2]) {
    const runtime = await json(repositoryPath(`src/data/ultimate-b2/generated/unit-${String(unitNumber).padStart(2, "0")}.runtime.json`));
    for (const activity of runtime.activities) runtimeById.set(activity.stableNormalizedId, activity);
  }
  const teacherSolutionsDocument = await json(repositoryPath("android-content-packs/ultimate-b2-students-book/teacher-solutions.json"));
  const teacherSolutions = teacherSolutionsDocument.solutions || {};
  const readingAuthoringById = new Map();
  for (const relative of [
    "src/data/ultimate-b2/authoring/unit-01-reading-exercise-4.complete-sentences.json",
    "src/data/ultimate-b2/authoring/unit-01-reading-debate-club.open-answer.json",
  ]) {
    const authoring = await json(repositoryPath(relative));
    readingAuthoringById.set(authoring.activityId, authoring);
  }
  const recoveredById = new Map();
  for (let unitNumber = 1; unitNumber <= 10; unitNumber += 1) {
    const catalog = await json(repositoryPath(`books/ultimate-b2/generated/activities/unit-${String(unitNumber).padStart(2, "0")}.activities.json`));
    for (const activity of catalog.activities) recoveredById.set(activity.id, activity);
  }

  const allActivityIds = [...new Set([...pageContext.keys(), ...recoveredById.keys(), ...runtimeById.keys()])].sort();
  const unresolved = [];
  for (const rawId of allActivityIds) {
    const activityId = safeActivityId(rawId);
    const recovered = recoveredById.get(activityId) || null;
    const context = pageContext.get(activityId) || null;
    const unitNumber = recovered?.unitNumber || context?.unit.number || runtimeById.get(activityId)?.unitNumber;
    const root = `students-book/activities/${unitFolder(unitNumber)}/${activityId}`;
    const linkedPaths = new Set([
      ...(recovered?.sourceProvenance || []).map(sourceBasePath).filter(Boolean),
      ...(recovered?.mediaDependencies || []).map((entry) => sourceBasePath(entry.sourceRelativePath)).filter(Boolean),
      ...(recovered?.imageDependencies || []).map((entry) => sourceBasePath(entry.sourceRelativePath)).filter(Boolean),
    ]);
    const sourceFiles = [];
    const unresolvedForActivity = [];
    for (const relative of [...linkedPaths].sort()) {
      const source = path.join(sourceApplicationRoot, ...relative.split("/"));
      if (!await exists(source)) {
        unresolvedForActivity.push(relative);
        unresolved.push({ activityId, publisherPath: relative });
        counters.unresolvedSources += 1;
        continue;
      }
      const destination = `${root}/source-private/publisher/${relative}`;
      const record = await copy(source, destination, { logicalId: `${activityId}.source.${sha256(Buffer.from(relative)).slice(0, 12)}`, role: "publisher-source", classification: "source-private", mediaType: mediaType(source), publisherPath: `Ultimate English B2.app/${relative}`, activityId, counter: "activitySource" });
      sourceFiles.push({ publisherPath: `Ultimate English B2.app/${relative}`, workspacePath: record.workspacePath, sha256: record.sha256, sizeBytes: record.sizeBytes, mediaType: record.mediaType });
    }

    const student = runtimeById.get(activityId) || {
      stableNormalizedId: activityId,
      unitNumber,
      partNumber: recovered?.partNumber || context?.page.partNumber || null,
      printedPage: recovered?.physicalPageNumber || context?.page.physicalPageNumber || null,
      title: context?.activity.title || recovered?.title || activityId,
      visibleInstructionText: context?.activity.instructions || null,
      activityType: context?.activity.activityType || recovered?.activityType || "unknown",
      implementationMode: context?.activity.implementationMode || "recovered-only",
      scoringMode: context?.activity.scoring || "not-runtime-ready",
      availability: context?.activity.availability || "recovered-only",
      implementationStatus: context?.activity.implementationStatus || recovered?.implementationStatus || "recovered-only",
      runtime: null,
    };
    await generate(`${root}/student-runtime/activity.json`, student, { logicalId: `${activityId}.student-runtime`, role: "activity-runtime", classification: "student-runtime", activityId, unitNumber, counter: "studentRuntime" });
    const readingAuthoring = readingAuthoringById.get(activityId);
    if (readingAuthoring) {
      await generate(`${root}/student-runtime/reading-presentation.json`, projectStudentReadingActivity(readingAuthoring), { logicalId: `${activityId}.reading-student-runtime`, role: "reading-presentation", classification: "student-runtime", activityId, unitNumber, counter: "studentRuntime" });
      await generate(`${root}/teacher-private/reading-solution.json`, projectTeacherReadingSolution(readingAuthoring), { logicalId: `${activityId}.reading-teacher-solution`, role: "reading-teacher-solution", classification: "teacher-private", activityId, unitNumber, counter: "teacherPrivate" });
    }
    if (teacherSolutions[activityId]) {
      const { readingSolution: _separateReadingSolution, ...packTeacherSolution } = teacherSolutions[activityId];
      const genericTeacherSolution = activityId === "ultimate-b2-sb-u1-p2-o5"
        ? { activityId, solutionAvailability: "open-response", solutionType: "open-response", questions: {} }
        : packTeacherSolution;
      await generate(`${root}/teacher-private/solution.json`, genericTeacherSolution, { logicalId: `${activityId}.teacher-solution`, role: "teacher-solution", classification: "teacher-private", activityId, unitNumber, counter: "teacherPrivate" });
    }
    const manifest = {
      schemaVersion: "1.0",
      activityId,
      book: "ultimate-b2",
      component: "students-book",
      unitNumber,
      partNumber: recovered?.partNumber || context?.page.partNumber || null,
      pageId: context?.page.id || recovered?.hotspotNavigation?.pageId || null,
      printedPage: recovered?.physicalPageNumber || context?.page.physicalPageNumber || null,
      section: context?.page.sectionTitle || null,
      title: context?.activity.title || recovered?.title || activityId,
      activityType: context?.activity.activityType || recovered?.activityType || "unknown",
      implementationMode: context?.activity.implementationMode || "recovered-only",
      scoringMode: context?.activity.scoring || recovered?.scoringRules?.mode || "not-runtime-ready",
      implementationStatus: context?.activity.implementationStatus || recovered?.implementationStatus || "recovered-only",
      availability: context?.activity.availability || "recovered-only",
      sourceProvenance: sourceFiles,
      unresolvedSourceMappings: unresolvedForActivity,
      studentRuntimePath: `${root}/student-runtime/activity.json`,
      teacherPrivatePath: teacherSolutions[activityId] ? `${root}/teacher-private/solution.json` : null,
      repositoryProjectionPaths: [
        runtimeById.has(activityId) ? `src/data/ultimate-b2/generated/unit-${String(unitNumber).padStart(2, "0")}.runtime.json` : null,
        "src/data/ultimate-b2/generated/students-book.runtime.json",
      ].filter(Boolean),
    };
    await generate(`${root}/manifest.json`, manifest, { logicalId: `${activityId}.manifest`, role: "activity-manifest", classification: "authoring", activityId, unitNumber, counter: "generatedManifests" });
  }

  const authoringDirectory = repositoryPath("src/data/ultimate-b2/authoring");
  for (const file of (await filesBelow(authoringDirectory)).filter((candidate) => candidate.endsWith(".json"))) {
    const relative = path.relative(authoringDirectory, file).replaceAll("\\", "/");
    if (["studentsBookHotspots.json", "teacherAppAssetOverrides.json", "publisher-created-activities.json"].includes(relative)) continue;
    const value = await json(file);
    const activityId = value.activityId;
    if (!activityId || !pageContext.has(activityId)) continue;
    const unitNumber = pageContext.get(activityId).unit.number;
    await copy(file, `students-book/activities/${unitFolder(unitNumber)}/${activityId}/source-private/authoring/${path.basename(file)}`, { logicalId: `${activityId}.authoring-source`, role: "authoring-source", classification: "source-private", repositoryPath: path.relative(repositoryRoot, file).replaceAll("\\", "/"), activityId, counter: "activitySource" });
  }
  await copy(repositoryPath("src/data/ultimate-b2/authoring/publisher-created-activities.json"), "students-book/activities/publisher-created-activities.json", { logicalId: "ultimate-b2.publisher-created-activities", role: "activity-registry", classification: "authoring", repositoryPath: "src/data/ultimate-b2/authoring/publisher-created-activities.json" });

  for (const file of [
    "netlify/functions/_ultimate-b2-open-response-model-answers.json",
    "netlify/functions/_ultimate-b2-unit1-opener-model-answers.json",
  ]) {
    await copy(repositoryPath(file), `students-book/teacher-private/registries/${path.basename(file)}`, { logicalId: `ultimate-b2.teacher-private.${path.basename(file, ".json")}`, role: "teacher-answer-registry", classification: "teacher-private", repositoryPath: file, counter: "teacherPrivate" });
  }

  const sharedFamilies = [
    ["src/assets/books/ultimate-b2/covers", "shared-media/student-runtime/images/covers", "student-runtime"],
    ["src/assets/books/ultimate-b2/legacy-pilot", "shared-media/student-runtime/legacy-pilot", "student-runtime"],
    ["src/assets/books/ultimate-b2/media", "shared-media/student-runtime/media", "student-runtime"],
    ["src/assets/books/ultimate-b2/teacher-offline-media", "shared-media/teacher-private/teacher-offline-media", "teacher-private"],
  ];
  for (const [repositoryRelativeRoot, workspaceRelativeRoot, classification] of sharedFamilies) {
    const sourceRoot = repositoryPath(repositoryRelativeRoot);
    for (const file of await filesBelow(sourceRoot)) {
      const relative = path.relative(sourceRoot, file).replaceAll("\\", "/");
      await copy(file, `${workspaceRelativeRoot}/${relative}`, { logicalId: `ultimate-b2.shared.${sha256(Buffer.from(`${repositoryRelativeRoot}/${relative}`)).slice(0, 16)}`, role: "shared-media", classification, mediaType: mediaType(file), repositoryPath: `${repositoryRelativeRoot}/${relative}`, counter: "sharedMedia" });
    }
  }

  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
  const bookManifest = {
    schemaVersion: "1.0",
    bookId: "ultimate-b2",
    componentId: "ultimate-b2-students-book",
    title: "Ultimate English B2",
    sourceRepository: "mariosrafail/hhplms",
    sourceRevision: head,
    canonicalRole: "publisher-authoring-content",
    runtimeDependencyPolicy: "Repository builds consume deterministic projections and never this absolute workspace path.",
    counts: { activities: allActivityIds.length, implementedRuntimeActivities: runtimeById.size, teacherSolutions: Object.keys(teacherSolutions).length, pages: studentsBook.units.reduce((sum, unit) => sum + unit.pages.length, 0) },
  };
  await generate("00-manifest/book.json", bookManifest, { logicalId: "ultimate-b2.book", role: "book-manifest", classification: "authoring", counter: "generatedManifests" });
  await generate("00-manifest/provenance.json", {
    schemaVersion: "1.0",
    sourceRepository: "mariosrafail/hhplms",
    sourceRevision: head,
    publisherPackage: "Ultimate English B2.app",
    selectionPolicy: "Only current pages, live UI bindings, activity-linked publisher sources, current authoring, runtime projections, solutions, and current shared media are included.",
    excluded: ["Complete Ultimate English B2.app package", "Complete legacy-source mirror", "Unrelated legacy application resources"],
    unresolvedActivitySourceMappings: unresolved,
  }, { logicalId: "ultimate-b2.provenance", role: "provenance", classification: "source-private", counter: "generatedManifests" });

  records.sort((left, right) => left.workspacePath.localeCompare(right.workspacePath));
  const contentIndexPath = await resolveInsideWorkspace(workspaceRoot, "00-manifest/content-index.json", { allowMissing: true });
  await replaceGeneratedIndex(contentIndexPath, `${JSON.stringify({ schemaVersion: "1.0", bookId: "ultimate-b2", records }, null, 2)}\n`);
  const checksumTargets = [...records, await fileRecord(contentIndexPath, workspaceRoot)].sort((left, right) => left.workspacePath.localeCompare(right.workspacePath));
  const checksumsPath = await resolveInsideWorkspace(workspaceRoot, "00-manifest/checksums.sha256", { allowMissing: true });
  await replaceGeneratedIndex(checksumsPath, `${checksumTargets.map((record) => `${record.sha256}  ${record.workspacePath}`).join("\n")}\n`);

  console.log(JSON.stringify({ command: "migrate", workspace: "configured-content-root", sourceRevision: head, counters, byteCounters, totalFiles: records.length + 2, totalBytes: records.reduce((sum, record) => sum + record.sizeBytes, 0), mappedActivities: allActivityIds.length, unresolvedSourceMappings: unresolved.length, fullPublisherApplicationCopied: false }, null, 2));
}

async function verify() {
  const workspaceRoot = resolveUltimateB2ContentRoot(process.env, { required: true });
  const index = await json(await resolveInsideWorkspace(workspaceRoot, "00-manifest/content-index.json"));
  const failures = [];
  for (const record of index.records) {
    try { await verifyFileRecord(workspaceRoot, record); } catch (error) { failures.push(error.message); }
  }
  const studentFiles = (await filesBelow(workspaceRoot)).filter((file) => file.replaceAll("\\", "/").includes("/student-runtime/") && file.endsWith(".json"));
  for (const file of studentFiles) {
    try {
      const value = await json(file);
      assertStudentSafe(value, path.relative(workspaceRoot, file));
      const raw = await readFile(file, "utf8");
      if (/teacher-private|source-private|teacher-solutions\.json|Ultimate English B2\.app|Hamilton-House-Content|[A-Za-z]:[\\/]/i.test(raw)) failures.push(`Student runtime contains a forbidden private/local dependency: ${path.relative(workspaceRoot, file)}`);
    } catch (error) { failures.push(error.message); }
  }
  const checksums = await readFile(await resolveInsideWorkspace(workspaceRoot, "00-manifest/checksums.sha256"), "utf8");
  for (const line of checksums.trim().split(/\r?\n/)) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match) { failures.push(`Malformed checksum line: ${line}`); continue; }
    const file = await resolveInsideWorkspace(workspaceRoot, match[2]);
    const bytes = await readFile(file).catch(() => null);
    if (!bytes || sha256(bytes) !== match[1]) failures.push(`Checksum file mismatch: ${match[2]}`);
  }
  if (failures.length) throw new Error(`Workspace verification failed (${failures.length}):\n${failures.slice(0, 20).join("\n")}`);
  console.log(JSON.stringify({ command: "verify", workspace: "configured-content-root", records: index.records.length, studentJsonFiles: studentFiles.length, findings: 0, valid: true }, null, 2));
}

async function projectionStatus() {
  const workspaceRoot = resolveUltimateB2ContentRoot(process.env, { required: true });
  const mappings = [
    ["students-book/hotspots/hotspots.json", "src/data/ultimate-b2/authoring/studentsBookHotspots.json"],
    ["interactive-ui/ui-config.json", "src/data/ultimate-b2/authoring/teacherAppAssetOverrides.json"],
    ["students-book/activities/publisher-created-activities.json", "src/data/ultimate-b2/authoring/publisher-created-activities.json"],
    ["students-book/teacher-private/registries/_ultimate-b2-open-response-model-answers.json", "netlify/functions/_ultimate-b2-open-response-model-answers.json"],
    ["students-book/teacher-private/registries/_ultimate-b2-unit1-opener-model-answers.json", "netlify/functions/_ultimate-b2-unit1-opener-model-answers.json"],
  ];
  const differences = [];
  for (const [workspaceRelative, repositoryRelative] of mappings) {
    const canonical = await readFile(await resolveInsideWorkspace(workspaceRoot, workspaceRelative));
    const projection = await readFile(repositoryPath(repositoryRelative)).catch(() => null);
    if (!projection || sha256(canonical) !== sha256(projection)) differences.push({ workspacePath: workspaceRelative, repositoryPath: repositoryRelative, state: projection ? "different" : "missing" });
    if (writeProjection && (!projection || sha256(canonical) !== sha256(projection))) {
      await mkdir(path.dirname(repositoryPath(repositoryRelative)), { recursive: true });
      await writeFile(repositoryPath(repositoryRelative), canonical);
    }
  }
  const pendingRoot = path.join(workspaceRoot, "00-manifest", "pending-projections");
  const pending = await filesBelow(pendingRoot);
  console.log(JSON.stringify({ command: writeProjection ? "sync" : "status", mode: writeProjection ? "non-destructive-write" : "dry-run", compared: mappings.length, differences, pendingProjectionRecords: pending.length, deleted: 0 }, null, 2));
}

if (command === "migrate") await migration();
else if (command === "verify") await verify();
else if (command === "index") await reindexWorkspace(resolveUltimateB2ContentRoot(process.env, { required: true }));
else if (command === "status" || command === "sync") await projectionStatus();
else throw new Error("Usage: content-workspace-cli.mjs <migrate|index|verify|status|sync> [--write]");
