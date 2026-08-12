import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  normalizeUltimateB2OpenResponseAuthoring,
  normalizeUltimateB2OpenResponseTeacherAnswers,
  ULTIMATE_B2_OPEN_RESPONSE_ACTIVITY_IDS,
  ULTIMATE_B2_UNIT2_OPENER_OPEN_RESPONSE_ID,
} from "../../src/data/ultimate-b2/openResponseAuthoringSchema.js";
import { normalizeUltimateB2PublisherActivityRegistry } from "../../src/data/ultimate-b2/publisherCreatedActivities.js";
import { ultimateB2StudentsBookAuthoringPages } from "../../src/data/ultimate-b2/studentsBookAuthoringCatalog.js";
import { ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID } from "../../src/data/ultimate-b2/page5AuthoringSchema.js";
import { importUltimateB2OpenResponsePublisherBundle } from "./open-response-publisher-importer.mjs";
import { markUltimateB2PublisherActivityFilesystemSynced, projectUltimateB2PublisherActivity } from "./publisher-activity-projection.mjs";
import { normalizeWorkspaceRelativePath, resolveUltimateB2ContentRoot, sha256 } from "./content-workspace.mjs";

export const openResponseAuthoringEndpoint = "/__hhplms/ultimate-b2-open-response-authoring";
export const openResponsePublisherImportEndpoint = "/__hhplms/ultimate-b2-open-response-publisher-import";
export const openResponseAssetEndpoint = "/__hhplms/ultimate-b2-open-response-asset";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const loopbackAddresses = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const requestLimitBytes = 90 * 1024 * 1024;
const defaultTeacherRegistryPath = path.join(repositoryRoot, "netlify/functions/_ultimate-b2-open-response-model-answers.json");
const publisherActivityRegistryPath = path.join(repositoryRoot, "src/data/ultimate-b2/authoring/publisher-created-activities.json");

function defaultTargets() {
  return {
    [ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID]: {
      publicPath: path.join(repositoryRoot, "src/data/ultimate-b2/authoring/unit-01-page-5-exercise-1.open-response.json"),
      teacherRegistryPath: defaultTeacherRegistryPath,
      assetDirectory: path.join(repositoryRoot, `src/assets/books/ultimate-b2/authoring/open-response/${ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID}`),
    },
    [ULTIMATE_B2_UNIT2_OPENER_OPEN_RESPONSE_ID]: {
      publicPath: path.join(repositoryRoot, "src/data/ultimate-b2/authoring/unit-02-page-19-exercise-1.open-response.json"),
      teacherRegistryPath: defaultTeacherRegistryPath,
      assetDirectory: path.join(repositoryRoot, `src/assets/books/ultimate-b2/authoring/open-response/${ULTIMATE_B2_UNIT2_OPENER_OPEN_RESPONSE_ID}`),
    },
  };
}

async function dynamicTarget(activityId, registrySourcePath = publisherActivityRegistryPath) {
  const registry = normalizeUltimateB2PublisherActivityRegistry(JSON.parse(await readFile(registrySourcePath, "utf8")));
  const record = registry.activities.find((activity) => activity.activityId === activityId && activity.authoringKind === "open-response") || null;
  if (!record) return null;
  return {
    record,
    registry,
    publicPath: path.join(repositoryRoot, `src/data/ultimate-b2/authoring/publisher-created/${activityId}.open-response.json`),
    teacherRegistryPath: defaultTeacherRegistryPath,
    assetDirectory: path.join(repositoryRoot, `src/assets/books/ultimate-b2/authoring/open-response/${activityId}`),
  };
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(`${JSON.stringify(payload)}\n`);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > requestLimitBytes) throw new Error("Open Response source request is too large.");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("Open Response request must contain valid JSON."); }
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const keys = Object.keys(value);
  if (keys.some((key) => !allowed.includes(key)) || allowed.some((key) => !keys.includes(key))) throw new Error(`${label} has missing or unknown fields.`);
}

