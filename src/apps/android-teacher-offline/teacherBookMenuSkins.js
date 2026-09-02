import {
  BOOK_MENU_SKIN_IDS,
  defaultBookMenuSkinId,
  findBookMenuSkinDefinition,
} from "../../config/bookMenuSkins.js";
import { canonicalTeacherRuntimeUiAssets } from "./legacyClassroomAssets.js";

const packagePresentation = Object.freeze({
  "ultimate-b1-students-book": Object.freeze({ surfaceKey: "ultimate-b1:home", accessibleLabel: "Ultimate English B1", animationLabel: "Ultimate English B1" }),
  "ultimate-b1-workbook": Object.freeze({ surfaceKey: "ultimate-b1:home", accessibleLabel: "Ultimate English B1", animationLabel: "Ultimate English B1" }),
  "ultimate-b1-grammar-book": Object.freeze({ surfaceKey: "ultimate-b1:home", accessibleLabel: "Ultimate English B1", animationLabel: "Ultimate English B1" }),
  "ultimate-b1-plus-students-book": Object.freeze({ surfaceKey: "ultimate-b1-plus:home", accessibleLabel: "Ultimate English B1+", animationLabel: "Ultimate English B1+" }),
  "ultimate-b1-plus-workbook": Object.freeze({ surfaceKey: "ultimate-b1-plus:home", accessibleLabel: "Ultimate English B1+", animationLabel: "Ultimate English B1+" }),
  "ultimate-b1-plus-grammar-book": Object.freeze({ surfaceKey: "ultimate-b1-plus:home", accessibleLabel: "Ultimate English B1+", animationLabel: "Ultimate English B1+" }),
  "ultimate-b2-students-book": Object.freeze({ surfaceKey: "ultimate-b2:home", accessibleLabel: "Ultimate English B2" }),
  "ultimate-b2-workbook": Object.freeze({ surfaceKey: "ultimate-b2:home", accessibleLabel: "Ultimate English B2" }),
  "ultimate-b2-grammar-book": Object.freeze({ surfaceKey: "ultimate-b2:home", accessibleLabel: "Ultimate English B2" }),
});

function runtimeAssetsBySkinId(runtimeUiAssets, packageId) {
  const assets = runtimeUiAssets.classroom;
  const presentation = packagePresentation[packageId] || packagePresentation["ultimate-b2-students-book"];
  return Object.freeze({
  [BOOK_MENU_SKIN_IDS.ULTIMATE_B2_LEGACY]: Object.freeze({
    surfaceKey: presentation.surfaceKey,
    background: assets.backgrounds.classroomGlacier,
    publisherLogo: assets.branding.hamiltonHouseLogo,
    publisherLogoAlt: "Hamilton House — English Language Teaching",
    title: Object.freeze({ kind: "legacy-gaf", accessibleLabel: presentation.accessibleLabel, ...(presentation.animationLabel ? { animationLabel: presentation.animationLabel } : {}) }),
    units: assets.branding.bookMenu.units,
    editions: assets.branding.bookMenu.editions,
    extras: assets.branding.bookMenu.extras,
    closeIcon: assets.icons.close,
    minimizeIcon: assets.icons.minimize,
    settingsIcon: assets.icons.settings,
  }),
  });
}

export function resolveTeacherBookMenuSkin(packageId, selectedSkinId = null, runtimeUiAssets = canonicalTeacherRuntimeUiAssets) {
  const skinId = selectedSkinId || defaultBookMenuSkinId(packageId);
  const definition = findBookMenuSkinDefinition(skinId);
  if (!definition || !definition.packageIds.includes(String(packageId || ""))) return null;
  const assets = runtimeAssetsBySkinId(runtimeUiAssets, packageId)[skinId];
  return assets ? Object.freeze({ ...definition, ...assets }) : null;
}
