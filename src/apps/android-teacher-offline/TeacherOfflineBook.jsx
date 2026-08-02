import { BookOpen, ListChecks } from "lucide-react";

import TeacherOfflineActivityList from "./TeacherOfflineActivityList.jsx";
import TeacherOfflinePages from "./TeacherOfflinePages.jsx";
import TeacherUnitSwitch from "./TeacherUnitSwitch.jsx";
import { LegacyClassroomIcon, legacyClassroomAssets } from "./legacyClassroomAssets.js";
import { teacherStudentsBookUnitTitle } from "./teacherOfflineUnitMetadata.js";

export default function TeacherOfflineBook({
  pack,
  pageUnits,
  location,
  activityId,
  onLocationChange,
  onOpenActivity,
  onCloseActivity,
  onOpenMedia,
  onBackToLibrary,
  viewportProfile,
}) {
  const availableUnitNumbers = (pageUnits || [])
    .map((unit) => Number(unit.number))
    .filter((number) => Number.isInteger(number))
    .sort((left, right) => left - right);
  const requestedUnitNumber = Number(location.unitNumber);
  const unitNumber = availableUnitNumbers.includes(requestedUnitNumber)
    ? requestedUnitNumber
    : availableUnitNumbers[0] || 1;
  const tab = location.tab === "exercises" ? "exercises" : "pages";
  const pageViewerActive = tab === "pages" && Boolean(location.pageId);
  const unitOverviewActive = tab === "pages" && !location.pageId;
  const activeActivity = pack.activities.activities.find((activity) => activity.stableActivityId === activityId) || null;
  const update = (patch, options) => onLocationChange({ ...location, ...patch }, options);

  return (
    <main className={`teacher-offline-book ${pageViewerActive ? "page-viewer-active" : ""} ${unitOverviewActive ? "unit-overview-active" : ""}`.trim()} style={{ "--legacy-classroom-background": `url(${legacyClassroomAssets.backgrounds.classroomGlacier})` }}>
      <header className="teacher-offline-book-header">
        <button type="button" className="teacher-offline-icon-label" onClick={onBackToLibrary} title="Library">
          <LegacyClassroomIcon name="home" /><span>Library</span>
        </button>
        <div className="teacher-offline-book-title">
          <span className="teacher-offline-eyebrow">Ultimate English B2 · Students Book</span>
          <h1>Unit {unitNumber} · {teacherStudentsBookUnitTitle(unitNumber)}</h1>
        </div>
        <div className="teacher-offline-book-controls">
          <TeacherUnitSwitch
            className="teacher-offline-unit-tabs"
            selectedUnit={unitNumber}
            onSelectUnit={(number) => update({ unitNumber: number, tab: "pages", pageId: "" })}
          />
          <div className="teacher-offline-view-tabs" role="tablist" aria-label="Book view">
            <button type="button" title="Book pages" role="tab" aria-selected={tab === "pages"} className={tab === "pages" ? "selected" : ""} onClick={() => update({ tab: "pages" })}>
              <BookOpen size={20} /><span>Book pages</span>
            </button>
            <button type="button" title="Contents and exercises" role="tab" aria-selected={tab === "exercises"} className={tab === "exercises" ? "selected" : ""} onClick={() => update({ tab: "exercises" })}>
              <ListChecks size={20} /><span>Contents / Exercises</span>
            </button>
          </div>
        </div>
      </header>
      {tab === "pages" ? (
        <TeacherOfflinePages
          unit={pageUnits.find((candidate) => Number(candidate.number) === unitNumber)}
          selectedPageId={location.pageId}
          onSelectPage={(pageId, options) => update({ pageId }, options)}
          activeActivity={activeActivity}
          activeActivityId={activityId}
          onOpenActivity={(nextActivityId) => onOpenActivity(nextActivityId, { unitNumber, tab: "pages", pageId: location.pageId })}
          onCloseActivity={onCloseActivity}
          onOpenMedia={onOpenMedia}
          onBackToLibrary={onBackToLibrary}
          onOpenContents={() => update({ tab: "exercises" })}
          onSelectUnit={(number) => update({ unitNumber: number, tab: "pages", pageId: "" })}
          availableUnitNumbers={availableUnitNumbers}
          viewportProfile={viewportProfile}
        />
      ) : (
        <TeacherOfflineActivityList
          unit={pack.catalog.units.find((candidate) => Number(candidate.unitNumber) === unitNumber)}
          onOpenActivity={onOpenActivity}
        />
      )}
    </main>
  );
}
