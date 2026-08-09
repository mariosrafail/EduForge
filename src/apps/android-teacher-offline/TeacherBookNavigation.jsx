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
  videoAvailable = false,
  videoActive = false,
  onVideo = noOp,
}) {
  return <TeacherBookNavigationCore {...{ onHome, onBack, onPrevious, onNext, previousDisabled, nextDisabled, videoAvailable, videoActive, onVideo }} renderIcon={(name) => <LegacyClassroomIcon name={name} />} />;
}
