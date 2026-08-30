import assert from "node:assert/strict";

const expectedTabs = ["Content", "Visual", "Audio & Timeline", "Page Mapping", "Answer Key", "Readable Text", "Video", "Local Preview"];

async function assertCompleteTranscript(surface, interaction) {
  const fragments = surface.locator(".native-oldschool-listening-transcript-fragment");
  await fragments.nth(2).waitFor();
  assert.equal(await fragments.count(), 3);
  assert.equal(await fragments.evaluateAll((entries) => entries.every((entry) => entry.getClientRects().length > 0 && getComputedStyle(entry).visibility === "visible")), true);
  for (const cue of interaction.cues) {
    const text = await surface.locator(`.native-oldschool-listening-transcript-fragment[data-cue-id="${cue.id}"]`).allTextContents();
    assert.equal(text.map((value) => value.trim()).filter(Boolean).join(" "), cue.text);
  }
}

async function measureRegistration(surface) {
  return surface.evaluate((root) => {
    const canvas = root.querySelector(".native-oldschool-listening-page-canvas");
    const fragment = root.querySelector(".native-oldschool-listening-transcript-fragment");
    const highlight = root.querySelector(`.native-oldschool-listening-highlight[data-region-id="${fragment?.dataset.regionId}"]`);
    const canvasRect = canvas.getBoundingClientRect();
    const normalized = (element) => { const rect = element.getBoundingClientRect(); return { x: (rect.left - canvasRect.left) / canvasRect.width, y: (rect.top - canvasRect.top) / canvasRect.height, width: rect.width / canvasRect.width, height: rect.height / canvasRect.height }; };
    return { canvasWidth: canvasRect.width, fragment: normalized(fragment), highlight: normalized(highlight) };
  });
}

function closeEnough(left, right, tolerance = .01) { return Math.abs(left - right) <= tolerance; }

