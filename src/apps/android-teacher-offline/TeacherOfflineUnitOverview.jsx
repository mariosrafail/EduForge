import { ChevronLeft, ChevronRight, Grid2X2, Minimize2 } from "lucide-react";

import ClassroomStageTransform from "./ClassroomStageTransform.jsx";
import ClassroomToolOverlay from "./ClassroomToolOverlay.jsx";
import ClassroomToolbar from "./ClassroomToolbar.jsx";
import { LegacyClassroomIcon } from "./legacyClassroomAssets.js";
import { buildStudentsBookOverviewEntries } from "./studentsBookOverviewLayout.js";
import { useTeacherOfflineSettings } from "./teacherOfflineSettings.js";

export default function TeacherOfflineUnitOverview({
  unit,
  availableUnitNumbers = [],
  onSelectPage,
  onSelectUnit,
  onBackToLibrary,
  onOpenContents,
}) {
  const entries = buildStudentsBookOverviewEntries(unit);
  const settings = useTeacherOfflineSettings();
  const unitNumber = Number(unit.number);
  const surfaceKey = `students-book:overview:unit-${unitNumber}`;
  const orderedAvailableUnits = [...availableUnitNumbers].sort((left, right) => left - right);
  const unitIndex = orderedAvailableUnits.indexOf(unitNumber);
  const previousUnit = unitIndex > 0 ? orderedAvailableUnits[unitIndex - 1] : null;
  const nextUnit = unitIndex >= 0 ? orderedAvailableUnits[unitIndex + 1] || null : null;

  const navigationGroup = (side) => (
    <div aria-label={`${side} overview navigation`}>
      <button type="button" className="legacy-page-round-button" onClick={onBackToLibrary} title="Library" aria-label={`${side} library`}><LegacyClassroomIcon name="home" /></button>
      <button type="button" className="legacy-page-round-button" onClick={onBackToLibrary} title="Back to library" aria-label={`${side} back to library`}><LegacyClassroomIcon name="back" /></button>
    </div>
  );

  return (
    <section className="teacher-offline-pages teacher-offline-unit-overview-screen" aria-label={`Unit ${unit.number} page overview`}>
      <header className="legacy-page-heading legacy-overview-heading">
        <div aria-hidden="true" />
        <div><h2>Unit {unit.number}</h2></div>
        <div className="legacy-page-window-controls">
          <button type="button" disabled aria-disabled="true" title="Minimize — unavailable on Android"><Minimize2 size={20} /></button>
          <button type="button" onClick={onBackToLibrary} title="Close book" aria-label="Close book">×</button>
        </div>
      </header>

      <div className="teacher-unit-overview-stage">
        {previousUnit && (
          <button
            type="button"
            className="teacher-unit-side-navigation previous"
            data-unit-target={previousUnit}
            aria-label="Previous unit"
            aria-controls="teacher-unit-overview-panel"
            title={`Previous unit: Unit ${previousUnit}`}
            onClick={() => onSelectUnit(previousUnit)}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
        )}
        <div id="teacher-unit-overview-panel" className={`teacher-offline-unit-overview legacy-overview-unit-${unitNumber}`} data-classroom-surface-id={surfaceKey} tabIndex={-1}>
          <ClassroomStageTransform surfaceKey={surfaceKey}>
          <div className="teacher-unit-overview-grid">
            {entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="teacher-unit-page-card"
                data-overview-entry={entry.id}
                data-overview-row={entry.row}
                data-page-ids={entry.pageIds.join(",")}
                onClick={() => onSelectPage(entry.pageIds[0])}
                aria-label={`Open ${entry.label || "Unit opener"}, ${entry.pageLabel}`}
              >
                <span className="teacher-unit-page-copy">
                  {entry.label && <strong>{entry.label}</strong>}
                  <b>{entry.pageLabel}</b>
                </span>
                <span className={`teacher-unit-page-thumb ${entry.pages.length > 1 ? "grouped" : ""}`}>
                  {entry.pages.map((candidate) => (
                    <img key={candidate.id} src={candidate.images?.[0]} alt="" loading="eager" decoding="async" draggable="false" />
                  ))}
                </span>
              </button>
            ))}
          </div>
          <ClassroomToolOverlay surfaceKey={surfaceKey} />
          </ClassroomStageTransform>
        </div>
        {nextUnit && (
          <button
            type="button"
            className="teacher-unit-side-navigation next"
            data-unit-target={nextUnit}
            aria-label="Next unit"
            aria-controls="teacher-unit-overview-panel"
            title={`Next unit: Unit ${nextUnit}`}
            onClick={() => onSelectUnit(nextUnit)}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        )}
      </div>

      <nav className="legacy-page-navigation legacy-overview-navigation" aria-label="Unit overview navigation">
        {settings.content.showNavbarLeft || (!settings.content.showNavbarLeft && !settings.content.showNavbarRight) ? navigationGroup("Left") : <div data-navbar-side="left" data-navbar-hidden="true" />}
        <div className="legacy-overview-book-links" aria-label="Book and contents controls">
          <button type="button" disabled aria-label="Grammar Book — Locked" title="Grammar Book — Locked"><span>GB</span><small>Locked</small></button>
          <button type="button" disabled aria-label="Workbook — Locked" title="Workbook — Locked"><span>WB</span><small>Locked</small></button>
          <button type="button" onClick={onOpenContents} aria-label="Contents and exercises" title="Contents and exercises"><Grid2X2 size={24} /><small>Contents</small></button>
        </div>
        {settings.content.showNavbarRight ? navigationGroup("Right") : <div data-navbar-side="right" data-navbar-hidden="true" />}
      </nav>

      <ClassroomToolbar surfaceKey={surfaceKey} />
    </section>
  );
}
