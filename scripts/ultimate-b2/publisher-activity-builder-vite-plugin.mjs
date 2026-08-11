import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import {
  createUltimateB2PublisherActivityRecord,
  nextUltimateB2PublisherActivityId,
  normalizeUltimateB2PublisherActivityRegistry,
  ULTIMATE_B2_PUBLISHER_ACTIVITY_KINDS,
} from "../../src/data/ultimate-b2/publisherCreatedActivities.js";
import { ultimateB2StudentsBookAuthoringActivities, ultimateB2StudentsBookAuthoringPages } from "../../src/data/ultimate-b2/studentsBookAuthoringCatalog.js";
import { normalizeUltimateB2ImageAuthoring } from "../../src/data/ultimate-b2/imageAuthoringSchema.js";
import { importUltimateB2OpenResponsePublisherBundle } from "./open-response-publisher-importer.mjs";
import { markUltimateB2PublisherActivityFilesystemSynced, projectUltimateB2PublisherActivity } from "./publisher-activity-projection.mjs";

export const publisherActivityEndpoint = "/__hhplms/ultimate-b2-publisher-activities";
export const publisherActivityCreateEndpoint = "/__hhplms/ultimate-b2-publisher-activities/create";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const registryPath = path.join(repositoryRoot, "src/data/ultimate-b2/authoring/publisher-created-activities.json");
const teacherRegistryPath = path.join(repositoryRoot, "netlify/functions/_ultimate-b2-open-response-model-answers.json");
const loopbackAddresses = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const requestLimit = 90 * 1024 * 1024;
const imageLimit = 12 * 1024 * 1024;
const activityIdPattern = /^ultimate-b2-sb-u[1-9]\d*-p[1-9]\d*-o[1-9]\d*$/;
const mutationPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

function json(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(`${JSON.stringify(payload)}\n`);
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const keys = Object.keys(value);
  if (keys.some((key) => !allowed.includes(key)) || allowed.some((key) => !keys.includes(key))) throw new Error(`${label} has missing or unknown fields.`);
}

async function requestBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > requestLimit) throw new Error("Publisher activity creation request is too large.");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("Publisher activity creation request must be valid JSON."); }
}

function canonicalBase64(value, label) {
  if (typeof value !== "string" || !value || value.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error(`${label} is not canonical Base64.`);
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) throw new Error(`${label} is not canonical Base64.`);
  return bytes;
}

function decodePublisherFiles(files) {
  if (!Array.isArray(files)) throw new Error("Open Response source files must be an array.");
  return files.map((file, index) => {
    exactKeys(file, ["name", "type", "base64"], `files[${index}]`);
    return { name: file.name, bytes: canonicalBase64(file.base64, `files[${index}].base64`) };
  });
}

async function loadRegistry() {
  return normalizeUltimateB2PublisherActivityRegistry(JSON.parse(await readFile(registryPath, "utf8")));
}

function publicAuthoringPath(record) {
  const extension = record.authoringKind === "image" ? "image" : "open-response";
  return path.join(repositoryRoot, `src/data/ultimate-b2/authoring/publisher-created/${record.activityId}.${extension}.json`);
}

function withinRepository(candidate) {
  const resolved = path.resolve(candidate);
  const relative = path.relative(repositoryRoot, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Managed publisher authoring target is outside the repository.");
  return resolved;
}

async function rejectSymlinks(candidate) {
  let cursor = path.dirname(candidate);
  while (cursor.startsWith(repositoryRoot) && cursor !== repositoryRoot) {
    const stats = await lstat(cursor).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
    if (stats?.isSymbolicLink()) throw new Error("Managed publisher authoring path contains a symlink.");
    cursor = path.dirname(cursor);
  }
  const target = await lstat(candidate).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
  if (target?.isSymbolicLink()) throw new Error("Managed publisher authoring target must not be a symlink.");
}

export async function transactionalPublisherAuthoringWrite(entries) {
  const token = `${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`;
  const prepared = [];
  try {
    for (const entry of entries) {
      const target = withinRepository(entry.path);
      await rejectSymlinks(target);
      await mkdir(path.dirname(target), { recursive: true });
      const temporary = `${target}.${token}.tmp`;
      const backup = `${target}.${token}.bak`;
      await writeFile(temporary, entry.bytes, { flag: "wx" });
      prepared.push({ target, temporary, backup, hadOriginal: Boolean(await lstat(target).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error))), committed: false });
    }
    for (const entry of prepared) {
      if (entry.hadOriginal) await rename(entry.target, entry.backup);
      try { await rename(entry.temporary, entry.target); entry.committed = true; }
      catch (error) { if (entry.hadOriginal) await rename(entry.backup, entry.target); throw error; }
    }
    await Promise.all(prepared.filter((entry) => entry.hadOriginal).map((entry) => rm(entry.backup, { force: true }).catch(() => undefined)));
  } catch (error) {
    for (const entry of [...prepared].reverse()) {
      if (entry.committed) await rm(entry.target, { force: true }).catch(() => undefined);
      if (entry.hadOriginal && await lstat(entry.backup).catch(() => null)) await rename(entry.backup, entry.target).catch(() => undefined);
      await rm(entry.temporary, { force: true }).catch(() => undefined);
    }
    throw error;
  }
}

