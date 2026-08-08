import ClassroomToolbar from "./ClassroomToolbar.jsx";
import { ultimateB2TeacherToolbarItems } from "./legacyClassroomAssets.js";

export default function UltimateB2ClassroomToolbar(props) {
  return <ClassroomToolbar {...props} items={ultimateB2TeacherToolbarItems} />;
}
