import path from "node:path";
import { fileURLToPath } from "node:url";
import { AppRootResolutionError } from "../../lib/book-builder/app-root-resolver.js";
import { defaultBookBuilderWorkspace } from "../../lib/book-builder/source-binding.js";
import { createProjectFromSource, inspectProject, rescanProject } from "../../lib/book-builder/scanner-service.js";
import { materializeMenuReview } from "../../lib/book-builder/profiles/ultimate-air-v2/menu-materializer.js";
import { materializeActivityReview } from "../../lib/book-builder/profiles/ultimate-air-v2/activity-materializer.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function parseArgs(argv) {
  const firstIsOption = argv[0]?.startsWith("--");
  const result = { command: firstIsOption ? "help" : (argv[0] || "help") };
  for (let index = firstIsOption ? 0 : 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const [rawKey, inline] = argument.slice(2).split("=", 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (inline !== undefined) result[key] = inline;
    else if (argv[index + 1] && !argv[index + 1].startsWith("--")) result[key] = argv[++index];
    else result[key] = true;
  }
  return result;
}

function help() {
  return `Hamilton House Book Builder Milestone 2

Usage:
  book-builder scan --source <folder> [--workspace <folder>] [--project-id <id>]
  book-builder rescan --project <project-directory>
  book-builder inspect --project <project-directory>
  book-builder materialize --project <project-directory> --scope menu|activities
  book-builder --help
`;
}

function print(value) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.command === "help") { process.stdout.write(help()); return; }
  if (args.command === "scan") {
    if (!args.source) throw new Error("--source is required");
    const result = await createProjectFromSource({ source: args.source, workspace: args.workspace || defaultBookBuilderWorkspace(), projectId: args.projectId, repositoryRoot });
    const summary = result.scan.profileResult?.summary || {};
    print({ status: "scanned", projectDirectory: result.projectDirectory, outputDirectory: result.projectDirectory, profile: result.project.selectedProfile.id, confidence: result.project.selectedProfile.confidence, fileCount: result.scan.inventory.summary.fileCount, byteCount: result.scan.inventory.summary.totalBytes, factCount: result.project.detectedFacts.length, iwbTotal: summary.iwbTotal || 0, strictIwbCount: summary.iwbStrict || 0, malformedIwbCount: summary.iwbMalformed || 0, componentCandidateCount: summary.componentCandidates || 0, pageSpreadCount: summary.pageSpreads || 0, atlasFamilyCount: summary.atlasFamilies || 0, atlasRegionCount: summary.atlasRegions || 0, menuButtonCount: summary.menuButtons || 0, hotspotExactMatchCount: summary.hotspotExact || 0, hotspotReviewCount: summary.hotspotReview || 0, objectDirectoryCount: summary.objectCount || 0, activityClusterCount: summary.signatureClusterCount || 0, studentActivityCandidateCount: summary.studentCandidateCount || 0, teacherSolutionCandidateCount: summary.teacherCandidateCount || 0, structuredQuestionCount: summary.questions || 0, structuredOptionCount: summary.options || 0, reviewItemCount: summary.reviewItems || 0 });
    return;
  }
  if (args.command === "rescan") {
    if (!args.project) throw new Error("--project is required");
    const result = await rescanProject({ projectDirectory: args.project, repositoryRoot });
    print({ status: "rescanned", outputDirectory: result.projectDirectory, revision: result.project.revision, added: result.diff.added.length, changed: result.diff.changed.length, removed: result.diff.removed.length, staleDecisions: result.diff.staleDecisions.length });
    return;
  }
  if (args.command === "inspect") {
    if (!args.project) throw new Error("--project is required");
    print(await inspectProject(args.project));
    return;
  }
  if (args.command === "materialize") {
    if (!args.project) throw new Error("--project is required");
    if (!new Set(["menu", "activities"]).has(args.scope)) throw new Error("--scope menu|activities is required");
    const result = args.scope === "menu" ? await materializeMenuReview({ projectDirectory: args.project }) : await materializeActivityReview({ projectDirectory: args.project });
    print({ status: "materialized", scope: args.scope, outputDirectory: result.outputDirectory, materializedFileCount: result.materializedFileCount, aggregateHash: result.aggregateHash, reviewHtmlPath: result.reviewHtmlPath });
    return;
  }
  throw new Error(`Unknown command: ${args.command}`);
}

try { await main(); } catch (error) {
  const payload = { error: error.message, code: error instanceof AppRootResolutionError ? error.code : error.code || "book_builder_error", diagnostics: error.diagnostics || [] };
  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exitCode = 1;
}
