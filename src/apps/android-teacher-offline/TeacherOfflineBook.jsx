import { BookOpen, ListChecks } from "lucide-react";

import TeacherOfflineActivityList from "./TeacherOfflineActivityList.jsx";
import TeacherOfflinePages from "./TeacherOfflinePages.jsx";
import { LegacyClassroomIcon, legacyClassroomAssets } from "./legacyClassroomAssets.js";

const unitNames = { 1: "Lights, Camera, Action!", 2: "Journeys of Discovery" };

export default function TeacherOfflineBook({
  pack,
  pageUnits,
  location,
  onLocationChange,
  onOpenActivity,
  onOpenMedia,
  onBackToLibrary,
  viewportProfile,
}) {
  const unitNumber = [1, 2].includes(Number(location.unitNumber)) ? Number(location.unitNumber) : 1;
  const tab = location.tab === "exercises" ? "exercises" : "pages";
  const pageViewerActive = tab === "pages" && Boolean(location.pageId);
  const update = (patch, options) => onLocationChange({ ...location, ...patch }, options);

  return (
    <main className={`teacher-offline-book ${pageViewerActive ? "page-viewer-active" : ""}`} style={{ "--legacy-classroom-background": `url(${legacyClassroomAssets.backgrounds.classroomGlacier})` }}>
      <header className="teacher-offline-book-header">
        <button type="button" className="teacher-offline-icon-label" onClick={onBackToLibrary} title="Library">
          <LegacyClassroomIcon name="home" /><span>Library</span>
        </button>
        <div className="teacher-offline-book-title">
          <span className="teacher-offline-eyebrow">Ultimate English B2 · Students Book</span>
          <h1>Unit {unitNumber} · {unitNames[unitNumber]}</h1>
        </div>
        <div className="teacher-offline-book-controls">
          <nav className="teacher-offline-unit-tabs" aria-label="Book unit">
            {[1, 2].map((number) => (
              <button
                key={number}
                type="button"
                className={unitNumber === number ? "selected" : ""}
                onClick={() => update({ unitNumber: number, tab: "pages", pageId: "" })}
              >
                Unit {number}
              </button>
            ))}
          </nav>
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
          onOpenActivity={onOpenActivity}
          onOpenMedia={onOpenMedia}
          onBackToLibrary={onBackToLibrary}
          onOpenContents={() => update({ tab: "exercises" })}
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
