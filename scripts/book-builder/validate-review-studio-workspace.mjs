import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { chromium } from "@playwright/test";

function argument(name, fallback) {
  const exact = process.argv.indexOf(name);
  if (exact >= 0) return process.argv[exact + 1];
  const prefix = `${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) || fallback;
}

const origin = new URL(argument("--url", "http://127.0.0.1:4177")).origin;
const screenshotRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hhplms-studio-real-validation-"));
const responseBodies = [];
const timings = [];

function assertSafe(value, label) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  assert.doesNotMatch(serialized, /[A-Za-z]:\\(?:Users|AppData)|(?:^|["'\s])\/(?:Users|home)\/[A-Za-z0-9._-]+\//i, `${label} exposed an absolute user path`);
  assert.doesNotMatch(serialized, /"(?:acceptedAnswers|correctAnswers|answerValues?|modelAnswer|iwbKey|decodedXml|selectedOuterPath|canonicalApplicationRealPath)"\s*:/i, `${label} exposed a forbidden key`);
  assert.doesNotMatch(serialized, /teacher-solution-candidates|answer-evidence-index|local-source-binding\.json/i, `${label} exposed a forbidden artifact name`);
}

async function timed(label, action) {
  const started = performance.now();
  const value = await action();
  timings.push({ label, milliseconds: Number((performance.now() - started).toFixed(1)) });
  return value;
}

const bootstrapResponse = await fetch(`${origin}/__hhplms/book-builder/bootstrap`, { headers: { Origin: origin } });
assert.equal(bootstrapResponse.status, 200);
const bootstrap = await bootstrapResponse.json();
const headers = { Origin: origin, "X-HHPLMS-Book-Builder-Session": bootstrap.sessionToken };
async function api(pathname) {
  const response = await fetch(`${origin}/__hhplms/book-builder${pathname}`, { headers });
  const payload = await response.json();
  assert.equal(response.status, 200, `${pathname} returned ${response.status}`);
  assertSafe(payload, pathname);
  return payload;
}

const listing = await timed("dashboard projects", () => api("/projects"));
const results = [];
for (const project of listing.projects) {
  const projectId = encodeURIComponent(project.projectId);
  const overview = await timed(`${project.projectId} overview`, () => api(`/projects/${projectId}/overview`));
  const result = { projectId: project.projectId, profile: project.profile, revision: project.revision, reviews: project.reviewSummary.total, overview: true };
  if (project.profile === "ultimate-air-v2") {
    const components = await timed(`${project.projectId} components`, () => api(`/projects/${projectId}/components?pageSize=25`));
    let selectedPage = null;
    let pageNumber = 1;
    do {
      const pages = await timed(`${project.projectId} pages ${pageNumber}`, () => api(`/projects/${projectId}/pages?page=${pageNumber}&pageSize=100`));
      selectedPage ||= pages.items.find((item) => item.variants.length && item.hotspotCount > item.unresolvedHotspotCount) || pages.items.find((item) => item.variants.length);
      pageNumber += 1;
      if (pageNumber > pages.pagination.pageCount) break;
    } while (pageNumber <= 10);
    assert.ok(selectedPage, `${project.projectId} has no allowed page preview`);
    const page = await timed(`${project.projectId} selected page`, () => api(`/projects/${projectId}/pages?pageId=${encodeURIComponent(selectedPage.candidateId)}&pageSize=25`));
    const previewId = page.selected.variants[0]?.previewId;
    assert.ok(previewId, `${project.projectId} selected page has no preview ID`);
    const preview = await timed(`${project.projectId} preview`, () => fetch(`${origin}/__hhplms/book-builder/projects/${projectId}/preview/${previewId}`, { headers }));
    assert.equal(preview.status, 200);
    assert.match(preview.headers.get("content-type") || "", /^image\/(?:png|jpeg|webp)$/);
    assert.ok((await preview.arrayBuffer()).byteLength > 0);
    const menu = await timed(`${project.projectId} menu`, () => api(`/projects/${projectId}/menu`));
    const activities = await timed(`${project.projectId} activities`, () => api(`/projects/${projectId}/activities?page=1&pageSize=25`));
    const structured = await timed(`${project.projectId} structured activity`, () => api(`/projects/${projectId}/activities?page=1&pageSize=25&hasPrompt=true`));
    const raster = await timed(`${project.projectId} raster gaps`, () => api(`/projects/${projectId}/activities?page=1&pageSize=25&completeness=raster-gaps`));
    const reviews = await timed(`${project.projectId} review groups`, () => api(`/projects/${projectId}/reviews?groupBy=reason&pageSize=25`));
    const clusters = await timed(`${project.projectId} review clusters`, () => api(`/projects/${projectId}/reviews?groupBy=cluster&pageSize=25`));
    const diff = await timed(`${project.projectId} diff`, () => api(`/projects/${projectId}/diff?pageSize=25`));
    result.components = components.pagination.total;
    result.pages = page.pagination.total;
    result.normalizedHotspots = page.selected.hotspots.filter((item) => item.geometry).length;
    result.preview = true;
    result.menuButtons = menu.buttons.length;
    result.materializedPreviews = menu.previews.length;
    result.activities = activities.pagination.total;
    result.structuredActivity = structured.pagination.total > 0;
    result.rasterGaps = raster.pagination.total;
    result.reviewGroups = reviews.groups.length;
    result.clusters = clusters.pagination.total;
    result.diff = diff.available;
  } else {
    result.componentsAvailable = (await api(`/projects/${projectId}/components`)).available;
    result.activitiesAvailable = (await api(`/projects/${projectId}/activities`)).available;
  }
  assert.equal(overview.project.revision, project.revision);
  results.push(result);
}

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("response", async (response) => {
    if (!response.url().includes("/__hhplms/book-builder/") || !String(response.headers()["content-type"] || "").includes("application/json")) return;
    try { responseBodies.push(await response.text()); } catch { /* navigation can cancel old requests */ }
  });
  await page.goto(`${origin}/builder.html`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Book Project dashboard" }).waitFor();
  await page.screenshot({ path: path.join(screenshotRoot, "dashboard.png"), fullPage: true });
  const ultimateProjects = results.filter((item) => item.profile === "ultimate-air-v2");
  for (const project of ultimateProjects) {
    await page.goto(`${origin}/builder.html#/projects/${encodeURIComponent(project.projectId)}/pages`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Pages & Hotspots" }).waitFor();
    await page.locator(".studio-page-preview-frame").waitFor();
    await page.screenshot({ path: path.join(screenshotRoot, `${project.projectId}-pages.png`), fullPage: true });
  }
  const b2 = results.find((item) => item.projectId.includes("b2")) || results.find((item) => item.profile === "ultimate-air-v2");
  await page.goto(`${origin}/builder.html#/projects/${encodeURIComponent(b2.projectId)}/activities`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Activities" }).waitFor();
  await page.screenshot({ path: path.join(screenshotRoot, `${b2.projectId}-activities.png`), fullPage: true });
  await page.goto(`${origin}/builder.html#/projects/${encodeURIComponent(b2.projectId)}/reviews`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Review Queue" }).waitFor();
  await page.screenshot({ path: path.join(screenshotRoot, `${b2.projectId}-reviews.png`), fullPage: true });
  const dom = await page.locator("body").innerText();
  assertSafe(dom, "browser DOM");
  assertSafe(responseBodies.join("\n"), "browser network responses");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
} finally { await browser?.close(); }

process.stdout.write(`${JSON.stringify({ status: "real-workspace-safe", workspaceLabel: bootstrap.workspaceLabel, projects: results, diagnostics: listing.diagnostics, timings, screenshots: { directory: screenshotRoot, count: results.filter((item) => item.profile === "ultimate-air-v2").length + 3 }, browserResponsesChecked: responseBodies.length }, null, 2)}\n`);
