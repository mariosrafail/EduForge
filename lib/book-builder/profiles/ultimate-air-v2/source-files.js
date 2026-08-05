import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { normalizeSourceLocator } from "../../detected-facts.js";
import { isPathWithin } from "../../path-safety.js";

export async function sha256File(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

export function sha256Bytes(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

export async function resolveSourceFile(sourceRoot, sourceRelativePath) {
  const locator = normalizeSourceLocator(sourceRelativePath);
  const root = await fsp.realpath(sourceRoot);
  const candidate = path.resolve(root, ...locator.split("/"));
  if (!isPathWithin(root, candidate)) throw new Error(`Source locator escapes root: ${locator}`);
  const stat = await fsp.lstat(candidate);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Source locator is not a regular non-symlink file: ${locator}`);
  const real = await fsp.realpath(candidate);
  if (!isPathWithin(root, real)) throw new Error(`Source locator resolves outside root: ${locator}`);
  return { locator, absolutePath: real, stat };
}

export async function pngDimensions(filePath) {
  const handle = await fsp.open(filePath, "r");
  try {
    const header = Buffer.alloc(24);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead < 24 || !header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("Unsupported or truncated PNG");
    return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
  } finally { await handle.close(); }
}

export function finiteNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function booleanValue(value) {
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return null;
}
