import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateBookManifest } from "../../lib/book-assets/manifest.js";
import { cleanupFailedImport, executeImport, prepareImportPlan, readManifest, verifyPublishedAssets } from "./importer.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const defaultManifest = path.join(repoRoot, "books/ultimate-b2/ultimate-b2.students-book-unit-2.manifest.json");

function parseArgs(argv) {
  const result = { command: argv[0] || "validate" };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (inlineValue !== undefined) result[key] = inlineValue;
    else if (argv[index + 1] && !argv[index + 1].startsWith("--")) result[key] = argv[++index];
    else result[key] = true;
  }
  return result;
}

function print(value) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }

async function inventory(root) {
  const locations = ["unit", "selides", "src/assets/books"];
  const rows = [];
  async function walk(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(fullPath);
      else if (entry.isFile()) rows.push({ path: path.relative(root, fullPath).replaceAll("\\", "/"), bytes: (await fs.stat(fullPath)).size, extension: path.extname(entry.name).toLowerCase() || "[none]" });
    }
  }
  for (const location of locations) await walk(path.join(root, location));
  const extensions = Object.entries(rows.reduce((groups, row) => { groups[row.extension] ||= { files: 0, bytes: 0 }; groups[row.extension].files += 1; groups[row.extension].bytes += row.bytes; return groups; }, {})).map(([extension, values]) => ({ extension, ...values }));
  return { files: rows.length, bytes: rows.reduce((sum, row) => sum + row.bytes, 0), extensions };
}

const args = parseArgs(process.argv.slice(2));
const manifestPath = path.resolve(args.manifest || defaultManifest);
const sourceRoot = path.resolve(args.sourceRoot || repoRoot);

try {
  if (args.command === "inventory") print(await inventory(sourceRoot));
  else if (args.command === "verify") {
    const result = await verifyPublishedAssets({}); print(result); if (result.failures.length) process.exitCode = 1;
  } else if (args.command === "cleanup-failed") {
    if (!args.importId) throw new Error("--import-id is required for failed-import cleanup");
    print(await cleanupFailedImport({ importId: args.importId, confirmation: args.confirmStaging }));
  } else {
    const { manifest, raw, checksum } = await readManifest(manifestPath);
    if (args.command === "validate") {
      const result = await validateBookManifest(manifest, { sourceRoot, checkFiles: true }); print({ manifest: manifestPath, ...result }); if (!result.valid) process.exitCode = 1;
    } else if (args.command === "import") {
      const result = await executeImport({ manifest, rawManifest: raw, manifestChecksum: checksum, sourceRoot, dryRun: Boolean(args.dryRun), environment: args.environment || "staging", confirmation: args.confirmStaging, concurrency: args.concurrency || 4 }); print(result);
    } else if (args.command === "plan") print(await prepareImportPlan({ manifest, sourceRoot }));
    else throw new Error(`Unknown books command: ${args.command}`);
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