function decodeFiles(value) {
  if (!Array.isArray(value)) throw new Error("files must be an array.");
  return value.map((file, index) => {
    exactKeys(file, ["name", "type", "base64"], `files[${index}]`);
    if (typeof file.name !== "string" || typeof file.type !== "string" || typeof file.base64 !== "string" || !file.base64 || file.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(file.base64)) throw new Error(`files[${index}] is invalid.`);
    const bytes = Buffer.from(file.base64, "base64");
    if (bytes.toString("base64") !== file.base64) throw new Error(`files[${index}] is not canonical Base64.`);
    return { name: file.name, bytes };
  });
}

function assertControlledPath(candidate, roots, label) {
  const resolved = path.resolve(candidate);
  if (!roots.some((root) => {
    const relative = path.relative(root, resolved);
    return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
  })) throw new Error(`${label} is outside the controlled authoring roots.`);
  return resolved;
}

async function rejectSymlinkPath(candidate, roots = [repositoryRoot]) {
  const controlledRoot = roots.find((root) => {
    const relative = path.relative(root, candidate);
    return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
  });
  if (!controlledRoot) throw new Error("Managed authoring path escaped the controlled roots.");
  let cursor = path.dirname(candidate);
  while (cursor.startsWith(controlledRoot) && cursor !== controlledRoot) {
    const stats = await lstat(cursor).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
    if (stats?.isSymbolicLink()) throw new Error("Managed authoring path contains a symlink.");
    cursor = path.dirname(cursor);
  }
  const targetStats = await lstat(candidate).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
  if (targetStats?.isSymbolicLink()) throw new Error("Managed authoring target must not be a symlink.");
}

async function transactionalWrite(entries, roots = [repositoryRoot]) {
  const token = `${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`;
  const prepared = [];
  try {
    for (const entry of entries) {
      const target = assertControlledPath(entry.path, roots, "Managed authoring target");
      await rejectSymlinkPath(target, roots);
      await mkdir(path.dirname(target), { recursive: true });
      const temporaryPath = `${target}.${token}.tmp`;
      const backupPath = `${target}.${token}.bak`;
      await writeFile(temporaryPath, entry.bytes, { flag: "wx" });
      prepared.push({ target, temporaryPath, backupPath, hadOriginal: Boolean(await lstat(target).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error))), committed: false });
    }
    for (const entry of prepared) {
      if (entry.hadOriginal) await rename(entry.target, entry.backupPath);
      try {
        await rename(entry.temporaryPath, entry.target);
        entry.committed = true;
      } catch (error) {
        if (entry.hadOriginal) await rename(entry.backupPath, entry.target);
        throw error;
      }
    }
    // Backup cleanup is best-effort after every replacement has committed. A
    // cleanup failure must not trigger rollback after some earlier backups have
    // already been removed, because that could destroy the newly committed set.
    await Promise.all(prepared.filter((entry) => entry.hadOriginal).map((entry) => rm(entry.backupPath, { force: true }).catch(() => undefined)));
  } catch (error) {
    for (const entry of [...prepared].reverse()) {
      if (entry.committed) await rm(entry.target, { force: true }).catch(() => undefined);
      if (entry.hadOriginal && await lstat(entry.backupPath).catch(() => null)) await rename(entry.backupPath, entry.target).catch(() => undefined);
      await rm(entry.temporaryPath, { force: true }).catch(() => undefined);
    }
    throw error;
  }
}

async function runtimeFallback(activityId) {
  for (const filename of ["unit-01.runtime.json", "unit-02.runtime.json"]) {
    const document = JSON.parse(await readFile(path.join(repositoryRoot, `src/data/ultimate-b2/generated/${filename}`), "utf8"));
    const activity = document.activities?.find((candidate) => candidate.stableNormalizedId === activityId);
    if (activity) return { title: activity.title, questions: activity.runtime?.questions || [] };
  }
  return { title: "Open Response", questions: [] };
}

