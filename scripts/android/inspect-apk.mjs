import { execFile as execFileCallback } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

async function firstAvailable(paths) {
  for (const candidate of paths) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue through the supported Android SDK locations.
    }
  }
  return "aapt";
}

async function findAapt() {
  const sdkRoots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Android", "Sdk"),
  ].filter(Boolean);
  const candidates = [];
  for (const sdkRoot of sdkRoots) {
    try {
      const versions = await readdir(path.join(sdkRoot, "build-tools"));
      versions.sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
      for (const version of versions) {
        candidates.push(path.join(sdkRoot, "build-tools", version, process.platform === "win32" ? "aapt.exe" : "aapt"));
      }
    } catch {
      // A later SDK root or PATH may provide aapt.
    }
  }
  return firstAvailable(candidates);
}

function quotedField(line, name) {
  return line.match(new RegExp(`${name}='([^']*)'`))?.[1] || "";
}

function lineValue(line) {
  return line.match(/^[^:]+:'([^']*)'/)?.[1] || "";
}

export async function inspectAndroidApk(apkPath) {
  const aapt = await findAapt();
  const { stdout } = await execFile(aapt, ["dump", "badging", apkPath], { maxBuffer: 10 * 1024 * 1024 });
  const lines = stdout.split(/\r?\n/);
  const packageLine = lines.find((line) => line.startsWith("package:")) || "";
  const permissions = lines
    .filter((line) => line.startsWith("uses-permission"))
    .map((line) => quotedField(line, "name"));
  return {
    applicationId: quotedField(packageLine, "name"),
    versionCode: Number(quotedField(packageLine, "versionCode")),
    versionName: quotedField(packageLine, "versionName"),
    applicationLabel: lineValue(lines.find((line) => line.startsWith("application-label:")) || ""),
    minSdk: Number(lineValue(lines.find((line) => line.startsWith("sdkVersion:")) || "")),
    targetSdk: Number(lineValue(lines.find((line) => line.startsWith("targetSdkVersion:")) || "")),
    permissions,
    inspectionTool: aapt,
  };
}
