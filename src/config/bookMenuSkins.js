export const BOOK_MENU_SKIN_IDS = Object.freeze({
  ULTIMATE_B2_LEGACY: "ultimate-b2-legacy",
});

export const BOOK_MENU_SKIN_SELECTION_SCHEMA_VERSION = "1.0";

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

export function validateAndNormalizeBookMenuSkinSelections(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Book menu skin selections must be an object.");
  }
  if (input.schemaVersion !== BOOK_MENU_SKIN_SELECTION_SCHEMA_VERSION) {
    throw new Error(`Book menu skin selections must use schema ${BOOK_MENU_SKIN_SELECTION_SCHEMA_VERSION}.`);
  }
  if (!input.selections || typeof input.selections !== "object" || Array.isArray(input.selections)) {
    throw new Error("Book menu skin selections must contain a selections object.");
  }

  const selections = {};
  for (const [packageId, skinId] of Object.entries(input.selections).sort(([left], [right]) => left.localeCompare(right))) {
    const normalizedPackageId = String(packageId || "").trim();
    const definition = findBookMenuSkinDefinition(skinId);
    if (!normalizedPackageId) throw new Error("Book menu skin package IDs cannot be empty.");
    if (!definition) throw new Error(`Unknown book menu skin: ${skinId}`);
    if (definition.status !== "ready") throw new Error(`Book menu skin is not ready: ${skinId}`);
    if (!definition.packageIds.includes(normalizedPackageId)) {
      throw new Error(`Book menu skin ${skinId} does not support package ${normalizedPackageId}.`);
    }
    selections[normalizedPackageId] = definition.id;
  }

  return { schemaVersion: BOOK_MENU_SKIN_SELECTION_SCHEMA_VERSION, selections };
}

export function selectedBookMenuSkinId(input, packageId) {
  const normalizedPackageId = String(packageId || "");
  const normalized = validateAndNormalizeBookMenuSkinSelections(input);
  return normalized.selections[normalizedPackageId] || defaultBookMenuSkinId(normalizedPackageId);
}
