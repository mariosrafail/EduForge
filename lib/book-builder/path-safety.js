import fs from "node:fs/promises";
import path from "node:path";

export function portablePath(value) {
  return String(value || ".").replaceAll("\\", "/").replace(/^\.\//, "") || ".";
}

export function isPathWithin(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function assertSafeId(value, label = "ID") {
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(String(value || ""))) throw new Error(`${label} must be a safe identifier`);
  return String(value);
}

export async function assertNoSymlinkPath(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (!isPathWithin(resolvedRoot, resolvedTarget)) throw new Error("Path escapes its allowed root");
  const relative = path.relative(resolvedRoot, resolvedTarget);
  let current = resolvedRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      if ((await fs.lstat(current)).isSymbolicLink()) throw new Error(`Symbolic-link path segment is not allowed: ${segment}`);
    } catch (error) {
      if (error.code === "ENOENT") break;
      throw error;
    }
  }
}

export async function realPathWithin(root, target) {
  const realRoot = await fs.realpath(root);
  const realTarget = await fs.realpath(target);
  if (!isPathWithin(realRoot, realTarget)) throw new Error("Resolved path escapes its selected root");
  return { realRoot, realTarget };
}
