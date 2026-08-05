import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { chromium } from "@playwright/test";

export const VALIDATION_CAPABILITY_KEYS = Object.freeze([
  "overviewAvailable",
  "componentsAvailable",
  "pagesAvailable",
  "menuAvailable",
  "activitiesAvailable",
  "activityClustersAvailable",
  "reviewReasonsAvailable",
  "diffAvailable",
  "pagePreviewAvailable",
  "normalizedHotspotsAvailable",
]);

const CURRENT_ACTIVITY_CAPABILITIES = Object.freeze([
  "activitiesAvailable",
  "structuredActivitiesAvailable",
  "rasterGapActivitiesAvailable",
  "activityClustersAvailable",
]);

const FULL_CERTIFICATION_CAPABILITIES = Object.freeze([
  "overviewAvailable",
  "componentsAvailable",
  "pagesAvailable",
  "menuAvailable",
  "activitiesAvailable",
  "structuredActivitiesAvailable",
  "rasterGapActivitiesAvailable",
  "activityClustersAvailable",
  "reviewReasonsAvailable",
  "diffAvailable",
  "pagePreviewAvailable",
  "normalizedHotspotsAvailable",
]);

function safeFilename(value) {
  return String(value || "project").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 100);
}

function safeErrorMessage(error) {
  return String(error?.message || error || "validation failed")
    .replace(/[A-Za-z]:\\[^\r\n]+/g, "[redacted-path]")
    .replace(/\/(?:Users|home)\/[^\r\n]+/g, "[redacted-path]");
}

