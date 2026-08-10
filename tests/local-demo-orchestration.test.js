import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import {
  preflightLocalDemoPorts,
  startLocalDemoChildren,
  terminateProcessTree,
  verifyLocalDemoDatabase,
} from "../scripts/start-all-local-demos.mjs";

test("local demo ports are explicit, non-overlapping, and wired to their canonical commands", async () => {
  const [packageJson, netlify, viteLoopback, multiSchool, ports, documentation] = await Promise.all([
    readFile("package.json", "utf8").then(JSON.parse),
    readFile("netlify.toml", "utf8"),
    readFile("scripts/start-vite-loopback.mjs", "utf8"),
    readFile("scripts/_local-multi-school.mjs", "utf8"),
    import("../scripts/_local-demo-ports.mjs"),
    readFile("docs/local-multi-school-demo.md", "utf8"),
  ]);

  assert.deepEqual(ports.LOCAL_DEMO_PORTS, {
    teacherOffline: 8000,
    lmsVite: 8001,
    lmsPublic: 8888,
    postgres: 55433,
  });
  assert.equal(packageJson.scripts["demo:all:start"], "node scripts/start-all-local-demos.mjs");
  assert.match(packageJson.scripts["dev:android-teacher-offline"], /--port 8000 --strictPort$/);
  assert.match(netlify, /targetPort = 8001/);
  assert.doesNotMatch(netlify, /targetPort = 8000/);
  assert.match(viteLoopback, /port: LOCAL_DEMO_PORTS\.lmsVite, strictPort: true/);
  assert.match(multiSchool, /port: LOCAL_DEMO_PORTS\.postgres/);
  assert.match(documentation, /npm run demo:all:start/);
  assert.match(documentation, /localhost:8000\/#library/);
});

test("combined preflight checks every required loopback listener and reports the owning service", async () => {
  const checked = [];
  await preflightLocalDemoPorts(async (port, host) => {
    checked.push(`${host}:${port}`);
    return false;
  });
  assert.deepEqual(checked, [
    "127.0.0.1:8000", "::1:8000",
    "127.0.0.1:8001", "::1:8001",
    "127.0.0.1:8888",
  ]);

  await assert.rejects(
    preflightLocalDemoPorts(async (port) => port === 8001),
    /Port 8001 is already in use.*LMS internal Vite server requires http:\/\/localhost:8001/s,
  );
});

test("combined startup requires the existing isolated demo database without mutating it", async () => {
  await assert.rejects(
    verifyLocalDemoDatabase({ marker: null }),
    /has not been set up.*npm run demo:multi-school:setup/s,
  );

  const calls = [];
  class AvailablePool {
    constructor(options) { calls.push(["construct", options.connectionString, options.connectionTimeoutMillis]); }
    async query(sql) { calls.push(["query", sql]); }
    async end() { calls.push(["end"]); }
  }
  await verifyLocalDemoDatabase({ marker: { databaseUrl: "postgresql://local/demo" }, Pool: AvailablePool });
  assert.deepEqual(calls, [
    ["construct", "postgresql://local/demo", 2_000],
    ["query", "select 1"],
    ["end"],
  ]);

  class UnavailablePool {
    async query() { throw new Error("connection refused"); }
    async end() {}
  }
  await assert.rejects(
    verifyLocalDemoDatabase({ marker: { databaseUrl: "postgresql://local/demo" }, Pool: UnavailablePool }),
    /database is unavailable.*npm run demo:multi-school:setup/s,
  );
});

test("launcher starts both commands concurrently and terminates complete child trees", () => {
  const calls = [];
  const spawnChild = (command, args, options) => {
    calls.push({ command, args, options });
    return Object.assign(new EventEmitter(), { pid: 100 + calls.length, exitCode: null, signalCode: null });
  };
  const children = startLocalDemoChildren({ spawnChild, platform: "win32", environment: { ComSpec: "C:\\Windows\\cmd.exe" } });
  assert.deepEqual(calls.map((call) => call.args.at(-1)), [
    "npm run demo:multi-school:start",
    "npm run dev:android-teacher-offline",
  ]);
  assert.equal(children.length, 2);
  assert.ok(calls.every((call) => call.command === "C:\\Windows\\cmd.exe" && call.options.stdio === "inherit"));

  const taskkills = [];
  terminateProcessTree(children[0].child, {
    platform: "win32",
    runSync: (...args) => taskkills.push(args),
  });
  assert.deepEqual(taskkills[0].slice(0, 2), ["taskkill", ["/PID", "101", "/T", "/F"]]);

  const signals = [];
  terminateProcessTree({ pid: 202, exitCode: null, signalCode: null }, {
    platform: "linux",
    killProcess: (...args) => signals.push(args),
  });
  assert.deepEqual(signals, [[-202, "SIGTERM"]]);
});
