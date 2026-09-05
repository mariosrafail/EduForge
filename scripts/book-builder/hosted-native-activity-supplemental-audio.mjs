import assert from "node:assert/strict";

export async function exerciseSupplementalAudio({ page, nativeDocuments, activityId, audioBytes, replacementAudioBytes, referenceBytes, replacementReferenceBytes }) {
  await page.getByRole("tab", { name: "Supplemental MP3" }).click();
  const editor = page.locator(".native-supplemental-audio-editor");
  const audioToggle = editor.getByRole("switch", { name: "Supplemental MP3", exact: true });
  assert.equal(await audioToggle.getAttribute("aria-checked"), "false");
  await audioToggle.click();
  await editor.getByText("Upload a supplemental MP3.", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Save Draft" }).isDisabled(), true);

  await editor.locator('input[type="file"][accept*="audio/mpeg"]').setInputFiles({ name: "supplemental-classroom.mp3", mimeType: "audio/mpeg", buffer: audioBytes });
  await editor.getByLabel("Supplemental MP3 preview").waitFor();
  assert.equal(await page.getByRole("button", { name: "Save Draft" }).isDisabled(), false);
  const referenceToggle = editor.getByRole("switch", { name: "Supplemental MP3 Reference" });
  await referenceToggle.click();
  await editor.getByText("No Reference image attached. The MP3 can be saved on its own.", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Save Draft" }).isDisabled(), false);
  await page.getByRole("tab", { name: "Content", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Save Draft" }).isDisabled(), false);
  await page.getByRole("button", { name: "Save Draft" }).click();
  await page.getByText("Draft saved.", { exact: true }).waitFor();
  assert.equal(Object.hasOwn(nativeDocuments.get(activityId).publicDocument.supplementalAudio, "reference"), false);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: new RegExp(activityId) }).click();
  await page.getByRole("tab", { name: "Supplemental MP3" }).click();
  await referenceToggle.click();
  const referenceInput = editor.locator('input[type="file"][accept*="image/png"]');
  await referenceInput.waitFor({ state: "attached" });
  await page.waitForFunction(() => !document.querySelector('.native-supplemental-audio-editor input[type="file"][accept*="image/png"]')?.disabled);
  await referenceInput.setInputFiles({ name: "readable-supplemental-reference.png", mimeType: "image/png", buffer: referenceBytes });
  await editor.locator("figure img").waitFor();
  await editor.getByLabel("Accessibility label").fill("Supplemental classroom transcript");
  await page.getByRole("button", { name: "Save Draft" }).click();
  await page.getByText("Draft saved.", { exact: true }).waitFor();

  const first = structuredClone(nativeDocuments.get(activityId).publicDocument.supplementalAudio);
  assert.ok(first.durationMs > 0);
  assert.equal(first.reference.altText, "Supplemental classroom transcript");
  const firstAudioAssetId = nativeDocuments.get(activityId).publicDocument.assets.find((asset) => asset.slot === first.assetSlot).assetId;
  const firstReferenceAssetId = nativeDocuments.get(activityId).publicDocument.assets.find((asset) => asset.slot === first.reference.assetSlot).assetId;

  const previousAudioSource = await editor.getByLabel("Supplemental MP3 preview").getAttribute("src");
  const previousReferenceSource = await editor.locator("figure img").getAttribute("src");
  await editor.locator('input[type="file"][accept*="audio/mpeg"]').setInputFiles({ name: "supplemental-classroom-replacement.mp3", mimeType: "audio/mpeg", buffer: replacementAudioBytes });
  await page.waitForFunction((source) => document.querySelector('.native-supplemental-audio-editor audio[aria-label="Supplemental MP3 preview"]')?.getAttribute("src") !== source, previousAudioSource);
  await page.waitForFunction(() => !document.querySelector('.native-supplemental-audio-editor input[type="file"][accept*="image/png"]')?.disabled);
  await editor.locator('input[type="file"][accept*="image/png"]').setInputFiles({ name: "readable-supplemental-reference-replacement.png", mimeType: "image/png", buffer: replacementReferenceBytes });
  await page.waitForFunction((source) => document.querySelector(".native-supplemental-audio-editor figure img")?.getAttribute("src") !== source, previousReferenceSource);
  await editor.getByLabel("Accessibility label").fill("Replacement supplemental transcript");
  await page.getByRole("button", { name: "Save Draft" }).click();
  await page.getByText("Draft saved.", { exact: true }).waitFor();
  const saved = nativeDocuments.get(activityId).publicDocument;
  assert.equal(saved.assets.some((asset) => asset.assetId === firstAudioAssetId), false);
  assert.equal(saved.assets.some((asset) => asset.assetId === firstReferenceAssetId), true, "shared readable-text bytes remain referenced");
  assert.equal(saved.readableText.assetSlot, first.reference.assetSlot);
  assert.notEqual(saved.supplementalAudio.reference.assetSlot, first.reference.assetSlot);
  assert.equal(saved.supplementalAudio.reference.altText, "Replacement supplemental transcript");
  assert.doesNotMatch(JSON.stringify(saved.supplementalAudio), /https?:\/\/|objectKey|teacher|answer/i);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: new RegExp(activityId) }).click();
  await page.getByRole("tab", { name: "Supplemental MP3" }).click();
  assert.equal(await page.getByRole("switch", { name: "Supplemental MP3", exact: true }).getAttribute("aria-checked"), "true");
  assert.equal(await page.getByRole("switch", { name: "Supplemental MP3 Reference" }).getAttribute("aria-checked"), "true");
  assert.equal(await page.getByLabel("Accessibility label").inputValue(), "Replacement supplemental transcript");

  await page.getByRole("tab", { name: "Local Preview" }).click();
  await page.getByRole("button", { name: "Student Preview" }).click();
  const root = page.locator(".native-or-preview .native-readable-text-presentation");
  const player = root.getByLabel("Supplemental audio player");
  await player.waitFor();
  const [rootBox, playerBox] = await Promise.all([root.boundingBox(), player.boundingBox()]);
  assert.ok(rootBox && playerBox);
  assert.ok(Math.abs(rootBox.x + rootBox.width - (playerBox.x + playerBox.width) - 24) < 2, "supplemental player remains right-anchored");
  assert.ok(Math.abs(rootBox.y + rootBox.height - (playerBox.y + playerBox.height) - 18) < 2, "supplemental player remains bottom-anchored");
  assert.equal(await player.getByRole("button", { name: "Open supplemental audio Reference" }).count(), 1);
  assert.equal(await root.evaluate((element) => element.querySelectorAll(".native-supplemental-audio-anchor").length), 1);

  await player.getByRole("button", { name: "Play supplemental audio" }).click();
  await page.waitForFunction(() => document.querySelector(".native-supplemental-audio-anchor + audio")?.paused === false);
  await player.getByRole("button", { name: "Mute Listening audio" }).click();
  assert.equal(await player.getByRole("button", { name: "Unmute Listening audio" }).getAttribute("aria-pressed"), "true");
  await player.getByRole("button", { name: "Open supplemental audio Reference" }).click();
  const reference = root.getByRole("region", { name: "Supplemental audio Reference" });
  await reference.waitFor();
  const scroll = reference.locator(".native-readable-text-scroll");
  const referenceImage = reference.getByRole("img");
  assert.equal(await referenceImage.getAttribute("alt"), "Replacement supplemental transcript");
  await referenceImage.evaluate((image) => image.decode());
  const scrollMetrics = await scroll.evaluate((element) => { const section = element.closest(".native-supplemental-audio-reference"); const root = element.closest("[data-native-media-scope]"); return { scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, width: element.clientWidth, sectionStyle: section?.getAttribute("style"), sectionHeight: section?.getBoundingClientRect().height, computedSectionHeight: getComputedStyle(section).height, rootHeight: root?.getBoundingClientRect().height, windowHeight: innerHeight, image: { width: element.firstElementChild?.getBoundingClientRect().width, height: element.firstElementChild?.getBoundingClientRect().height, naturalWidth: element.firstElementChild?.naturalWidth, naturalHeight: element.firstElementChild?.naturalHeight } }; });
  assert.ok(scrollMetrics.scrollHeight > scrollMetrics.clientHeight, JSON.stringify(scrollMetrics));
  assert.ok(Math.abs(scrollMetrics.sectionHeight - scrollMetrics.rootHeight) <= 1, JSON.stringify(scrollMetrics));
  assert.equal(await reference.getByRole("scrollbar", { name: "Supplemental audio Reference vertical scroll" }).count(), 1);
  await scroll.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  assert.ok(await scroll.evaluate((element) => element.scrollTop > 0));
  assert.equal(await root.locator("audio").evaluate((audio) => audio.paused), false, "audio continues while Reference is open");
  await page.keyboard.press("Escape");
  await reference.waitFor({ state: "hidden" });

  await root.getByRole("button", { name: "Video", exact: true }).click();
  assert.equal(await root.locator("audio").evaluate((audio) => audio.paused), true, "opening Video pauses supplemental audio");
  assert.equal(await root.getByLabel("Supplemental audio player").count(), 0);
  await root.getByRole("button", { name: "Questions", exact: true }).click();
  await root.getByLabel("Supplemental audio player").waitFor();
}
