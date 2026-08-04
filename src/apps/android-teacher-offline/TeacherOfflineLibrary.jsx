import { LockKeyhole } from "lucide-react";

import ClassroomStageTransform from "./ClassroomStageTransform.jsx";
import ClassroomToolOverlay from "./ClassroomToolOverlay.jsx";
import ClassroomToolbar from "./ClassroomToolbar.jsx";
import LegacyMenuTitleAnimation from "./LegacyMenuTitleAnimation.jsx";
import { teacherStudentsBookUnits as units } from "./teacherOfflineUnitMetadata.js";

function LegacyMenuArtwork({ artwork }) {
  return (
    <span className="legacy-menu-button-art" aria-hidden="true">
      <img className="normal" src={artwork.normal} alt="" draggable="false" />
      <img className="hover-pressed" src={artwork.hoverPressed} alt="" draggable="false" />
    </span>
  );
}

function UnitColumn({ label, items, artwork, onOpenBook }) {
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
          <LegacyMenuArtwork artwork={artwork[unit.number - 1]} />
          {!unit.available && <small className="legacy-home-lock"><LockKeyhole size={13} /> Locked</small>}
        </button>
      ))}
    </div>
  );
}

export default function TeacherOfflineLibrary({ menuSkin, onOpenBook, onOpenSettings, onCloseApplication, animationsActive }) {
  if (!menuSkin) return <main className="teacher-offline-status damaged" role="alert"><h1>Book menu unavailable</h1><p>Reinstall the verified classroom application.</p></main>;
  const surfaceKey = menuSkin.surfaceKey;

  return (
    <main className="teacher-offline-library has-classroom-tools" data-book-menu-skin={menuSkin.id} style={{ "--legacy-classroom-background": `url(${menuSkin.background})` }}>
      <header className="legacy-home-floating-chrome">
        <img className="legacy-home-publisher-logo" src={menuSkin.publisherLogo} alt={menuSkin.publisherLogoAlt} />
        <div className="legacy-home-window-controls" aria-label="Launcher controls">
          <button type="button" className="legacy-home-settings-button" aria-label="Open classroom settings" title="Classroom settings" onClick={onOpenSettings}>
            <img src={menuSkin.settingsIcon} alt="" draggable="false" />
          </button>
          <button type="button" className="legacy-home-close-button" aria-label="Close application" title="Close application" onClick={onCloseApplication}>
            <img src={menuSkin.closeIcon} alt="" draggable="false" />
          </button>
        </div>
      </header>

      <section className="legacy-home-classroom-surface" data-classroom-surface-id={surfaceKey} tabIndex={-1} aria-label={`${menuSkin.title.accessibleLabel} classroom launcher`}>
        <ClassroomStageTransform surfaceKey={surfaceKey}>
          <div className="legacy-home-launcher">
            <UnitColumn label="Units 1 to 5" items={units.slice(0, 5)} artwork={menuSkin.units} onOpenBook={onOpenBook} />
            {menuSkin.title.kind === "legacy-gaf" && <LegacyMenuTitleAnimation animate={animationsActive} />}
            <UnitColumn label="Units 6 to 10" items={units.slice(5)} artwork={menuSkin.units} onOpenBook={onOpenBook} />

            <div className="legacy-home-book-row" aria-label="Additional book editions">
              {[
                ["Workbook", "workbook", "Workbook content not installed"],
                ["Grammar Book", "grammarBook", "Grammar Book content not installed"],
                ["Extras", "extras", "Extras content not installed"],
              ].map(([label, assetKey, title]) => (
                <button key={label} type="button" className="legacy-home-book-button locked" disabled aria-label={`${label} — Locked`} title={title}>
                  <LegacyMenuArtwork artwork={menuSkin.editions[assetKey]} />
                  <small className="legacy-home-lock"><LockKeyhole size={13} /> Locked</small>
                </button>
              ))}
            </div>
          </div>
          <ClassroomToolOverlay surfaceKey={surfaceKey} />
        </ClassroomStageTransform>
      </section>

      <ClassroomToolbar surfaceKey={surfaceKey} />
    </main>
  );
}
