import assert from "node:assert/strict";
import path from "node:path";

export async function assertInteractiveOverview(frame, expected, label, screenshot = {}) {
  const cards = frame.locator("[data-overview-entry]");
  const images = frame.locator(".teacher-unit-page-thumb img");
  await cards.nth(expected.labels.length - 1).waitFor();
  await images.nth(expected.labels.length - 1).waitFor();
  await frame.locator("html").evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  await images.evaluateAll(async (nodes, expectedCount) => {
    if (nodes.length !== expectedCount) throw new Error(`Expected ${expectedCount} overview images, found ${nodes.length}`);
    await Promise.all(nodes.map((image) => image.decode()));
  }, expected.labels.length);

  const metrics = await frame.locator(".teacher-offline-unit-overview").evaluate((panel) => {
    const entries = [...panel.querySelectorAll("[data-overview-entry]")];
    const rectangle = (node) => {
      const { left, right, top, bottom, width, height } = node.getBoundingClientRect();
      return { left, right, top, bottom, width, height };
    };
    const directionalOverflow = (child, container) => ({
      left: Math.max(0, container.left - child.left),
      right: Math.max(0, child.right - container.right),
      top: Math.max(0, container.top - child.top),
      bottom: Math.max(0, child.bottom - container.bottom),
    });
    const maximumOverflow = (overflow) => Math.max(...Object.values(overflow));
    const rectangles = entries.map((entry) => entry.getBoundingClientRect());
    const imageNodes = entries.map((entry) => entry.querySelector(".teacher-unit-page-thumb img"));
    const imageRectangles = imageNodes.map((image) => image.getBoundingClientRect());
    const thumbnailRectangles = entries.map((entry) => entry.querySelector(".teacher-unit-page-thumb").getBoundingClientRect());
    const panelRect = panel.getBoundingClientRect();
    const geometry = entries.map((entry) => {
      const card = rectangle(entry);
      const children = [
        ["copy", entry.querySelector(".teacher-unit-page-copy")],
        ["title", entry.querySelector(".teacher-unit-page-copy strong")],
        ["pageLabel", entry.querySelector(".teacher-unit-page-copy b")],
        ["thumbnail", entry.querySelector(".teacher-unit-page-thumb")],
        ["image", entry.querySelector(".teacher-unit-page-thumb img")],
      ].filter(([, node]) => node).map(([kind, node]) => {
        const child = rectangle(node);
        const cardOverflow = directionalOverflow(child, card);
        const panelOverflow = directionalOverflow(child, panelRect);
        const style = kind === "title" || kind === "pageLabel" ? getComputedStyle(node) : null;
        return {
          kind,
          text: node.textContent?.trim() || null,
          rectangle: child,
          cardOverflow,
          panelOverflow,
          maximumCardOverflow: maximumOverflow(cardOverflow),
          maximumPanelOverflow: maximumOverflow(panelOverflow),
          textStyle: style ? {
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
            fontStretch: style.fontStretch,
            fontWeight: style.fontWeight,
            lineHeight: style.lineHeight,
            overflow: style.overflow,
            textOverflow: style.textOverflow,
            whiteSpace: style.whiteSpace,
          } : null,
        };
      });
      return {
        entry: entry.dataset.overviewEntry,
        card,
        cardPanelOverflow: directionalOverflow(card, panelRect),
        children,
      };
    });
    const offenders = geometry.flatMap(({ entry, children }) => children.map((child) => ({ entry, ...child })))
      .sort((left, right) => Math.max(right.maximumCardOverflow, right.maximumPanelOverflow) - Math.max(left.maximumCardOverflow, left.maximumPanelOverflow));
    const loadedFontFaces = document.fonts ? [...document.fonts].map((face) => ({ family: face.family, status: face.status, style: face.style, weight: face.weight })) : [];
    return {
      labels: entries.map((entry) => entry.querySelector(".teacher-unit-page-copy b")?.textContent?.trim()),
      rows: entries.map((entry) => Number(entry.dataset.overviewRow)),
      weights: entries.map((entry) => Number(entry.dataset.overviewWeight)),
      spans: entries.map((entry) => Number(entry.dataset.overviewColumnSpan)),
      cardWidths: rectangles.map((rectangle) => rectangle.width),
      imageWidths: imageRectangles.map((rectangle) => rectangle.width),
      imageHeights: imageRectangles.map((rectangle) => rectangle.height),
      naturalWidths: imageNodes.map((image) => image.naturalWidth),
      naturalHeights: imageNodes.map((image) => image.naturalHeight),
      rowTopSpreads: [1, 2].map((row) => {
        const tops = rectangles.filter((_, index) => Number(entries[index].dataset.overviewRow) === row).map((rectangle) => rectangle.top);
        return tops.length ? Math.max(...tops) - Math.min(...tops) : null;
      }),
      minimumWidth: Math.min(...rectangles.map((rectangle) => rectangle.width)),
      minimumWidthRatio: Math.min(...rectangles.map((rectangle) => rectangle.width)) / panelRect.width,
      contained: rectangles.every((rectangle) => rectangle.left >= panelRect.left - 2 && rectangle.right <= panelRect.right + 2 && rectangle.top >= panelRect.top - 2 && rectangle.bottom <= panelRect.bottom + 2),
      overlaps: rectangles.some((first, index) => rectangles.slice(index + 1).some((second) => (
        first.left < second.right - 1 && first.right > second.left + 1
        && first.top < second.bottom - 1 && first.bottom > second.top + 1
      ))),
      imagesContained: imageRectangles.every((rectangle, index) => {
        const thumbnail = thumbnailRectangles[index];
        return rectangle.left >= thumbnail.left - 1 && rectangle.right <= thumbnail.right + 1
          && rectangle.top >= thumbnail.top - 1 && rectangle.bottom <= thumbnail.bottom + 1;
      }),
      objectFits: [...panel.querySelectorAll(".teacher-unit-page-thumb img")].map((image) => getComputedStyle(image).objectFit),
      thumbnailHeights: [...panel.querySelectorAll(".teacher-unit-page-thumb")].map((thumbnail) => thumbnail.getBoundingClientRect().height),
      titleFontSizes: entries.map((entry) => Number.parseFloat(getComputedStyle(entry.querySelector(".teacher-unit-page-copy strong")).fontSize)),
      pageLabelFontSizes: entries.map((entry) => Number.parseFloat(getComputedStyle(entry.querySelector(".teacher-unit-page-copy b")).fontSize)),
      overviewBook: panel.dataset.overviewBook,
      thumbnailToken: getComputedStyle(panel).getPropertyValue("--teacher-unit-overview-thumbnail-height").trim(),
      panelOverflow: panel.scrollWidth - panel.clientWidth,
      panelVerticalOverflow: panel.scrollHeight - panel.clientHeight,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      documentVerticalOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      panelGeometry: {
        rectangle: rectangle(panel),
        clientWidth: panel.clientWidth,
        clientHeight: panel.clientHeight,
        scrollWidth: panel.scrollWidth,
        scrollHeight: panel.scrollHeight,
      },
      geometry,
      maximumOffender: offenders[0],
      fontState: {
        status: document.fonts?.status || "unsupported",
        pfStieleCheck: document.fonts?.check('30.4px "PF Stiele Futura Medium"') || false,
        arialNarrowCheck: document.fonts?.check('30.4px "Arial Narrow"') || false,
        arialCheck: document.fonts?.check("30.4px Arial") || false,
        loadedFontFaces,
      },
    };
  });

  const childContainmentFailures = metrics.geometry.flatMap(({ entry, children }) => children
    .filter((child) => child.maximumCardOverflow > 1 || child.maximumPanelOverflow > 1)
    .map((child) => ({ entry, ...child })));
  console.log(`${label} geometry: ${JSON.stringify({ panel: metrics.panelGeometry, fontState: metrics.fontState, maximumOffender: metrics.maximumOffender, childContainmentFailures })}`);

  assert.deepEqual(metrics.labels, expected.labels, `${label} labels`);
  assert.deepEqual(metrics.rows, expected.rows, `${label} rows`);
  assert.deepEqual(metrics.weights, expected.weights, `${label} weights`);
  if (expected.spans) assert.deepEqual(metrics.spans, expected.spans, `${label} column spans`);
  assert.equal(metrics.overviewBook, expected.overviewBook, `${label} component identity`);
  assert.deepEqual([1, 2].map((row) => metrics.spans
    .filter((_, index) => metrics.rows[index] === row)
    .reduce((sum, span) => sum + span, 0)), expected.columnTotals, `${label} proportional columns`);
  assert.ok(metrics.rowTopSpreads.every((spread) => spread !== null && spread <= 3), `${label} exactly two visual rows`);
  assert.ok(metrics.minimumWidth >= 80 && metrics.minimumWidthRatio >= 0.1, `${label} readable card width: ${metrics.minimumWidth} (${metrics.minimumWidthRatio})`);
  assert.equal(metrics.contained, true, `${label} entries contained`);
  assert.equal(metrics.overlaps, false, `${label} no overlap`);
  assert.equal(metrics.imagesContained, true, `${label} images are not clipped`);
  assert.ok(metrics.objectFits.every((value) => value === "contain"), `${label} object-fit contain`);
  assert.equal(metrics.objectFits.length, expected.labels.length, `${label} all images rendered`);
  assert.equal(metrics.fontState.status, "loaded", `${label} deterministic font state`);
  if (expected.overviewBook === "workbook" || expected.overviewBook === "grammar-book") {
    assert.deepEqual(childContainmentFailures, [], `${label} managed card children fit their cards and panel`);
    assert.deepEqual(metrics.naturalWidths.map((width, index) => width > metrics.naturalHeights[index] ? 2 : 1), metrics.weights, `${label} weights follow intrinsic managed page geometry`);
  }
  assert.ok(metrics.panelOverflow <= 1, `${label} panel overflow: ${metrics.panelOverflow}px`);
  assert.ok(metrics.panelVerticalOverflow <= 1, `${label} vertical panel overflow: ${metrics.panelVerticalOverflow}px`);
  assert.ok(metrics.documentOverflow <= 1, `${label} document overflow`);
  assert.ok(metrics.documentVerticalOverflow <= 1, `${label} vertical document overflow`);

  if (expected.imageHeightParityTolerance !== undefined) {
    const singleIndices = metrics.weights.map((weight, index) => weight === 1 ? index : -1).filter((index) => index >= 0);
    const spreadIndices = metrics.weights.map((weight, index) => weight === 2 ? index : -1).filter((index) => index >= 0);
    assert.ok(singleIndices.length > 0 && spreadIndices.length > 0, `${label} includes singles and spreads`);
    const targetHeight = singleIndices.reduce((sum, index) => sum + metrics.imageHeights[index], 0) / singleIndices.length;
    const maximumHeightDelta = Math.max(...spreadIndices.map((index) => Math.abs(metrics.imageHeights[index] - targetHeight)));
    assert.ok(maximumHeightDelta <= expected.imageHeightParityTolerance, `${label} actual image height parity: ${maximumHeightDelta}px`);
    assert.ok(Math.abs(targetHeight - expected.singleImageHeight) <= expected.imageHeightParityTolerance, `${label} single-page image height remains ${expected.singleImageHeight}px: ${targetHeight}px`);
    assert.ok(Math.min(...spreadIndices.map((index) => metrics.imageWidths[index])) > Math.max(...singleIndices.map((index) => metrics.imageWidths[index])), `${label} spread images are wider than singles`);
    assert.ok(Math.min(...spreadIndices.map((index) => metrics.cardWidths[index])) > Math.max(...singleIndices.map((index) => metrics.cardWidths[index])), `${label} spread cards are wider than singles`);
    metrics.singleImageHeight = targetHeight;
    metrics.maximumSpreadHeightDelta = maximumHeightDelta;
  }

  if (expected.verifyNaturalAspectRatio) {
    const maximumAspectRatioDelta = Math.max(...metrics.imageWidths.map((width, index) => Math.abs(
      (width / metrics.imageHeights[index]) - (metrics.naturalWidths[index] / metrics.naturalHeights[index]),
    )));
    assert.ok(maximumAspectRatioDelta <= 0.01, `${label} preserves natural image aspect ratios: ${maximumAspectRatioDelta}`);
    metrics.maximumAspectRatioDelta = maximumAspectRatioDelta;
  }

  console.log(`${label}: ${JSON.stringify(metrics.labels.map((pageLabel, index) => ({ pageLabel, weight: metrics.weights[index], span: metrics.spans[index], cardWidth: metrics.cardWidths[index], imageWidth: metrics.imageWidths[index], imageHeight: metrics.imageHeights[index] })))}; token ${metrics.thumbnailToken}; title ${metrics.titleFontSizes[0]}px; page label ${metrics.pageLabelFontSizes[0]}px`);

  if (screenshot.directory && screenshot.fileName) {
    await frame.locator(".teacher-offline-unit-overview-screen").screenshot({ path: path.join(screenshot.directory, screenshot.fileName) });
  }

  return metrics;
}
