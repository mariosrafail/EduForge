import {
  BOOK_MENU_SKIN_IDS,
  defaultBookMenuSkinId,
  findBookMenuSkinDefinition,
} from "../../config/bookMenuSkins.js";
import { legacyClassroomAssets } from "./legacyClassroomAssets.js";

const runtimeAssetsBySkinId = Object.freeze({
  [BOOK_MENU_SKIN_IDS.ULTIMATE_B2_LEGACY]: Object.freeze({
    surfaceKey: "ultimate-b2:home",
    background: legacyClassroomAssets.backgrounds.classroomGlacier,
    publisherLogo: legacyClassroomAssets.branding.hamiltonHouseLogo,
    publisherLogoAlt: "Hamilton House — English Language Teaching",
    title: Object.freeze({ kind: "legacy-gaf", accessibleLabel: "Ultimate English B2" }),
    units: legacyClassroomAssets.branding.bookMenu.units,
    editions: legacyClassroomAssets.branding.bookMenu.editions,
    extras: legacyClassroomAssets.branding.bookMenu.extras,
    closeIcon: legacyClassroomAssets.icons.close,
    minimizeIcon: legacyClassroomAssets.icons.minimize,
    settingsIcon: legacyClassroomAssets.icons.settings,
  }),
});

export function resolveTeacherBookMenuSkin(packageId, selectedSkinId = null) {
  const skinId = selectedSkinId || defaultBookMenuSkinId(packageId);
  const definition = findBookMenuSkinDefinition(skinId);
  if (!definition || !definition.packageIds.includes(String(packageId || ""))) return null;
  const assets = runtimeAssetsBySkinId[skinId];
  return assets ? Object.freeze({ ...definition, ...assets }) : null;
}
