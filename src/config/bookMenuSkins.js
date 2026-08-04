export const BOOK_MENU_SKIN_IDS = Object.freeze({
  ULTIMATE_B2_LEGACY: "ultimate-b2-legacy",
});

export const bookMenuSkinCatalog = Object.freeze([
  Object.freeze({
    id: BOOK_MENU_SKIN_IDS.ULTIMATE_B2_LEGACY,
    label: "Ultimate B2 legacy",
    description: "Recovered Hamilton House Ultimate B2 classroom menu artwork",
    packageIds: Object.freeze(["ultimate-b2-students-book"]),
    status: "ready",
  }),
]);

const skinsById = new Map(bookMenuSkinCatalog.map((skin) => [skin.id, skin]));
if (skinsById.size !== bookMenuSkinCatalog.length) throw new Error("Book menu skin IDs must be unique");

export function findBookMenuSkinDefinition(skinId) {
  return skinsById.get(String(skinId || "")) || null;
}

export function listBookMenuSkinOptions(packageId) {
  const normalizedPackageId = String(packageId || "");
  return bookMenuSkinCatalog.filter((skin) => !normalizedPackageId || skin.packageIds.includes(normalizedPackageId));
}

export function defaultBookMenuSkinId(packageId) {
  return listBookMenuSkinOptions(packageId).find((skin) => skin.status === "ready")?.id || null;
}
