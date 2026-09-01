import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

import { chromium } from "@playwright/test";

import { localPlaywrightLaunchOptions } from "./android-teacher/playwright-launch-options.mjs";
import { compilePublicationV2Fixture, publicationV2Fixture } from "../tests/fixtures/publication-v2.js";

const root = path.resolve("dist");
const compiled = compilePublicationV2Fixture();
const releaseId = "10000000-0000-4000-8000-000000000097";
const publication = {
  releaseId,
  releaseNumber: 7,
  releaseSchemaVersion: compiled.releaseSchemaVersion,
  compilerId: compiled.compilerId,
  releaseSha256: compiled.releaseSha256,
  compatibility: compiled.compatibility,
  projection: compiled.publicProjection,
};
const onePixelPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2Z9sAAAAASUVORK5CYII=", "base64");
const mime = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml" };

function json(response, statusCode, value) {
  const bytes = Buffer.from(JSON.stringify(value));
  response.writeHead(statusCode, { "Cache-Control": "no-store", "Content-Length": bytes.length, "Content-Type": "application/json" });
  response.end(bytes);
}

function answerApi(request, response, url) {
  if (url.pathname.endsWith("/.netlify/functions/auth-me")) {
    json(response, 200, { user: { id: "10000000-0000-4000-8000-000000000001", full_name: "Layout Student", email: "student@example.invalid", role: "student", status: "active", school_id: "10000000-0000-4000-8000-000000000002" } });
    return true;
  }
  if (url.pathname.endsWith("/.netlify/functions/school-profile")) {
    json(response, 200, { school: { name: "Layout School", logo: "", primaryColor: "#f97316", secondaryColor: "#0b1f3a" } });
    return true;
  }
  if (!url.pathname.endsWith("/.netlify/functions/book-content")) return false;
  const action = url.searchParams.get("action");
  if (action === "active-component-release") json(response, 200, publication);
  else if (action === "published-release-asset") {
    response.writeHead(200, { "Cache-Control": "no-store", "Content-Length": onePixelPng.length, "Content-Type": "image/png" });
    response.end(onePixelPng);
  } else if (action === "list") json(response, 200, { bookPackages: [] });
  else if (action === "dashboard-metrics") json(response, 200, { role: "student", assignments: [], grades: [], books: [] });
  else json(response, 200, {});
  return true;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (answerApi(request, response, url)) return;
  const relative = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
  let file = path.resolve(root, relative);
  let details = file.startsWith(`${root}${path.sep}`) ? await stat(file).catch(() => null) : null;
  if (!details?.isFile()) { file = path.join(root, "index.html"); details = await stat(file).catch(() => null); }
  if (!details?.isFile()) { response.writeHead(404); response.end(); return; }
  const bytes = await readFile(file);
  response.writeHead(200, { "Content-Length": bytes.length, "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
  response.end(bytes);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
let browser;
try {
  browser = await chromium.launch(localPlaywrightLaunchOptions());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`http://127.0.0.1:${port}/#activity-${publicationV2Fixture.dragDropId}`, { waitUntil: "domcontentloaded" });
  const surface = page.locator(".native-drag-drop");
  await surface.waitFor();
  await page.waitForFunction(() => document.querySelector(".native-drag-drop-stage")?.getBoundingClientRect().height > 0);
  const measure = () => surface.evaluate((element) => {
    const snapshot = (node) => {
      if (!node) return null;
      const box = node.getBoundingClientRect(); const style = getComputedStyle(node);
      return { width: box.width, height: box.height, top: box.top, left: box.left, display: style.display, heightStyle: style.height, minHeight: style.minHeight, overflowX: style.overflowX, overflowY: style.overflowY, gridTemplateRows: style.gridTemplateRows };
    };
    const host = element.closest(".native-readable-text-activity-view");
    const stage = element.querySelector(".native-drag-drop-stage");
    const bank = element.querySelector(".native-drag-drop-bank");
    const hostBox = host.getBoundingClientRect(); const surfaceBox = element.getBoundingClientRect(); const stageBox = stage.getBoundingClientRect(); const bankBox = bank.getBoundingClientRect();
    return {
      section: snapshot(element.closest(".student-section-stack")),
      runner: snapshot(element.closest(".ultimate-activity-runner")),
      published: snapshot(element.closest(".published-native-activity")),
      presentation: snapshot(element.closest(".native-readable-text-presentation")),
      activityView: snapshot(host),
      surface: snapshot(element),
      visual: snapshot(element.querySelector(".native-drag-drop-visual-region")),
      workspace: snapshot(element.querySelector(".native-drag-drop-workspace")),
      stage: snapshot(stage),
      bank: snapshot(bank),
      surfaceHostFill: surfaceBox.height / hostBox.height,
      stageAspectRatio: stageBox.width / stageBox.height,
      bankHeightRatio: bankBox.height / stageBox.height,
      bankTopRatio: (bankBox.top - stageBox.top) / stageBox.height,
      stageInsideHost: stageBox.left >= hostBox.left - 1 && stageBox.right <= hostBox.right + 1 && stageBox.top >= hostBox.top - 1 && stageBox.bottom <= hostBox.bottom + 1,
      surfaceOverflow: { x: element.scrollWidth - element.clientWidth, y: element.scrollHeight - element.clientHeight },
      documentOverflowX: document.documentElement.scrollWidth - innerWidth,
    };
  });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 768, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.waitForFunction(() => {
      const stage = document.querySelector(".native-drag-drop-stage")?.getBoundingClientRect();
      const host = document.querySelector(".native-readable-text-activity-view")?.getBoundingClientRect();
      return stage && host && stage.height > 0 && stage.width <= host.width + 1 && stage.height <= host.height + 1;
    });
    const metrics = await measure();
    console.log(`LMS_DRAG_DROP_LAYOUT ${viewport.width}x${viewport.height} ${JSON.stringify(metrics)}`);
    assert.ok(metrics.activityView.height > 0, JSON.stringify(metrics));
    assert.ok(metrics.surfaceHostFill > 0.98, JSON.stringify(metrics));
    assert.ok(metrics.stageInsideHost, JSON.stringify(metrics));
    assert.ok(Math.abs(metrics.stageAspectRatio - 1024 / 582) < 0.02, JSON.stringify(metrics));
    assert.ok(metrics.bankHeightRatio > 0.18 && metrics.bankHeightRatio < 0.22, JSON.stringify(metrics));
    assert.ok(metrics.bankTopRatio > 0.78 && metrics.bankTopRatio < 0.82, JSON.stringify(metrics));
    assert.ok(metrics.surfaceOverflow.x <= 1 && metrics.surfaceOverflow.y <= 1, JSON.stringify(metrics));
    assert.ok(metrics.documentOverflowX <= 1, JSON.stringify(metrics));
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
