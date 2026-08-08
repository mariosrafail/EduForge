import { LegacyClassroomIcon } from "./legacyClassroomAssets.js";

const noOp = () => {};

export default function TeacherBookNavigation({
  onHome,
  onBack,
  onPrevious = noOp,
  onNext = noOp,
  previousDisabled = true,
  nextDisabled = true,
}) {
  return (
    <nav className="teacher-book-navigation" aria-label="Book navigation" data-teacher-book-navigation="">
      <button type="button" onClick={onHome} aria-label="Home" title="Home"><LegacyClassroomIcon name="home" /></button>
      <button type="button" onClick={onBack} aria-label="Back" title="Back"><LegacyClassroomIcon name="back" /></button>
      <button type="button" disabled={previousDisabled} onClick={onPrevious} aria-label="Previous page" title="Previous page"><LegacyClassroomIcon name="previous" /></button>
      <button type="button" disabled={nextDisabled} onClick={onNext} aria-label="Next page" title="Next page"><LegacyClassroomIcon name="next" /></button>
      <button type="button" className="teacher-book-navigation-edition" onClick={noOp} aria-label="Grammar Book" title="Grammar Book"><span>GB</span></button>
      <button type="button" className="teacher-book-navigation-edition" onClick={noOp} aria-label="Workbook" title="Workbook"><span>WB</span></button>
    </nav>
  );
}
