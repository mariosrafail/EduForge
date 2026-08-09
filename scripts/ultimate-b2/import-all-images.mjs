import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, "../..");
const defaultSourceRoot = path.join(repoRoot, "Ultimate English B2.app");
const defaultOutputRoot = path.join(repoRoot, "src/assets/books/ultimate-b2/legacy-source");
const manifestFilename = "image-manifest.json";
const imageExtensions = new Set([
  ".bmp",
  ".gif",
  ".icns",
  ".ico",
  ".jpeg",
  ".jpg",
  ".png",
  ".tif",
  ".tiff",
  ".webp",
]);

function parseArguments(argv) {
  const options = {
    sourceRoot: defaultSourceRoot,
    outputRoot: defaultOutputRoot,
    write: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--write") {
      options.write = true;
      continue;
    }
    if (argument === "--source-root" || argument === "--output-root") {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a path.`);
      const key = argument === "--source-root" ? "sourceRoot" : "outputRoot";
      options[key] = path.resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function assertDirectory(directoryPath, label) {
  const stats = fs.statSync(directoryPath, { throwIfNoEntry: false });
  if (!stats?.isDirectory()) throw new Error(`${label} is not a directory: ${directoryPath}`);
}

function normalizeRelativePath(value) {
  return value.split(path.sep).join("/");
}

function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  const handle = fs.openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(handle, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(handle);
  }
  return hash.digest("hex");
}

function collectImages(resourcesRoot) {
  const images = [];
  const pendingDirectories = [resourcesRoot];

  while (pendingDirectories.length > 0) {
    const currentDirectory = pendingDirectories.pop();
    const entries = fs.readdirSync(currentDirectory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, "en"));

    for (const entry of entries) {
      const absolutePath = path.join(currentDirectory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Refusing to follow source symlink: ${absolutePath}`);
      }
      if (entry.isDirectory()) {
        pendingDirectories.push(absolutePath);
        continue;
      }
      if (!entry.isFile() || !imageExtensions.has(path.extname(entry.name).toLowerCase())) continue;

      const stats = fs.statSync(absolutePath);
      images.push({
        absolutePath,
        relativePath: normalizeRelativePath(path.relative(resourcesRoot, absolutePath)),
        byteSize: stats.size,
      });
    }
  }

  return images.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en"));
}

function classify(relativePath) {
  const segments = relativePath.split("/");
  if (segments[0] === "assets" && segments[1] === "books" && segments[2] === "book1") {
    return `book1/${segments[3] || "root"}`;
  }
  if (segments[0] === "assets") return `shell/${segments[1] || "root"}`;
  if (segments[0] === "icons") return "application-icons";
  return "resources-root";
}

function summarize(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const current = groups.get(entry.group) || { count: 0, byteSize: 0 };
    current.count += 1;
    current.byteSize += entry.byteSize;
    groups.set(entry.group, current);
  }

  return Object.fromEntries([...groups.entries()].sort(([left], [right]) => left.localeCompare(right, "en")));
}

function copyIfNeeded(sourcePath, outputPath, expectedHash) {
  const existingStats = fs.statSync(outputPath, { throwIfNoEntry: false });
  if (existingStats?.isFile() && existingStats.size === fs.statSync(sourcePath).size && sha256(outputPath) === expectedHash) {
    return "unchanged";
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.copyFileSync(sourcePath, outputPath);
  return existingStats ? "updated" : "copied";
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const resourcesRoot = path.join(options.sourceRoot, "Contents", "Resources");
  assertDirectory(options.sourceRoot, "Ultimate B2 source root");
  assertDirectory(resourcesRoot, "Ultimate B2 Resources root");

  const sourceImages = collectImages(resourcesRoot);
  const entries = sourceImages.map((image) => ({
    sourceRelativePath: `Contents/Resources/${image.relativePath}`,
    outputRelativePath: image.relativePath,
    group: classify(image.relativePath),
    byteSize: image.byteSize,
    sha256: sha256(image.absolutePath),
  }));
  const totalByteSize = entries.reduce((sum, entry) => sum + entry.byteSize, 0);
  const uniqueSha256Count = new Set(entries.map((entry) => entry.sha256)).size;
  const manifest = {
    schemaVersion: "1.0",
    source: "Ultimate English B2.app/Contents/Resources",
    output: "src/assets/books/ultimate-b2/legacy-source",
    imageExtensions: [...imageExtensions].sort(),
    imageCount: entries.length,
    uniqueSha256Count,
    duplicatePathCount: entries.length - uniqueSha256Count,
    totalByteSize,
    groups: summarize(entries),
    entries,
  };

  const result = { copied: 0, updated: 0, unchanged: 0 };
  if (options.write) {
    for (let index = 0; index < sourceImages.length; index += 1) {
      const image = sourceImages[index];
      const entry = entries[index];
      const outputPath = path.join(options.outputRoot, ...entry.outputRelativePath.split("/"));
      result[copyIfNeeded(image.absolutePath, outputPath, entry.sha256)] += 1;
    }
    fs.mkdirSync(options.outputRoot, { recursive: true });
    fs.writeFileSync(path.join(options.outputRoot, manifestFilename), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  process.stdout.write(`${JSON.stringify({
    mode: options.write ? "write" : "dry-run",
    sourceRoot: options.sourceRoot,
    outputRoot: options.outputRoot,
    imageCount: entries.length,
    uniqueSha256Count,
    duplicatePathCount: entries.length - uniqueSha256Count,
    totalByteSize,
    result,
  }, null, 2)}\n`);
}

main();
