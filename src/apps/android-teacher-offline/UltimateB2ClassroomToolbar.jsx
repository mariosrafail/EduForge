import ClassroomToolbar from "./ClassroomToolbar.jsx";
import { useTeacherRuntimeUiAssets } from "./legacyClassroomAssets.js";

export default function UltimateB2ClassroomToolbar(props) {
  const runtimeUiAssets = useTeacherRuntimeUiAssets();
  return <ClassroomToolbar {...props} items={runtimeUiAssets.toolbarItems} />;
}
