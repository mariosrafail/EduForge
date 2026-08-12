import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const ULTIMATE_B2_CONTENT_ROOT_ENV = "ULTIMATE_B2_CONTENT_ROOT";
export const ULTIMATE_B2_WORKSPACE_SCHEMA_VERSION = "1.0";

const forbiddenStudentKeys = new Set([
  "acceptedanswers",
  "answer",
  "answers",
  "correctanswer",
  "correctanswers",
  "correctoptionid",
  "correctoptionids",
  "modelanswer",
  "modelanswers",
  "teachersolution",
  "teachersolutions",
  "answerkey",
  "revealedword",
  "revealtext",
  "iwbsha256",
  "decodedsha256",
  "teachersolutionstate",
  "source",
]);

function isWindowsAbsolute(value) {
  return /^[A-Za-z]:[\\/]/.test(value);
}

export function normalizeWorkspaceRelativePath(value, label = "Workspace path") {
  const normalized = String(value || "").replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || isWindowsAbsolute(normalized) || normalized.startsWith("//")) {
    throw new Error(`${label} must be a non-empty workspace-relative path.`);
  }
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) throw new Error(`${label} contains an unsafe path segment.`);
  return parts.join("/");
}

export function resolveUltimateB2ContentRoot(environment = process.env, { required = false } = {}) {
  const configured = String(environment?.[ULTIMATE_B2_CONTENT_ROOT_ENV] || "").trim();
  if (!configured) {
    if (required) throw new Error(`${ULTIMATE_B2_CONTENT_ROOT_ENV} is required for this operation.`);
    return null;
  }
  if (!path.isAbsolute(configured) || configured.startsWith("\\\\") || configured.startsWith("//")) {
    throw new Error(`${ULTIMATE_B2_CONTENT_ROOT_ENV} must be an absolute local path and must not be a UNC path.`);
  }
  const resolved = path.resolve(configured);
  const parsed = path.parse(resolved);
  if (resolved === parsed.root) throw new Error(`${ULTIMATE_B2_CONTENT_ROOT_ENV} must not be a filesystem root.`);
  return resolved;
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function nearestExistingAncestor(candidate) {
  let cursor = candidate;
  while (true) {
    try {
      await lstat(cursor);
      return cursor;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) throw error;
      cursor = parent;
    }
  }
}

export async function resolveInsideWorkspace(root, relativePath, { allowMissing = false } = {}) {
  const normalized = normalizeWorkspaceRelativePath(relativePath);
  const absoluteRoot = path.resolve(root);
  const candidate = path.resolve(absoluteRoot, ...normalized.split("/"));
  if (!isInside(absoluteRoot, candidate)) throw new Error("Workspace path escaped the configured content root.");

  const existingRoot = await realpath(absoluteRoot).catch((error) => {
    if (allowMissing && error?.code === "ENOENT") return absoluteRoot;
    throw error;
  });
  const ancestor = await nearestExistingAncestor(candidate).catch((error) => {
    if (allowMissing && error?.code === "ENOENT") return absoluteRoot;
    throw error;
  });
  const realAncestor = await realpath(ancestor).catch(() => ancestor);
  if (realAncestor !== existingRoot && !isInside(existingRoot, realAncestor)) throw new Error("Workspace path traversed a symlink outside the configured content root.");
  return candidate;
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function studentPrivateFieldFindings(value, location = "$") {
  const findings = [];
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findings.push(...studentPrivateFieldFindings(entry, `${location}[${index}]`)));
    return findings;
  }
  if (!value || typeof value !== "object") return findings;
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
    if (forbiddenStudentKeys.has(normalized)) findings.push(`${location}.${key}`);
    if (normalized === "iscorrect" && typeof child === "boolean") findings.push(`${location}.${key}`);
    findings.push(...studentPrivateFieldFindings(child, `${location}.${key}`));
  }
  return findings;
}

export function assertStudentSafe(value, label = "Student runtime") {
  const findings = studentPrivateFieldFindings(value);
  if (findings.length) throw new Error(`${label} contains private solution fields: ${findings.slice(0, 8).join(", ")}`);
  return value;
}

export function repositoryFileTarget(repositoryPath, workspaceRoot, workspaceRelativePath) {
  if (!workspaceRoot) return Object.freeze({ canonicalPath: repositoryPath, projectionPath: null, workspaceRelativePath: null });
  return Object.freeze({
    canonicalPath: path.resolve(workspaceRoot, ...normalizeWorkspaceRelativePath(workspaceRelativePath).split("/")),
    projectionPath: path.resolve(repositoryPath),
    workspaceRelativePath: normalizeWorkspaceRelativePath(workspaceRelativePath),
  });
}

