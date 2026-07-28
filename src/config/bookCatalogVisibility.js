export const PHASE_ONE_PACKAGE_SLUGS = Object.freeze([
  "ultimate-b1",
  "ultimate-b1-plus",
  "ultimate-b2",
]);

export const ARCHIVED_PACKAGE_SLUGS = Object.freeze(["english-journey-6"]);

export const PHASE_ONE_VISIBLE_COMPONENTS = Object.freeze({
  "ultimate-b1": Object.freeze([
    "ultimate-b1-students-book",
    "ultimate-b1-workbook",
  ]),
  "ultimate-b1-plus": Object.freeze([
    "ultimate-b1-plus-students-book",
    "ultimate-b1-plus-workbook",
  ]),
  "ultimate-b2": Object.freeze([
    "ultimate-b2-students-book",
    "ultimate-b2-workbook",
  ]),
});

// Grammar Book and Test Book are preserved but temporarily hidden from the Phase 1 catalog.

function slugifyCatalogIdentity(value = "") {
  return String(value).trim().toLowerCase().replace(/\+/g, "-plus").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function getCatalogPackageSlug(packageOrSlug = "") {
  const rawIdentity = typeof packageOrSlug === "string"
    ? packageOrSlug
    : packageOrSlug?.slug || packageOrSlug?.id || packageOrSlug?.packageTitle || packageOrSlug?.title || "";
  const identity = slugifyCatalogIdentity(rawIdentity);
  if (identity === "ultimate-english-b1") return "ultimate-b1";
  if (identity === "ultimate-english-b1-plus") return "ultimate-b1-plus";
  return identity;
}

export function isCatalogPackageVisible(packageOrSlug = "") {
  return PHASE_ONE_PACKAGE_SLUGS.includes(getCatalogPackageSlug(packageOrSlug));
}

export function isPhaseOneComponentVisible(packageOrSlug = "", componentOrSlug = "") {
  const packageSlug = getCatalogPackageSlug(packageOrSlug);
  const visibleSlugs = PHASE_ONE_VISIBLE_COMPONENTS[packageSlug];
  const rawComponentSlug = typeof componentOrSlug === "string"
    ? componentOrSlug
    : componentOrSlug?.slug || componentOrSlug?.id || componentOrSlug?.routeSlug || "";
  const componentSlug = slugifyCatalogIdentity(rawComponentSlug);
  if (!componentSlug) return false;
  // Packages outside the Phase 1 catalog keep their existing behavior.
  if (!visibleSlugs) return true;
  return visibleSlugs.includes(componentSlug) || visibleSlugs.includes(`${packageSlug}-${componentSlug}`);
}

export function filterPhaseOneComponents(bookPackage = {}) {
  return {
    ...bookPackage,
    components: (bookPackage.components || []).filter((component) => (
      isPhaseOneComponentVisible(bookPackage, component)
    )),
  };
}

export function sortPhaseOnePackages(packages = []) {
  const catalogIndex = (bookPackage) => {
    return PHASE_ONE_PACKAGE_SLUGS.indexOf(getCatalogPackageSlug(bookPackage));
  };
  return [...packages]
    .filter(isCatalogPackageVisible)
    .sort((left, right) => catalogIndex(left) - catalogIndex(right));
}
