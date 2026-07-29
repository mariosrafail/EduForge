import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".css"]);

const exactLegacyCeilings = new Map([
  ["src/components/lms/books/BookPageViewer.jsx", 907],
  ["src/styles/activities.css", 3690],
  ["src/styles/books.css", 2358],
]);

export const thresholds = {
  ui: { warning: 350, failure: 650 },
  netlifyEntry: { warning: 400, failure: 700 },
  utility: { warning: 500, failure: 900 },
  css: { warning: 900, failure: 1800 },
};

export function classifyPath(filePath) {
  const normalized = filePath.replaceAll("\\", "/");
  if (normalized.startsWith("tests/")) return "tests";
  if (normalized.startsWith("database/")) return "database-migrations";
  if (normalized.startsWith("android-content-packs/")) return "generated-or-derived-content";
  if (normalized.includes("/generated/") || normalized.startsWith("content/")) return "generated-or-derived-content";
  if (normalized.startsWith("src/data/ultimate-b2/")) return "recovered-educational-content";
  if (normalized.startsWith("src/data/")) return "catalog-or-data";
  if (normalized.startsWith(".github/") || /(^|\/)(vite|playwright|netlify)\.config\./.test(normalized)) return "configuration";
  return "handwritten-application-code";
}

export function limitKind(filePath) {
  const normalized = filePath.replaceAll("\\", "/");
  if (normalized.endsWith(".css")) return "css";
  if (normalized.startsWith("netlify/functions/") && !normalized.includes("/_")) return "netlifyEntry";
  if (normalized.endsWith(".jsx") || normalized.startsWith("src/")) return "ui";
  return "utility";
}

export function evaluateFile({ path: filePath, lines }, { tracked = true } = {}) {
  const category = classifyPath(filePath);
  if (category !== "handwritten-application-code") return { category, level: "excluded" };

  if (filePath === "src/styles/responsive.css") {
    return {
      category,
      level: lines > 1215 ? "failure" : "warning",
      message: `deferred responsive.css hotspot (${lines} lines; review required above 1215)`,
    };
  }

  const kind = limitKind(filePath);
  const limit = thresholds[kind];
  const legacyCeiling = exactLegacyCeilings.get(filePath);
  if (legacyCeiling !== undefined && tracked) {
    return {
      category,
      level: lines > legacyCeiling ? "failure" : "warning",
      message: `existing legacy ${kind} hotspot (${lines} lines; baseline ceiling ${legacyCeiling})`,
    };
  }
  if (lines > limit.failure) return { category, level: "failure", message: `${kind} exceeds ${limit.failure} lines` };
  if (lines > limit.warning) return { category, level: "warning", message: `${kind} exceeds ${limit.warning} lines` };
  return { category, level: "ok" };
}

export function collectTrackedSourceFiles(root = process.cwd()) {
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root })
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  return tracked
    .filter((filePath) => sourceExtensions.has(path.extname(filePath).toLowerCase()))
    .map((filePath) => {
      const buffer = readFileSync(path.join(root, filePath));
      const text = buffer.toString("utf8");
      return {
        path: filePath.replaceAll("\\", "/"),
        lines: text === "" ? 0 : text.split(/\r?\n/).length,
        bytes: buffer.byteLength,
      };
    });
}

export function runAudit(root = process.cwd()) {
  const files = collectTrackedSourceFiles(root);
  const assessed = files.map((file) => ({ ...file, ...evaluateFile(file) }));
  const handwritten = assessed
    .filter((file) => file.category === "handwritten-application-code")
    .sort((left, right) => right.lines - left.lines);
  const categories = Object.groupBy(assessed, (file) => file.category);

  console.log("Tracked source structure");
  for (const [category, entries] of Object.entries(categories).sort()) {
    console.log(`- ${category}: ${entries.length} files`);
  }
  console.log("\nLargest handwritten source files");
  for (const file of handwritten.slice(0, 30)) {
    console.log(`${String(file.lines).padStart(5)} lines  ${String(file.bytes).padStart(8)} bytes  ${file.path}`);
  }

  const warnings = assessed.filter((file) => file.level === "warning");
  const failures = assessed.filter((file) => file.level === "failure");
  for (const file of warnings) console.warn(`WARN ${file.path}: ${file.message}`);
  for (const file of failures) console.error(`FAIL ${file.path}: ${file.message}`);
  if (failures.length) process.exitCode = 1;
  return { files: assessed, warnings, failures };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) runAudit();
