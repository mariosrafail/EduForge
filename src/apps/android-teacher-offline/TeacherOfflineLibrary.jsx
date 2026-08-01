import { BookOpen, Minus, MonitorPlay, X } from "lucide-react";
import studentsBookCover from "../../assets/books/ultimate-b2/covers/ultimate_b2_students_book.jpg";
import workbookCover from "../../assets/books/ultimate-b2/covers/ultimate_b2_workbook.jpg";
import { legacyClassroomAssets } from "./legacyClassroomAssets.js";

export default function TeacherOfflineLibrary({ pack, onOpenBook }) {
  const manifest = pack.manifest;
  const units = [
    { number: 1, title: "Lights, Camera, Action!", available: true },
    { number: 2, title: "Journeys of Discovery", available: true },
  ];
  return (
    <main className="teacher-offline-library" style={{ "--legacy-classroom-background": `url(${legacyClassroomAssets.backgrounds.classroomGlacier})` }}>
      <header className="legacy-home-topbar">
        <div className="legacy-home-publisher">
          <strong>HAMILTON HOUSE</strong>
          <span>Interactive classroom</span>
        </div>
        <span className="teacher-offline-eyebrow"><MonitorPlay size={18} /> Teacher presentation · Offline</span>
        <div className="legacy-home-window-controls" aria-label="Android fullscreen window controls">
          <span aria-hidden="true"><Minus size={20} /></span>
          <span aria-hidden="true"><X size={20} /></span>
        </div>
      </header>
      <section className="legacy-home-launcher" aria-label="Ultimate B2 classroom launcher">
        <div className="legacy-home-unit-grid" aria-label="Book units">
          {units.map((unit) => (
            <button
              key={unit.number}
              type="button"
              className={`legacy-home-unit ${unit.available ? "available" : "unavailable"}`}
              disabled={!unit.available}
              aria-label={unit.available ? `Open Unit ${unit.number}: ${unit.title}` : `Unit ${unit.number}: ${unit.title}, unavailable`}
              onClick={() => onOpenBook(unit.number)}
            >
              <b>{unit.number}</b>
              <span>{unit.title}</span>
              {!unit.available && <small>Unavailable</small>}
            </button>
          ))}
        </div>

        <div className="legacy-home-identity">
          <img src={studentsBookCover} alt="Ultimate B2 Students Book cover" decoding="async" />
          <div className="legacy-home-title" aria-label="Ultimate English B2">
            <span>ULTIMATE ENGLISH</span>
            <strong>B2</strong>
          </div>
          <p>Students Book · Units 1–2 installed</p>
          <button type="button" className="teacher-primary-button legacy-home-open-book" onClick={() => onOpenBook()}>
            <BookOpen size={24} /> Open Students Book
          </button>
          <small>{manifest.enabledActivityCount} activities · {manifest.pageCount} page spreads · offline</small>
        </div>

        <div className="legacy-home-feature-row" aria-label="Available book editions">
          <button type="button" disabled aria-label="Workbook, content not installed">
            <img src={workbookCover} alt="" aria-hidden="true" />
            <span>Workbook</span><small>Content not installed</small>
          </button>
        </div>
      </section>
    </main>
  );
}
