import { ArrowLeft, BookOpen, ListChecks } from "lucide-react";

import TeacherOfflineActivityList from "./TeacherOfflineActivityList.jsx";
import TeacherOfflinePages from "./TeacherOfflinePages.jsx";

export default function TeacherOfflineBook({
  pack,
  pageUnits,
  location,
  onLocationChange,
  onOpenActivity,
  onOpenMedia,
  onBackToLibrary,
}) {
  const unitNumber = [1, 2].includes(Number(location.unitNumber)) ? Number(location.unitNumber) : 1;
  const tab = location.tab === "exercises" ? "exercises" : "pages";
  const update = (patch, options) => onLocationChange({ ...location, ...patch }, options);

  return (
    <main className="teacher-offline-book">
      <header className="teacher-offline-book-header">
        <button type="button" onClick={onBackToLibrary}><ArrowLeft size={22} /> Library</button>
        <div>
          <span className="teacher-offline-eyebrow">Teacher presentation · Offline</span>
          <h1>Ultimate B2 Students Book</h1>
        </div>
        <nav aria-label="Book unit">
          {[1, 2].map((number) => (
            <button
              key={number}
              type="button"
              className={unitNumber === number ? "selected" : ""}
              onClick={() => update({ unitNumber: number, pageId: "" })}
            >
              Unit {number}
            </button>
          ))}
        </nav>
      </header>
      <div className="teacher-offline-view-tabs" role="tablist" aria-label="Book view">
        <button type="button" role="tab" aria-selected={tab === "pages"} className={tab === "pages" ? "selected" : ""} onClick={() => update({ tab: "pages" })}>
          <BookOpen size={20} /> Book pages
        </button>
        <button type="button" role="tab" aria-selected={tab === "exercises"} className={tab === "exercises" ? "selected" : ""} onClick={() => update({ tab: "exercises" })}>
          <ListChecks size={20} /> Contents / Exercises
        </button>
      </div>
      {tab === "pages" ? (
        <TeacherOfflinePages
          unit={pageUnits.find((candidate) => Number(candidate.number) === unitNumber)}
          selectedPageId={location.pageId}
          onSelectPage={(pageId, options) => update({ pageId }, options)}
          onOpenActivity={onOpenActivity}
          onOpenMedia={onOpenMedia}
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
