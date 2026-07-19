const unit2ActionGeometry = {
  video: { top: "7%", left: "3.2%", width: "45%", height: "14%", ariaLabel: "Open video activity from page 20" },
  "text-audio": { top: "22%", left: "3.4%", width: "46.2%", height: "66%", ariaLabel: "Open reading text with audio from page 20" },
  "exercise-3": { top: "8%", left: "53.2%", width: "43.5%", height: "38%", ariaLabel: "Open Exercise 3 missing sentences" },
  "exercise-4": { top: "48%", left: "53.3%", width: "43.4%", height: "29%", ariaLabel: "Open Exercise 4 circle the correct words" },
};

export function flattenStudentsBookPages(catalog) {
  return (catalog?.units || []).flatMap((unit) => unit.pages || []);
}

export function findStudentsBookPageInCatalog(catalog, pageToken) {
  const normalized = String(pageToken ?? "").trim();
  if (!normalized) return null;
  const numeric = Number(normalized);
  return flattenStudentsBookPages(catalog).find((page) => (
    page.id === normalized
    || page.sourcePageId === normalized
    || page.spreadNumber === normalized
    || (Number.isInteger(numeric) && page.pageNumbers.includes(numeric))
  )) || null;
}

export function findStudentsBookUnitInCatalog(catalog, unitToken) {
  const normalized = String(unitToken ?? "").trim().toLowerCase();
  const numeric = Number(normalized.replace(/^unit-?/, ""));
  return (catalog?.units || []).find((unit) => unit.id.toLowerCase() === normalized || unit.number === numeric) || null;
}

export function adjacentStudentsBookPageInCatalog(catalog, pageToken, direction) {
  const pages = flattenStudentsBookPages(catalog);
  const page = typeof pageToken === "object" ? pageToken : findStudentsBookPageInCatalog(catalog, pageToken);
  const index = pages.findIndex((candidate) => candidate.id === page?.id);
  if (index < 0) return null;
  return pages[index + (direction < 0 ? -1 : 1)] || null;
}

export function visibleStudentsBookActivitiesForMode(page, mode = "student") {
  const activities = page?.activities || [];
  return mode === "teacher" ? activities : activities.filter((activity) => activity.availability === "enabled");
}

export function studentsBookPageRouteTokenForPage(page) {
  return page?.physicalPageNumber ? String(page.physicalPageNumber) : null;
}

export function buildStudentsBookPageUnits(catalog, resolveAsset) {
  return (catalog?.units || []).map((unit) => ({
    id: unit.id,
    number: unit.number,
    title: unit.title,
    unit: unit.title,
    displayLabel: unit.title,
    printedPageRange: unit.printedPageRange,
    pages: unit.pages.map((page) => ({
      id: page.id,
      sourcePageId: page.sourcePageId,
      part: page.partNumber,
      title: page.sectionTitle,
      label: `pg ${page.spreadNumber}`,
      pageNumber: page.physicalPageNumber,
      pageNumbers: page.pageNumbers,
      spreadNumber: page.spreadNumber,
      navigationOrder: page.navigationOrder,
      images: [resolveAsset(unit.number, page.partNumber)].filter(Boolean),
      activities: page.activities,
      media: page.media,
      editorialStatus: page.editorialStatus,
      actions: page.actions.map((action) => ({ ...action, ...(unit2ActionGeometry[action.id] || {}) })),
      continuesToVideo: page.actions.some((action) => action.target === "video"),
    })),
  }));
}
