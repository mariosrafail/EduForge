import path from "node:path";
import process from "node:process";

import { assertTeacherProjectId } from "../../lib/teacher-project-builder/schema.js";
import { TeacherProjectStore } from "../../lib/teacher-project-builder/store.js";
import { buildTeacherProjectWeb } from "./build-web.mjs";

function argumentsFrom(argv) {
  const result = { command: argv[0] || "", workspace: "", projectId: "" };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--workspace") result.workspace = argv[++index] || "";
    else if (argument.startsWith("--workspace=")) result.workspace = argument.slice(12);
    else if (argument === "--project") result.projectId = argv[++index] || "";
    else if (argument.startsWith("--project=")) result.projectId = argument.slice(10);
    else throw new Error(`Unknown Teacher Project option: ${argument}`);
  }
  if (!["validate", "build-web"].includes(result.command)) throw new Error("Use validate or build-web.");
  if (!result.workspace) throw new Error("--workspace is required.");
  result.workspace = path.resolve(result.workspace);
  result.projectId = assertTeacherProjectId(result.projectId);
  return result;
}

async function main() {
  const options = argumentsFrom(process.argv.slice(2));
  if (options.command === "validate") {
    const status = await new TeacherProjectStore({ workspace: options.workspace }).status(options.projectId);
    process.stdout.write(`${JSON.stringify({ projectId: options.projectId, revision: status.project.revision, contentHash: status.contentHash, completeness: status.completeness }, null, 2)}\n`);
    if (!status.completeness.complete) process.exitCode = 2;
    return;
  }
  const result = await buildTeacherProjectWeb({ ...options, onStage: (stage) => process.stdout.write(`${stage}\n`) });
  process.stdout.write(`${JSON.stringify({ projectId: options.projectId, revision: result.project.revision, verification: result.verification }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.code || "teacher_project_build_failed"}: ${error.message}\n`);
  process.exitCode = 1;
});
