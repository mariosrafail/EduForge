import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

import { normalizeUltimateB2ImageAuthoring } from "../../src/data/ultimate-b2/imageAuthoringSchema.js";
import { normalizeUltimateB2PublisherActivityRegistry } from "../../src/data/ultimate-b2/publisherCreatedActivities.js";
import { ultimateB2StudentsBookAuthoringPages } from "../../src/data/ultimate-b2/studentsBookAuthoringCatalog.js";
import { markUltimateB2PublisherActivityFilesystemSynced, projectUltimateB2PublisherActivity } from "./publisher-activity-projection.mjs";
import { normalizeUltimateB2PublisherImage, transactionalPublisherAuthoringWrite } from "./publisher-activity-builder-vite-plugin.mjs";
import { resolveUltimateB2ContentRoot, sha256 } from "./content-workspace.mjs";

export const imageAuthoringEndpoint = "/__hhplms/ultimate-b2-image-authoring";
export const imageAssetEndpoint = "/__hhplms/ultimate-b2-image-asset";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const registryPath = path.join(repositoryRoot, "src/data/ultimate-b2/authoring/publisher-created-activities.json");
const loopbackAddresses = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const jsonLimit = 256_000;
const imageLimit = 12 * 1024 * 1024;

function json(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(`${JSON.stringify(payload)}\n`);
}

async function registry(sourcePath = registryPath) {
  return normalizeUltimateB2PublisherActivityRegistry(JSON.parse(await readFile(sourcePath, "utf8")));
}

async function body(request, maximum) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximum) throw new Error("Image authoring request is too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function authoringPath(activityId) {
  return path.join(repositoryRoot, `src/data/ultimate-b2/authoring/publisher-created/${activityId}.image.json`);
}

function activityAssetDirectory(activityId) {
  return path.join(repositoryRoot, `src/assets/books/ultimate-b2/authoring/image/${activityId}`);
}