export async function normalizeUltimateB2PublisherImage(bytes, declaredType) {
  if (bytes.length > imageLimit) throw new Error("Image file is larger than 12 MB.");
  const expected = { "image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp" }[declaredType];
  if (!expected) throw new Error("Choose a PNG, JPEG or WebP image.");
  const metadata = await sharp(bytes, { failOn: "warning", limitInputPixels: 40_000_000 }).metadata();
  if (metadata.format !== expected || (metadata.pages || 1) !== 1) throw new Error("Image bytes do not match the declared single-frame raster type.");
  const output = await sharp(bytes, { failOn: "warning", limitInputPixels: 40_000_000 }).rotate().webp({ quality: 92, effort: 6 }).toBuffer({ resolveWithObject: true });
  if (![output.info.width, output.info.height].every((dimension) => Number.isSafeInteger(dimension) && dimension >= 16 && dimension <= 8192)) throw new Error("Image dimensions must be between 16 and 8192 pixels.");
  const sha256 = createHash("sha256").update(output.data).digest("hex");
  return { bytes: output.data, sha256, width: output.info.width, height: output.info.height };
}

function validateDraft(value, pages, registry) {
  exactKeys(value, ["pageId", "authoringKind", "title", "clientMutationId", "predictedActivityId"], "Publisher activity draft");
  const page = pages.find((candidate) => candidate.id === value.pageId);
  if (!page) throw new Error("Publisher activity draft references an unknown canonical page.");
  if (!ULTIMATE_B2_PUBLISHER_ACTIVITY_KINDS.includes(value.authoringKind)) throw new Error("Only Image and Open Response publisher activities can be created.");
  if (typeof value.title !== "string" || !value.title.trim() || value.title.length > 300 || /[<>]/.test(value.title)) throw new Error("Publisher activity title is invalid.");
  if (!mutationPattern.test(value.clientMutationId)) throw new Error("Publisher activity mutation identity is invalid.");
  const occupied = [...ultimateB2StudentsBookAuthoringActivities.map((activity) => activity.activityKey), ...registry.activities.map((activity) => activity.activityId)];
  const predicted = nextUltimateB2PublisherActivityId(page, occupied);
  if (value.predictedActivityId !== predicted || !activityIdPattern.test(value.predictedActivityId)) throw new Error("Publisher activity draft identity is stale or conflicts with the canonical catalog.");
  return { page, occupied, title: value.title.trim(), authoringKind: value.authoringKind, clientMutationId: value.clientMutationId };
}

