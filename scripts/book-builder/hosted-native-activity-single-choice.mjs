import assert from "node:assert/strict";
import { expect } from "@playwright/test";

import { waitForStableGeometry } from "./playwright-layout-stability.mjs";

const canvasSelector = ".native-single-choice-hotspot-canvas";
const hotspotSelector = ".native-single-choice-authoring-hotspot";
const selectedName = "Hotspot selected";

const sourceGeometry = async (page) => {
  const canvas = page.locator(canvasSelector);
  const values = await Promise.all([
    page.getByRole("spinbutton", { name: "X", exact: true }).inputValue(),
    page.getByRole("spinbutton", { name: "Y", exact: true }).inputValue(),
    page.getByRole("spinbutton", { name: "Width", exact: true }).inputValue(),
    page.getByRole("spinbutton", { name: "Height", exact: true }).inputValue(),
    canvas.getAttribute("data-surface-width"),
    canvas.getAttribute("data-surface-height"),
  ]);
  const [x, y, width, height, sourceWidth, sourceHeight] = values.map(Number);
  return { x, y, width, height, sourceWidth, sourceHeight };
};

export function sourceRectanglesOverlap(left, right) {
  return left.x < right.x + right.width && left.x + left.width > right.x
    && left.y < right.y + right.height && left.y + left.height > right.y;
}

export async function setVisualHotspotGeometry(page, area) {
  for (const [name, value] of [["X", 0], ["Y", 0], ["Width", area.width], ["Height", area.height], ["X", area.x], ["Y", area.y]]) {
    await page.getByRole("spinbutton", { name, exact: true }).fill(String(value));
  }
  const geometry = await sourceGeometry(page);
  assert.deepEqual(
    { x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height },
    area,
    "The hosted fixture must persist its deterministic source geometry through Builder controls",
  );
  assert.ok(area.x >= 0 && area.y >= 0 && area.x + area.width <= geometry.sourceWidth && area.y + area.height <= geometry.sourceHeight, "Deterministic hotspot geometry must stay inside the source image");
  return geometry;
}

