import manifest from "../../../android-content-packs/ultimate-b2-students-book/manifest.json";
import catalog from "../../../android-content-packs/ultimate-b2-students-book/catalog.json";
import activities from "../../../android-content-packs/ultimate-b2-students-book/activities.json";
import teacherSolutions from "../../../android-content-packs/ultimate-b2-students-book/teacher-solutions.json";
import assetsManifest from "../../../android-content-packs/ultimate-b2-students-book/assets-manifest.json";

import { BundledTeacherContentPackProvider } from "./contentPackProviders.js";

export const bundledTeacherPack = Object.freeze({
  manifest,
  catalog,
  activities,
  teacherSolutions,
  assetsManifest,
});

export const teacherContentPackProvider = new BundledTeacherContentPackProvider(bundledTeacherPack);
export const interactiveContentPackProvider = teacherContentPackProvider;

export function getOfflineTeacherSolution(activityId) {
  return teacherSolutions.solutions?.[String(activityId || "")] || null;
}
