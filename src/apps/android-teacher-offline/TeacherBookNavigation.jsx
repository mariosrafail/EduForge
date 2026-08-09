import { LegacyClassroomIcon } from "./legacyClassroomAssets.js";
import TeacherBookNavigationCore from "./TeacherBookNavigationCore.jsx";

const noOp = () => {};

export default function TeacherBookNavigation({
  onHome,
  onBack,
  onPrevious = noOp,
  onNext = noOp,
  previousDisabled = true,
  nextDisabled = true,
  contextAction = null,
  contextActions = null,
  internalNavigation = null,
}) {
  return <TeacherBookNavigationCore {...{ onHome, onBack, onPrevious, onNext, previousDisabled, nextDisabled, contextAction, contextActions, internalNavigation }} renderIcon={(name) => <LegacyClassroomIcon name={name} />} />;
}