function jsonBytes(value) { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"); }

export function ultimateB2PublisherActivityBuilderPlugin({
  projectActivity = projectUltimateB2PublisherActivity,
  markFilesystemSynced = markUltimateB2PublisherActivityFilesystemSynced,
} = {}) {
  return {
    name: "hhplms-ultimate-b2-publisher-activity-builder",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url || "/", "http://localhost");
        if (![publisherActivityEndpoint, publisherActivityCreateEndpoint].includes(url.pathname)) return next();
        try {
          if (!loopbackAddresses.has(request.socket.remoteAddress || "")) return json(response, 403, { error: "The publisher activity authoring endpoint is local-only." });
          if (url.search) return json(response, 404, { error: "Unknown publisher activity authoring target." });
          if (url.pathname === publisherActivityEndpoint) {
            if (request.method !== "GET") return json(response, 405, { error: "Method not allowed" });
            const registry = await loadRegistry();
            return json(response, 200, { ...registry, databaseAuthoringConfigured: ["test", "staging"].includes(process.env.ULTIMATE_B2_PUBLISHER_AUTHORING_DB_MODE) });
          }
          if (request.method !== "POST") return json(response, 405, { error: "Method not allowed" });
          if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) return json(response, 415, { error: "Expected an application/json request." });
          const body = await requestBody(request);
          exactKeys(body, ["draft", "source"], "Publisher activity creation request");
          const registry = await loadRegistry();
          const draft = validateDraft(body.draft, ultimateB2StudentsBookAuthoringPages, registry);
          let prepared;
          if (draft.authoringKind === "image") {
            exactKeys(body.source, ["type", "base64", "mainImageAlt"], "Image creation source");
            const raster = await normalizeUltimateB2PublisherImage(canonicalBase64(body.source.base64, "source.base64"), body.source.type);
            prepared = { raster, questions: [] };
          } else {
            exactKeys(body.source, ["files"], "Open Response creation source");
            const files = decodePublisherFiles(body.source.files);
            const provisional = await importUltimateB2OpenResponsePublisherBundle({ activityId: body.draft.predictedActivityId, files, allowUnregisteredDraft: true });
            prepared = { files, provisional, questions: provisional.publicAuthoring.questions };
          }
          const projection = await projectActivity({ page: draft.page, authoringKind: draft.authoringKind, title: draft.title, occupiedActivityIds: draft.occupied, questions: prepared.questions, clientMutationId: draft.clientMutationId, filesystemSyncStatus: "pending" });
          const { record } = projection;
          let publicAuthoring;
          let teacherAuthoring = null;
          const entries = [];
          if (record.authoringKind === "image") {
            const assetPath = `src/assets/books/ultimate-b2/authoring/image/${record.activityId}/${prepared.raster.sha256}.webp`;
            publicAuthoring = normalizeUltimateB2ImageAuthoring({
              schemaVersion: 2,
              activityId: record.activityId,
              visualCapabilities: { instructionImage: null, showText: { enabled: false, showTextImage: null } },
              instructionImageAlt: "",
              mainImage: { binding: `image.${record.activityId}.main.${prepared.raster.sha256.slice(0, 12)}`, repositoryPath: assetPath, sha256: prepared.raster.sha256, mimeType: "image/webp", naturalSize: { width: prepared.raster.width, height: prepared.raster.height } },
              mainImageAlt: body.source.mainImageAlt || record.title,
            }, record.activityId);
            entries.push({ path: path.join(repositoryRoot, ...assetPath.split("/")), bytes: prepared.raster.bytes });
          } else {
            const imported = record.activityId === body.draft.predictedActivityId
              ? prepared.provisional
              : await importUltimateB2OpenResponsePublisherBundle({ activityId: record.activityId, files: prepared.files, allowUnregisteredDraft: true });
            publicAuthoring = imported.publicAuthoring;
            teacherAuthoring = imported.teacherAuthoring;
            entries.push(...imported.assets.map((asset) => ({ path: path.join(repositoryRoot, ...asset.repositoryPath.split("/")), bytes: asset.bytes })));
            const teacherRegistry = JSON.parse(await readFile(teacherRegistryPath, "utf8"));
            teacherRegistry.activities = { ...teacherRegistry.activities, [record.activityId]: teacherAuthoring };
            entries.push({ path: teacherRegistryPath, bytes: jsonBytes(teacherRegistry) });
          }
          const latestRegistry = await loadRegistry();
          const collision = latestRegistry.activities.find((activity) => activity.activityId === record.activityId);
          if (collision && JSON.stringify(collision) !== JSON.stringify(record)) throw new Error("Publisher activity identity was claimed by another authoring operation.");
          const nextRegistry = normalizeUltimateB2PublisherActivityRegistry({ schemaVersion: 1, activities: collision ? latestRegistry.activities : [...latestRegistry.activities, record] });
          entries.push({ path: publicAuthoringPath(record), bytes: jsonBytes(publicAuthoring) }, { path: registryPath, bytes: jsonBytes(nextRegistry) });
          await transactionalPublisherAuthoringWrite(entries);
          let synchronizationWarning = null;
          try { await markFilesystemSynced({ activityId: record.activityId }); }
          catch (error) { synchronizationWarning = `Authoring was saved, but the database filesystem synchronization marker remains pending: ${error.message}`; }
          return json(response, 200, { record, registry: nextRegistry, publicAuthoring, teacherAuthoring, report: prepared.provisional?.report || null, database: { projected: true, target: projection.databaseTarget, filesystemSyncStatus: synchronizationWarning ? "pending" : "synced" }, warning: synchronizationWarning });
        } catch (error) {
          return json(response, 400, { error: error.message || "Publisher activity could not be created." });
        }
      });
    },
  };
}
