import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { chromium } from "@playwright/test";
import { localPlaywrightLaunchOptions } from "./playwright-launch-options.mjs";

const candidateRoot = path.resolve(process.env.HHPLMS_VIEWER_CACHE_CANDIDATE_DIR || "dist-netlify/ultimate-b2-interactive");
const baselineRoot = process.env.HHPLMS_VIEWER_CACHE_BASELINE_DIR
  ? path.resolve(process.env.HHPLMS_VIEWER_CACHE_BASELINE_DIR)
  : null;
const binaryPattern = /\.(?:avif|bin|gaf|gif|jpe?g|m4a|m4v|mp3|mp4|ogg|png|wav|webm|webp)$/i;
const mimeTypes = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".gaf": "application/octet-stream",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".vtt": "text/vtt; charset=utf-8",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".webp": "image/webp",
});

await access(path.join(candidateRoot, "index.html"));
if (baselineRoot) await access(path.join(baselineRoot, "index.html"));

const committedHotspots = JSON.parse(await readFile("src/data/ultimate-b2/authoring/studentsBookHotspots.json", "utf8"));
let activeRoot = candidateRoot;
let hotspotRevision = 41;
let phase = "setup";
const transferLog = [];

function hotspotEnvelope() {
  return {
    bookSlug: "ultimate-b2",
    componentSlug: "ultimate-b2-students-book",
    resource: "hotspots",
    schemaVersion: "1.0",
    revision: hotspotRevision,
    source: "database",
    document: committedHotspots,
  };
}

function recordTransfer(requestPath, bytes, statusCode) {
  transferLog.push({ phase, path: requestPath, bytes, statusCode, binary: binaryPattern.test(requestPath) });
}

function safeFilePath(root, requestPath) {
  const relative = requestPath === "/" ? "index.html" : decodeURIComponent(requestPath).replace(/^\/+/, "");
  const resolved = path.resolve(root, relative);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

async function sendStatic(request, response, requestPath) {
  const filePath = safeFilePath(activeRoot, requestPath);
  if (!filePath) {
    response.writeHead(404).end();
    return;
  }
  let details;
  try {
    details = await stat(filePath);
  } catch {
    response.writeHead(404).end();
    return;
  }
  if (!details.isFile()) {
    response.writeHead(404).end();
    return;
  }
  const extension = path.extname(filePath).toLowerCase();
  const immutable = requestPath.startsWith("/assets/") && /-[A-Za-z0-9_-]+\.[^.]+$/.test(requestPath);
  const headers = {
    "Accept-Ranges": "bytes",
    "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-store",
    "Content-Type": mimeTypes[extension] || "application/octet-stream",
  };
  const range = request.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), details.size - 1) : details.size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= details.size) {
      response.writeHead(416, { "Content-Range": `bytes */${details.size}` }).end();
      return;
    }
    const bytes = end - start + 1;
    response.writeHead(206, {
      ...headers,
      "Content-Length": bytes,
      "Content-Range": `bytes ${start}-${end}/${details.size}`,
    });
    recordTransfer(requestPath, bytes, 206);
    createReadStream(filePath, { start, end }).pipe(response);
    return;
  }
  response.writeHead(200, { ...headers, "Content-Length": details.size });
  recordTransfer(requestPath, details.size, 200);
  createReadStream(filePath).pipe(response);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/ui-controller") { const body = Buffer.from(JSON.stringify({ document: { schemaVersion: "1.0", packageId: "ultimate-b2-students-book", assets: {} } })); response.writeHead(200, { "Cache-Control": "no-store", "Content-Length": body.length, "Content-Type": "application/json" }); response.end(body); return; }
  if (url.pathname === "/cache-probe.html") {
    const body = Buffer.from("<!doctype html><title>Viewer cache probe</title>");
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": body.length,
      "Content-Type": "text/html; charset=utf-8",
    });
    recordTransfer(url.pathname, body.length, 200);
    response.end(body);
    return;
  }
  if (url.pathname === "/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/hotspots") {
    const body = Buffer.from(JSON.stringify(hotspotEnvelope()));
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": body.length,
      "Content-Type": "application/json; charset=utf-8",
    });
    recordTransfer(url.pathname, body.length, 200);
    response.end(body);
    return;
  }
  if (url.pathname === "/assets/task41-partial-miss.bin") {
    const body = Buffer.from("task41-controlled-partial-miss");
    response.writeHead(200, {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": body.length,
      "Content-Type": "application/octet-stream",
    });
    recordTransfer(url.pathname, body.length, 200);
    response.end(body);
    return;
  }
  await sendStatic(request, response, url.pathname);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
function viewerUrl(root) {
  const identity = baselineRoot && root === baselineRoot
    ? ""
    : "&bookSlug=ultimate-b2&componentSlug=ultimate-b2-students-book";
  return `${origin}/?builderPreview=1${identity}&view=library`;
}

function transfersFor(label) {
  const entries = transferLog.filter((entry) => entry.phase === label);
  const binaries = entries.filter((entry) => entry.binary);
  const videos = binaries.filter((entry) => /\.(?:m4v|mp4|webm)$/i.test(entry.path));
  const blockingBinaries = binaries.filter((entry) => !/\.(?:m4v|mp4|webm)$/i.test(entry.path));
  const hotspot = entries.filter((entry) => entry.path.startsWith("/preview/content/"));
  return {
    requestCount: entries.length,
    bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    binaryRequests: binaries.length,
    binaryBytes: binaries.reduce((sum, entry) => sum + entry.bytes, 0),
    blockingBinaryRequests: blockingBinaries.length,
    blockingBinaryBytes: blockingBinaries.reduce((sum, entry) => sum + entry.bytes, 0),
    backgroundVideoRequests: videos.length,
    backgroundVideoBytes: videos.reduce((sum, entry) => sum + entry.bytes, 0),
    hotspotRequests: hotspot.length,
  };
}

