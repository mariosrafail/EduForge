import assert from "node:assert/strict";

const canvasSelector = ".native-single-choice-hotspot-canvas";
const hotspotSelector = ".native-single-choice-authoring-hotspot";
const selectedName = "Click target selected";

const waitForStableCanvasTarget = async (page, canvas, ratios) => {
  const element = await canvas.elementHandle();
  assert.ok(element, "Single Choice hotspot canvas must exist");
  const result = await page.waitForFunction(async ({ element: target, ratios: drawRatios }) => {
    const nextFrame = () => new Promise(requestAnimationFrame);
    const readBox = () => { const { x, y, width, height, top, right, bottom, left } = target.getBoundingClientRect(); return { x, y, width, height, top, right, bottom, left }; };
    const describe = (node) => node ? { tag: node.tagName, className: String(node.className), pointerEvents: getComputedStyle(node).pointerEvents } : null;
    await nextFrame();
    const firstBox = readBox();
    await nextFrame();
    const secondBox = readBox();
    const point = (xRatio, yRatio) => ({ x: secondBox.x + secondBox.width * xRatio, y: secondBox.y + secondBox.height * yRatio });
    const start = point(drawRatios.startX, drawRatios.startY);
    const end = point(drawRatios.startX + .18, drawRatios.startY + .14);
    const pointsInsideViewport = [start, end].every(({ x, y }) =>
      x >= 0 && y >= 0 && x < innerWidth && y < innerHeight);
    const pointsInsideCanvas = [start, end].every(({ x, y }) =>
      x >= secondBox.left && y >= secondBox.top && x < secondBox.right && y < secondBox.bottom);
    const pointsHitCanvas = [start, end].every(({ x, y }) =>
      document.elementFromPoint(x, y) === target);
    const boxesMatch = ["x", "y", "width", "height"].every((key) => Math.abs(firstBox[key] - secondBox[key]) <= .25);
    if (!target.classList.contains("is-drawing") || firstBox.width <= 0 || firstBox.height <= 0 ||
      !boxesMatch || !pointsInsideCanvas || !pointsInsideViewport || !pointsHitCanvas) return false;
    const stack = (drawPoint) => document.elementsFromPoint(drawPoint.x, drawPoint.y).slice(0, 4).map(describe);
    return { box: secondBox, viewport: { width: innerWidth, height: innerHeight }, scroll: { x: scrollX, y: scrollY }, drawClass: target.className, start, end, startHit: describe(document.elementFromPoint(start.x, start.y)), endHit: describe(document.elementFromPoint(end.x, end.y)), startStack: stack(start), endStack: stack(end), firstBox, secondBox };
  }, { element, ratios }, { polling: "raf", timeout: 5_000 });
  return result.jsonValue();
};

const reportFailure = async ({ page, canvas, bindingIndex, initialHotspotCount, ratios, error }) => {
  const state = await canvas.evaluate((element, drawRatios) => {
    const { x, y, width, height, top, right, bottom, left } = element.getBoundingClientRect();
    const point = (xRatio, yRatio) => ({ x: x + width * xRatio, y: y + height * yRatio });
    const start = point(drawRatios.startX, drawRatios.startY); const end = point(drawRatios.startX + .18, drawRatios.startY + .14);
    const describe = (node) => node ? { tag: node.tagName, className: String(node.className), pointerEvents: getComputedStyle(node).pointerEvents } : null;
    const stack = (drawPoint) => document.elementsFromPoint(drawPoint.x, drawPoint.y).slice(0, 4).map(describe);
    return { box: { x, y, width, height, top, right, bottom, left }, viewport: { width: innerWidth, height: innerHeight }, scroll: { x: scrollX, y: scrollY }, drawClass: element.className, start, end, startHit: describe(document.elementFromPoint(start.x, start.y)), endHit: describe(document.elementFromPoint(end.x, end.y)), startStack: stack(start), endStack: stack(end) };
  }, ratios);
  const diagnostic = {
    bindingIndex,
    initialHotspotCount,
    hotspotCount: await page.locator(hotspotSelector).count(),
    selectedCount: await page.getByRole("group", { name: selectedName }).count(),
    state,
    error: { name: error.name, message: error.message },
  };
  console.error("SINGLE_CHOICE_HOTSPOT_GESTURE_FAILURE", JSON.stringify(diagnostic));
};

export const createVisualHotspotDrawer = (page) => async (bindingIndex, startX, startY) => {
  const canvas = page.locator(canvasSelector);
  const hotspots = page.locator(hotspotSelector);
  const selected = page.getByRole("group", { name: selectedName });
  const initialHotspotCount = await hotspots.count();
  const ratios = { startX, startY };
  try {
    assert.equal(await selected.count(), 0, "No hotspot may be selected before drawing");
    await page.getByLabel("Option to map").selectOption({ index: bindingIndex });
    await page.getByRole("button", { name: "Draw hotspot" }).click();
    await page.locator(`${canvasSelector}.is-drawing`).waitFor();
    await canvas.scrollIntoViewIfNeeded();
    const { start, end } = await waitForStableCanvasTarget(page, canvas, ratios);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y);
    await page.mouse.up();
    await selected.waitFor();
    assert.equal(await hotspots.count(), initialHotspotCount + 1, "A draw gesture must create exactly one hotspot");
    assert.equal(await selected.count(), 1, "The newly created hotspot must be selected");
    assert.equal(await canvas.evaluate((element) => element.classList.contains("is-drawing")), false,
      "Drawing mode must exit after the hotspot is committed");
    const [x, y, width, height, sourceWidth, sourceHeight] = await Promise.all([
      page.getByRole("spinbutton", { name: "X", exact: true }).inputValue(),
      page.getByRole("spinbutton", { name: "Y", exact: true }).inputValue(),
      page.getByRole("spinbutton", { name: "Width", exact: true }).inputValue(),
      page.getByRole("spinbutton", { name: "Height", exact: true }).inputValue(),
      canvas.getAttribute("data-surface-width"),
      canvas.getAttribute("data-surface-height"),
    ]).then((values) => values.map(Number));
    assert.ok(width > 0 && height > 0, "The new hotspot must have positive geometry");
    assert.ok(x >= 0 && y >= 0 && x + width <= sourceWidth && y + height <= sourceHeight,
      "The new hotspot must stay inside the source image");
  } catch (error) {
    await reportFailure({ page, canvas, bindingIndex, initialHotspotCount, ratios, error });
    throw error;
  }
};