export function assertSafeValidationValue(value, label) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  assert.doesNotMatch(serialized, /[A-Za-z]:\\(?:Users|AppData)|(?:^|["'\s])\/(?:Users|home)\/[A-Za-z0-9._-]+\//i, `${label} exposed an absolute user path`);
  assert.doesNotMatch(serialized, /"(?:acceptedAnswers|correctAnswers|answerValues?|modelAnswer|iwbKey|decodedXml|selectedOuterPath|canonicalApplicationRealPath)"\s*:/i, `${label} exposed a forbidden key`);
  assert.doesNotMatch(serialized, /teacher-solution-candidates|answer-evidence-index|local-source-binding\.json/i, `${label} exposed a forbidden artifact name`);
}

function supports(project, required) {
  return required.every((name) => project.capabilities[name] === true);
}

function capabilityScore(project) {
  return Object.values(project.capabilities).filter(Boolean).length;
}

function selectCapableProject(projects, required, preferredProjectId = null) {
  if (preferredProjectId) {
    const preferred = projects.find((project) => project.projectId === preferredProjectId);
    if (preferred && supports(preferred, required)) return preferred.projectId;
  }
  return [...projects]
    .filter((project) => supports(project, required))
    .sort((left, right) => capabilityScore(right) - capabilityScore(left) || left.projectId.localeCompare(right.projectId))[0]?.projectId || null;
}

export function selectValidationProjects(projects) {
  const certificationProjectId = selectCapableProject(projects, CURRENT_ACTIVITY_CAPABILITIES);
  return {
    certification: certificationProjectId,
    overview: selectCapableProject(projects, ["overviewAvailable"], certificationProjectId),
    components: selectCapableProject(projects, ["componentsAvailable"], certificationProjectId),
    pages: selectCapableProject(projects, ["pagesAvailable", "pagePreviewAvailable", "normalizedHotspotsAvailable"], certificationProjectId),
    menu: selectCapableProject(projects, ["menuAvailable"], certificationProjectId),
    activities: selectCapableProject(projects, ["activitiesAvailable"], certificationProjectId),
    structuredActivities: selectCapableProject(projects, ["activitiesAvailable", "structuredActivitiesAvailable"], certificationProjectId),
    rasterGapActivities: selectCapableProject(projects, ["activitiesAvailable", "rasterGapActivitiesAvailable"], certificationProjectId),
    activityClusters: selectCapableProject(projects, ["activityClustersAvailable"], certificationProjectId),
    reviewReasons: selectCapableProject(projects, ["reviewReasonsAvailable"], certificationProjectId),
    diff: selectCapableProject(projects, ["diffAvailable"], certificationProjectId),
  };
}

export function missingCertificationCapabilities(projects) {
  const missing = FULL_CERTIFICATION_CAPABILITIES.filter((capability) => !projects.some((project) => project.capabilities[capability]));
  if (!missing.length && !projects.some((project) => supports(project, CURRENT_ACTIVITY_CAPABILITIES))) {
    missing.push("currentActivityCapabilitiesCoLocated");
  }
  return missing;
}

async function inspectProject({ project, api, timed, fetchPreview }) {
  const encodedId = encodeURIComponent(project.projectId);
  const overview = await timed(`${project.projectId} overview`, () => api(`/projects/${encodedId}/overview`));
  const components = await timed(`${project.projectId} components`, () => api(`/projects/${encodedId}/components?pageSize=25`));
  let pageNumber = 1;
  let pageListing = null;
  let selectedPageSummary = null;
  do {
    pageListing = await timed(`${project.projectId} pages ${pageNumber}`, () => api(`/projects/${encodedId}/pages?page=${pageNumber}&pageSize=100`));
    selectedPageSummary ||= pageListing.items.find((item) => item.variants.length && item.hotspotCount > item.unresolvedHotspotCount)
      || pageListing.items.find((item) => item.variants.length);
    pageNumber += 1;
  } while (pageListing.available && pageNumber <= pageListing.pagination.pageCount);
  const selectedPage = selectedPageSummary
    ? await timed(`${project.projectId} selected page`, () => api(`/projects/${encodedId}/pages?pageId=${encodeURIComponent(selectedPageSummary.candidateId)}&pageSize=25`))
    : null;
  const previewId = selectedPage?.selected?.variants?.[0]?.previewId || null;
  const previewAvailable = previewId
    ? await timed(`${project.projectId} preview`, () => fetchPreview(encodedId, previewId))
    : false;
  const menu = await timed(`${project.projectId} menu`, () => api(`/projects/${encodedId}/menu`));
  const activities = await timed(`${project.projectId} activities`, () => api(`/projects/${encodedId}/activities?page=1&pageSize=25`));
  const structured = await timed(`${project.projectId} structured activities`, () => api(`/projects/${encodedId}/activities?page=1&pageSize=25&hasPrompt=true&hasOptions=true`));
  const raster = await timed(`${project.projectId} raster-gap activities`, () => api(`/projects/${encodedId}/activities?page=1&pageSize=25&completeness=raster-gaps`));
  const reviews = await timed(`${project.projectId} review reasons`, () => api(`/projects/${encodedId}/reviews?groupBy=reason&pageSize=25`));
  const clusters = await timed(`${project.projectId} activity clusters`, () => api(`/projects/${encodedId}/reviews?groupBy=cluster&pageSize=25`));
  const diff = await timed(`${project.projectId} diff`, () => api(`/projects/${encodedId}/diff?pageSize=25`));
  const normalizedHotspotCount = selectedPage?.selected?.hotspots?.filter((item) => item.geometry).length || 0;
  const capabilities = {
    overviewAvailable: Boolean(overview.project),
    componentsAvailable: components.available === true,
    pagesAvailable: pageListing?.available === true,
    menuAvailable: menu.available === true,
    activitiesAvailable: activities.available === true && activities.pagination.total > 0,
    structuredActivitiesAvailable: structured.available === true && structured.pagination.total > 0,
    rasterGapActivitiesAvailable: raster.available === true && raster.pagination.total > 0,
    activityClustersAvailable: clusters.available === true && clusters.pagination.total > 0,
    reviewReasonsAvailable: reviews.available === true && reviews.groups.length > 0,
    diffAvailable: diff.available === true,
    pagePreviewAvailable: previewAvailable,
    normalizedHotspotsAvailable: normalizedHotspotCount > 0,
  };
  for (const key of VALIDATION_CAPABILITY_KEYS) assert.equal(typeof capabilities[key], "boolean", `${project.projectId} ${key} is not boolean`);
  assert.equal(overview.project.revision, project.revision);
  return {
    projectId: project.projectId,
    profile: project.profile,
    revision: project.revision,
    reviews: project.reviewSummary.total,
    capabilities,
    coverage: {
      components: components.pagination.total,
      pages: pageListing?.pagination.total || 0,
      normalizedHotspots: normalizedHotspotCount,
      menuButtons: menu.buttons.length,
      materializedPreviews: menu.previews.length,
      activities: activities.pagination.total,
      structuredActivities: structured.pagination.total,
      rasterGapActivities: raster.pagination.total,
      reviewGroups: reviews.groups.length,
      activityClusters: clusters.pagination.total,
    },
  };
}

async function negativeRequest(origin, pathname, init, expectedStatus) {
  const response = await fetch(`${origin}/__hhplms/book-builder${pathname}`, init);
  assert.equal(response.status, expectedStatus, `${pathname} returned ${response.status}, expected ${expectedStatus}`);
  const body = await response.text();
  assertSafeValidationValue(body, `negative request ${pathname}`);
  assert.doesNotMatch(body, /\bat\s+.*:\d+:\d+|Error:\s/i, `${pathname} exposed a stack trace`);
  assert.notEqual(response.headers.get("access-control-allow-origin"), "*", `${pathname} exposed wildcard CORS`);
  return { status: response.status, cors: response.headers.get("access-control-allow-origin") || null };
}

async function capture(page, screenshotRoot, screenshots, filename) {
  const target = path.join(screenshotRoot, filename);
  await page.screenshot({ path: target, fullPage: true });
  screenshots.push(filename);
}

async function openProjectView(page, origin, projectId, view, heading) {
  await page.goto(`${origin}/builder.html#/projects/${encodeURIComponent(projectId)}/${view}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: heading, exact: true }).waitFor({ state: "visible" });
}

async function validateBrowserFlows({ origin, projects, selections, screenshotRoot, responseBodies }) {
  const screenshots = [];
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(10_000);
    page.setDefaultNavigationTimeout(20_000);
    page.on("response", async (response) => {
      if (!response.url().includes("/__hhplms/book-builder/") || !String(response.headers()["content-type"] || "").includes("application/json")) return;
      try { responseBodies.push(await response.text()); } catch { /* navigation may cancel an old response */ }
    });

    await page.goto(`${origin}/builder.html`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Book Project dashboard", exact: true }).waitFor();
    await capture(page, screenshotRoot, screenshots, "dashboard.png");

    if (selections.overview) {
      await openProjectView(page, origin, selections.overview, "overview", "Overview");
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Overview", exact: true }).waitFor();
      await capture(page, screenshotRoot, screenshots, `${safeFilename(selections.overview)}-overview.png`);
    }
    if (selections.components) {
      await openProjectView(page, origin, selections.components, "components", "Components");
      await capture(page, screenshotRoot, screenshots, `${safeFilename(selections.components)}-components.png`);
    }
    if (selections.pages) {
      await openProjectView(page, origin, selections.pages, "pages", "Pages & Hotspots");
      await page.locator(".studio-page-image").waitFor();
      await page.waitForFunction(() => {
        const image = document.querySelector(".studio-page-image");
        return Boolean(image?.complete && image.naturalWidth > 0);
      });
      await capture(page, screenshotRoot, screenshots, `${safeFilename(selections.pages)}-pages.png`);
    }
    if (selections.menu) {
      await openProjectView(page, origin, selections.menu, "menu", "Menu & Branding");
      await page.getByRole("heading", { name: "GAF timeline summary", exact: true }).waitFor();
      await page.getByRole("heading", { name: "Startup intro", exact: true }).waitFor();
      await capture(page, screenshotRoot, screenshots, `${safeFilename(selections.menu)}-menu.png`);
    }

    for (const project of projects.filter((item) => !item.capabilities.activitiesAvailable)) {
      await openProjectView(page, origin, project.projectId, "activities", "Activity candidates unavailable");
      await capture(page, screenshotRoot, screenshots, `${safeFilename(project.projectId)}-activities-unavailable.png`);
    }
    if (selections.structuredActivities) {
      await openProjectView(page, origin, selections.structuredActivities, "activities", "Activities");
      const promptFilter = page.locator("label.studio-field").filter({ has: page.getByText("Prompt", { exact: true }) }).locator("select");
      const optionsFilter = page.locator("label.studio-field").filter({ has: page.getByText("Options", { exact: true }) }).locator("select");
      await promptFilter.selectOption("true");
      await Promise.all([
        page.waitForResponse((response) => {
          const requestUrl = new URL(response.url());
          return requestUrl.pathname.endsWith("/activities")
            && requestUrl.searchParams.get("hasPrompt") === "true"
            && requestUrl.searchParams.get("hasOptions") === "true"
            && response.ok();
        }),
        optionsFilter.selectOption("true"),
      ]);
      await page.locator(".studio-selectable-table tbody tr").first().waitFor();
      await page.getByRole("heading", { name: "Prompts and options", exact: true }).waitFor();
      await capture(page, screenshotRoot, screenshots, `${safeFilename(selections.structuredActivities)}-activities-structured.png`);
    }
    if (selections.rasterGapActivities) {
      await openProjectView(page, origin, selections.rasterGapActivities, "activities", "Activities");
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Activities", exact: true }).waitFor();
      await page.getByLabel("Completeness").selectOption("raster-gaps");
      await page.getByText("Structured content has raster-only or missing text gaps.", { exact: true }).waitFor();
      await capture(page, screenshotRoot, screenshots, `${safeFilename(selections.rasterGapActivities)}-activities-raster-gaps.png`);
    }
    if (selections.reviewReasons) {
      await openProjectView(page, origin, selections.reviewReasons, "reviews", "Review Queue");
      await capture(page, screenshotRoot, screenshots, `${safeFilename(selections.reviewReasons)}-review-reasons.png`);
    }
    if (selections.activityClusters) {
      await openProjectView(page, origin, selections.activityClusters, "reviews", "Review Queue");
      await page.getByLabel("Group by").selectOption("cluster");
      await page.locator(".studio-cluster-grid article").first().waitFor();
      await capture(page, screenshotRoot, screenshots, `${safeFilename(selections.activityClusters)}-activity-clusters.png`);
    } else {
      for (const project of projects.filter((item) => item.capabilities.reviewReasonsAvailable)) {
        await openProjectView(page, origin, project.projectId, "reviews", "Review Queue");
        await page.getByLabel("Group by").selectOption("cluster");
        await page.getByRole("heading", { name: "Activity clusters unavailable", exact: true }).waitFor();
        await capture(page, screenshotRoot, screenshots, `${safeFilename(project.projectId)}-activity-clusters-unavailable.png`);
      }
    }
    if (selections.diff) {
      await openProjectView(page, origin, selections.diff, "diff", "Source Diff");
      await capture(page, screenshotRoot, screenshots, `${safeFilename(selections.diff)}-diff.png`);
    }

    const routingProject = selections.pages;
    let routing = { deepLinkReload: false, back: false, forward: false };
    if (routingProject) {
      await openProjectView(page, origin, routingProject, "pages", "Pages & Hotspots");
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Pages & Hotspots", exact: true }).waitFor();
      routing.deepLinkReload = true;
      await page.getByRole("tab", { name: "Overview" }).click();
      await page.getByRole("heading", { name: "Overview", exact: true }).waitFor();
      await page.goBack();
      await page.getByRole("heading", { name: "Pages & Hotspots", exact: true }).waitFor();
      routing.back = true;
      await page.goForward();
      await page.getByRole("heading", { name: "Overview", exact: true }).waitFor();
      routing.forward = true;
    }

    await page.goto(`${origin}/ultimate-b2-builder.html`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Students Book hotspot builder", exact: true }).waitFor();
    await capture(page, screenshotRoot, screenshots, "ultimate-b2-legacy-builder.png");
    const body = await page.locator("body").innerText();
    assertSafeValidationValue(body, "browser DOM");
    assertSafeValidationValue(responseBodies.join("\n"), "browser network responses");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, "page-level horizontal overflow detected");
    return { screenshots, routing, legacyBuilder: true };
  } finally {
    await browser.close();
  }
}

export async function runRealWorkspaceValidation({ url, screenshotDirectory } = {}) {
  const origin = new URL(url || "http://127.0.0.1:4177").origin;
  const screenshotRoot = screenshotDirectory || await fs.mkdtemp(path.join(os.tmpdir(), "hhplms-studio-real-validation-"));
  await fs.mkdir(screenshotRoot, { recursive: true });
  const responseBodies = [];
  const timings = [];
  const timed = async (label, action) => {
    const started = performance.now();
    const value = await action();
    timings.push({ label, milliseconds: Number((performance.now() - started).toFixed(1)) });
    return value;
  };
  const bootstrapResponse = await fetch(`${origin}/__hhplms/book-builder/bootstrap`, { headers: { Origin: origin } });
  assert.equal(bootstrapResponse.status, 200);
  const bootstrap = await bootstrapResponse.json();
  assertSafeValidationValue(bootstrap, "bootstrap");
  const headers = { Origin: origin, "X-HHPLMS-Book-Builder-Session": bootstrap.sessionToken };
  const api = async (pathname) => {
    const response = await fetch(`${origin}/__hhplms/book-builder${pathname}`, { headers });
    const payload = await response.json();
    assert.equal(response.status, 200, `${pathname} returned ${response.status}`);
    assertSafeValidationValue(payload, pathname);
    return payload;
  };
  const fetchPreview = async (projectId, previewId) => {
    const response = await fetch(`${origin}/__hhplms/book-builder/projects/${projectId}/preview/${previewId}`, { headers });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /^image\/(?:png|jpeg|webp)$/);
    assert.ok((await response.arrayBuffer()).byteLength > 0);
    return true;
  };

  const listing = await timed("dashboard projects", () => api("/projects"));
  const projects = [];
  for (const project of listing.projects) projects.push(await inspectProject({ project, api, timed, fetchPreview }));
  const selections = selectValidationProjects(projects);
  const missingCapabilities = missingCertificationCapabilities(projects);
  const browser = await validateBrowserFlows({ origin, projects, selections, screenshotRoot, responseBodies });
  const securityProject = selections.certification || selections.overview || projects[0]?.projectId;
  const security = securityProject ? {
    missingSession: await negativeRequest(origin, "/projects", { headers: { Origin: origin } }, 401),
    wrongSession: await negativeRequest(origin, "/projects", { headers: { Origin: origin, "X-HHPLMS-Book-Builder-Session": "wrong-token" } }, 401),
    mutation: await negativeRequest(origin, `/projects/${encodeURIComponent(securityProject)}/overview`, { method: "POST", headers }, 405),
    unknownProject: await negativeRequest(origin, "/projects/not-a-project/overview", { headers }, 404),
    internalArtifact: await negativeRequest(origin, `/projects/${encodeURIComponent(securityProject)}/internal`, { headers }, 404),
    unknownPreview: await negativeRequest(origin, `/projects/${encodeURIComponent(securityProject)}/preview/preview_unknown`, { headers }, 404),
  } : {};
  const unavailableFlows = Object.fromEntries(Object.entries(selections).filter(([name, projectId]) => name !== "certification" && !projectId).map(([name]) => [name, "no capable project"]));
  const status = selections.certification && !Object.keys(unavailableFlows).length ? "real-workspace-safe" : "real-workspace-incomplete";
  const report = {
    status,
    workspaceLabel: bootstrap.workspaceLabel,
    projectCapabilityMatrix: projects,
    selectedProjects: selections,
    missingCapabilities,
    unavailableFlows,
    diagnostics: listing.diagnostics,
    timings,
    screenshots: { directory: screenshotRoot, count: browser.screenshots.length, files: browser.screenshots },
    routing: browser.routing,
    legacyBuilder: browser.legacyBuilder,
    security,
    browserResponsesChecked: responseBodies.length,
  };
  assertSafeValidationValue({ ...report, screenshots: { ...report.screenshots, directory: "[external-validation-directory]" } }, "validation report");
  if (status === "real-workspace-safe") {
    assert.ok(CURRENT_ACTIVITY_CAPABILITIES.every((key) => projects.find((project) => project.projectId === selections.certification)?.capabilities[key]));
    assert.deepEqual(browser.routing, { deepLinkReload: true, back: true, forward: true });
  }
  return report;
}

export function structuredValidationError(error) {
  return { status: "real-workspace-error", error: { code: error?.code || "validation_error", message: safeErrorMessage(error) } };
}
