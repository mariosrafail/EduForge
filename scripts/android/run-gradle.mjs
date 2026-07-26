import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const androidRoot = path.join(repositoryRoot, "android");
const localPropertiesPath = path.join(androidRoot, "local.properties");
const requested = process.argv.slice(2);
const teacher = requested[0] === "--teacher";
const gradleArguments = teacher ? ["-PteacherPresentation", ...requested.slice(1)] : requested;

function validSdk(candidate) {
  return Boolean(candidate && existsSync(path.join(candidate, "platforms")) && existsSync(path.join(candidate, "build-tools")));
}

function decodeGradlePath(value) {
  return value.replaceAll("\\:", ":").replaceAll("\\\\", "\\");
}

async function configuredSdk() {
  const candidates = [
    process.env.ANDROID_SDK_ROOT,
    process.env.ANDROID_HOME,
    path.join(os.homedir(), "AppData", "Local", "Android", "Sdk"),
    path.join(os.homedir(), "Android", "Sdk"),
  ];
  try {
    const localProperties = await readFile(localPropertiesPath, "utf8");
    const configured = localProperties.match(/^sdk\.dir=(.+)$/m)?.[1]?.trim();
    if (configured) candidates.unshift(decodeGradlePath(configured));
  } catch {
    // A clean checkout normally has no local.properties.
  }
  return candidates.find(validSdk) || null;
}

async function main() {
  if (!gradleArguments.length) {
    throw new Error("Pass a Gradle task, for example: npm run android:gradle -- assembleDebug");
  }
  const sdkRoot = await configuredSdk();
  if (!sdkRoot) {
    throw new Error(
      "Android SDK not found. Install Android SDK Platform 36 and Build Tools 36, then set ANDROID_SDK_ROOT or ANDROID_HOME.",
    );
  }

  await mkdir(androidRoot, { recursive: true });
  await writeFile(localPropertiesPath, `sdk.dir=${sdkRoot.replaceAll("\\", "\\\\").replace(":", "\\:")}\n`, "utf8");

  const command = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
  const child = spawn(command, gradleArguments, {
    cwd: androidRoot,
    env: {
      ...process.env,
      ANDROID_HOME: sdkRoot,
      ANDROID_SDK_ROOT: sdkRoot,
    },
    shell: process.platform === "win32",
    stdio: "inherit",
    windowsHide: true,
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) process.exitCode = exitCode;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
