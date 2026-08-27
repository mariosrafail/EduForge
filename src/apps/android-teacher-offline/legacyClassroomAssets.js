import { createContext, createElement, useContext } from "react";

import { ultimateB2TeacherAppAuthoring } from "../../data/ultimate-b2/teacherAppAuthoring.js";
import { resolveUltimateB2AuthoredAssetUrl } from "../../data/ultimate-b2/ultimateB2AuthoredAssetUrls.js";
import { createTeacherRuntimeUiAssetModel } from "./teacherRuntimeUiAssetModel.js";

export function createUltimateB2TeacherRuntimeUiAssets(hostedPreview = null, runtimeContext) {
  return createTeacherRuntimeUiAssetModel({
    authoring: ultimateB2TeacherAppAuthoring,
    resolveCanonicalAssetUrl: resolveUltimateB2AuthoredAssetUrl,
    hostedPreview,
    runtimeContext,
  });
}

export const canonicalTeacherRuntimeUiAssets = createUltimateB2TeacherRuntimeUiAssets();
export const ultimateB2TeacherToolbarItems = canonicalTeacherRuntimeUiAssets.toolbarItems;
export const legacyClassroomAssets = canonicalTeacherRuntimeUiAssets.classroom;

const TeacherRuntimeUiAssetsContext = createContext(canonicalTeacherRuntimeUiAssets);

export function TeacherRuntimeUiAssetsProvider({ value, children }) {
  return createElement(TeacherRuntimeUiAssetsContext.Provider, { value: value || canonicalTeacherRuntimeUiAssets }, children);
}

export function useTeacherRuntimeUiAssets() {
  return useContext(TeacherRuntimeUiAssetsContext);
}

export function LegacyClassroomIcon({ name, className = "", alt = "" }) {
  const source = useTeacherRuntimeUiAssets().classroom.icons[name];
  return source ? createElement("img", { className: `legacy-classroom-icon ${className}`.trim(), "data-legacy-icon": name, src: source, alt, draggable: "false" }) : null;
}
