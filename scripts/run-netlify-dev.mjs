import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { connect } from "node:net";

function portIsListening(port, host) {
  return new Promise((resolve) => {
    const socket = connect({ port, host });
    socket.setTimeout(750);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(false));
  });
}

if (await portIsListening(8888, "127.0.0.1")) {
  console.error(
    "Port 8888 is already in use. First try the existing http://127.0.0.1:8888; "
    + "if it is stale, terminate that listening process before starting another demo server.",
  );
  process.exit(1);
}

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