export async function exerciseOldschoolPersistentTranscript({ page, oldschoolId, nativeDocuments, publishViewerHotspot }) {
  const interaction = nativeDocuments.get(oldschoolId).publicDocument.parts[0].interaction;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByLabel("Access").selectOption("all"); await page.getByLabel("Type").selectOption("all"); await page.getByPlaceholder("Search title, type, or ID").fill(oldschoolId);
  for (let depth = 0; depth < 3; depth += 1) { await page.locator('.activity-tree-toggle[aria-expanded="false"]').evaluateAll((buttons) => buttons.forEach((button) => button.click())); await page.waitForTimeout(20); }
  await page.getByRole("button", { name: new RegExp(oldschoolId) }).click(); const editor = page.locator(".native-oldschool-listening-editor"); await editor.waitFor();
  assert.deepEqual(await editor.getByRole("tab").allTextContents(), expectedTabs);
  await page.getByRole("tab", { name: "Page Mapping" }).click(); assert.equal(await page.locator(".native-oldschool-mapping-region").count(), 3);
  await page.getByRole("tab", { name: "Local Preview" }).click(); await page.getByRole("button", { name: "Student Preview" }).click();
  const preview = page.locator(".native-or-preview .native-oldschool-listening"); await preview.waitFor();
  assert.equal(await preview.getAttribute("data-view"), "questions"); assert.equal(await preview.getByText("The speaker emphasizes the later printed detail.", { exact: true }).count(), 0);
  await preview.getByLabel("Listening audio position").fill("1"); await preview.getByAltText("A full printed listening page with two highlighted passages").waitFor();
  await assertCompleteTranscript(preview, interaction); assert.equal(await preview.locator(".native-oldschool-listening-highlight").count(), 2);
  const firstRegion = interaction.cues[0].highlightRegions[0]; const panel = interaction.panels[1]; const firstRegistration = await measureRegistration(preview);
  for (const key of ["x", "y", "width", "height"]) assert.ok(closeEnough(firstRegistration.fragment[key], firstRegion[key] / (key === "x" || key === "width" ? panel.sourceWidth : panel.sourceHeight)), JSON.stringify(firstRegistration));
  for (const key of ["x", "y", "width", "height"]) assert.ok(closeEnough(firstRegistration.fragment[key], firstRegistration.highlight[key], .003), JSON.stringify(firstRegistration));
  await page.setViewportSize({ width: 1024, height: 768 }); await page.waitForTimeout(100); const resizedRegistration = await measureRegistration(preview);
  assert.ok(resizedRegistration.canvasWidth < firstRegistration.canvasWidth); for (const key of ["x", "y", "width", "height"]) assert.ok(closeEnough(resizedRegistration.fragment[key], firstRegistration.fragment[key], .003), JSON.stringify(resizedRegistration));
  await page.setViewportSize({ width: 1440, height: 900 });
  await preview.getByRole("button", { name: "Play Listening audio" }).click(); await preview.getByRole("button", { name: "Pause Listening audio" }).waitFor(); await assertCompleteTranscript(preview, interaction);
  await preview.getByRole("button", { name: "Pause Listening audio" }).click(); await assertCompleteTranscript(preview, interaction);
  await preview.locator("audio").evaluate((audio) => { Object.defineProperty(audio, "currentTime", { configurable: true, writable: true, value: 2.5 }); audio.dispatchEvent(new Event("timeupdate")); }); await page.waitForFunction((root) => root.querySelectorAll(".native-oldschool-listening-highlight").length === 1, await preview.elementHandle()); await assertCompleteTranscript(preview, interaction); await page.waitForTimeout(200); assert.ok(await preview.locator(".native-oldschool-listening-page-viewport").evaluate((element) => element.scrollTop) > 0);
  await preview.locator("audio").evaluate((audio) => { audio.currentTime = 1; audio.dispatchEvent(new Event("timeupdate")); }); await page.waitForFunction((root) => root.querySelectorAll(".native-oldschool-listening-highlight").length === 2, await preview.elementHandle()); await assertCompleteTranscript(preview, interaction);
  await preview.getByRole("button", { name: "Stop Listening audio" }).click(); await page.waitForFunction((root) => root.getAttribute("data-view") === "questions", await preview.elementHandle());
  await preview.getByLabel("Listening audio position").fill("1"); await assertCompleteTranscript(preview, interaction);
  await preview.getByRole("button", { name: "Play Listening audio" }).click(); await preview.locator("audio").evaluate((audio) => audio.dispatchEvent(new Event("ended"))); await page.waitForFunction((root) => root.getAttribute("data-view") === "questions", await preview.elementHandle()); assert.match(await preview.getByLabel("Listening audio time").innerText(), /^00:00 \/ /);
  await page.locator(".native-or-preview").getByRole("button", { name: "Teacher Preview" }).click(); const teacher = page.locator(".native-or-preview .native-oldschool-listening"); await teacher.locator(".native-or-answer-layer").click({ force: true }); assert.equal(await teacher.getByText("The speaker emphasizes the later printed detail.", { exact: true }).count(), 1);

  publishViewerHotspot();
  await page.locator('.hosted-builder-tool-tabs a[href$="/hotspots"]').click(); await page.reload({ waitUntil: "domcontentloaded" }); await page.getByRole("button", { name: "Review", exact: true }).click();
  const viewer = page.frameLocator(".unified-builder-review-dialog iframe"); await viewer.getByRole("button", { name: "Draft Oldschool Listening hotspot" }).click({ force: true }); const viewerSurface = viewer.locator(".native-oldschool-listening"); await viewerSurface.waitFor();
  assert.equal(await viewerSurface.getByText("The speaker emphasizes the later printed detail.", { exact: true }).count(), 0); await viewer.getByRole("button", { name: "Next activity part", exact: true }).click(); await assertCompleteTranscript(viewerSurface, interaction);
  await page.getByRole("button", { name: "Close Review" }).click(); await page.locator('.hosted-builder-tool-tabs a[href$="/activities"]').click();
}
