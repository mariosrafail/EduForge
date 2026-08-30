import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const expectedTabs = ["Content", "Visual", "Audio & Timeline", "Page Mapping", "Answer Key", "Readable Text", "Video", "Local Preview"];
const exactCueFragments = [
  ["...our lives.", "What", "Let's first take a look at TV series.", "Most series are"],
  ["The later sentence appears near the bottom of the page."],
];

function closeEnough(left, right, tolerance = .01) { return Math.abs(left - right) <= tolerance; }

export async function importOldschoolExactTranscriptMapping(page) {
  await page.getByRole("tab", { name: "Audio & Timeline" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export mapping JSON" }).click();
  const download = await downloadPromise; const mappingPath = await download.path(); assert.ok(mappingPath);
  const mapping = JSON.parse(await readFile(mappingPath, "utf8"));
  assert.deepEqual(mapping.cues.map((cue) => cue.highlightRegions.length), [4, 1]);
  mapping.cues.forEach((cue, cueIndex) => {
    cue.highlightRegions.forEach((region, regionIndex) => { region.text = exactCueFragments[cueIndex][regionIndex]; });
    cue.text = exactCueFragments[cueIndex].join(" ");
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('.native-oldschool-listening-editor input[type=file][accept*="application/json"]').setInputFiles({ name: "oldschool-exact-mapping.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(mapping)) });
  await page.getByText("2 canonical JSON cues imported.", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "Page Mapping" }).click();
  assert.equal(await page.locator(".native-oldschool-mapping-region").count(), 5);
}

async function assertCompleteTranscript(surface, interaction) {
  const fragments = surface.locator(".native-oldschool-listening-transcript-fragment");
  const expectedCount = interaction.cues.reduce((count, cue) => count + cue.highlightRegions.length, 0);
  await fragments.nth(expectedCount - 1).waitFor();
  assert.equal(await fragments.count(), expectedCount);
  assert.equal(await fragments.evaluateAll((entries) => entries.every((entry) => entry.getClientRects().length > 0 && getComputedStyle(entry).visibility === "visible")), true);
  for (const cue of interaction.cues) {
    const text = await surface.locator(`.native-oldschool-listening-transcript-fragment[data-cue-id="${cue.id}"]`).allTextContents();
    assert.equal(text.map((value) => value.trim()).filter(Boolean).join(" "), cue.text);
  }
}

async function exactPresentationMetrics(surface) {
  return surface.evaluate((root) => {
    const canvas = root.querySelector(".native-oldschool-listening-page-canvas"); const canvasRect = canvas.getBoundingClientRect();
    const normalized = (rect) => ({ x: (rect.left - canvasRect.left) / canvasRect.width, y: (rect.top - canvasRect.top) / canvasRect.height, width: rect.width / canvasRect.width, height: rect.height / canvasRect.height, right: (rect.right - canvasRect.left) / canvasRect.width });
    const fragments = [...root.querySelectorAll('.native-oldschool-listening-transcript-fragment[data-exact="true"]')].map((fragment) => {
      const line = fragment.firstElementChild; const text = fragment.querySelector(".native-oldschool-listening-exact-text"); const style = getComputedStyle(line); const highlightStyle = getComputedStyle(text); const range = document.createRange(); range.selectNodeContents(text);
      const textRect = text.getBoundingClientRect(); const rangeRect = range.getBoundingClientRect();
      return { cueId: fragment.dataset.cueId, regionId: fragment.dataset.regionId, text: text.textContent, highlighted: fragment.dataset.highlighted === "true", fragment: normalized(fragment.getBoundingClientRect()), textBox: normalized(textRect), textWidthPx: textRect.width, rangeWidthPx: rangeRect.width, rangeLeftPx: rangeRect.left, textLeftPx: textRect.left, rectCount: text.getClientRects().length, fontSize: style.fontSize, lineHeight: style.lineHeight, fontWeight: style.fontWeight, whiteSpace: style.whiteSpace, overflowWrap: style.overflowWrap, wordBreak: style.wordBreak, backgroundColor: highlightStyle.backgroundColor, outlineWidth: highlightStyle.outlineWidth };
    });
    return { canvasWidth: canvasRect.width, fragments, fallbackHighlights: root.querySelectorAll(".native-oldschool-listening-highlight").length };
  });
}

async function assertExactPresentation(surface, interaction, expectedActiveCount) {
  await assertCompleteTranscript(surface, interaction);
  const metrics = await exactPresentationMetrics(surface); const expectedCount = interaction.cues.reduce((count, cue) => count + cue.highlightRegions.length, 0);
  assert.equal(metrics.fragments.length, expectedCount); assert.equal(metrics.fallbackHighlights, 0);
  assert.deepEqual([...new Set(metrics.fragments.map((fragment) => fragment.fontSize))], ["21px"]);
  assert.deepEqual([...new Set(metrics.fragments.map((fragment) => fragment.lineHeight))], ["31px"]);
  assert.equal(metrics.fragments.every((fragment) => fragment.fontWeight === "400" && fragment.whiteSpace === "nowrap" && fragment.overflowWrap === "normal" && fragment.wordBreak === "normal" && fragment.rectCount === 1), true, JSON.stringify(metrics));
  assert.equal(metrics.fragments.filter((fragment) => fragment.highlighted).length, expectedActiveCount);
  assert.equal(metrics.fragments.filter((fragment) => fragment.highlighted).every((fragment) => fragment.backgroundColor !== "rgba(0, 0, 0, 0)" && fragment.outlineWidth === "3px" && Math.abs(fragment.textWidthPx - fragment.rangeWidthPx) <= 3 && Math.abs(fragment.textLeftPx - fragment.rangeLeftPx) <= 3), true, JSON.stringify(metrics));
  const regions = new Map(interaction.cues.flatMap((cue) => cue.highlightRegions.map((region) => [region.id, region]))); const panel = interaction.panels[1];
  for (const fragment of metrics.fragments) {
    const region = regions.get(fragment.regionId);
    for (const key of ["x", "y", "width", "height"]) assert.ok(closeEnough(fragment.fragment[key], region[key] / (key === "x" || key === "width" ? panel.sourceWidth : panel.sourceHeight), .003), JSON.stringify(fragment));
    assert.ok(closeEnough(fragment.textBox.x, fragment.fragment.x, .003), JSON.stringify(fragment)); assert.ok(closeEnough(fragment.textBox.y, fragment.fragment.y, .003), JSON.stringify(fragment));
  }
  const what = metrics.fragments.find((fragment) => fragment.text === "What"); assert.ok(what.textBox.width < what.fragment.width * .55, JSON.stringify(what));
  for (const [leftText, rightText] of [["...our lives.", "What"], ["Let's first take a look at TV series.", "Most series are"]]) {
    const left = metrics.fragments.find((fragment) => fragment.text === leftText); const right = metrics.fragments.find((fragment) => fragment.text === rightText);
    assert.ok(closeEnough(left.fragment.y, right.fragment.y, .003), JSON.stringify({ left, right })); assert.ok(left.textBox.right < right.textBox.x, JSON.stringify({ left, right }));
  }
  return metrics;
}

export async function exerciseOldschoolPersistentTranscript({ page, oldschoolId, nativeDocuments, publishViewerHotspot }) {
  const interaction = nativeDocuments.get(oldschoolId).publicDocument.parts[0].interaction;
  assert.deepEqual(interaction.cues.map((cue) => cue.highlightRegions.map((region) => region.text)), exactCueFragments);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByLabel("Access").selectOption("all"); await page.getByLabel("Type").selectOption("all"); await page.getByPlaceholder("Search title, type, or ID").fill(oldschoolId);
  for (let depth = 0; depth < 3; depth += 1) { await page.locator('.activity-tree-toggle[aria-expanded="false"]').evaluateAll((buttons) => buttons.forEach((button) => button.click())); await page.waitForTimeout(20); }
  await page.getByRole("button", { name: new RegExp(oldschoolId) }).click(); const editor = page.locator(".native-oldschool-listening-editor"); await editor.waitFor();
  assert.deepEqual(await editor.getByRole("tab").allTextContents(), expectedTabs);
  await page.getByRole("tab", { name: "Page Mapping" }).click(); assert.equal(await page.locator(".native-oldschool-mapping-region").count(), 5);
  await page.getByRole("tab", { name: "Local Preview" }).click(); await page.getByRole("button", { name: "Student Preview" }).click();
  const preview = page.locator(".native-or-preview .native-oldschool-listening"); await preview.waitFor();
  assert.equal(await preview.getAttribute("data-view"), "questions"); assert.equal(await preview.getByText("The speaker emphasizes the later printed detail.", { exact: true }).count(), 0);
  await preview.getByLabel("Listening audio position").fill("1"); await preview.getByAltText("A full printed listening page with two highlighted passages").waitFor();
  const firstMetrics = await assertExactPresentation(preview, interaction, 4);
  await page.setViewportSize({ width: 1024, height: 768 }); await page.waitForTimeout(100); const resizedMetrics = await assertExactPresentation(preview, interaction, 4);
  assert.ok(resizedMetrics.canvasWidth < firstMetrics.canvasWidth);
  for (const first of firstMetrics.fragments) { const resized = resizedMetrics.fragments.find((fragment) => fragment.regionId === first.regionId); for (const key of ["x", "y"]) assert.ok(closeEnough(resized.fragment[key], first.fragment[key], .003) && closeEnough(resized.textBox[key], first.textBox[key], .003), JSON.stringify({ first, resized })); }
  await page.setViewportSize({ width: 1440, height: 900 });
  await preview.getByRole("button", { name: "Play Listening audio" }).click(); await preview.getByRole("button", { name: "Pause Listening audio" }).waitFor(); await assertExactPresentation(preview, interaction, 4);
  await preview.getByRole("button", { name: "Pause Listening audio" }).click(); await assertExactPresentation(preview, interaction, 4);
  await preview.locator("audio").evaluate((audio) => { Object.defineProperty(audio, "currentTime", { configurable: true, writable: true, value: 2.5 }); audio.dispatchEvent(new Event("timeupdate")); }); await page.waitForFunction((root) => root.querySelectorAll('.native-oldschool-listening-transcript-fragment[data-highlighted="true"]').length === 1, await preview.elementHandle()); await assertExactPresentation(preview, interaction, 1); await page.waitForTimeout(200); assert.ok(await preview.locator(".native-oldschool-listening-page-viewport").evaluate((element) => element.scrollTop) > 0);
  await preview.locator("audio").evaluate((audio) => { audio.currentTime = 1; audio.dispatchEvent(new Event("timeupdate")); }); await page.waitForFunction((root) => root.querySelectorAll('.native-oldschool-listening-transcript-fragment[data-highlighted="true"]').length === 4, await preview.elementHandle()); await assertExactPresentation(preview, interaction, 4);
  await preview.getByRole("button", { name: "Stop Listening audio" }).click(); await page.waitForFunction((root) => root.getAttribute("data-view") === "questions", await preview.elementHandle());
  await preview.getByLabel("Listening audio position").fill("1"); await assertExactPresentation(preview, interaction, 4);
  await preview.getByRole("button", { name: "Play Listening audio" }).click(); await preview.locator("audio").evaluate((audio) => audio.dispatchEvent(new Event("ended"))); await page.waitForFunction((root) => root.getAttribute("data-view") === "questions", await preview.elementHandle()); assert.match(await preview.getByLabel("Listening audio time").innerText(), /^00:00 \/ /);
  await page.locator(".native-or-preview").getByRole("button", { name: "Teacher Preview" }).click(); const teacher = page.locator(".native-or-preview .native-oldschool-listening"); await teacher.locator(".native-or-answer-layer").click({ force: true }); assert.equal(await teacher.getByText("The speaker emphasizes the later printed detail.", { exact: true }).count(), 1);

  publishViewerHotspot();
  await page.locator('.hosted-builder-tool-tabs a[href$="/hotspots"]').click(); await page.reload({ waitUntil: "domcontentloaded" }); await page.getByRole("button", { name: "Review", exact: true }).click();
  const viewer = page.frameLocator(".unified-builder-review-dialog iframe"); await viewer.getByRole("button", { name: "Draft Oldschool Listening hotspot" }).click({ force: true }); const viewerSurface = viewer.locator(".native-oldschool-listening"); await viewerSurface.waitFor();
  assert.equal(await viewerSurface.getByText("The speaker emphasizes the later printed detail.", { exact: true }).count(), 0); await viewer.getByRole("button", { name: "Next activity part", exact: true }).click(); await assertExactPresentation(viewerSurface, interaction, 4);
  await page.getByRole("button", { name: "Close Review" }).click(); await page.locator('.hosted-builder-tool-tabs a[href$="/activities"]').click();
}