export const createVisualHotspotCreator = (page) => async (bindingIndex, deterministicArea = null) => {
  const canvas = page.locator(canvasSelector);
  const hotspots = page.locator(hotspotSelector);
  const selected = page.getByRole("group", { name: selectedName });
  const initialHotspotCount = await hotspots.count();
  if (bindingIndex !== null && bindingIndex !== undefined) await page.getByLabel("Option to map").selectOption({ index: bindingIndex });
  await page.getByRole("button", { name: "New hotspot" }).click();
  await selected.waitFor();
  assert.equal(await hotspots.count(), initialHotspotCount + 1, "New hotspot must immediately create exactly one hotspot");
  assert.equal(await selected.count(), 1, "The new hotspot must be selected immediately");
  assert.equal(await selected.getByRole("button", { name: /Resize Hotspot from/ }).count(), 4, "All four resize handles must be available immediately");
  assert.equal(await canvas.evaluate((element) => element.classList.contains("is-drawing")), false, "Immediate creation must not enter drawing mode");
  assert.equal(await page.getByRole("button", { name: "Click target", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Visual highlight", exact: true }).count(), 0);
  assert.equal(await page.getByRole("group", { name: "Selected hotspot rectangle workflow" }).count(), 0);
  const geometry = await sourceGeometry(page);
  assert.equal(geometry.width, Math.min(25, geometry.sourceWidth));
  assert.equal(geometry.height, Math.min(25, geometry.sourceHeight));
  assert.ok(Number.isInteger(geometry.x) && Number.isInteger(geometry.y));
  assert.ok(geometry.x >= 0 && geometry.y >= 0 && geometry.x + geometry.width <= geometry.sourceWidth && geometry.y + geometry.height <= geometry.sourceHeight, "The new hotspot must stay inside the source image");
  return deterministicArea ? setVisualHotspotGeometry(page, deterministicArea) : geometry;
};

export async function exerciseVisualHotspotPointerMove(page, initialGeometry) {
  await page.getByRole("spinbutton", { name: "X", exact: true }).fill("200");
  await page.getByRole("spinbutton", { name: "Y", exact: true }).fill("80");
  const controls = ["X", "Y", "Width", "Height"].map((name) => page.getByRole("spinbutton", { name, exact: true }));
  const readGeometry = () => Promise.all(controls.map((control) => control.inputValue())).then((values) => values.map(Number));
  const baseline = await readGeometry();
  const sourceDimensions = [initialGeometry.sourceWidth, initialGeometry.sourceHeight, initialGeometry.sourceWidth, initialGeometry.sourceHeight];
  const canvas = page.locator(canvasSelector);
  const frame = page.getByRole("group", { name: selectedName });
  const renderedSourceGeometry = () => frame.evaluate((element, source) => ["left", "top", "width", "height"].map((property, index) => Math.round(Number.parseFloat(element.style[property]) * source[index] / 100)), sourceDimensions);
  await expect.poll(renderedSourceGeometry).toEqual(baseline);
  const frameBefore = (await waitForStableGeometry(frame, { label: "Selected hotspot before pointer movement" })).boxes[0];
  const canvasBox = await canvas.boundingBox();
  const label = frame.locator(".studio-selection-label");
  await label.hover();
  const selectedBefore = page.locator(`${hotspotSelector}.is-selected`);
  assert.equal(await selectedBefore.count(), 1, "Exactly one hotspot must be selected before pointer movement");
  const selectedHotspotName = await selectedBefore.getAttribute("aria-label");
  assert.ok(canvasBox && frameBefore && selectedHotspotName);
  const pointerStart = await label.evaluate((element, localCanvasSelector) => { const selectedFrame = element.closest(".studio-selection-frame"); const rect = element.getBoundingClientRect(); const x = rect.left + rect.width / 2; const y = rect.top + rect.height / 2; const hit = document.elementsFromPoint(x, y)[0]; return { x, y, hitTag: hit?.tagName || null, hitClass: hit?.className || null, belongsToFrame: Boolean(selectedFrame && hit && selectedFrame.contains(hit)), belongsToLabel: Boolean(hit && element.contains(hit)), isResizeHandle: Boolean(hit?.closest(".studio-resize-handle")), isCanvasBackground: hit === element.closest(localCanvasSelector) }; }, canvasSelector);
  assert.equal(pointerStart.belongsToFrame, true, `Pointer start must hit the selected frame: ${JSON.stringify(pointerStart)}`);
  assert.equal(pointerStart.belongsToLabel, true, `Pointer start must hit the actionable move grip: ${JSON.stringify(pointerStart)}`);
  assert.equal(pointerStart.isResizeHandle, false, `Pointer start must not hit a resize handle: ${JSON.stringify(pointerStart)}`);
  assert.equal(pointerStart.isCanvasBackground, false, `Pointer start must not hit the canvas background: ${JSON.stringify(pointerStart)}`);
  await frame.evaluate((element) => { element.addEventListener("pointerdown", (event) => { element.dataset.acceptancePointerTarget = event.target?.className || event.target?.tagName || "unknown"; }, { once: true }); });
  await page.mouse.down();
  await page.mouse.move(pointerStart.x + 10, pointerStart.y + 8, { steps: 6 });
  await page.mouse.up();
  const receivedPointerTarget = await frame.evaluate((element) => { const target = element.dataset.acceptancePointerTarget; delete element.dataset.acceptancePointerTarget; return target; });
  assert.ok(receivedPointerTarget, "The selected frame must receive the pointer-down used for movement");
  assert.equal(await frame.count(), 1, "The selected StageSelectionFrame must remain after pointer movement");
  const selectedAfter = page.locator(`${hotspotSelector}.is-selected`);
  assert.equal(await selectedAfter.count(), 1, "Pointer movement must preserve hotspot selection");
  assert.equal(await selectedAfter.getAttribute("aria-label"), selectedHotspotName, "Pointer movement must preserve the selected hotspot identity");
  await expect.poll(async () => (await readGeometry()).slice(0, 2)).not.toEqual(baseline.slice(0, 2));
  const pointerGeometry = await readGeometry();
  await expect.poll(renderedSourceGeometry).toEqual(pointerGeometry);
  const frameAfter = (await waitForStableGeometry(frame, { label: "Selected hotspot after pointer movement" })).boxes[0];
  assert.notDeepEqual(pointerGeometry.slice(0, 2), baseline.slice(0, 2), "Dragging the selected hotspot must change its source position");
  const renderedDelta = [frameAfter.left - frameBefore.left, frameAfter.top - frameBefore.top];
  const expectedDelta = [(pointerGeometry[0] - baseline[0]) * frameBefore.width / baseline[2], (pointerGeometry[1] - baseline[1]) * frameBefore.height / baseline[3]];
  for (let axis = 0; axis < 2; axis += 1) assert.ok(Math.abs(renderedDelta[axis] - expectedDelta[axis]) < 1.5, `Rendered hotspot frame movement must match source geometry on axis ${axis}: ${renderedDelta[axis]} vs ${expectedDelta[axis]}`);
  return canvasBox;
}
