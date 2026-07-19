import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

const env = { ...process.env };

env.ACCOUNT_RATE_LIMIT_SALT ||= randomBytes(32).toString("hex");
env.INVITE_RATE_LIMIT_SALT ||= randomBytes(32).toString("hex");

const command = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "npx";
const args = process.platform === "win32"
  ? ["/d", "/s", "/c", "npx netlify-cli dev"]
  : ["netlify-cli", "dev"];

const child = spawn(command, args, {
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exitCode = code ?? 1;
});

child.on("error", (error) => {
  console.error(`Failed to start Netlify Dev: ${error.message}`);
  process.exitCode = 1;
});
