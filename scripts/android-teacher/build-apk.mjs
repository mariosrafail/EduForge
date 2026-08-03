import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

async function run(command, args, extraEnvironment = {}) {
  const child = spawn(command, args, {
    cwd: repositoryRoot,
    env: { ...process.env, ...extraEnvironment },
    shell: process.platform === "win32" && command.toLowerCase().endsWith(".cmd"),
    stdio: "inherit",
    windowsHide: true,
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${exitCode}`);
}

async function main() {
  if (!existsSync(path.join(repositoryRoot, "node_modules"))) {
    throw new Error("Dependencies are not installed. Run npm ci before building the APK.");
  }
  await run(npmCommand, ["run", "build:android-teacher-offline"]);
  await run(npxCommand, ["cap", "sync", "android"], { CAPACITOR_BUILD_MODE: "teacher" });
  await run(process.execPath, ["scripts/android/run-gradle.mjs", "--teacher", "assembleDebug"]);
  await run(process.execPath, ["scripts/android/archive-apk.mjs", "teacher"]);
  await run(npmCommand, ["run", "verify:android-teacher-apk"]);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
