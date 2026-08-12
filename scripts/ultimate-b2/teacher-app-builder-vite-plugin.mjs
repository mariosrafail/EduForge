import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { inspectTeacherAsset } from "../../lib/teacher-project-builder/asset-inspection.js";
import {
  buildUltimateB2TeacherAppAuthoring,
  normalizeUltimateB2TeacherAppOverrides,
  ULTIMATE_B2_TEACHER_APP_ASSET_ENDPOINT,
  ULTIMATE_B2_TEACHER_APP_CONFIG_ENDPOINT,
  ULTIMATE_B2_TEACHER_APP_IMPORT_ENDPOINT,
  ultimateB2TeacherAppDefaultAssets,
} from "../../src/data/ultimate-b2/teacherAppAuthoring.js";
import {
  readAuthoringJson,
  repositoryFileTarget,
  resolveInsideWorkspace,
  resolveUltimateB2ContentRoot,
  sha256,
  writeAuthoringBytes,
  writeAuthoringJson,
} from "./content-workspace.mjs";

const defaultRepositoryRoot = path.resolve(import.meta.dirname, "../..");
const defaultConfigPath = path.join(defaultRepositoryRoot, "src/data/ultimate-b2/authoring/teacherAppAssetOverrides.json");
const defaultAssetRoot = path.join(defaultRepositoryRoot, "src/assets/books/ultimate-b2/authoring/teacher-app");
const loopbackAddresses = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const maximumJsonBytes = 2 * 1024 * 1024;
const maximumUploadBytes = 16 * 1024 * 1024;

function json(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(`${JSON.stringify(payload)}\n`);
}

async function bodyBytes(request, maximumBytes, description) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) throw new Error(`${description} is too large.`);
    chunks.push(chunk);
  }
  if (!size) throw new Error(`${description} is empty.`);
  return Buffer.concat(chunks);
}

async function atomicWrite(outputPath, bytes) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await writeFile(temporaryPath, bytes, { flag: "wx" });
  await rename(temporaryPath, outputPath);
}

function importDescriptor(definition) {
  if (definition.mediaType === "audio/mpeg") return { section: "audio", slot: "library", variant: "sound", index: null };
  if (definition.mediaType === "application/x-gaf") return { section: "animation", slot: "title", variant: "gaf", index: null };
  return { section: "pages", slot: "library", variant: "image", index: null };
}

async function readOverrides(configPath) {
  return normalizeUltimateB2TeacherAppOverrides(JSON.parse(await readFile(configPath, "utf8")));
}

function repositoryRelativeAssetPath(definition, sha256, extension) {
  const directory = definition.role === "navibar-library" ? "library/" : "";
  return `src/assets/books/ultimate-b2/authoring/teacher-app/${directory}${sha256}${extension}`;
}

async function resolveInsideRepository(repositoryRoot, repositoryPath) {
  const root = await realpath(repositoryRoot);
  const candidate = await realpath(path.resolve(root, repositoryPath));
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Teacher App asset escaped the repository.");
  return candidate;
}

async function verifyOverrides(overrides, repositoryRoot) {
  for (const [id, binding] of Object.entries(overrides.assets)) {
    const file = await resolveInsideRepository(repositoryRoot, binding.repositoryPath);
    const bytes = await readFile(file);
    if (bytes.length !== binding.sizeBytes) throw new Error(`Teacher App asset byte size does not match: ${id}`);
    if (createHash("sha256").update(bytes).digest("hex") !== binding.sha256) throw new Error(`Teacher App asset checksum does not match: ${id}`);
  }
}

