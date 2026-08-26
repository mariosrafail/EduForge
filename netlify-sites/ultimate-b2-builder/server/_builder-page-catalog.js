import studentsBookRuntime from "../../../src/data/ultimate-b2/generated/students-book.runtime.json" with { type: "json" };
import studentsBookAssets from "../../../src/data/ultimate-b2/generated/students-book-page-assets.json" with { type: "json" };

export const builderPageComponents = Object.freeze({
  studentsBook: "ultimate-b2-students-book",
  workbook: "ultimate-b2-workbook",
  grammarBook: "ultimate-b2-grammar-book",
});

const assetsByPageId = new Map(studentsBookAssets.pages.map((asset) => [asset.pageId, asset]));

export const canonicalStudentsBookPages = Object.freeze(studentsBookRuntime.units.flatMap((unit) => (
  unit.pages.map((page) => {
    const asset = assetsByPageId.get(page.id);
    if (!asset || asset.unitNumber !== Number(unit.number) || asset.navigationOrder !== Number(page.navigationOrder)) {
      throw new Error(`Students Book page manifest mismatch: ${page.id}`);
    }
    const extension = asset.mimeType === "image/jpeg" ? ".jpg" : asset.mimeType === "image/webp" ? ".webp" : ".png";
    return Object.freeze({
      id: page.id,
      stableKey: `${builderPageComponents.studentsBook}/pages/${page.id}`,
      componentSlug: builderPageComponents.studentsBook,
      source: "repository-baseline",
      unitNumber: Number(unit.number),
      unitTitle: page.unitTitle,
      sectionTitle: page.sectionTitle,
      partNumber: Number(page.partNumber),
      printedPages: Object.freeze(page.pageNumbers.map(Number)),
      printedLabel: page.spreadNumber,
      sortOrder: ((Number(unit.number) - 1) * 100) + Number(page.navigationOrder),
      label: `${page.unitTitle} · ${page.sectionTitle} · ${page.spreadNumber}`,
      image: Object.freeze({
        source: "repository-baseline",
        url: `/page-library/ultimate-b2/${builderPageComponents.studentsBook}/${page.id}${extension}`,
        originalFilename: asset.originalFilename,
        mimeType: asset.mimeType,
        byteSize: asset.byteSize,
        checksumSha256: asset.checksumSha256,
        width: asset.width,
        height: asset.height,
      }),
    });
  })
)));

export const canonicalStudentsBookPagesById = new Map(canonicalStudentsBookPages.map((page) => [page.id, page]));

export function resolveBuilderPageComponent(bookSlug, componentSlug) {
  if (bookSlug !== "ultimate-b2") return null;
  if (componentSlug === builderPageComponents.studentsBook) return { kind: "students-book", componentSlug, baseline: canonicalStudentsBookPages };
  if (componentSlug === builderPageComponents.workbook) return { kind: "managed", title: "Workbook", pagePrefix: "wb", componentSlug, baseline: Object.freeze([]) };
  if (componentSlug === builderPageComponents.grammarBook) return { kind: "managed", title: "Grammar Book", pagePrefix: "gb", componentSlug, baseline: Object.freeze([]) };
  return null;
}
