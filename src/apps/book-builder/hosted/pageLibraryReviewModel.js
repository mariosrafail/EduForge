function compareNumbers(left, right) {
  return Number(left || 0) - Number(right || 0);
}

function comparePages(left, right) {
  return compareNumbers(left.sortOrder, right.sortOrder)
    || String(left.pageId || left.id).localeCompare(String(right.pageId || right.id));
}

export function pageLibraryReviewNavigation(pageLibrary, { bookSlug, componentSlug }) {
  if (pageLibrary?.component?.bookSlug !== bookSlug || pageLibrary.component.componentSlug !== componentSlug) {
    throw new Error("Page Library identity does not match the active component.");
  }
  const units = [...(pageLibrary.units || [])]
    .filter((unit) => Number.isInteger(Number(unit.unitNumber)) && Number(unit.unitNumber) > 0)
    .sort((left, right) => compareNumbers(left.sortOrder, right.sortOrder) || compareNumbers(left.unitNumber, right.unitNumber));
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const pages = [...(pageLibrary.pages || [])]
    .filter((page) => page?.id && page.componentSlug === componentSlug)
    .map((page) => {
      const unit = page.unitId ? unitById.get(page.unitId) : null;
      const unitNumber = Number(page.unitNumber ?? unit?.unitNumber);
      if (!Number.isInteger(unitNumber) || unitNumber < 1) return null;
      return Object.freeze({
        pageId: page.id,
        unitNumber,
        pageLabel: page.printedLabel ? `Pages ${page.printedLabel}` : page.label,
        sectionTitle: page.sectionTitle || page.label,
        sortOrder: Number(page.sortOrder || 0),
        unitId: unit?.id || page.unitId || `unit-${unitNumber}`,
      });
    })
    .filter(Boolean)
    .sort((left, right) => compareNumbers(left.unitNumber, right.unitNumber) || comparePages(left, right));
  const placementsByUnit = new Map(units.map((unit) => [unit.id, []]));
  for (const page of pages) if (placementsByUnit.has(page.unitId)) placementsByUnit.get(page.unitId).push(page);
  return Object.freeze({
    placements: Object.freeze(pages),
    units: Object.freeze(units.map((unit) => Object.freeze({
      id: unit.slug,
      title: unit.title,
      unitNumber: Number(unit.unitNumber),
      lessons: Object.freeze((placementsByUnit.get(unit.id) || []).map((page) => Object.freeze({
        id: page.pageId,
        pageId: page.pageId,
        title: page.sectionTitle,
        sectionTitle: page.sectionTitle,
        pageLabel: page.pageLabel,
        exercises: Object.freeze([]),
      }))),
    }))),
  });
}
