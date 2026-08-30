import assert from "node:assert/strict";

const canvasSelector = ".native-single-choice-hotspot-canvas";
const hotspotSelector = ".native-single-choice-authoring-hotspot";
const selectedName = "Click target selected";
const readinessBoxProperty = "__hhplmsSingleChoiceHotspotReadinessBox";
const fallbackOffsets = [[0, 0], [.02, 0], [-.02, 0], [0, .02], [0, -.02]];

const boxesMatch = (left, right) =>
  ["x", "y", "width", "height"].every((key) => Math.abs(left[key] - right[key]) <= .25);

const waitForStableCanvasTarget = async (page, canvas, ratios) => {
  const element = await canvas.elementHandle();
  assert.ok(element, "Single Choice hotspot canvas must exist");
  await canvas.evaluate((target, property) => { delete target[property]; }, readinessBoxProperty);
  const result = await page.waitForFunction(({ element: target, ratios: drawRatios, property }) => {
    const readBox = () => { const { x, y, width, height, top, right, bottom, left } = target.getBoundingClientRect(); return { x, y, width, height, top, right, bottom, left }; };
    const currentBox = readBox();
    const previousBox = target[property]?.observedBox || null;
    const point = (xRatio, yRatio) => ({ x: currentBox.x + currentBox.width * xRatio, y: currentBox.y + currentBox.height * yRatio });
    const candidates = drawRatios.map(({ startX, startY }) => {
      const start = point(startX, startY); const end = point(startX + .18, startY + .14);
      const insideViewport = [start, end].every(({ x, y }) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight);
      const insideCanvas = [start, end].every(({ x, y }) => x >= currentBox.left && y >= currentBox.top && x < currentBox.right && y < currentBox.bottom);
      const hitsCanvas = [start, end].every(({ x, y }) => document.elementFromPoint(x, y) === target);
      return { insideViewport, insideCanvas, hitsCanvas };
    });
    const candidateIndex = candidates.findIndex(({ insideViewport, insideCanvas, hitsCanvas }) => insideViewport && insideCanvas && hitsCanvas);
    const stable = previousBox && ["x", "y", "width", "height"].every((key) => Math.abs(previousBox[key] - currentBox[key]) <= .25);
    const ready = target.classList.contains("is-drawing") && currentBox.width > 0 && currentBox.height > 0 &&
      stable && candidateIndex >= 0;
    target[property] = { observedBox: currentBox, readinessBox: ready ? currentBox : null, readinessCandidateIndex: ready ? candidateIndex : null };
    return Boolean(ready);
  }, { element, ratios, property: readinessBoxProperty }, { polling: "raf", timeout: 5_000 });
  await result.dispose();
};

const readCanvasSnapshot = (canvas, ratios) => canvas.evaluate((element, { drawRatios, property }) => {
    const { x, y, width, height, top, right, bottom, left } = element.getBoundingClientRect();
    const point = (xRatio, yRatio) => ({ x: x + width * xRatio, y: y + height * yRatio });
    const candidateSnapshots = drawRatios.map(({ startX, startY }) => {
      const start = point(startX, startY); const end = point(startX + .18, startY + .14);
      const startTarget = document.elementFromPoint(start.x, start.y); const endTarget = document.elementFromPoint(end.x, end.y);
      const insideViewport = [start, end].every(({ x: pointX, y: pointY }) => pointX >= 0 && pointY >= 0 && pointX < innerWidth && pointY < innerHeight);
      const insideCanvas = [start, end].every(({ x: pointX, y: pointY }) => pointX >= left && pointY >= top && pointX < right && pointY < bottom);
      return { start, end, startTarget, endTarget, insideViewport, insideCanvas, hitsCanvas: startTarget === element && endTarget === element };
    });
    const candidateIndex = candidateSnapshots.findIndex(({ insideViewport, insideCanvas, hitsCanvas }) => insideViewport && insideCanvas && hitsCanvas);
    const chosen = candidateSnapshots[candidateIndex >= 0 ? candidateIndex : 0];
    const { start, end, startTarget, endTarget } = chosen;
    const describe = (node) => node ? { tag: node.tagName, className: String(node.className), pointerEvents: getComputedStyle(node).pointerEvents } : null;
    const stack = (drawPoint) => document.elementsFromPoint(drawPoint.x, drawPoint.y).slice(0, 4).map(describe);
    const readinessBox = element[property]?.readinessBox || null;
    const readinessCandidateIndex = element[property]?.readinessCandidateIndex ?? null;
    return { readinessBox, readinessCandidateIndex, candidateIndex, box: { x, y, width, height, top, right, bottom, left }, viewport: { width: innerWidth, height: innerHeight }, scroll: { x: scrollX, y: scrollY }, drawClass: element.className, drawActive: element.classList.contains("is-drawing"), start, end, startHitsCanvas: startTarget === element, endHitsCanvas: endTarget === element, startHit: describe(startTarget), endHit: describe(endTarget), startStack: stack(start), endStack: stack(end) };
  }, { drawRatios: ratios, property: readinessBoxProperty });