async function loadTarget(activityId, target) {
  try {
    const [publicValue, teacherRegistryValue] = await Promise.all([readFile(target.publicPath, "utf8"), readFile(target.teacherRegistryPath, "utf8")]);
    const publicAuthoring = normalizeUltimateB2OpenResponseAuthoring(JSON.parse(publicValue), activityId);
    const teacherRegistry = JSON.parse(teacherRegistryValue);
    const teacherAuthoring = normalizeUltimateB2OpenResponseTeacherAnswers(teacherRegistry.activities?.[activityId], activityId, publicAuthoring.questions.map((question) => question.id));
    return { activityId, configured: true, publicAuthoring, teacherAuthoring, runtimeFallback: await runtimeFallback(activityId) };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { activityId, configured: false, publicAuthoring: null, teacherAuthoring: null, runtimeFallback: await runtimeFallback(activityId) };
  }
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function updatedTeacherRegistry(target, activityId, teacherAuthoring) {
  const registry = JSON.parse(await readFile(target.teacherRegistryPath, "utf8"));
  exactKeys(registry, ["schemaVersion", "activities"], "Teacher Open Response registry");
  if (registry.schemaVersion !== 1 || !registry.activities || typeof registry.activities !== "object" || Array.isArray(registry.activities)) throw new Error("Teacher Open Response registry is invalid.");
  return { schemaVersion: 1, activities: { ...registry.activities, [activityId]: teacherAuthoring } };
}

export function ultimateB2OpenResponseBuilderPlugin({ targets = defaultTargets(), projectActivity = projectUltimateB2PublisherActivity, markFilesystemSynced = markUltimateB2PublisherActivityFilesystemSynced, environment = process.env } = {}) {
  const workspaceRoot = resolveUltimateB2ContentRoot(environment);
  const roots = workspaceRoot ? [repositoryRoot, workspaceRoot] : [repositoryRoot];
  const workspaceRegistryPath = workspaceRoot ? path.join(workspaceRoot, "students-book", "activities", "publisher-created-activities.json") : publisherActivityRegistryPath;
  const workspaceTeacherRegistryPath = workspaceRoot ? path.join(workspaceRoot, "students-book", "teacher-private", "registries", "_ultimate-b2-open-response-model-answers.json") : defaultTeacherRegistryPath;

  function canonicalTarget(activityId, repositoryTarget) {
    if (!workspaceRoot) return repositoryTarget;
    const page = ultimateB2StudentsBookAuthoringPages.find((candidate) => candidate.activities.some((activity) => activity.id === activityId));
    const unitNumber = page?.unitNumber || repositoryTarget.record?.unitNumber || Number(/-u(\d+)-/.exec(activityId)?.[1]);
    const activityRoot = path.join(workspaceRoot, "students-book", "activities", `unit-${String(unitNumber).padStart(2, "0")}`, activityId);
    return {
      ...repositoryTarget,
      publicPath: path.join(activityRoot, "source-private", "authoring", path.basename(repositoryTarget.publicPath)),
      repositoryPublicPath: repositoryTarget.publicPath,
      teacherRegistryPath: workspaceTeacherRegistryPath,
      repositoryTeacherRegistryPath: repositoryTarget.teacherRegistryPath,
      assetDirectory: path.join(activityRoot, "student-runtime", "assets"),
      repositoryAssetDirectory: repositoryTarget.assetDirectory,
      sourcePrivateDirectory: path.join(activityRoot, "source-private", "uploads"),
    };
  }

  function mirroredEntries(target, entries) {
    if (!workspaceRoot) return entries;
    const mirrored = [];
    for (const entry of entries) {
      mirrored.push(entry);
      if (entry.path === target.publicPath) mirrored.push({ ...entry, path: target.repositoryPublicPath });
      else if (entry.path === target.teacherRegistryPath) mirrored.push({ ...entry, path: target.repositoryTeacherRegistryPath });
      else if (entry.path === workspaceRegistryPath) mirrored.push({ ...entry, path: publisherActivityRegistryPath });
      else if (path.dirname(entry.path) === target.assetDirectory) mirrored.push({ ...entry, path: path.join(target.repositoryAssetDirectory, path.basename(entry.path)) });
    }
    return mirrored;
  }
  return {
    name: "hhplms-ultimate-b2-open-response-builder",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url || "/", "http://localhost");
        if (![openResponseAuthoringEndpoint, openResponsePublisherImportEndpoint, openResponseAssetEndpoint].includes(url.pathname)) return next();
        try {
          if (!loopbackAddresses.has(request.socket.remoteAddress || "")) return sendJson(response, 403, { error: "The Open Response authoring endpoint is local-only." });
          const activityId = url.searchParams.get("activityId");
          const repositoryTarget = targets[activityId] || await dynamicTarget(activityId, workspaceRegistryPath);
          const target = repositoryTarget ? canonicalTarget(activityId, repositoryTarget) : null;
          if (!target || (!ULTIMATE_B2_OPEN_RESPONSE_ACTIVITY_IDS.includes(activityId) && !target.record)) return sendJson(response, 404, { error: "Unknown Open Response activity." });
          const publisherRecord = target.record || null;
          if (url.pathname === openResponseAssetEndpoint) {
            if ([...url.searchParams.keys()].some((key) => !["activityId", "file"].includes(key)) || request.method !== "GET") return sendJson(response, 404, { error: "Unknown Open Response asset." });
            const filename = url.searchParams.get("file") || "";
            if (!/^[a-f0-9]{64}\.(?:png|jpg|webp)$/.test(filename)) return sendJson(response, 404, { error: "Unknown Open Response asset." });
            const assetPath = path.join(target.assetDirectory, filename);
            await rejectSymlinkPath(assetPath, roots);
            const bytes = await readFile(assetPath);
            response.statusCode = 200;
            response.setHeader("Content-Type", filename.endsWith(".png") ? "image/png" : filename.endsWith(".webp") ? "image/webp" : "image/jpeg");
            response.setHeader("Cache-Control", "no-store");
            response.end(bytes);
            return;
          }
          if ([...url.searchParams.keys()].some((key) => key !== "activityId")) return sendJson(response, 404, { error: "Unknown Open Response authoring target." });
          if (url.pathname === openResponseAuthoringEndpoint && request.method === "GET") return sendJson(response, 200, await loadTarget(activityId, target));
          if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" });
          if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) return sendJson(response, 415, { error: "Expected an application/json request." });
          const body = await readBody(request);
          if (url.pathname === openResponsePublisherImportEndpoint) {
            exactKeys(body, publisherRecord ? ["activityId", "files", "title"] : ["activityId", "files"], "Publisher import request");
            if (body.activityId !== activityId) throw new Error("Request activity ID does not match the endpoint selection.");
            const decodedFiles = decodeFiles(body.files);
            const imported = await importUltimateB2OpenResponsePublisherBundle({ activityId, files: decodedFiles });
            let projection = null;
            let nextRegistry = null;
            if (publisherRecord) {
              const page = ultimateB2StudentsBookAuthoringPages.find((candidate) => candidate.id === publisherRecord.pageId);
              projection = await projectActivity({ page, authoringKind: "open-response", title: body.title, occupiedActivityIds: target.registry.activities.map((activity) => activity.activityId), questions: imported.publicAuthoring.questions, clientMutationId: `activity:${activityId}`, existingRecord: publisherRecord, filesystemSyncStatus: "pending" });
              nextRegistry = normalizeUltimateB2PublisherActivityRegistry({ schemaVersion: 1, activities: target.registry.activities.map((activity) => activity.activityId === activityId ? projection.record : activity) });
            }
            const assetEntries = imported.assets.map((asset) => {
              const expectedPrefix = `src/assets/books/ultimate-b2/authoring/open-response/${activityId}/`;
              if (!asset.repositoryPath.startsWith(expectedPrefix)) throw new Error("Imported asset path is outside the selected activity directory.");
              const destination = path.join(target.assetDirectory, path.basename(asset.repositoryPath));
              return { path: destination, bytes: asset.bytes };
            });
            const sourceEntries = workspaceRoot ? decodedFiles.map((file) => {
              const safeName = path.basename(file.name).replace(/[^A-Za-z0-9._-]+/g, "-");
              normalizeWorkspaceRelativePath(`uploads/${safeName}`);
              return { path: path.join(target.sourcePrivateDirectory, `${sha256(file.bytes)}-${safeName}`), bytes: file.bytes };
            }) : [];
            await transactionalWrite(mirroredEntries(target, [
              ...sourceEntries,
              ...assetEntries,
              { path: target.publicPath, bytes: jsonBytes(imported.publicAuthoring) },
              { path: target.teacherRegistryPath, bytes: jsonBytes(await updatedTeacherRegistry(target, activityId, imported.teacherAuthoring)) },
              ...(nextRegistry ? [{ path: workspaceRegistryPath, bytes: jsonBytes(nextRegistry) }] : []),
            ]), roots);
            let synchronizationWarning = null;
            if (publisherRecord) {
              try { await markFilesystemSynced({ activityId }); }
              catch (error) { synchronizationWarning = `Authoring was saved, but the database filesystem synchronization marker remains pending: ${error.message}`; }
            }
            const { assets: _assets, ...safeResponse } = imported;
            return sendJson(response, 200, { ...safeResponse, configured: true, record: projection?.record || null, registry: nextRegistry, runtimeFallback: await runtimeFallback(activityId), warning: synchronizationWarning });
          }
          exactKeys(body, publisherRecord ? ["activityId", "publicAuthoring", "teacherAuthoring", "title"] : ["activityId", "publicAuthoring", "teacherAuthoring"], "Open Response authoring request");
          if (body.activityId !== activityId) throw new Error("Request activity ID does not match the endpoint selection.");
          const publicAuthoring = normalizeUltimateB2OpenResponseAuthoring(body.publicAuthoring, activityId);
          const teacherAuthoring = normalizeUltimateB2OpenResponseTeacherAnswers(body.teacherAuthoring, activityId, publicAuthoring.questions.map((question) => question.id));
          let projection = null;
          let nextRegistry = null;
          if (publisherRecord) {
            const page = ultimateB2StudentsBookAuthoringPages.find((candidate) => candidate.id === publisherRecord.pageId);
            projection = await projectActivity({ page, authoringKind: "open-response", title: body.title, occupiedActivityIds: target.registry.activities.map((activity) => activity.activityId), questions: publicAuthoring.questions, clientMutationId: `activity:${activityId}`, existingRecord: publisherRecord, filesystemSyncStatus: "pending" });
            nextRegistry = normalizeUltimateB2PublisherActivityRegistry({ schemaVersion: 1, activities: target.registry.activities.map((activity) => activity.activityId === activityId ? projection.record : activity) });
          }
          await transactionalWrite(mirroredEntries(target, [
            { path: target.publicPath, bytes: jsonBytes(publicAuthoring) },
            { path: target.teacherRegistryPath, bytes: jsonBytes(await updatedTeacherRegistry(target, activityId, teacherAuthoring)) },
            ...(nextRegistry ? [{ path: workspaceRegistryPath, bytes: jsonBytes(nextRegistry) }] : []),
          ]), roots);
          let synchronizationWarning = null;
          if (publisherRecord) {
            try { await markFilesystemSynced({ activityId }); }
            catch (error) { synchronizationWarning = `Authoring was saved, but the database filesystem synchronization marker remains pending: ${error.message}`; }
          }
          return sendJson(response, 200, { activityId, configured: true, publicAuthoring, teacherAuthoring, record: projection?.record || null, registry: nextRegistry, runtimeFallback: await runtimeFallback(activityId), warning: synchronizationWarning });
        } catch (error) {
          return sendJson(response, 400, { error: error.message || "Open Response authoring could not be saved." });
        }
      });
    },
  };
}
