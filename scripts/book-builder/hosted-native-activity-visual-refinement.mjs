import assert from "node:assert/strict";

const number = async (scope, label) => Number(await scope.getByLabel(`Quick ${label}`, { exact: true }).inputValue());
const ratio = async (scope) => (await number(scope, "Width")) / (await number(scope, "Height"));

export async function exerciseOuterFocusAspectRatio(page, audioEditor) {
  await audioEditor.locator(".native-audio-hotspot-focus-tools").getByRole("button", { name: "Select outer focus", exact: true }).click();
  const original = Object.fromEntries(await Promise.all(["X", "Y", "Width", "Height"].map(async (label) => [label, await number(audioEditor, label)])));
  const deleteInner = audioEditor.getByRole("button", { name: "Delete inner highlight", exact: true }); if (await deleteInner.count()) await deleteInner.click();
  const toggle = audioEditor.getByLabel("Keep aspect ratio", { exact: true });
  await toggle.check();
  const width = audioEditor.getByLabel("Quick Width", { exact: true }); const height = audioEditor.getByLabel("Quick Height", { exact: true });
  await width.fill("512"); assert.ok(Math.abs((await ratio(audioEditor)) - 512 / 291) < .00001); assert.equal(await number(audioEditor, "Height"), 291);
  await height.fill("220"); assert.ok(Math.abs((await ratio(audioEditor)) - 512 / 291) < .00001);
  const size = { width: await number(audioEditor, "Width"), height: await number(audioEditor, "Height") };
  await audioEditor.getByLabel("Quick X", { exact: true }).fill("99999"); await audioEditor.getByLabel("Quick Y", { exact: true }).fill("99999");
  assert.deepEqual({ width: await number(audioEditor, "Width"), height: await number(audioEditor, "Height") }, size);
  for (const corner of ["top left", "top right", "bottom right", "bottom left"]) {
    const handle = audioEditor.getByRole("button", { name: `Resize Outer readable text focus from ${corner}` }); const box = await handle.boundingBox(); assert.ok(box);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + (corner.includes("left") ? -8 : 8), box.y + box.height / 2 + (corner.includes("top") ? -5 : 5)); await page.mouse.up();
    assert.ok(Math.abs((await ratio(audioEditor)) - 512 / 291) < .00001, corner);
  }
  await toggle.uncheck(); const freeformHeight = await number(audioEditor, "Height"); await width.fill("300"); assert.equal(await number(audioEditor, "Height"), freeformHeight);
  await width.fill(String(original.Width)); await height.fill(String(original.Height)); await audioEditor.getByLabel("Quick X", { exact: true }).fill(String(original.X)); await audioEditor.getByLabel("Quick Y", { exact: true }).fill(String(original.Y));
  await audioEditor.getByRole("button", { name: "Add inner highlight", exact: true }).click(); await audioEditor.locator(".native-audio-hotspot-focus-tools").getByRole("button", { name: "Select outer focus", exact: true }).click();
}

export async function exerciseCompleteSentencesGeometry(page, editor) {
  await editor.locator(".native-single-choice-authoring-hotspot").first().click();
  const x = editor.getByLabel("Quick X", { exact: true }); const y = editor.getByLabel("Quick Y", { exact: true }); const width = editor.getByLabel("Quick Width", { exact: true }); const height = editor.getByLabel("Quick Height", { exact: true });
  await x.fill("111"); await y.fill("123"); await width.fill("280"); await height.fill("64");
  const frame = editor.getByRole("group", { name: "Blank hotspot selected", exact: true }); const beforeDrag = Number(await x.inputValue()); const box = await frame.boundingBox(); assert.ok(box);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 18, box.y + box.height / 2 + 6); await page.mouse.up(); assert.notEqual(Number(await x.inputValue()), beforeDrag);
  const resize = frame.getByRole("button", { name: "Resize Blank hotspot from bottom right" }); const resizeBox = await resize.boundingBox(); const beforeResize = Number(await width.inputValue()); assert.ok(resizeBox);
  await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2); await page.mouse.down(); await page.mouse.move(resizeBox.x + resizeBox.width / 2 + 15, resizeBox.y + resizeBox.height / 2 + 8); await page.mouse.up(); assert.notEqual(Number(await width.inputValue()), beforeResize);
  const lock = editor.getByLabel("Lock hotspot position", { exact: true }); await lock.check(); for (const input of [x, y, width, height]) assert.equal(await input.isDisabled(), true); await lock.uncheck();
  await x.fill("111"); await y.fill("123"); await width.fill("280"); await height.fill("64"); await editor.getByLabel("Quick Answer font size", { exact: true }).fill("32"); await editor.getByLabel("Answer text color", { exact: true }).fill("#e40083");
  return { area: { x: 111, y: 123, width: 280, height: 64 }, presentation: { fontSize: 32, color: "#e40083" } };
}

export async function exerciseListeningTranscriptGeometry(editor) {
  const controls = editor.getByRole("group", { name: "Listening transcript region geometry" });
  for (const [label, value] of [["X", 90], ["Y", 80], ["Width", 700], ["Height", 420]]) await controls.getByLabel(`Quick ${label}`, { exact: true }).fill(String(value));
  assert.deepEqual(await Promise.all(["X", "Y", "Width", "Height"].map((label) => number(controls, label))), [90, 80, 700, 420]);
  return { x: 90, y: 80, width: 700, height: 420 };
}

export async function exerciseListeningSelectedGeometry(editor) {
  const controls = editor.getByRole("group", { name: "Listening snippet geometry" });
  for (const [label, value] of [["X", 700], ["Y", 55], ["Width", 56], ["Height", 52]]) await controls.getByLabel(`Quick ${label}`, { exact: true }).fill(String(value));
  assert.deepEqual(await Promise.all(["X", "Y", "Width", "Height"].map((label) => number(controls, label))), [700, 55, 56, 52]);
}