const validateCanvasSnapshot = (snapshot) => {
  assert.ok(snapshot && typeof snapshot === "object", "The stable canvas snapshot must exist");
  assert.ok(snapshot.readinessBox && typeof snapshot.readinessBox === "object", "The readiness canvas box must exist");
  assert.ok(snapshot.box && typeof snapshot.box === "object", "The current canvas box must exist");
  assert.ok(snapshot.start && typeof snapshot.start === "object", "The stable canvas snapshot must include a start point");
  assert.ok(snapshot.end && typeof snapshot.end === "object", "The stable canvas snapshot must include an end point");
  assert.ok([snapshot.start.x, snapshot.start.y, snapshot.end.x, snapshot.end.y].every(Number.isFinite), "Hotspot gesture coordinates must be finite numbers");
  assert.ok(Number.isFinite(snapshot.viewport?.width) && Number.isFinite(snapshot.viewport?.height) && snapshot.viewport.width > 0 && snapshot.viewport.height > 0, "The stable canvas snapshot must include positive viewport dimensions");
  assert.ok(Number.isFinite(snapshot.readinessBox.width) && Number.isFinite(snapshot.readinessBox.height) && snapshot.readinessBox.width > 0 && snapshot.readinessBox.height > 0, "The readiness canvas box must have positive dimensions");
  assert.ok(Number.isFinite(snapshot.box.width) && Number.isFinite(snapshot.box.height) && snapshot.box.width > 0 && snapshot.box.height > 0, "The current canvas box must have positive dimensions");
  assert.ok(boxesMatch(snapshot.readinessBox, snapshot.box), "The canvas geometry changed after readiness");
  assert.equal(snapshot.candidateIndex, snapshot.readinessCandidateIndex, "The drawable hotspot target changed after readiness");
  assert.equal(snapshot.drawActive, true, "Drawing mode must remain active before the gesture");
  assert.ok([snapshot.start, snapshot.end].every(({ x, y }) => x >= 0 && y >= 0 && x < snapshot.viewport.width && y < snapshot.viewport.height), "Hotspot gesture coordinates must remain inside the viewport");
  assert.ok([snapshot.start, snapshot.end].every(({ x, y }) => x >= snapshot.box.left && y >= snapshot.box.top && x < snapshot.box.right && y < snapshot.box.bottom), "Hotspot gesture coordinates must remain inside the current canvas");
  assert.equal(snapshot.startHitsCanvas, true, "The hotspot pointer-down must hit the drawable canvas");
  assert.equal(snapshot.endHitsCanvas, true, "The hotspot pointer-up must hit the drawable canvas");
};

const reportFailure = async ({ page, canvas, bindingIndex, initialHotspotCount, ratios, error }) => {
  const [stateResult, hotspotCountResult, selectedCountResult] = await Promise.allSettled([
    readCanvasSnapshot(canvas, ratios),
    page.locator(hotspotSelector).count(),
    page.getByRole("group", { name: selectedName }).count(),
  ]);
  const settledValue = (result) => result.status === "fulfilled" ? result.value : { unavailable: true, error: result.reason?.message || String(result.reason) };
  const diagnostic = {
    bindingIndex,
    initialHotspotCount,
    hotspotCount: settledValue(hotspotCountResult),
    selectedCount: settledValue(selectedCountResult),
    state: settledValue(stateResult),
    error: { name: error?.name || "Error", message: error?.message || String(error) },
  };
  console.error("SINGLE_CHOICE_HOTSPOT_GESTURE_FAILURE", JSON.stringify(diagnostic));
};

export const createVisualHotspotDrawer = (page) => async (bindingIndex, startX, startY) => {
  const canvas = page.locator(canvasSelector);
  const hotspots = page.locator(hotspotSelector);
  const selected = page.getByRole("group", { name: selectedName });
  const initialHotspotCount = await hotspots.count();
  const ratios = fallbackOffsets.map(([xOffset, yOffset]) => ({ startX: startX + xOffset, startY: startY + yOffset }));
  try {
    assert.equal(await selected.count(), 0, "No hotspot may be selected before drawing");
    await page.getByLabel("Option to map").selectOption({ index: bindingIndex });
    await page.getByRole("button", { name: "Draw hotspot" }).click();
    await page.locator(`${canvasSelector}.is-drawing`).waitFor();
    await canvas.scrollIntoViewIfNeeded();
    await waitForStableCanvasTarget(page, canvas, ratios);
    const snapshot = await readCanvasSnapshot(canvas, ratios);
    validateCanvasSnapshot(snapshot);
    await page.mouse.move(snapshot.start.x, snapshot.start.y);
    await page.mouse.down();
    await page.mouse.move(snapshot.end.x, snapshot.end.y);
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
