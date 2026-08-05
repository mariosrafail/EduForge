import { runRealWorkspaceValidation, structuredValidationError } from "./review-studio-validator.mjs";

function argument(name, fallback) {
  const exact = process.argv.indexOf(name);
  if (exact >= 0) return process.argv[exact + 1];
  const prefix = `${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) || fallback;
}

try {
  const report = await runRealWorkspaceValidation({ url: argument("--url", "http://127.0.0.1:4177") });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status !== "real-workspace-safe") process.exitCode = 2;
} catch (error) {
  process.stdout.write(`${JSON.stringify(structuredValidationError(error), null, 2)}\n`);
  process.exitCode = 1;
}
