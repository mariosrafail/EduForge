import { authorizedHostedPreviewPath } from "./hostedReleasePreview.js";

function projectActivePages(pageUnits, activePageIds, resolvePage) {
  const active = new Set(activePageIds);
  return Object.freeze(pageUnits.map((unit) => Object.freeze({
    ...unit,
    pages: Object.freeze(unit.pages.filter((page) => active.has(page.id)).map(resolvePage)),
  })));
}

export function studentsBookPageUnitsFromActivePageIds(pageUnits, activePageIds) {
  if (!Array.isArray(activePageIds) || activePageIds.some((id) => typeof id !== "string")) throw new Error("Students Book active page identities are invalid.");
  return projectActivePages(pageUnits, activePageIds, (page) => page);
}

export function studentsBookPageUnitsFromCatalog(pageUnits, payload, authorization) {
  if (payload?.component?.bookSlug !== "ultimate-b2" || payload.component.componentSlug !== "ultimate-b2-students-book" || payload.component.kind !== "students-book" || !Array.isArray(payload.pages)) throw new Error("Students Book page catalog identity is invalid.");
  const active = new Map(payload.pages.map((page) => [page.id, page]));
  return projectActivePages(pageUnits, [...active.keys()], (page) => {
    const catalogPage = active.get(page.id);
    if (catalogPage.source !== "override") return page;
    const url = new URL(catalogPage.image.url, "https://viewer.invalid");
    url.searchParams.delete("previewAuthorization");
    return Object.freeze({ ...page, images: Object.freeze([authorizedHostedPreviewPath(`${url.pathname}${url.search}`, authorization)]) });
  });
}
