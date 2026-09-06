import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect } from "@playwright/test";
import { markWordsFixtureId } from "../tests/fixtures/native-mark-words.js";
import { nativeAssignmentCapability } from "../netlify/functions/_book-content/native-assignment-runtime.js";

export async function exercisePublishedMarkWords({ page, origin, publication, compiled }) {
  const entry = compiled.publicProjection.nativeActivities[markWordsFixtureId];
  const teacher = compiled.teacherProjection.nativeActivities[markWordsFixtureId].document;
  const capability = nativeAssignmentCapability("mark-the-words");
  const assignmentId = "10000000-0000-4000-8000-000000000096";
  const assignment = { id: assignmentId, title: "Assigned Mark the Words", status: "open", targetKind: "published_native", packageSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", target: { kind: "published_native", releaseId: publication.releaseId, nativeActivityId: markWordsFixtureId, nativeKind: "mark-the-words", entry, publication, capability } };
  let submissions = 0; const privateRequests = [];
  page.on("request", (request) => { if (/teacher.*(?:solution|document)|native-activity-teacher/.test(request.url())) privateRequests.push(request.url()); });
  await page.route("**/.netlify/functions/book-content?**", async (route) => {
    const action = new URL(route.request().url()).searchParams.get("action");
    if (action === "assignments") return route.fulfill({ json: { assignments: [assignment] } });
    if (action === "student-assignment") {
      assert.equal(new URL(route.request().url()).searchParams.get("assignmentId"), assignmentId);
      return route.fulfill({ json: { assignment: { ...assignment, assignmentId } } });
    }
    if (action !== "submit") return route.continue();
    const body = route.request().postDataJSON(); assert.deepEqual(Object.keys(body).sort(), ["assignmentId", "response"]);
    assert.equal(body.assignmentId, assignmentId); const normalized = capability.normalizeResponse(entry.document, body.response); assert.equal(normalized.error, undefined);
    assert.equal(submissions, 0); submissions += 1;
    const score = capability.evaluateResponse(entry.document, teacher, normalized.payload);
    Object.assign(assignment, { submissionId: "10000000-0000-4000-8000-000000000095", submittedAt: new Date().toISOString(), submissionStatus: score.status, scorePercent: score.scorePercent, responsePayload: normalized.payload });
    return route.fulfill({ json: { submission: { id: assignment.submissionId, ...score } } });
  });
  await page.goto(`${origin}/#activity-${markWordsFixtureId}`, { waitUntil: "domcontentloaded" });
  const surface = page.locator(".native-mark-words"); await surface.waitFor();
  const word = surface.getByRole("button", { name: "Passage 1, word 2: watch", exact: true });
  const repeated = surface.getByRole("button", { name: "Passage 1, word 6: watch", exact: true });
  const screenshotRoot = path.resolve("test-results/native-mark-words"); await mkdir(screenshotRoot, { recursive: true });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 900 }]) {
    await page.setViewportSize(viewport); await word.scrollIntoViewIfNeeded(); const before = await surface.boundingBox();
    await word.click(); await expect(word).toHaveAttribute("aria-pressed", "true"); await expect(repeated).toHaveAttribute("aria-pressed", "false");
    const after = await surface.boundingBox(); for (const key of ["width", "height"]) assert.ok(Math.abs(before[key] - after[key]) < .1);
    await word.press("Space"); await expect(word).toHaveAttribute("aria-pressed", "false");
    await page.screenshot({ path: path.join(screenshotRoot, `practice-${viewport.width}.png`), fullPage: true });
  }
  const touch = await page.context().newCDPSession(page);
  await touch.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await word.scrollIntoViewIfNeeded();
  const touchBox = await word.boundingBox();
  const point = { x: touchBox.x + touchBox.width / 2, y: touchBox.y + touchBox.height / 2 };
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(word).toHaveAttribute("aria-pressed", "true");
  await word.press("Enter"); await expect(word).toHaveAttribute("aria-pressed", "false");
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...point, y: point.y - 70 }] });
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(word).toHaveAttribute("aria-pressed", "false");
  await touch.send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await touch.detach();
  assert.equal(submissions, 0);
  await page.goto(`${origin}/#/student/assignments/${assignmentId}`, { waitUntil: "domcontentloaded" });
  await page.locator('.student-interactive-runtime[data-runtime-mode="assigned"] .native-mark-words').waitFor();
  for (const answer of teacher.parts[0].solution.answers) for (const id of answer.correctWordIds) await surface.locator(`[data-word-id="${id}"]`).click();
  await page.getByRole("button", { name: "Submit assignment", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Submit this assignment?", exact: true }); await dialog.waitFor(); assert.equal(submissions, 0);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click(); await expect(surface.locator('[aria-pressed="true"]')).toHaveCount(5);
  await page.getByRole("button", { name: "Submit assignment", exact: true }).click(); await dialog.getByRole("button", { name: "Submit final answers", exact: true }).click();
  await expect(surface.locator("button:enabled")).toHaveCount(0); assert.equal(submissions, 1); assert.equal(assignment.scorePercent, 100);
  await page.reload({ waitUntil: "domcontentloaded" }); await surface.waitFor(); await expect(surface.locator('[aria-pressed="true"]')).toHaveCount(5); await expect(surface.locator("button:enabled")).toHaveCount(0);
  await surface.locator("button").first().dispatchEvent("click"); await expect(surface.locator('[aria-pressed="true"]')).toHaveCount(5);
  await surface.locator("button").first().dispatchEvent("keydown", { key: " ", code: "Space" });
  await surface.locator("button").first().dispatchEvent("pointerup", { pointerType: "touch" });
  await expect(surface.locator('[aria-pressed="true"]')).toHaveCount(5);
  await page.screenshot({ path: path.join(screenshotRoot, "saved-review-768.png"), fullPage: true });
  assert.deepEqual(privateRequests, []); assert.equal(submissions, 1);
  process.stdout.write("Mark the Words LMS practice, touch, final submission and saved read-only review passed.\n");
}
