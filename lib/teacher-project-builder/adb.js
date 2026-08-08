import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { runFixedProcess } from "./fixed-process.js";
import { TeacherProjectError } from "./errors.js";
import { TEACHER_ANDROID_APPLICATION_ID, TEACHER_ANDROID_MAIN_ACTIVITY } from "./android-contract.js";

const SERIAL_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

async function executable(candidate) {
  if (!candidate) return null;
  try { await access(candidate); return path.resolve(candidate); } catch { return null; }
}

function decodePropertiesPath(value) {
  return value.replaceAll("\\:", ":").replaceAll("\\\\", "\\");
}

export async function discoverAdb({ repositoryRoot, environment = process.env } = {}) {
  const executableName = process.platform === "win32" ? "adb.exe" : "adb";
  const candidates = [];
  if (environment.ANDROID_ADB_PATH) candidates.push(environment.ANDROID_ADB_PATH);
  for (const root of [environment.ANDROID_SDK_ROOT, environment.ANDROID_HOME]) {
    if (root) candidates.push(path.join(root, "platform-tools", executableName));
  }
  try {
    const localProperties = await readFile(path.join(repositoryRoot, "android", "local.properties"), "utf8");
    const sdk = localProperties.match(/^sdk\.dir=(.+)$/m)?.[1]?.trim();
    if (sdk) candidates.push(path.join(decodePropertiesPath(sdk), "platform-tools", executableName));
  } catch {
    // A clean checkout need not have local.properties.
  }
  for (const candidate of candidates) {
    const found = await executable(candidate);
    if (found) return { command: found, source: candidate === environment.ANDROID_ADB_PATH ? "ANDROID_ADB_PATH" : "android-sdk" };
  }
  return { command: executableName, source: "PATH" };
}

export function parseAdbDevices(output) {
  return String(output || "").split(/\r?\n/).slice(1).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [serial, state, ...details] = line.split(/\s+/);
    if (!SERIAL_PATTERN.test(serial || "") || !state) return null;
    const properties = Object.fromEntries(details.map((item) => item.split(":", 2)).filter((pair) => pair.length === 2));
    return {
      serial,
      state,
      product: String(properties.product || "").slice(0, 80),
      model: String(properties.model || "").replaceAll("_", " ").slice(0, 80),
      device: String(properties.device || "").slice(0, 80),
    };
  }).filter(Boolean);
}

export async function listAdbDevices({ repositoryRoot, environment, runProcess = runFixedProcess } = {}) {
  const adb = await discoverAdb({ repositoryRoot, environment });
  try {
    const result = await runProcess(adb.command, ["devices", "-l"], { cwd: repositoryRoot, env: environment || process.env });
    return { available: true, source: adb.source, devices: parseAdbDevices(result.stdout) };
  } catch (error) {
    if (["ENOENT", "EACCES"].includes(error.code)) return { available: false, source: adb.source, devices: [], error: "adb_not_available" };
    throw new TeacherProjectError("adb_discovery_failed", 503);
  }
}

export async function installAndLaunchTeacherApk({ repositoryRoot, apkPath, serial, environment, runProcess = runFixedProcess } = {}) {
  if (!SERIAL_PATTERN.test(String(serial || ""))) throw new TeacherProjectError("invalid_android_device_serial", 400);
  const discovery = await listAdbDevices({ repositoryRoot, environment, runProcess });
  if (!discovery.available) throw new TeacherProjectError("adb_not_available", 503);
  const device = discovery.devices.find((item) => item.serial === serial);
  if (!device) throw new TeacherProjectError("android_device_not_found", 409);
  if (device.state !== "device") throw new TeacherProjectError("android_device_not_ready", 409, { state: device.state });
  const adb = await discoverAdb({ repositoryRoot, environment });
  try {
    await runProcess(adb.command, ["-s", serial, "install", "-r", apkPath], { cwd: repositoryRoot, env: environment || process.env });
    await runProcess(adb.command, ["-s", serial, "shell", "am", "start", "-n", TEACHER_ANDROID_MAIN_ACTIVITY], { cwd: repositoryRoot, env: environment || process.env });
  } catch {
    throw new TeacherProjectError("android_install_or_launch_failed", 502);
  }
  return { status: "launched", serial, applicationId: TEACHER_ANDROID_APPLICATION_ID, activity: TEACHER_ANDROID_MAIN_ACTIVITY, replacedExistingDebugApp: true };
}
