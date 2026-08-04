import { LockKeyhole } from "lucide-react";

import ClassroomStageTransform from "./ClassroomStageTransform.jsx";
import ClassroomToolOverlay from "./ClassroomToolOverlay.jsx";
import ClassroomToolbar from "./ClassroomToolbar.jsx";
import { legacyClassroomAssets } from "./legacyClassroomAssets.js";
import LegacyMenuTitleAnimation from "./LegacyMenuTitleAnimation.jsx";
import { teacherStudentsBookUnits as units } from "./teacherOfflineUnitMetadata.js";

function UnitColumn({ label, items, onOpenBook }) {
  return (
    <div className="legacy-home-unit-column" aria-label={label}>
      {items.map((unit) => (
        <button
          key={unit.number}
          type="button"
          className={`legacy-home-unit ${unit.available ? "available" : "locked"}`}
          disabled={!unit.available}
          aria-label={unit.available ? `Open Unit ${unit.number}: ${unit.title}` : `Unit ${unit.number}: ${unit.title} — Locked`}
          onClick={unit.available ? () => onOpenBook(unit.number) : undefined}
        >
          <b>{unit.number}</b>
          <span>{unit.title}</span>
          {!unit.available && <small className="legacy-home-lock"><LockKeyhole size={13} /> Locked</small>}
        </button>
      ))}
    </div>
  );
}

export default function TeacherOfflineLibrary({ onOpenBook, onOpenSettings, onCloseApplication, animationsActive }) {
  const surfaceKey = "ultimate-b2:home";

  return (
    <main className="teacher-offline-library has-classroom-tools" style={{ "--legacy-classroom-background": `url(${legacyClassroomAssets.backgrounds.classroomGlacier})` }}>
      <header className="legacy-home-topbar">
        <img className="legacy-home-publisher-logo" src={legacyClassroomAssets.branding.hamiltonHouseLogo} alt="Hamilton House — English Language Teaching" />
        <div className="legacy-home-window-controls" aria-label="Launcher controls">
          <button type="button" className="legacy-home-close-button" aria-label="Close application" title="Close application" onClick={onCloseApplication}>
            <img src={legacyClassroomAssets.icons.close} alt="" draggable="false" />
          </button>
        </div>
      </header>

      <section className="legacy-home-classroom-surface" data-classroom-surface-id={surfaceKey} tabIndex={-1} aria-label="Ultimate English B2 classroom launcher">
        <ClassroomStageTransform surfaceKey={surfaceKey}>
          <div className="legacy-home-launcher">
            <UnitColumn label="Units 1 to 5" items={units.slice(0, 5)} onOpenBook={onOpenBook} />
            <LegacyMenuTitleAnimation animate={animationsActive} />
            <UnitColumn label="Units 6 to 10" items={units.slice(5)} onOpenBook={onOpenBook} />

            <div className="legacy-home-book-row" aria-label="Additional book editions">
              {[
                ["Workbook", "Workbook content not installed"],
                ["Grammar Book", "Grammar Book content not installed"],
                ["Extras", "Extras content not installed"],
              ].map(([label, title]) => (
                <button key={label} type="button" className="legacy-home-book-button locked" disabled aria-label={`${label} — Locked`} title={title}>
                  <LockKeyhole size={25} /><span>{label}</span><small className="legacy-home-lock">Locked</small>
                </button>
              ))}
            </div>
          </div>
          <ClassroomToolOverlay surfaceKey={surfaceKey} />
        </ClassroomStageTransform>
      </section>

      <ClassroomToolbar surfaceKey={surfaceKey} />
      <button type="button" className="legacy-home-settings-button" aria-label="Open classroom settings" title="Classroom settings" onClick={onOpenSettings}>
        <img src={legacyClassroomAssets.icons.settings} alt="" draggable="false" />
      </button>
    </main>
  );
}
