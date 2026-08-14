import { useTeacherRuntimeUiAssets } from "./legacyClassroomAssets.js";

export function useTeacherListeningPlayerAssets() {
  return useTeacherRuntimeUiAssets().classroom.mediaPlayer;
}
