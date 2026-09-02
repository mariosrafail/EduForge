import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { assertAhemRendering } from "./hosted-native-activity-authoring-helpers.mjs";
import { landscapeChoicePng, portraitChoicePng, tallReadablePng } from "./hosted-native-activity-media-fixtures.mjs";

const testFontBytes = Buffer.from((await readFile(path.resolve("tests/fixtures/fonts/Ahem.ttf.base64"), "utf8")).trim(), "base64");

export async function handleCompleteSentencesFontRequest({ request, response, url, nativeRoot, origin, nativeFonts, nativeFontUploads, nativeAssets, nextSequence, json, requestBytes, requestJson }) {
  if (url.pathname === `${nativeRoot}/fonts` && request.method === "GET") {
    json(response, 200, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", fonts: [...nativeFonts.values()].map((font) => font.reference) });
    return true;
  }
  if (url.pathname === `${nativeRoot}/fonts/prepare` && request.method === "POST") {
    const body = await requestJson(request);
    const uploadId = `20000000-0000-4000-8000-${String(nextSequence()).padStart(12, "0")}`;
    nativeFontUploads.set(uploadId, { ...body, bytes: null });
    json(response, 200, { uploadId, expiresIn: 900, authorization: { url: `${origin}/fixture-font-upload/${uploadId}`, headers: { "Content-Type": "font/ttf" } }, idempotent: false });
    return true;
  }
  if (url.pathname.startsWith("/fixture-font-upload/") && request.method === "PUT") {
    const upload = nativeFontUploads.get(url.pathname.split("/").at(-1));
    if (!upload) json(response, 404, {});
    else {
      upload.bytes = await requestBytes(request);
      response.writeHead(200);
      response.end();
    }
    return true;
  }
  if (url.pathname === `${nativeRoot}/fonts/finalize` && request.method === "POST") {
    const body = await requestJson(request);
    const upload = nativeFontUploads.get(body.uploadId);
    if (!upload?.bytes) {
      json(response, 400, { error: "upload_incomplete" });
      return true;
    }
    const checksumSha256 = createHash("sha256").update(upload.bytes).digest("hex");
    let font = [...nativeFonts.values()].find((entry) => entry.reference.checksumSha256 === checksumSha256);
    if (!font) {
      const assetId = `20000000-0000-4000-8000-${String(nextSequence()).padStart(12, "0")}`;
      const slot = `font-${assetId.replaceAll("-", "")}`;
      const reference = { assetId, checksumSha256, role: "activity_font", slot, displayLabel: path.basename(upload.name, path.extname(upload.name)), familyAlias: `hh-native-font-${assetId.replaceAll("-", "")}`, byteSize: upload.bytes.length, previewUrl: `${nativeRoot}/fonts/${assetId}/preview` };
      font = { bytes: upload.bytes, type: "font/ttf", reference };
      nativeFonts.set(assetId, font);
      nativeAssets.set(assetId, { bytes: upload.bytes, type: "font/ttf", role: "activity_font" });
    }
    json(response, 200, { font: font.reference, idempotent: false });
    return true;
  }
  const fontPreviewMatch = url.pathname.match(new RegExp(`^${nativeRoot}/fonts/([0-9a-f-]+)/preview$`));
  if (fontPreviewMatch && request.method === "GET") {
    const font = nativeFonts.get(fontPreviewMatch[1]);
    if (!font) json(response, 404, {});
    else {
      response.writeHead(200, { "Content-Type": "font/ttf", "Content-Length": font.bytes.length });
      response.end(font.bytes);
    }
    return true;
  }
  return false;
}

export async function exerciseCompleteSentencesAuthoring({ page, nativeDocuments, nativeFonts, getNativeIndex, screenshotRoot, uploadReadableText, assertContentTabActive }) {
  await page.getByRole("button", { name: "Add Activity" }).click(); await page.getByRole("radio", { name: /Complete the Sentences/ }).check(); await page.getByLabel(/Initial title/).fill("Browser native complete sentences"); await page.getByRole("button", { name: "Create activity" }).click(); await assertContentTabActive(page, ".native-single-choice-editor");
  await page.getByRole("heading", { name: "Browser native complete sentences" }).first().waitFor(); const completeSentencesId = [...nativeDocuments].find(([, pair]) => pair.publicDocument.metadata.title === "Browser native complete sentences")[0]; assert.equal(await page.getByLabel("Visible instruction").count(), 0); await page.getByRole("button", { name: "Add Sentence" }).click(); const markedSentences = page.getByLabel("Full sentence with one marked answer"); await markedSentences.fill("I spent the weekend catching up on the series."); assert.equal(await page.getByRole("button", { name: "Save Draft" }).isDisabled(), true); await markedSentences.fill("I spent the weekend *catching up on* the series."); await page.getByRole("button", { name: "Add Sentence" }).click(); await markedSentences.fill("She *turned it in* yesterday."); await page.getByRole("button", { name: "Add Sentence" }).click(); await markedSentences.fill("This *unmapped draft answer* remains saveable."); await page.getByRole("tab", { name: "Local Preview" }).click(); assert.equal(await page.locator(".native-complete-sentences-inline-blank").count(), 3); await page.getByText("Unsaved changes", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "Answer Key" }).click(); await page.screenshot({ path: path.join(screenshotRoot, "native-complete-sentences-answer-key-1440.png"), fullPage: true }); await page.getByRole("tab", { name: "Visual" }).click(); const completeWorkspace = page.locator(".native-single-choice-visual-authoring .studio-visual-workspace"); const completeColumns = await completeWorkspace.evaluate((workspace) => { const box = workspace.getBoundingClientRect(); const canvas = workspace.querySelector(":scope > .studio-canvas-column").getBoundingClientRect(); const inspector = workspace.querySelector(":scope > .studio-inspector").getBoundingClientRect(); return { workspace: box.width, canvas: canvas.width, inspector: inspector.width }; }); assert.ok(completeColumns.canvas > completeColumns.workspace * .4 && completeColumns.inspector < completeColumns.workspace * .35, JSON.stringify(completeColumns)); await page.locator('.studio-inspector input[accept*="image/png"]').setInputFiles({ name: "complete-background.png", mimeType: "image/png", buffer: landscapeChoicePng }); const completeCanvas = page.locator(".native-single-choice-hotspot-canvas"); await completeCanvas.locator("img").waitFor(); await page.getByLabel("Sentence to map").selectOption({ index: 1 }); await page.getByRole("button", { name: "New hotspot" }).click(); const firstDefaultHotspot = completeCanvas.locator(".native-single-choice-authoring-hotspot").first(); await firstDefaultHotspot.waitFor(); const defaultGeometry = await firstDefaultHotspot.evaluate((hotspot) => { const area = hotspot.getBoundingClientRect(); const canvas = hotspot.parentElement.getBoundingClientRect(); return { centerX: area.left + area.width / 2 - canvas.left, centerY: area.top + area.height / 2 - canvas.top, canvasWidth: canvas.width, canvasHeight: canvas.height }; }); assert.ok(Math.abs(defaultGeometry.centerX - defaultGeometry.canvasWidth / 2) <= 2 && Math.abs(defaultGeometry.centerY - defaultGeometry.canvasHeight / 2) <= 2, JSON.stringify(defaultGeometry)); await completeCanvas.locator(".studio-selection-frame").press("Escape"); await page.getByLabel("Sentence to map").selectOption({ index: 2 }); await page.getByRole("button", { name: "Draw custom hotspot" }).click(); await completeCanvas.waitFor({ state: "visible" }); assert.match(await completeCanvas.getAttribute("class"), /is-drawing/); const completeCanvasBox = await completeCanvas.boundingBox(); assert.ok(completeCanvasBox); await completeCanvas.hover({ position: { x: completeCanvasBox.width * .58, y: completeCanvasBox.height * .35 } }); await page.mouse.down(); await completeCanvas.hover({ position: { x: completeCanvasBox.width * .86, y: completeCanvasBox.height * .45 } }); await page.mouse.up(); await completeCanvas.locator(".native-single-choice-authoring-hotspot").nth(1).waitFor();
  const firstCompleteHotspot = completeCanvas.locator(".native-single-choice-authoring-hotspot").first();
  await firstCompleteHotspot.click();
  await page.locator('.studio-inspector input[accept*=".ttf"]').setInputFiles({ name: "Ahem.ttf", mimeType: "font/ttf", buffer: testFontBytes });
  for (let attempt = 0; attempt < 100 && nativeFonts.size === 0; attempt += 1) await page.waitForTimeout(50);
  assert.equal(nativeFonts.size, 1, await page.locator(".studio-save-bar").textContent());
  await page.getByLabel("Answer font size").fill("240");
  await page.getByLabel("Answer text color").fill("#e40083");
  await page.getByRole("button", { name: "Add Panel", exact: true }).click();
  await page.getByRole("button", { name: "Move Up", exact: true }).click();
  await page.getByRole("button", { name: "Move Down", exact: true }).click();
  await page.locator('.studio-inspector input[accept*="image/png"]').setInputFiles({ name: "complete-background-panel-2.png", mimeType: "image/png", buffer: portraitChoicePng });
  await completeCanvas.locator("img").waitFor();
  await uploadReadableText(page, tallReadablePng, "readable-complete-sentences.png", "Complete the Sentences readable passage"); await page.getByRole("button", { name: "Save Draft" }).click(); await page.getByText("Draft saved.", { exact: true }).waitFor();
  assert.match(JSON.stringify(nativeDocuments.get(completeSentencesId).teacherDocument), /catching up on/); assert.match(JSON.stringify(nativeDocuments.get(completeSentencesId).teacherDocument), /turned it in/); assert.doesNotMatch(JSON.stringify(nativeDocuments.get(completeSentencesId).publicDocument), /catching up on|turned it in|unmapped draft answer/); assert.match(JSON.stringify(nativeDocuments.get(completeSentencesId).publicDocument), /\[\[blank\]\]/); assert.match(JSON.stringify(nativeDocuments.get(completeSentencesId).teacherDocument), /unmapped draft answer/); const savedCompletePresentation = nativeDocuments.get(completeSentencesId).publicDocument.parts[0].interaction.presentation; assert.equal(savedCompletePresentation.panels.length, 2);
  assert.equal(savedCompletePresentation.panels[0].hotspots.length, 2);
  assert.equal(savedCompletePresentation.panels[1].hotspots.length, 0);
  assert.equal(savedCompletePresentation.answerStyle.fontSize, 240);
  assert.equal(savedCompletePresentation.answerStyle.color, "#e40083");
  assert.ok(savedCompletePresentation.answerStyle.fontAssetSlot);
  assert.ok(savedCompletePresentation.panels[0].hotspots.every((hotspot) => !("presentation" in hotspot)));
  assert.equal(nativeDocuments.get(completeSentencesId).publicDocument.assets.filter((asset) => asset.role === "activity_font").length, 1);
  assert.equal(nativeFonts.size, 1);
  const completeSourceAspectRatio = savedCompletePresentation.panels[0].sourceWidth / savedCompletePresentation.panels[0].sourceHeight; await page.reload({ waitUntil: "domcontentloaded" }); await page.getByRole("button", { name: new RegExp(completeSentencesId) }).click(); await markedSentences.waitFor(); assert.equal(await markedSentences.inputValue(), "I spent the weekend *catching up on* the series."); await page.getByRole("tab", { name: "Local Preview" }).click(); const completePreview = page.getByRole("tabpanel", { name: "Local Preview" }); await completePreview.locator(".native-complete-sentences-blank input").first().fill("catching up"); assert.equal(await completePreview.locator(".native-complete-sentences-blank input").first().inputValue(), "catching up"); await page.getByRole("button", { name: "Teacher Preview" }).click(); const completeTeacherTarget = completePreview.locator(".native-complete-sentences-teacher-target").first();
  const completeTargetPresentation = await completeTeacherTarget.evaluate((target) => ({
    color: target.style.getPropertyValue("--native-complete-answer-color"),
    fontFamily: target.style.getPropertyValue("--native-complete-answer-font-family"),
    fontSize: target.style.getPropertyValue("--native-complete-answer-font-size"),
  }));
  assert.equal(completeTargetPresentation.color, "#e40083");
  assert.match(completeTargetPresentation.fontFamily, /^hh-native-font-/);
  assert.match(completeTargetPresentation.fontSize, /cqw$/);
  await assertAhemRendering(completeTeacherTarget, "Complete Sentences Teacher Preview");
  assert.equal(await completeTeacherTarget.getAttribute("data-revealed"), null); assert.equal(await completePreview.getByText("catching up on", { exact: true }).count(), 0); await completeTeacherTarget.focus(); await completeTeacherTarget.press("Enter"); assert.equal(await completeTeacherTarget.getAttribute("data-revealed"), "true"); assert.equal(await completePreview.getByText("catching up on", { exact: true }).count(), 1); assert.equal(await completePreview.getByText("turned it in", { exact: true }).count(), 0); await completeTeacherTarget.click(); assert.equal(await completePreview.getByText("catching up on", { exact: true }).count(), 1); await page.getByRole("button", { name: "Student Preview" }).click();
  assert.equal(await completePreview.getByText("catching up on", { exact: true }).count(), 0);
  const completePanelNavigation = completePreview.getByRole("navigation", { name: "Complete the Sentences panels" });
  await completePanelNavigation.getByRole("button", { name: "Next", exact: true }).click();
  await completePreview.getByText("Panel 2 of 2", { exact: true }).waitFor();
  assert.equal(await completePreview.locator(".native-complete-sentences-blank").count(), 0);
  await completePanelNavigation.getByRole("button", { name: "Previous", exact: true }).click();
  await completePreview.getByText("Panel 1 of 2", { exact: true }).waitFor();
  await page.locator('.hosted-builder-tool-tabs a[href$="/hotspots"]').click(); await page.locator(".editable-hotspot-box").first().click(); await page.getByLabel("Activity").selectOption(completeSentencesId); await page.getByLabel("Label").fill("Draft Complete Sentences hotspot"); await page.locator(".builder-save-state").getByRole("button", { name: "Save", exact: true }).click(); await page.locator(".builder-save-state").getByText("Saved", { exact: true }).waitFor(); await page.getByRole("button", { name: "Review", exact: true }).click(); const viewer = page.frameLocator(".unified-builder-review-dialog iframe"); await viewer.getByRole("button", { name: "Draft Complete Sentences hotspot" }).click({ force: true }); const completeViewerTargets = viewer.locator(".native-complete-sentences-teacher-target"); const revealedCompleteViewerTargets = viewer.locator(".native-complete-sentences-teacher-target[data-revealed]"); await completeViewerTargets.first().waitFor();
  const completeViewerNextPanel = viewer.getByRole("button", { name: "Next activity part", exact: true });
  const completeViewerPreviousPanel = viewer.getByRole("button", { name: "Previous activity part", exact: true });
  assert.equal(await completeViewerNextPanel.isDisabled(), false);
  await completeViewerNextPanel.click();
  await viewer.locator(`.native-complete-sentences-stage[data-panel-id="${savedCompletePresentation.panels[1].id}"]`).waitFor();
  assert.equal(await completeViewerTargets.count(), 0);
  await completeViewerPreviousPanel.click();
  await viewer.locator(`.native-complete-sentences-stage[data-panel-id="${savedCompletePresentation.panels[0].id}"]`).waitFor();
  await completeViewerTargets.first().waitFor();
  const completeFill = await viewer.locator(".native-complete-sentences-stage").evaluate((stage) => { const available = stage.closest(".native-readable-text-activity-view").getBoundingClientRect(); const box = stage.getBoundingClientRect(); return { available: { width: available.width, height: available.height }, stage: { width: box.width, height: box.height } }; }); assert.ok(Math.abs(completeFill.stage.width / completeFill.stage.height - completeSourceAspectRatio) < .02 && completeFill.stage.width <= completeFill.available.width + 2 && completeFill.stage.height <= completeFill.available.height + 2 && (completeFill.stage.width >= completeFill.available.width * .9 || completeFill.stage.height >= completeFill.available.height * .9), JSON.stringify(completeFill)); assert.equal(await revealedCompleteViewerTargets.count(), 0); await completeViewerTargets.nth(1).click(); await revealedCompleteViewerTargets.first().waitFor(); assert.equal(await revealedCompleteViewerTargets.count(), 1); const completeViewerShowNext = viewer.getByRole("button", { name: "Show Next", exact: true }); await completeViewerShowNext.click(); await revealedCompleteViewerTargets.nth(1).waitFor(); assert.equal(await revealedCompleteViewerTargets.count(), 2); assert.equal(await completeViewerShowNext.isDisabled(), true); const completeViewerReload = viewer.getByRole("button", { name: "Reload", exact: true }); await completeViewerReload.click(); await completeViewerTargets.first().waitFor(); await revealedCompleteViewerTargets.first().waitFor({ state: "detached" }); assert.equal(await revealedCompleteViewerTargets.count(), 0); const completeViewerShowAll = viewer.getByRole("button", { name: "Show All", exact: true }); await completeViewerShowAll.click(); await revealedCompleteViewerTargets.nth(1).waitFor(); assert.equal(await revealedCompleteViewerTargets.count(), 2); assert.equal(await completeViewerShowAll.isDisabled(), true); await page.getByRole("button", { name: "Close Review" }).click();
  await page.locator('.hosted-builder-tool-tabs a[href$="/activities"]').click(); const completeSearch = page.getByPlaceholder("Search title, type, or ID"); await completeSearch.fill(completeSentencesId); for (let depth = 0; depth < 3; depth += 1) { await page.locator('.activity-tree-toggle[aria-expanded="false"]').evaluateAll((buttons) => buttons.forEach((button) => button.click())); await page.waitForTimeout(20); } await page.getByRole("button", { name: new RegExp(completeSentencesId) }).click(); await page.getByRole("button", { name: "Move Activity", exact: true }).click(); const moveDialog = page.getByRole("dialog", { name: "Move activity" }); await moveDialog.getByLabel("Destination").selectOption("reading-19"); await moveDialog.getByRole("button", { name: "Move Activity", exact: true }).click(); await moveDialog.waitFor({ state: "detached" }); await page.getByText(/Activity moved.*destination page.*Hotspots/i).waitFor(); assert.equal(nativeDocuments.get(completeSentencesId).publicDocument.placement.pageId, "reading-19"); assert.equal(getNativeIndex().activities.find((entry) => entry.activityId === completeSentencesId).placement.pageId, "reading-19"); await page.reload({ waitUntil: "domcontentloaded" }); const movedSearch = page.getByPlaceholder("Search title, type, or ID"); await movedSearch.fill(completeSentencesId); const movedUnit = page.locator(".activity-navigation-tree > section").filter({ hasText: "Unit 2" }); await movedUnit.locator(":scope > .activity-tree-unit-row > .activity-tree-toggle").click(); await movedUnit.locator(".activity-tree-page > .activity-tree-toggle").click(); await page.getByRole("button", { name: new RegExp(completeSentencesId) }).click(); await page.getByRole("heading", { name: "Browser native complete sentences" }).waitFor(); await movedSearch.fill("");

  const removedCompletePanelSlot = savedCompletePresentation.panels[1].backgroundAssetSlot;
  await page.getByRole("tab", { name: "Visual" }).click();
  await page.locator(".studio-layer-list").getByRole("button", { name: /Panel 2/ }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete Panel", exact: true }).click();
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await page.getByText("Draft saved.", { exact: true }).waitFor();
  const completeAfterPanelDelete = nativeDocuments.get(completeSentencesId);
  assert.equal(completeAfterPanelDelete.publicDocument.parts[0].interaction.items.length, 3);
  assert.equal(completeAfterPanelDelete.teacherDocument.parts[0].solution.answers.length, 3);
  assert.equal(completeAfterPanelDelete.publicDocument.parts[0].interaction.presentation.panels.length, 1);
  assert.equal(completeAfterPanelDelete.publicDocument.assets.some((asset) => asset.slot === removedCompletePanelSlot), false);

  await page.getByRole("button", { name: "Add Activity" }).click(); await page.getByRole("radio", { name: /Complete the Sentences/ }).check(); await page.getByLabel(/Initial title/).fill("Second browser complete sentences"); await page.getByRole("button", { name: "Create activity" }).click(); await page.getByRole("heading", { name: "Second browser complete sentences" }).first().waitFor(); const secondCompleteSentencesId = [...nativeDocuments].find(([, pair]) => pair.publicDocument.metadata.title === "Second browser complete sentences")[0]; await page.getByRole("button", { name: "Add Sentence" }).click(); await page.getByLabel("Full sentence with one marked answer").fill("They *carried on* despite the rain."); await page.getByRole("tab", { name: "Visual" }).click(); await page.locator('.studio-inspector input[accept*="image/png"]').setInputFiles({ name: "second-complete-background.png", mimeType: "image/png", buffer: landscapeChoicePng }); const secondCompleteCanvas = page.locator(".native-single-choice-hotspot-canvas"); await secondCompleteCanvas.locator("img").waitFor(); await page.getByLabel("Sentence to map").selectOption({ index: 1 }); await page.getByRole("button", { name: "New hotspot" }).click(); await secondCompleteCanvas.locator(".native-single-choice-authoring-hotspot").waitFor(); const reusableFontSelect = page.locator(".studio-inspector select").filter({ has: page.locator("option", { hasText: "Ahem" }) }); assert.equal(await reusableFontSelect.count(), 1); assert.equal(await reusableFontSelect.locator("option", { hasText: "Ahem" }).count(), 1); await reusableFontSelect.selectOption({ label: "Ahem" }); assert.equal(nativeFonts.size, 1); await page.getByRole("button", { name: "Save Draft", exact: true }).click(); await page.getByText("Draft saved.", { exact: true }).waitFor(); assert.equal(nativeDocuments.get(secondCompleteSentencesId).publicDocument.assets.filter((asset) => asset.role === "activity_font").length, 1);
  return completeSentencesId;
}