export function normalizeAuthoringTarget(target) {
  if (typeof target === "string") return { canonicalPath: target, projectionPath: null, workspaceRelativePath: null };
  if (!target?.canonicalPath) throw new Error("Authoring target is invalid.");
  return target;
}

export async function readAuthoringBytes(target) {
  return readFile(normalizeAuthoringTarget(target).canonicalPath);
}

export async function readAuthoringJson(target) {
  return JSON.parse(await readFile(normalizeAuthoringTarget(target).canonicalPath, "utf8"));
}

async function stageFile(outputPath, bytes) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, bytes, { flag: "wx" });
  return temporaryPath;
}

async function writeRecoveryRecord(workspaceRoot, record) {
  if (!workspaceRoot) return;
  const directory = path.join(workspaceRoot, "00-manifest", "pending-projections");
  await mkdir(directory, { recursive: true });
  const outputPath = path.join(directory, `${Date.now()}-${randomUUID()}.json`);
  await writeFile(outputPath, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}

export async function writeAuthoringBytes(target, bytes, { workspaceRoot = null, operation = "authoring-save" } = {}) {
  const normalized = normalizeAuthoringTarget(target);
  const payload = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (!normalized.projectionPath || normalized.projectionPath === normalized.canonicalPath) {
    const temporary = await stageFile(normalized.canonicalPath, payload);
    await rename(temporary, normalized.canonicalPath);
    return { canonicalWritten: true, projectionWritten: false, sha256: sha256(payload), sizeBytes: payload.length };
  }

  const canonicalTemporary = await stageFile(normalized.canonicalPath, payload);
  const projectionTemporary = await stageFile(normalized.projectionPath, payload);
  await rename(canonicalTemporary, normalized.canonicalPath);
  try {
    await rename(projectionTemporary, normalized.projectionPath);
  } catch (error) {
    await rm(projectionTemporary, { force: true }).catch(() => undefined);
    await writeRecoveryRecord(workspaceRoot, {
      schemaVersion: ULTIMATE_B2_WORKSPACE_SCHEMA_VERSION,
      operation,
      workspaceRelativePath: normalized.workspaceRelativePath,
      projectionPath: normalized.projectionPath,
      sha256: sha256(payload),
      sizeBytes: payload.length,
      state: "canonical-written-projection-pending",
      error: String(error?.message || error),
    });
    throw new Error(`Canonical workspace write succeeded but repository projection failed; a recovery record was created. ${error.message}`);
  }
  return { canonicalWritten: true, projectionWritten: true, sha256: sha256(payload), sizeBytes: payload.length };
}

export async function writeAuthoringJson(target, value, options = {}) {
  return writeAuthoringBytes(target, Buffer.from(`${JSON.stringify(value, null, 2)}\n`), options);
}

export async function copyFileIfMissingOrIdentical(sourcePath, destinationPath) {
  const source = await readFile(sourcePath);
  const existing = await readFile(destinationPath).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (existing) {
    if (sha256(existing) !== sha256(source)) throw new Error(`Refusing to overwrite different workspace content: ${destinationPath}`);
    return { copied: false, sizeBytes: source.length, sha256: sha256(source) };
  }
  const temporary = await stageFile(destinationPath, source);
  try {
    await rename(temporary, destinationPath);
  } catch (error) {
    const concurrent = await readFile(destinationPath).catch(() => null);
    if (!concurrent || sha256(concurrent) !== sha256(source)) throw error;
    await rm(temporary, { force: true });
  }
  return { copied: true, sizeBytes: source.length, sha256: sha256(source) };
}

export async function fileRecord(absolutePath, workspaceRoot, extra = {}) {
  const bytes = await readFile(absolutePath);
  return {
    workspacePath: path.relative(workspaceRoot, absolutePath).replaceAll("\\", "/"),
    sha256: sha256(bytes),
    sizeBytes: bytes.length,
    ...extra,
  };
}

export async function verifyFileRecord(workspaceRoot, record) {
  const file = await resolveInsideWorkspace(workspaceRoot, record.workspacePath);
  const metadata = await stat(file);
  if (!metadata.isFile()) throw new Error(`Workspace record is not a file: ${record.workspacePath}`);
  const bytes = await readFile(file);
  if (bytes.length !== record.sizeBytes || sha256(bytes) !== record.sha256) throw new Error(`Workspace checksum mismatch: ${record.workspacePath}`);
  return true;
}
