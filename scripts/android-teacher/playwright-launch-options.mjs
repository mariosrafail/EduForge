import fs from "node:fs";

export function localPlaywrightLaunchOptions() {
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || "";
  if (!executablePath) return { headless: true };
  if (!fs.existsSync(executablePath)) throw new Error(`PLAYWRIGHT_EXECUTABLE_PATH does not exist: ${executablePath}`);
  return { headless: true, executablePath };
}
