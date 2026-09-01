import assert from "node:assert/strict";

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
