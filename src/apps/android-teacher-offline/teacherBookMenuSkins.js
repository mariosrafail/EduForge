import {
  BOOK_MENU_SKIN_IDS,
  defaultBookMenuSkinId,
  findBookMenuSkinDefinition,
} from "../../config/bookMenuSkins.js";
import { canonicalTeacherRuntimeUiAssets } from "./legacyClassroomAssets.js";

function runtimeAssetsBySkinId(runtimeUiAssets) {
  const assets = runtimeUiAssets.classroom;
  return Object.freeze({
  [BOOK_MENU_SKIN_IDS.ULTIMATE_B2_LEGACY]: Object.freeze({
    surfaceKey: "ultimate-b2:home",
    background: assets.backgrounds.classroomGlacier,
    publisherLogo: assets.branding.hamiltonHouseLogo,
    publisherLogoAlt: "Hamilton House — English Language Teaching",
    title: Object.freeze({ kind: "legacy-gaf", accessibleLabel: "Ultimate English B2" }),
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
  const assets = runtimeAssetsBySkinId(runtimeUiAssets)[skinId];
  return assets ? Object.freeze({ ...definition, ...assets }) : null;
}