export async function assertBoxlessCompleteReveal(target, expectedColor = "rgb(228, 0, 131)") {
  const style = await target.evaluate((element) => { const computed = getComputedStyle(element); return { background: computed.backgroundColor, border: computed.borderStyle, radius: computed.borderRadius, shadow: computed.boxShadow, color: computed.color, outline: computed.outlineStyle }; });
  assert.deepEqual({ background: style.background, border: style.border, radius: style.radius, shadow: style.shadow }, { background: "rgba(0, 0, 0, 0)", border: "none", radius: "0px", shadow: "none" });
  assert.equal(style.color, expectedColor); assert.equal(style.outline, "none");
}

export async function measureListeningStage(root) {
  return root.evaluate((element) => { const bounds = (target) => { const rect = target.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }; }; const stage = bounds(element.querySelector(".native-listening-activity-stage")); const player = bounds(element.querySelector(".native-listening-player-anchor")); return { stage, player, view: element.dataset.view, ratio: stage.width / stage.height, playerInside: player.left >= stage.left && player.right <= stage.right + 1 && player.top >= stage.top && player.bottom <= stage.bottom + 1 }; });
}

export function assertStableListeningStages(before, after) {
  assert.ok(Math.abs(before.ratio - 1024 / 582) < .02 && Math.abs(after.ratio - 1024 / 582) < .02, JSON.stringify({ before, after }));
  assert.ok(Math.abs(before.stage.width - after.stage.width) <= 1 && Math.abs(before.stage.height - after.stage.height) <= 1, JSON.stringify({ before, after }));
  assert.equal(before.playerInside, true); assert.equal(after.playerInside, true); assert.equal(before.view, "questions"); assert.equal(after.view, "transcript");
}

async function openActivity(page, activityId) {
  await page.locator('.hosted-builder-tool-tabs a[href$="/activities"]').click();
  const search = page.getByPlaceholder("Search title, type, or ID"); await search.fill(activityId);
  for (let depth = 0; depth < 3; depth += 1) await page.locator('.activity-tree-toggle[aria-expanded="false"]').evaluateAll((buttons) => buttons.forEach((button) => button.click()));
  await page.getByRole("button", { name: new RegExp(activityId) }).click();
}

export async function exercisePersistedVisualRefinements(page, { completeSentencesId, listeningId }) {
  await openActivity(page, completeSentencesId); await page.getByRole("tab", { name: "Visual" }).click();
  const completeExpected = await exerciseCompleteSentencesGeometry(page, page.locator(".native-single-choice-editor")); await page.getByRole("button", { name: "Save Draft" }).click(); await page.getByText("Draft saved.", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "Local Preview" }).click(); await page.getByRole("button", { name: "Teacher Preview" }).click(); const target = page.locator(".studio-preview-panel .native-complete-sentences-teacher-target").first(); await target.click(); await assertBoxlessCompleteReveal(target);

  await openActivity(page, listeningId); await page.getByRole("tab", { name: "Visual" }).click(); const listening = page.locator(".native-listening-editor");
  await listening.locator(".native-or-prompt").first().click(); await listening.getByRole("group", { name: "Listening prompt geometry" }).getByLabel("Quick X", { exact: true }).fill("140");
  await listening.locator("button.native-or-response").first().click(); await listening.getByRole("group", { name: "Listening response geometry" }).getByLabel("Quick Y", { exact: true }).fill("330");
  await listening.locator(".native-or-layers button").first().click(); const artworkControls = listening.getByRole("group", { name: "Listening artwork geometry" }); const artworkX = artworkControls.getByLabel("Quick X", { exact: true }); const artworkLock = listening.getByLabel("Lock position and size", { exact: true }); await artworkLock.check(); assert.equal(await artworkX.isDisabled(), true); await artworkLock.uncheck(); await artworkX.fill("25");
  await listening.locator(".native-listening-hotspot-dot").first().click(); await exerciseListeningSelectedGeometry(listening);
  await page.getByRole("tab", { name: "Audio & Transcript" }).click(); const transcriptExpected = await exerciseListeningTranscriptGeometry(listening);
  await page.getByRole("button", { name: "Save Draft" }).click(); await page.getByText("Draft saved.", { exact: true }).waitFor(); await page.reload({ waitUntil: "domcontentloaded" }); await openActivity(page, listeningId); await page.getByRole("tab", { name: "Audio & Transcript" }).click(); assert.deepEqual(await Promise.all(["X", "Y", "Width", "Height"].map((label) => number(listening.getByRole("group", { name: "Listening transcript region geometry" }), label))), Object.values(transcriptExpected));
  await page.getByRole("tab", { name: "Local Preview" }).click(); await page.getByRole("button", { name: "Student Preview" }).click(); const preview = page.locator(".native-or-preview .native-listening"); const before = await measureListeningStage(preview); await preview.getByRole("button", { name: "Play Listening audio" }).click(); await preview.locator(".native-listening-transcript").waitFor(); const after = await measureListeningStage(preview); assertStableListeningStages(before, after); await preview.getByRole("button", { name: "Pause Listening audio" }).click(); assert.equal(await preview.getAttribute("data-view"), "transcript"); await preview.getByRole("button", { name: "Play Listening audio" }).click(); assert.equal(await preview.getAttribute("data-view"), "transcript"); await preview.getByRole("button", { name: "Stop Listening audio" }).click(); assert.equal(await preview.getAttribute("data-view"), "questions");
  return { completeExpected, transcriptExpected };
}
