import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { connect } from "node:net";
import pg from "pg";
import { LOCAL_DEMO_PORTS } from "./_local-demo-ports.mjs";
import { readLocalMultiSchoolMarker } from "./_local-multi-school.mjs";

const SERVICES = Object.freeze([
  { key: "LMS", script: "demo:multi-school:start" },
  { key: "Teacher Offline", script: "dev:android-teacher-offline" },
]);

export function portIsListening(port, host = "127.0.0.1") {
  return new Promise((resolveListening) => {
    const socket = connect({ port, host });
    socket.setTimeout(500);
    socket.once("connect", () => { socket.destroy(); resolveListening(true); });
    socket.once("timeout", () => { socket.destroy(); resolveListening(false); });
    socket.once("error", () => resolveListening(false));
  });
}

export async function preflightLocalDemoPorts(probe = portIsListening) {
  const requirements = [
    { port: LOCAL_DEMO_PORTS.teacherOffline, hosts: ["127.0.0.1", "::1"], service: "Teacher Offline", url: "http://localhost:8000" },
    { port: LOCAL_DEMO_PORTS.lmsVite, hosts: ["127.0.0.1", "::1"], service: "The LMS internal Vite server", url: "http://localhost:8001" },
    { port: LOCAL_DEMO_PORTS.lmsPublic, hosts: ["127.0.0.1"], service: "The LMS Netlify public server", url: "http://127.0.0.1:8888" },
  ];
  for (const requirement of requirements) {
    let occupied = false;
    for (const host of requirement.hosts) occupied ||= await probe(requirement.port, host);
    if (occupied) {
      throw new Error(`Port ${requirement.port} is already in use by another process.\n${requirement.service} requires ${requirement.url}.`);
    }
  }
}

export async function verifyLocalDemoDatabase({ marker = readLocalMultiSchoolMarker(), Pool = pg.Pool } = {}) {
  const setupMessage = "Run:\nnpm run demo:multi-school:setup";
  if (!marker) throw new Error(`The local multi-school demo has not been set up.\n${setupMessage}`);
  const pool = new Pool({ connectionString: marker.databaseUrl, connectionTimeoutMillis: 2_000 });
  try {
    await pool.query("select 1");
  } catch {
    throw new Error(`The local multi-school database is unavailable.\n${setupMessage}`);
  } finally {
    await pool.end().catch(() => {});
  }
}

export function terminateProcessTree(child, { platform = process.platform, runSync = spawnSync, killProcess = process.kill } = {}) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (platform === "win32") {
    runSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    return;
  }
  try {
    killProcess(-child.pid, "SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

export function startLocalDemoChildren({ spawnChild = spawn, platform = process.platform, environment = process.env } = {}) {
  return SERVICES.map((service) => ({
    ...service,
    child: spawnChild(
      platform === "win32" ? (environment.ComSpec || "cmd.exe") : "npm",
      platform === "win32" ? ["/d", "/s", "/c", `npm run ${service.script}`] : ["run", service.script],
      {
      env: environment,
      stdio: "inherit",
      shell: false,
      detached: platform !== "win32",
      windowsHide: false,
      },
    ),
  }));
}

export async function runAllLocalDemos() {
  await preflightLocalDemoPorts();
  await verifyLocalDemoDatabase();

  console.log(`
Hamilton House local demo services

LMS:
http://127.0.0.1:${LOCAL_DEMO_PORTS.lmsPublic}

Ultimate B2 Teacher Offline:
http://localhost:${LOCAL_DEMO_PORTS.teacherOffline}/#library

Internal LMS Vite:
http://localhost:${LOCAL_DEMO_PORTS.lmsVite}

PostgreSQL:
127.0.0.1:${LOCAL_DEMO_PORTS.postgres}

Press Ctrl+C to stop all local demo services.
`);

  const services = startLocalDemoChildren();
  let stopping = false;

  const stopAll = (exitCode) => {
    if (stopping) return;
    stopping = true;
    for (const service of services) terminateProcessTree(service.child);
    process.exitCode = exitCode;
  };

  process.once("SIGINT", () => stopAll(0));
  process.once("SIGTERM", () => stopAll(0));

  for (const service of services) {
    service.child.once("error", (error) => {
      console.error(`[${service.key}] failed to start: ${error.message}`);
      stopAll(1);
    });
    service.child.once("exit", (code, signal) => {
      if (stopping) return;
      console.error(`[${service.key}] exited unexpectedly (${signal ? `signal ${signal}` : `code ${code ?? 1}`}).`);
      stopAll(code === 0 ? 1 : (code ?? 1));
    });
  }

  await new Promise(() => {});
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  runAllLocalDemos().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