async function installStartupObserver(page) {
  await page.addInitScript(() => {
    globalThis.__task41StartupCopy = [];
    const record = () => {
      const copy = document.querySelector(".teacher-viewer-progress-copy")?.textContent?.replace(/\s+/g, " ").trim();
      const status = document.querySelector(".teacher-viewer-startup-phase")?.textContent?.replace(/\s+/g, " ").trim();
      if (copy || status) globalThis.__task41StartupCopy.push({ copy: copy || "", status: status || "", at: performance.now() });
    };
    new MutationObserver(record).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  });
}

async function runViewer(context, label, root) {
  activeRoot = root;
  phase = label;
  const page = await context.newPage();
  await installStartupObserver(page);
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const startedAt = performance.now();
  await page.goto(viewerUrl(root), { waitUntil: "domcontentloaded" });
  await page.locator(".legacy-home-launcher").waitFor({ timeout: 120_000 });
  const readyMs = Number((performance.now() - startedAt).toFixed(1));
  const startupCopy = await page.evaluate(() => globalThis.__task41StartupCopy);
  await page.close();
  const unexpectedErrors = errors.filter((message) => !/favicon|ERR_CACHE_MISS/i.test(message));
  assert.deepEqual(unexpectedErrors, [], `${label} unexpected console errors`);
  return { label, readyMs, cacheMissDiagnostics: errors.length - unexpectedErrors.length, startupCopy, transfers: transfersFor(label) };
}

async function runPartialMiss(context) {
  phase = "partial-miss";
  const page = await context.newPage();
  await page.goto(`${origin}/cache-probe.html`, { waitUntil: "domcontentloaded" });
  const cachedPath = transferLog.find((entry) => entry.binary)?.path;
  assert.ok(cachedPath, "cold Viewer run must cache at least one immutable binary");
  const result = await page.evaluate(async ({ cachedPath }) => {
    const paths = [cachedPath, "/assets/task41-partial-miss.bin"];
    const classification = [];
    for (const assetPath of paths) {
      try {
        const response = await fetch(assetPath, { cache: "only-if-cached", mode: "same-origin", credentials: "same-origin" });
        classification.push({ assetPath, status: response.ok ? "hit" : "miss" });
      } catch {
        classification.push({ assetPath, status: "miss" });
      }
    }
    for (const item of classification.filter(({ status }) => status === "miss")) {
      const response = await fetch(item.assetPath, { cache: "default", credentials: "same-origin" });
      await response.arrayBuffer();
    }
    return classification;
  }, { cachedPath });
  await page.close();
  assert.deepEqual(result.map(({ status }) => status), ["hit", "miss"]);
  const transfers = transfersFor("partial-miss");
  assert.equal(transfers.binaryRequests, 1, "only the controlled missing URL may transfer");
  return { classification: result, transfers };
}

const profile = await mkdtemp(path.join(os.tmpdir(), "hhplms-task41-viewer-cache-"));
const evictedProfile = await mkdtemp(path.join(os.tmpdir(), "hhplms-task41-viewer-evicted-"));
let context;
let evictedContext;
try {
  context = await chromium.launchPersistentContext(profile, {
    ...localPlaywrightLaunchOptions(),
    viewport: { width: 1280, height: 720 },
  });
  const coldRoot = baselineRoot || candidateRoot;
  const cold = await runViewer(context, baselineRoot ? "baseline-cold" : "candidate-cold", coldRoot);
  const codeOnly = baselineRoot ? await runViewer(context, "candidate-code-only", candidateRoot) : null;
  const warm = await runViewer(context, "candidate-warm", candidateRoot);
  hotspotRevision += 1;
  const hotspotOnly = await runViewer(context, "candidate-hotspot-revision", candidateRoot);
  const partialMiss = await runPartialMiss(context);

  evictedContext = await chromium.launchPersistentContext(evictedProfile, {
    ...localPlaywrightLaunchOptions(),
    viewport: { width: 1280, height: 720 },
  });
  const eviction = await runViewer(evictedContext, "candidate-empty-profile", candidateRoot);

  assert.ok(cold.transfers.binaryRequests > 0, "cold Viewer must transfer required binaries");
  assert.ok(eviction.transfers.binaryRequests > 0, "an empty profile must produce safe cache misses and transfers");
  assert.equal(warm.transfers.blockingBinaryRequests, 0, "warm unchanged critical Viewer binaries must not transfer");
  assert.equal(hotspotOnly.transfers.blockingBinaryRequests, 0, "hotspot-only revision must not invalidate critical binaries");
  assert.equal(hotspotOnly.transfers.hotspotRequests, 1, "hotspot preview must still refresh exactly once with no-store");
  assert.ok(warm.readyMs < cold.readyMs, `warm startup ${warm.readyMs}ms must be faster than cold ${cold.readyMs}ms`);
  if (codeOnly) {
    assert.equal(codeOnly.transfers.blockingBinaryRequests, 0, "code-only build must reuse unchanged baseline critical binaries");
  }

  process.stdout.write(`${JSON.stringify({
    status: "viewer-cache-safe",
    origin,
    baselineCompared: Boolean(baselineRoot),
    cold,
    codeOnly,
    warm,
    hotspotOnly,
    partialMiss,
    eviction,
  }, null, 2)}\n`);
} finally {
  await context?.close();
  await evictedContext?.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(profile, { recursive: true, force: true });
  await rm(evictedProfile, { recursive: true, force: true });
}
