export const PHASE_ONE_PACKAGE_SLUGS = Object.freeze([
  "ultimate-b1",
  "ultimate-b1-plus",
  "ultimate-b2",
]);

export const ARCHIVED_PACKAGE_SLUGS = Object.freeze(["english-journey-6"]);

export function isCatalogPackageVisible(packageOrSlug = "") {
  const rawIdentity = typeof packageOrSlug === "string"
    ? packageOrSlug
    : packageOrSlug?.slug || packageOrSlug?.id || packageOrSlug?.packageTitle || packageOrSlug?.title || "";
  const slug = String(rawIdentity).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return PHASE_ONE_PACKAGE_SLUGS.includes(String(slug).toLowerCase());
}

export function sortPhaseOnePackages(packages = []) {
  const catalogIndex = (bookPackage) => {
    const identity = bookPackage.slug || bookPackage.id || String(bookPackage.packageTitle || bookPackage.title || "")
      .trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return PHASE_ONE_PACKAGE_SLUGS.indexOf(identity);
  };
  return [...packages]
    .filter(isCatalogPackageVisible)
    .sort((left, right) => catalogIndex(left) - catalogIndex(right));
}
