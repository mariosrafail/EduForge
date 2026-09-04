import assert from "node:assert/strict";
import { expect } from "@playwright/test";

export async function exerciseDragDropExtensions(page, { dragDropId, savedDragDrop }) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("Search title, type, or ID").fill(dragDropId);
  for (let depth = 0; depth < 3; depth += 1) {
    await page.locator('.activity-tree-toggle[aria-expanded="false"]').evaluateAll((buttons) => buttons.forEach((button) => button.click()));
    await page.waitForTimeout(20);
  }
  await page.getByRole("button", { name: new RegExp(dragDropId) }).click();
  await page.getByRole("tab", { name: "Content" }).click();

  const reusableRow = page.locator(".native-drag-drop-word-row").nth(1);
  await reusableRow.getByRole("checkbox").check();
  await page.getByLabel("Answer bank height (px)").fill("132");
  await page.getByRole("tab", { name: "Answer Key" }).click();
  const extendedMappings = page.locator(".native-drag-drop-mapping select");
  await extendedMappings.nth(0).selectOption([
    { label: "repeated · word 2 · reusable" },
    { label: "distractor · word 4" },
  ]);
  await extendedMappings.nth(1).selectOption({ label: "repeated · word 2 · reusable" });
  await page.getByRole("tab", { name: "Local Preview" }).click();
  await page.locator(".studio-preview-panel").getByRole("button", { name: "Student Preview", exact: true }).click();

  const extendedPreview = page.locator(".studio-preview-panel .native-drag-drop");
  const extendedInteraction = savedDragDrop.publicDocument.parts[0].interaction;
  const reusableWordId = extendedInteraction.words[1].id;
  const distractorWordId = extendedInteraction.words[3].id;
  const firstExtendedTarget = extendedPreview.locator(`[data-drag-drop-target-id="${extendedInteraction.panels[0].dropTargets[0].id}"]`);
  const secondExtendedTarget = extendedPreview.locator(`[data-drag-drop-target-id="${extendedInteraction.panels[0].dropTargets[1].id}"]`);
  const reusableBankWord = extendedPreview.locator(`[data-drag-drop-word-id="${reusableWordId}"]`);
  assert.equal(await extendedPreview.getAttribute("class"), "native-drag-drop native-drag-drop-student");
  assert.match(await firstExtendedTarget.getAttribute("aria-label"), /0 of 2 places used/, "multi-select answer mapping raises the public target capacity");
  await reusableBankWord.click();
  await firstExtendedTarget.click();
  assert.equal(await reusableBankWord.count(), 1, "a reusable item remains available after placement");
  await expect(firstExtendedTarget.locator("[data-drag-drop-target-text]")).toHaveCount(1);

  const distractorBankWord = extendedPreview.locator(`[data-drag-drop-word-id="${distractorWordId}"]`);
  await distractorBankWord.click();
  await expect(distractorBankWord).toHaveAttribute("aria-pressed", "true");
  await firstExtendedTarget.focus();
  await firstExtendedTarget.press("Enter");
  await expect(firstExtendedTarget.locator("[data-drag-drop-target-text]")).toHaveCount(2);
  assert.equal(await firstExtendedTarget.getAttribute("data-full"), "true");
  await reusableBankWord.click();
  await secondExtendedTarget.click();
  assert.equal(await secondExtendedTarget.locator("[data-drag-drop-target-text]").count(), 1, "a reusable item can be correct in a second target");
  assert.equal(await reusableBankWord.count(), 1);

  await page.getByRole("tab", { name: "Answer Key" }).click();
  await page.locator(".native-drag-drop-mapping select").nth(1).selectOption({ label: "First · word 1" });
  await page.getByRole("tab", { name: "Content" }).click();
  await reusableRow.getByRole("checkbox").uncheck();
  await page.getByRole("radio", { name: "Text drag-and-drop" }).check();
  await page.getByLabel("Answer bank height (px)").fill("128");
  await page.getByLabel("Upper text-image panel height (px)").fill("310");
  await page.getByRole("tab", { name: "Local Preview" }).click();
  await page.locator(".studio-preview-panel").getByRole("button", { name: "Student Preview", exact: true }).click();

  const textPreview = page.locator(".studio-preview-panel .native-drag-drop");
  const textBankWord = textPreview.locator(`[data-drag-drop-word-id="${reusableWordId}"]`);
  assert.match(await textBankWord.textContent(), /B\. repeated/);
  await textBankWord.click();
  const firstTextTarget = textPreview.locator(`[data-drag-drop-target-id="${extendedInteraction.panels[0].dropTargets[0].id}"]`);
  await firstTextTarget.click();
  assert.equal((await firstTextTarget.textContent()).trim(), "B", "text mode places only the stable short label");
  assert.equal(await textBankWord.count(), 0, "text mode always consumes a placed phrase");
  const textModeLayout = await textPreview.evaluate((surface) => ({
    bank: surface.querySelector(".native-drag-drop-bank").getBoundingClientRect().height,
    workspace: surface.querySelector(".native-drag-drop-workspace").getBoundingClientRect().height,
    overflowY: getComputedStyle(surface.querySelector(".native-drag-drop-workspace")).overflowY,
  }));
  assert.ok(Math.abs(textModeLayout.bank - 128) <= 1 && Math.abs(textModeLayout.workspace - 310) <= 1, JSON.stringify(textModeLayout));
  assert.equal(textModeLayout.overflowY, "auto");

  await page.getByRole("tab", { name: "Layout" }).click();
  const targetCountBeforeImport = await page.locator(".native-drag-drop-authoring-target:not(.is-draft)").count();
  const bulkImporter = page.locator(".native-hotspot-bulk-importer");
  await bulkImporter.locator("summary").click();
  const importSurface = extendedInteraction.panels[0].surface;
  await bulkImporter.getByLabel("Paste target geometry").fill(
    `SOURCE ${importSurface.width}x${importSurface.height}\n\nPANEL 1\nTARGET 3 items=5 x=20 y=30 width=100 height=40`,
  );
  await bulkImporter.getByRole("button", { name: "Preview targets" }).click();
  await bulkImporter.getByRole("status").waitFor();
  assert.equal(await page.locator(".native-drag-drop-authoring-target:not(.is-draft)").count(), targetCountBeforeImport, "bulk preview is non-mutating");
  await bulkImporter.getByRole("button", { name: "Apply append" }).click();
  assert.equal(await page.locator(".native-drag-drop-authoring-target:not(.is-draft)").count(), targetCountBeforeImport + 1, "bulk apply updates public geometry and private mappings together");
}
