// Builder page assets are single pages or two-page spreads. Keep managed labels
// within that proven repository model instead of accepting unbounded ranges.
export const MAX_PRINTED_LABEL_PAGE_WEIGHT = 2;

const DEFAULT_COMPONENT_PAGE_LAYOUT = Object.freeze({ imageHeight: 150, preferredCardWidth: 236.25, gap: 13 });
const componentPageLayouts = Object.freeze({
  "ultimate-b2-students-book": Object.freeze({ ...DEFAULT_COMPONENT_PAGE_LAYOUT, imageHeight: 180 }),
});

export function componentPageLayoutPolicy(componentSlug) {
  return componentPageLayouts[componentSlug] || DEFAULT_COMPONENT_PAGE_LAYOUT;
}

export function componentPageRowMaxWidth(pageCount, policy = DEFAULT_COMPONENT_PAGE_LAYOUT) {
  const count = Math.max(0, Number(pageCount) || 0);
  return (count * policy.preferredCardWidth) + (Math.max(0, count - 1) * policy.gap);
}

const validPrintedPageNumber = (value) => Number.isSafeInteger(value) && value > 0;

export function printedPageWeight(page) {
  if (Array.isArray(page?.printedPages) && page.printedPages.length) {
    const uniquePages = new Set(page.printedPages.filter(validPrintedPageNumber));
    if (uniquePages.size) return uniquePages.size;
  }

  const label = typeof page?.printedLabel === "string" ? page.printedLabel.trim() : "";
  const match = label.match(/^(\d+)(?:\s*[-–—]\s*(\d+))?$/u);
  if (!match) return 1;

  const first = Number(match[1]);
  const last = match[2] === undefined ? first : Number(match[2]);
  if (!validPrintedPageNumber(first) || !validPrintedPageNumber(last)) return 1;

  const weight = last - first + 1;
  return weight > 0 && weight <= MAX_PRINTED_LABEL_PAGE_WEIGHT ? weight : 1;
}

export function splitUnitPageRows(pages) {
  if (!Array.isArray(pages) || pages.length === 0) {
    return { top: [], bottom: [], topWeight: 0, bottomWeight: 0, totalWeight: 0 };
  }

  const weights = pages.map(printedPageWeight);
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  const target = Math.ceil(totalWeight / 2);
  let topWeight = 0;
  let splitIndex = 0;

  while (splitIndex < pages.length && topWeight < target) {
    topWeight += weights[splitIndex];
    splitIndex += 1;
  }

  return {
    top: pages.slice(0, splitIndex),
    bottom: pages.slice(splitIndex),
    topWeight,
    bottomWeight: totalWeight - topWeight,
    totalWeight,
  };
}