export function ultimateB2TeacherAppBuilderPlugin({
  repositoryRoot = defaultRepositoryRoot,
  configPath = defaultConfigPath,
  assetRoot = defaultAssetRoot,
  environment = process.env,
} = {}) {
  const workspaceRoot = resolveUltimateB2ContentRoot(environment);
  const configTarget = repositoryFileTarget(configPath, workspaceRoot, "interactive-ui/ui-config.json");
  const workspaceAssetManifestPath = workspaceRoot ? path.join(workspaceRoot, "interactive-ui", "ui-assets.json") : null;
  const pendingWorkspaceAssets = new Map();

  async function readWorkspaceAssetManifest() {
    return workspaceAssetManifestPath ? JSON.parse(await readFile(workspaceAssetManifestPath, "utf8")) : null;
  }

  async function resolveAuthoringAsset(id, binding) {
    if (workspaceRoot) {
      if (binding.role === "page") {
        const match = /^unit\/(\d+)\/parts\/HD\/([^/]+)$/.exec(binding.repositoryPath);
        if (!match) throw new Error(`Canonical workspace page mapping is invalid: ${id}`);
        return resolveInsideWorkspace(workspaceRoot, `students-book/pages/unit-${String(Number(match[1])).padStart(2, "0")}/${match[2]}`);
      }
      const manifest = await readWorkspaceAssetManifest();
      const workspacePath = pendingWorkspaceAssets.get(id) || manifest?.assets?.[id]?.workspacePath;
      if (!workspacePath) throw new Error(`Canonical workspace asset is missing for Teacher App binding: ${id}`);
      return resolveInsideWorkspace(workspaceRoot, workspacePath);
    }
    return resolveInsideRepository(repositoryRoot, binding.repositoryPath);
  }

  return {
    name: "hhplms-ultimate-b2-teacher-app-builder",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url || "/", "http://localhost");
        if (![ULTIMATE_B2_TEACHER_APP_ASSET_ENDPOINT, ULTIMATE_B2_TEACHER_APP_CONFIG_ENDPOINT, ULTIMATE_B2_TEACHER_APP_IMPORT_ENDPOINT].includes(url.pathname)) return next();
        try {
          if (!loopbackAddresses.has(request.socket.remoteAddress || "")) return json(response, 403, { error: "The Ultimate B2 Teacher App authoring endpoint is local-only." });
          const id = url.searchParams.get("id") || "";
          if (url.pathname === ULTIMATE_B2_TEACHER_APP_ASSET_ENDPOINT) {
            if (request.method !== "GET") return json(response, 405, { error: "Method not allowed" });
            if ([...url.searchParams.keys()].some((key) => !["id", "v"].includes(key))) return json(response, 400, { error: "Unknown asset query field." });
            const model = buildUltimateB2TeacherAppAuthoring(normalizeUltimateB2TeacherAppOverrides(await readAuthoringJson(configTarget)));
            const binding = model.assets[id];
            if (!binding) return json(response, 404, { error: "Unknown Ultimate B2 Teacher App asset." });
            const file = await resolveAuthoringAsset(id, binding);
            const bytes = await readFile(file);
            response.statusCode = 200;
            response.setHeader("Content-Type", binding.mediaType);
            response.setHeader("Content-Length", String(bytes.length));
            response.setHeader("Cache-Control", "no-store");
            response.setHeader("X-Content-Type-Options", "nosniff");
            response.end(bytes);
            return;
          }
          if (url.pathname === ULTIMATE_B2_TEACHER_APP_IMPORT_ENDPOINT) {
            if (request.method !== "POST") return json(response, 405, { error: "Method not allowed" });
            if ([...url.searchParams.keys()].some((key) => key !== "id")) return json(response, 400, { error: "Unknown import query field." });
            const definition = ultimateB2TeacherAppDefaultAssets[id];
            if (!definition) return json(response, 404, { error: "Unknown Ultimate B2 Teacher App asset binding." });
            const declaredType = String(request.headers["content-type"] || "").toLowerCase().split(";", 1)[0].trim();
            const acceptedTypes = definition.mediaType === "audio/mpeg" ? new Set(["audio/mpeg", "audio/wav"])
              : definition.mediaType === "application/x-gaf" ? new Set(["application/octet-stream", "application/x-gaf"])
                : new Set(["image/png", "image/jpeg", "image/webp"]);
            if (!acceptedTypes.has(declaredType)) return json(response, 415, { error: "Choose a supported PNG, JPEG, WebP, MP3, WAV or GAF asset for this slot." });
            const bytes = await bodyBytes(request, maximumUploadBytes, "Teacher App asset");
            const originalFilename = decodeURIComponent(String(request.headers["x-original-filename"] || "upload"));
            const inspected = await inspectTeacherAsset({ bytes, originalFilename, descriptor: importDescriptor(definition) });
            if (declaredType !== "application/octet-stream" && declaredType !== inspected.metadata.mediaType) throw new Error("Asset bytes do not match the declared media type.");
            if (definition.role === "animation-atlas" && inspected.metadata.mediaType !== "image/png") throw new Error("GAF title atlases must remain PNG images.");
            const repositoryPath = repositoryRelativeAssetPath(definition, inspected.metadata.sha256, inspected.inspection.extension);
            const outputPath = path.resolve(repositoryRoot, repositoryPath);
            const expectedDirectory = path.resolve(assetRoot, definition.role === "navibar-library" ? "library" : ".");
            if (path.dirname(outputPath) !== expectedDirectory) throw new Error("Teacher App import target escaped its controlled asset directory.");
            const workspaceRelativePath = `interactive-ui/authored-replacements/${definition.role === "navibar-library" ? "library/" : ""}${id.replace(/[^A-Za-z0-9.-]+/g, "-")}-${inspected.metadata.sha256}${inspected.inspection.extension}`;
            const assetTarget = repositoryFileTarget(outputPath, workspaceRoot, workspaceRelativePath);
            const canonicalExists = await stat(assetTarget.canonicalPath).then(() => true, () => false);
            const projectionExists = await stat(outputPath).then(() => true, () => false);
            if (!canonicalExists || !projectionExists) await writeAuthoringBytes(assetTarget, inspected.bytes, { workspaceRoot, operation: `teacher-app-asset-import:${id}` });
            pendingWorkspaceAssets.set(id, workspaceRelativePath);
            const override = {
              repositoryPath,
              mediaType: inspected.metadata.mediaType,
              sha256: inspected.metadata.sha256,
              sizeBytes: inspected.metadata.sizeBytes,
              width: inspected.metadata.width,
              height: inspected.metadata.height,
              originalFilename: inspected.metadata.originalFilename,
            };
            normalizeUltimateB2TeacherAppOverrides({ schemaVersion: "1.0", packageId: "ultimate-b2-students-book", assets: { [id]: override } });
            return json(response, 200, { id, override });
          }
          if (request.method === "GET") {
            const overrides = normalizeUltimateB2TeacherAppOverrides(await readAuthoringJson(configTarget));
            return json(response, 200, { overrides, model: buildUltimateB2TeacherAppAuthoring(overrides) });
          }
          if (request.method !== "POST") return json(response, 405, { error: "Method not allowed" });
          if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) return json(response, 415, { error: "Expected an application/json request." });
          const candidate = JSON.parse((await bodyBytes(request, maximumJsonBytes, "Teacher App authoring manifest")).toString("utf8"));
          const overrides = normalizeUltimateB2TeacherAppOverrides(candidate);
          await verifyOverrides(overrides, repositoryRoot);
          if (workspaceRoot) {
            const manifest = await readWorkspaceAssetManifest();
            for (const [assetId, workspacePath] of pendingWorkspaceAssets) {
              const bytes = await readFile(await resolveInsideWorkspace(workspaceRoot, workspacePath));
              const binding = buildUltimateB2TeacherAppAuthoring(overrides).assets[assetId];
              manifest.assets[assetId] = { workspacePath, repositoryPath: binding.repositoryPath, mediaType: binding.mediaType, sha256: sha256(bytes), sizeBytes: bytes.length };
            }
            await writeAuthoringJson(workspaceAssetManifestPath, manifest, { operation: "teacher-app-ui-manifest-save" });
          }
          await writeAuthoringJson(configTarget, overrides, { workspaceRoot, operation: "teacher-app-config-save" });
          pendingWorkspaceAssets.clear();
          return json(response, 200, { overrides, model: buildUltimateB2TeacherAppAuthoring(overrides) });
        } catch (error) {
          return json(response, error?.statusCode || 400, { error: error.message || error.code || "Ultimate B2 Teacher App authoring failed." });
        }
      });
    },
  };
}
