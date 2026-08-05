import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";
import { createServer } from "vite";

import { createBookBuilderStudioFixture, prepareBookBuilderStudioAuthoringFixture, SYNTHETIC_TEACHER_SECRET } from "../../tests/helpers/book-builder-studio-fixture.mjs";
import { bookBuilderReviewStudioPlugin } from "./review-studio-api.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");

async function startStudio(workspace) {
  const server = await createServer({
    root: repositoryRoot,
    configFile: path.join(repositoryRoot, "vite.config.js"),
    appType: "mpa",
    logLevel: "error",
    plugins: [bookBuilderReviewStudioPlugin({ workspace, writeEnabled: true })],
    server: { host: "127.0.0.1", port: 0, strictPort: false },
  });
  await server.listen();
  return { server, origin: `http://127.0.0.1:${server.httpServer.address().port}` };
}

async function previewAndSave(page) {
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page.getByRole("heading", { name: "Confirm preview" }).waitFor();
  await page.getByRole("button", { name: "Confirm & save" }).click();
  await page.locator(".studio-decision-drawer").waitFor({ state: "detached" });
}

async function openComponentDrawer(page, origin) {
  await page.goto(`${origin}/builder.html#/projects/fictional-ultimate-review/components`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Components", exact: true }).waitFor();
  await page.getByRole("button", { name: "Decide", exact: true }).first().click();
  await page.getByRole("heading", { name: "course", exact: true }).waitFor();
}

async function assertSafe(page, networkBodies) {
  const body = await page.locator("body").innerText();
  assert.doesNotMatch(body, new RegExp(SYNTHETIC_TEACHER_SECRET));
  assert.doesNotMatch(body, /[A-Za-z]:\\(?:Users|AppData)|\/(?:Users|home)\//i);
  assert.doesNotMatch(networkBodies.join("\n"), new RegExp(SYNTHETIC_TEACHER_SECRET));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
}

async function run() {
  const fixture = await createBookBuilderStudioFixture();
  await prepareBookBuilderStudioAuthoringFixture(fixture);
  const studio = await startStudio(fixture.workspace);
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const networkBodies = [];
    page.on("response", async (response) => {
      if (!response.url().includes("/__hhplms/book-builder/") || !String(response.headers()["content-type"] || "").includes("application/json")) return;
      try { networkBodies.push(await response.text()); } catch { /* navigation can cancel a response */ }
    });
    await page.goto(`${studio.origin}/builder.html`, { waitUntil: "domcontentloaded" });
    await page.getByText("Local editing enabled — durable decisions change only this persistent Book Project copy.").waitFor();

    await openComponentDrawer(page, studio.origin);
    await page.getByLabel("Decision value").selectOption("students_book");
    await page.getByLabel("Approval state").selectOption("approved");
    await previewAndSave(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText("Effective: students_book").waitFor();
    await page.getByRole("button", { name: "Decide", exact: true }).first().click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Remove" }).click();
    await page.locator(".studio-decision-drawer").waitFor({ state: "detached" });

    await page.getByRole("tab", { name: "Pages & Hotspots" }).click();
    await page.getByRole("heading", { name: "Pages & Hotspots" }).waitFor();
    await page.getByRole("button", { name: "Decide page" }).click();
    await page.getByLabel("Approval state").selectOption("approved");
    await previewAndSave(page);
    await page.getByRole("button", { name: "Decide", exact: true }).first().click();
    await page.getByLabel("Decision value").selectOption("accepted_candidate");
    await page.getByLabel("Approval state").selectOption("approved");
    await previewAndSave(page);

    await page.getByRole("tab", { name: "Activities" }).click();
    await page.getByRole("heading", { name: "Activities" }).waitFor();
    await page.getByRole("button", { name: "Decide activity" }).click();
    await page.getByLabel("Approval state").selectOption("approved");
    await previewAndSave(page);
    await page.getByRole("button", { name: "Decide activity" }).click();
    await page.getByLabel("Decision kind").selectOption("activity_audience_policy");
    await page.getByLabel("Decision value").selectOption("teacher_only");
    await page.getByLabel("Approval state").selectOption("approved");
    await previewAndSave(page);

    await page.getByRole("tab", { name: "Review Queue" }).click();
    await page.getByRole("heading", { name: "Review Queue" }).waitFor();
    await page.locator("label.studio-field").filter({ hasText: /^Reason/ }).locator("select").selectOption("ambiguous_component_role");
    await page.waitForFunction(() => document.querySelectorAll(".studio-review-items > article").length === 1);
    await page.getByRole("button", { name: "Decide item" }).first().click();
    await page.getByLabel("Approval state").selectOption("approved");
    await previewAndSave(page);

    await page.getByRole("tab", { name: "Decisions & History" }).click();
    await page.getByRole("heading", { name: "Decisions & History" }).waitFor();
    assert.ok(await page.locator(".studio-history-list li").count() >= 6);
    await assertSafe(page, networkBodies);

    const second = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await openComponentDrawer(page, studio.origin);
    await openComponentDrawer(second, studio.origin);
    for (const candidate of [page, second]) {
      await candidate.getByLabel("Decision value").selectOption("students_book");
      await candidate.getByLabel("Approval state").selectOption("approved");
      await candidate.getByRole("button", { name: "Preview", exact: true }).click();
      await candidate.getByRole("heading", { name: "Confirm preview" }).waitFor();
    }
    await page.getByRole("button", { name: "Confirm & save" }).click();
    await second.getByRole("button", { name: "Confirm & save" }).click();
    await second.getByText("Project revision conflict", { exact: true }).waitFor();
    assert.equal(await second.getByLabel("Decision value").inputValue(), "students_book");
    second.once("dialog", (dialog) => dialog.accept());
    await second.getByRole("button", { name: "Close decision editor" }).click();
    await assertSafe(second, networkBodies);
    await second.close();

    for (const viewport of [{ width: 768, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await openComponentDrawer(page, studio.origin);
      await assertSafe(page, networkBodies);
      await page.getByRole("button", { name: "Close decision editor" }).click();
    }

    const project = JSON.parse(await fs.readFile(path.join(fixture.ultimate.projectRoot, "book-project.json"), "utf8"));
    assert.ok(project.revision >= 10);
    assert.ok(project.approvedDecisions.length >= 5);
    assert.doesNotMatch(JSON.stringify(project.approvedDecisions), new RegExp(SYNTHETIC_TEACHER_SECRET));
    process.stdout.write(`${JSON.stringify({ status: "review-studio-authoring-safe", finalRevision: project.revision, decisions: project.approvedDecisions.length, flows: 12 }, null, 2)}\n`);
  } finally {
    await browser?.close();
    await studio.server.close();
    await fixture.cleanup();
  }
}

run().catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