export function ultimateB2ImageBuilderPlugin({ projectActivity = projectUltimateB2PublisherActivity, markFilesystemSynced = markUltimateB2PublisherActivityFilesystemSynced, environment = process.env } = {}) {
  const workspaceRoot = resolveUltimateB2ContentRoot(environment);
  const roots = workspaceRoot ? [repositoryRoot, workspaceRoot] : [repositoryRoot];
  const canonicalRegistryPath = workspaceRoot ? path.join(workspaceRoot, "students-book", "activities", "publisher-created-activities.json") : registryPath;
  const workspaceActivityRoot = (record) => workspaceRoot && path.join(workspaceRoot, "students-book", "activities", `unit-${String(record.unitNumber).padStart(2, "0")}`, record.activityId);
  const canonicalAuthoringPath = (record) => workspaceRoot ? path.join(workspaceActivityRoot(record), "source-private", "authoring", path.basename(authoringPath(record.activityId))) : authoringPath(record.activityId);
  const canonicalAssetDirectory = (record) => workspaceRoot ? path.join(workspaceActivityRoot(record), "student-runtime", "assets") : activityAssetDirectory(record.activityId);
  return {
    name: "hhplms-ultimate-b2-image-builder",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url || "/", "http://localhost");
        if (![imageAuthoringEndpoint, imageAssetEndpoint].includes(url.pathname)) return next();
        try {
          if (!loopbackAddresses.has(request.socket.remoteAddress || "")) return json(response, 403, { error: "The Image authoring endpoint is local-only." });
          if ([...url.searchParams.keys()].some((key) => !["activityId", "file"].includes(key))) return json(response, 404, { error: "Unknown Image authoring target." });
          const activityId = url.searchParams.get("activityId") || "";
          const currentRegistry = await registry(canonicalRegistryPath);
          const record = currentRegistry.activities.find((activity) => activity.activityId === activityId && activity.authoringKind === "image");
          if (!record) return json(response, 404, { error: "Unknown trusted Image activity." });
          const page = ultimateB2StudentsBookAuthoringPages.find((candidate) => candidate.id === record.pageId);
          if (!page) throw new Error("Image activity references an unknown canonical page.");
          if (url.pathname === imageAssetEndpoint && request.method === "GET") {
            const filename = url.searchParams.get("file") || "";
            if (!/^[a-f0-9]{64}\.webp$/.test(filename)) return json(response, 404, { error: "Unknown Image asset." });
            const target = path.join(canonicalAssetDirectory(record), filename);
            const stats = await lstat(target);
            if (stats.isSymbolicLink()) throw new Error("Managed Image asset must not be a symlink.");
            response.statusCode = 200; response.setHeader("Content-Type", "image/webp"); response.setHeader("Cache-Control", "no-store"); response.end(await readFile(target)); return;
          }
          if (url.pathname === imageAssetEndpoint) {
            if (request.method !== "POST") return json(response, 405, { error: "Method not allowed" });
            const contentType = String(request.headers["content-type"] || "").toLowerCase().split(";", 1)[0].trim();
            const uploadedBytes = await body(request, imageLimit);
            const raster = await normalizeUltimateB2PublisherImage(uploadedBytes, contentType);
            const repositoryTarget = path.join(activityAssetDirectory(activityId), `${raster.sha256}.webp`);
            const entries = [{ path: repositoryTarget, bytes: raster.bytes }];
            if (workspaceRoot) {
              const extension = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" }[contentType];
              entries.unshift(
                { path: path.join(workspaceActivityRoot(record), "source-private", "uploads", `${sha256(uploadedBytes)}${extension}`), bytes: uploadedBytes },
                { path: path.join(canonicalAssetDirectory(record), `${raster.sha256}.webp`), bytes: raster.bytes },
              );
            }
            await transactionalPublisherAuthoringWrite(entries, { roots });
            return json(response, 200, { activityId, mainImage: { binding: `image.${activityId}.main.${raster.sha256.slice(0, 12)}`, repositoryPath: `src/assets/books/ultimate-b2/authoring/image/${activityId}/${raster.sha256}.webp`, sha256: raster.sha256, mimeType: "image/webp", naturalSize: { width: raster.width, height: raster.height } } });
          }
          if (url.searchParams.has("file")) return json(response, 404, { error: "Unknown Image authoring target." });
          if (request.method === "GET") return json(response, 200, { activityId, record, publicAuthoring: normalizeUltimateB2ImageAuthoring(JSON.parse(await readFile(canonicalAuthoringPath(record), "utf8")), activityId) });
          if (request.method !== "POST") return json(response, 405, { error: "Method not allowed" });
          if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) return json(response, 415, { error: "Expected an application/json request." });
          const input = JSON.parse((await body(request, jsonLimit)).toString("utf8"));
          if (!input || Object.keys(input).sort().join(",") !== "activityId,publicAuthoring,title" || input.activityId !== activityId) throw new Error("Image authoring request has missing or unknown fields.");
          const publicAuthoring = normalizeUltimateB2ImageAuthoring(input.publicAuthoring, activityId);
          const updatedRecord = { ...record, title: input.title };
          const projection = await projectActivity({ page, authoringKind: "image", title: input.title, occupiedActivityIds: currentRegistry.activities.map((activity) => activity.activityId), questions: [], clientMutationId: `activity:${activityId}`, existingRecord: updatedRecord, filesystemSyncStatus: "pending" });
          const nextRegistry = normalizeUltimateB2PublisherActivityRegistry({ schemaVersion: 1, activities: currentRegistry.activities.map((activity) => activity.activityId === activityId ? projection.record : activity) });
          const entries = [
            { path: authoringPath(activityId), bytes: Buffer.from(`${JSON.stringify(publicAuthoring, null, 2)}\n`) },
            { path: registryPath, bytes: Buffer.from(`${JSON.stringify(nextRegistry, null, 2)}\n`) },
          ];
          if (workspaceRoot) entries.unshift(
            { path: canonicalAuthoringPath(record), bytes: Buffer.from(`${JSON.stringify(publicAuthoring, null, 2)}\n`) },
            { path: canonicalRegistryPath, bytes: Buffer.from(`${JSON.stringify(nextRegistry, null, 2)}\n`) },
          );
          await transactionalPublisherAuthoringWrite(entries, { roots });
          let synchronizationWarning = null;
          try { await markFilesystemSynced({ activityId }); }
          catch (error) { synchronizationWarning = `Authoring was saved, but the database filesystem synchronization marker remains pending: ${error.message}`; }
          return json(response, 200, { activityId, record: projection.record, publicAuthoring, registry: nextRegistry, database: { projected: true, target: projection.databaseTarget, filesystemSyncStatus: synchronizationWarning ? "pending" : "synced" }, warning: synchronizationWarning });
        } catch (error) {
          return json(response, 400, { error: error.message || "Image authoring could not be saved." });
        }
      });
    },
  };
}
