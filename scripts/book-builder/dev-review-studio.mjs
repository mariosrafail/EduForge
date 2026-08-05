import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

import { defaultBookBuilderWorkspace } from "../../lib/book-builder/source-binding.js";
import { bookBuilderReviewStudioPlugin } from "./review-studio-api.mjs";
import { AUTHORING_CONFIRMATION, validateAuthoringWorkspace } from "./review-studio-authoring.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function parseArguments(argv) {
  const result = { workspace: null, port: 4177, edit: false, confirm: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--workspace") result.workspace = argv[++index];
    else if (argument.startsWith("--workspace=")) result.workspace = argument.slice("--workspace=".length);
    else if (argument === "--port") result.port = Number(argv[++index]);
    else if (argument.startsWith("--port=")) result.port = Number(argument.slice("--port=".length));
    else if (argument === "--edit") result.edit = true;
    else if (argument === "--confirm") result.confirm = argv[++index];
    else if (argument.startsWith("--confirm=")) result.confirm = argument.slice("--confirm=".length);
    else throw new Error(`Unknown Book Builder option: ${argument}`);
  }
  if (!Number.isSafeInteger(result.port) || result.port < 1 || result.port > 65535) throw new Error("--port must be between 1 and 65535");
  return result;
}

async function validatedWorkspace(value) {
  const selected = path.resolve(value || defaultBookBuilderWorkspace());
  const info = await fs.lstat(selected).catch(() => null);
  if (!info?.isDirectory() || info.isSymbolicLink()) throw new Error("The selected Book Builder workspace must be an existing non-symlink directory.");
  return fs.realpath(selected);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  let workspace = await validatedWorkspace(options.workspace);
  if (options.edit) {
    if (options.confirm !== AUTHORING_CONFIRMATION) throw new Error(`Edit mode requires --confirm=${AUTHORING_CONFIRMATION}`);
    workspace = await validateAuthoringWorkspace(workspace, { repositoryRoot });
  } else if (options.confirm) throw new Error("--confirm is available only with --edit");
  const server = await createServer({
    root: repositoryRoot,
    configFile: path.join(repositoryRoot, "vite.config.js"),
    appType: "mpa",
    plugins: [bookBuilderReviewStudioPlugin({ workspace, writeEnabled: options.edit })],
    server: {
      host: "127.0.0.1",
      port: options.port,
      strictPort: false,
      watch: { ignored: ["**/playwright-report/**", "**/test-results/**", "**/dist-book-builder/**"] },
    },
  });
  await server.listen();
  const address = server.httpServer?.address();
  const port = typeof address === "object" && address ? address.port : options.port;
  const label = `Local workspace · ${path.basename(workspace)}`;
  process.stdout.write(`Hamilton House Publisher Review Studio\n${label}\n${options.edit ? "Local editing enabled" : "Read-only review"}\nhttp://127.0.0.1:${port}/builder.html\n`);
  const close = async () => { await server.close(); process.exit(0); };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

main().catch((error) => {
  process.stderr.write(`Book Builder could not start: ${error.message}\n`);
  process.exitCode = 1;
});
