import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";
import { createServer } from "vite";

import { createBookBuilderStudioFixture, SYNTHETIC_TEACHER_SECRET } from "../../tests/helpers/book-builder-studio-fixture.mjs";
import { bookBuilderReviewStudioPlugin } from "./review-studio-api.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");

async function startStudio(workspace) {
  const server = await createServer({
    root: repositoryRoot,
    configFile: path.join(repositoryRoot, "vite.config.js"),
    appType: "mpa",
    logLevel: "error",
    plugins: [bookBuilderReviewStudioPlugin({ workspace })],
    server: { host: "127.0.0.1", port: 0, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer.address();
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function expectHeading(page, name) {
  await page.getByRole("heading", { name, exact: true }).waitFor({ state: "visible" });
}

async function assertSafePage(page, networkBodies) {
  const body = await page.locator("body").innerText();
  assert.doesNotMatch(body, new RegExp(SYNTHETIC_TEACHER_SECRET));
  assert.doesNotMatch(body, /[A-Za-z]:\\(?:Users|AppData)|\/(?:Users|home)\/[A-Za-z0-9._-]+\//i);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, "page-level horizontal overflow detected");
  assert.doesNotMatch(networkBodies.join("\n"), new RegExp(SYNTHETIC_TEACHER_SECRET));
}

async function run() {
  const fixture = await createBookBuilderStudioFixture();
  const primary = await startStudio(fixture.workspace);
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const networkBodies = [];
    page.on("response", async (response) => {
      if (!response.url().includes("/__hhplms/book-builder/") || !String(response.headers()["content-type"] || "").includes("application/json")) return;
      try { networkBodies.push(await response.text()); } catch { /* response may have been cancelled during navigation */ }
    });

    await page.goto(`${primary.origin}/builder.html`, { waitUntil: "networkidle" });
    await expectHeading(page, "Book Project dashboard");
    await page.getByText("Read-only review — approvals and manual corrections are not enabled in Milestone 4A.").waitFor();
    await page.getByRole("heading", { name: "Fictional Ultimate Review Book" }).waitFor();
    await page.getByRole("heading", { name: "Fictional Journey Control" }).waitFor();
    await page.getByRole("heading", { name: "Incomplete projects" }).waitFor();
    await page.getByRole("heading", { name: "Ultimate B2 hotspot authoring" }).waitFor();
    await assertSafePage(page, networkBodies);

    await page.goto(`${primary.origin}/builder.html#/projects/fictional-ultimate-review/overview`, { waitUntil: "networkidle" });
    await expectHeading(page, "Overview");
    await page.reload({ waitUntil: "networkidle" });
    await expectHeading(page, "Overview");
    await page.getByText("The project is an authoring draft. Publication data is incomplete and no content has been published.").waitFor();

    await page.getByRole("tab", { name: "Components" }).click();
    await expectHeading(page, "Components");
    await page.locator("label.studio-field").filter({ hasText: /^Pages/ }).locator("select").selectOption("true");
    await page.locator("tbody").getByText("students-book", { exact: true }).waitFor();

    await page.getByRole("tab", { name: "Pages & Hotspots" }).click();
    await expectHeading(page, "Pages & Hotspots");
    await page.getByAltText("Preview of course Unit 1 Part 1").waitFor();
    await page.getByText("Normalized geometry available").waitFor();
    await page.getByRole("button", { name: "Hide hotspots" }).click();
    assert.equal(await page.getByRole("button", { name: "Show hotspots" }).isVisible(), true);

    await page.getByRole("tab", { name: "Menu & Branding" }).click();
    await expectHeading(page, "Menu & Branding");
    await page.getByRole("heading", { name: "GAF timeline summary" }).waitFor();
    await page.getByRole("heading", { name: "Startup intro" }).waitFor();
    await page.getByText("The startup intro is explicitly distinct from the central on-menu title animation.").waitFor();
    await page.getByAltText("fictional-menu-preview.png").waitFor();

    await page.getByRole("tab", { name: "Activities" }).click();
    await expectHeading(page, "Activities");
    await page.getByText("152 items").waitFor();
    await page.getByLabel("Completeness").selectOption("raster-gaps");
    await page.getByText("Structured content has raster-only or missing text gaps.").waitFor();
    await page.getByText("Correct drag/drop mappings are not available.").waitFor();

    await page.getByRole("tab", { name: "Review Queue" }).click();
    await expectHeading(page, "Review Queue");
    await page.getByText("5,007", { exact: true }).first().waitFor();
    await page.getByLabel("Group by").selectOption("cluster");
    await page.getByText("120 candidates").waitFor();
    assert.equal(await page.getByRole("button", { name: /approve|dismiss|apply/i }).count(), 0);

    await page.getByRole("tab", { name: "Source Diff" }).click();
    await expectHeading(page, "Source Diff");
    await page.getByText("Revision 2 → 3").waitFor();
    await page.getByText("fact_fictional_1").waitFor();
    await assertSafePage(page, networkBodies);

    await page.goto(`${primary.origin}/builder.html#/projects/not-a-project/overview`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Book Project unavailable" }).waitFor();
    const internalStatus = await page.evaluate(async () => (await fetch("/__hhplms/book-builder/projects/fictional-ultimate-review/internal")).status);
    assert.notEqual(internalStatus, 200);

    await page.goto(`${primary.origin}/ultimate-b2-builder.html`, { waitUntil: "networkidle" });
    await expectHeading(page, "Students Book hotspot builder");
    await page.getByRole("textbox", { name: "Book", exact: true }).waitFor();
    await page.getByRole("button", { name: /Save/ }).waitFor();

    const viewports = [
      { width: 1280, height: 720, name: "1280x720" },
      { width: 1920, height: 1080, name: "1920x1080" },
      { width: 768, height: 900, name: "768-tablet" },
      { width: 390, height: 844, name: "390-mobile" },
    ];
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto(`${primary.origin}/builder.html`, { waitUntil: "networkidle" });
      await expectHeading(page, "Book Project dashboard");
      await assertSafePage(page, networkBodies);
      await page.screenshot({ path: path.join(fixture.root, `studio-${viewport.name}.png`), fullPage: true });
    }

    const emptyWorkspace = path.join(fixture.root, "empty-workspace");
    await fs.mkdir(path.join(emptyWorkspace, "projects"), { recursive: true });
    const empty = await startStudio(emptyWorkspace);
    try {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(`${empty.origin}/builder.html`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "No Book Projects found" }).waitFor();
    } finally { await empty.server.close(); }

    process.stdout.write(`${JSON.stringify({ status: "review-studio-visual-safe", flows: 11, viewports: viewports.map((item) => item.name), syntheticReviews: 5007, screenshots: "temporary" }, null, 2)}\n`);
  } finally {
    await browser?.close();
    await primary.server.close();
    await fixture.cleanup();
  }
}

run().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
