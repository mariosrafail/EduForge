import assert from "node:assert/strict";

export async function measureDragDrop(locator, { context, viewport }) {
  await locator.evaluate(async (surface) => {
    let previousSignature = "";
    let stableFrames = 0;
    for (let frame = 0; frame < 120; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const visualRect = surface.querySelector(".native-drag-drop-visual-region")?.getBoundingClientRect();
      const stageRect = surface.querySelector(".native-drag-drop-stage")?.getBoundingClientRect();
      if (!visualRect || !stageRect) continue;
      const signature = [visualRect.width, visualRect.height, stageRect.width, stageRect.height].map((value) => value.toFixed(2)).join(":");
      const stageInsideVisual = stageRect.left >= visualRect.left - 1 && stageRect.right <= visualRect.right + 1 && stageRect.top >= visualRect.top - 1 && stageRect.bottom <= visualRect.bottom + 1;
      stableFrames = stageInsideVisual && signature === previousSignature ? stableFrames + 1 : 0;
      previousSignature = signature;
      if (stableFrames >= 2) return;
    }
  });
  const measurement = await locator.evaluate((surface, measuredContext) => {
    const snapshot = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        element: element.tagName.toLowerCase(),
        className: typeof element.className === "string" ? element.className : "",
        width: Math.round(rect.width * 100) / 100,
        height: Math.round(rect.height * 100) / 100,
        minWidth: style.minWidth,
        minHeight: style.minHeight,
        maxWidth: style.maxWidth,
        maxHeight: style.maxHeight,
        display: style.display,
        gridTemplateRows: style.gridTemplateRows,
        alignSelf: style.alignSelf,
        overflow: style.overflow,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
      };
    };
    const visualElement = surface.querySelector(".native-drag-drop-visual-region");
    const stageElement = surface.querySelector(".native-drag-drop-stage");
    const bankElement = surface.querySelector(".native-drag-drop-bank");
    const bankItemsElement = surface.querySelector(".native-drag-drop-bank-items");
    const root = snapshot(surface);
    const visual = snapshot(visualElement);
    const stage = snapshot(stageElement);
    const bank = snapshot(bankElement);
    const activityHost = snapshot(surface.closest(".native-readable-text-activity-view"));
    const ancestors = [];
    for (let current = surface.parentElement, depth = 0; current && depth < 9; current = current.parentElement, depth += 1) ancestors.push(snapshot(current));
    const stageRect = stageElement.getBoundingClientRect();
    const visualRect = visualElement.getBoundingClientRect();
    const bankRect = bankElement.getBoundingClientRect();
    return {
      context: measuredContext,
      viewport: { width: innerWidth, height: innerHeight },
      root,
      visual,
      stage,
      bank,
      activityHost,
      ancestors,
      activityHostFillRatio: activityHost ? root.height / activityHost.height : null,
      visualRootRatio: visual.height / root.height,
      bankRootRatio: bank.height / root.height,
      usableVisualRatio: (stage.height - bank.height) / stage.height,
      usableBankRatio: bank.height / stage.height,
      bankTopRatio: (bankRect.top - stageRect.top) / stageRect.height,
      bankInsideStage: bankRect.left >= stageRect.left - 1 && bankRect.right <= stageRect.right + 1 && bankRect.top >= stageRect.top - 1 && bankRect.bottom <= stageRect.bottom + 1,
      bankItemRows: new Set([...bankItemsElement.children].map((item) => Math.round(item.getBoundingClientRect().top))).size,
      bankItemsScrollable: bankItemsElement.scrollHeight > bankItemsElement.clientHeight + 1,
      stageAspectRatio: stage.width / stage.height,
      sourceAspectRatio: Number(stageElement.dataset.surfaceWidth) / Number(stageElement.dataset.surfaceHeight),
      stageInsideVisual: stageRect.left >= visualRect.left - 1 && stageRect.right <= visualRect.right + 1 && stageRect.top >= visualRect.top - 1 && stageRect.bottom <= visualRect.bottom + 1,
      horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
    };
  }, context);
  process.stdout.write(`[drag-drop-geometry] ${JSON.stringify({ requestedViewport: viewport, ...measurement })}\n`);
  return measurement;
}

async function dragBetween(page, source, target) {
  const [sourceBox, targetBox] = await Promise.all([source.boundingBox(), target.boundingBox()]);
  assert.ok(sourceBox && targetBox);
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 });
  await page.mouse.up();
}

export async function exerciseValidatedDragDrop(page, surface, pair) {
  const target = surface.locator("[data-drag-drop-target-id]").first();
  const targetId = await target.getAttribute("data-drag-drop-target-id");
  const correctWordId = pair.teacherDocument.parts[0].solution.mappings.find((entry) => entry.targetId === targetId)?.wordId;
  const wrongWordId = pair.publicDocument.parts[0].interaction.words.find((word) => word.id !== correctWordId)?.id;
  assert.ok(correctWordId && wrongWordId);
  const wrongWord = surface.locator(`[data-drag-drop-word-id="${wrongWordId}"]`);
  await dragBetween(page, wrongWord, target);
  assert.equal(await target.getAttribute("data-occupied"), null);
  assert.equal(await target.getAttribute("data-incorrect"), "true");
  assert.equal(await wrongWord.getAttribute("data-used"), null);
  assert.equal(await surface.getByRole("status").textContent(), "Incorrect placement. Try again.");
  assert.equal(await target.evaluate((element) => getComputedStyle(element).borderColor), "rgb(185, 28, 28)");
  await dragBetween(page, surface.locator(`[data-drag-drop-word-id="${correctWordId}"]`), target);
  assert.equal(await target.getAttribute("data-occupied"), "true");
  assert.equal(await target.getAttribute("data-incorrect"), null);
  assert.notEqual(await surface.getByRole("status").textContent(), "Incorrect placement. Try again.");
  return target;
}
