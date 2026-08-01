import {
  BookOpen,
  Eraser,
  Keyboard,
  LockKeyhole,
  Minus,
  MonitorPlay,
  Pencil,
  RotateCcw,
  Timer,
  Trophy,
  Type,
  X,
} from "lucide-react";
import studentsBookCover from "../../assets/books/ultimate-b2/covers/ultimate_b2_students_book.jpg";
import { legacyClassroomAssets } from "./legacyClassroomAssets.js";
import { teacherStudentsBookUnits as units } from "./teacherOfflineUnitMetadata.js";

const homeTools = [
  { label: "Pen", icon: Pencil },
  { label: "Eraser", icon: Eraser },
  { label: "Text", icon: Type },
  { label: "Undo", icon: RotateCcw },
  { label: "Timer", icon: Timer },
  { label: "Scoreboard", icon: Trophy },
  { label: "Keyboard", icon: Keyboard },
];

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

export default function TeacherOfflineLibrary({ pack, onOpenBook }) {
  const manifest = pack.manifest;

  return (
    <main className="teacher-offline-library" style={{ "--legacy-classroom-background": `url(${legacyClassroomAssets.backgrounds.classroomGlacier})` }}>
      <header className="legacy-home-topbar">
        <div className="legacy-home-publisher">
          <strong>HAMILTON HOUSE</strong>
          <span>English Language Teaching</span>
        </div>
        <span className="teacher-offline-eyebrow"><MonitorPlay size={18} /> Interactive Classroom · Offline</span>
        <div className="legacy-home-window-controls" aria-label="Legacy window controls">
          <button type="button" disabled aria-label="Minimize — unavailable on Android" title="Minimize is unavailable on Android"><Minus size={20} /></button>
          <button type="button" disabled aria-label="Close — use Android Back" title="Use Android Back to close"><X size={20} /></button>
        </div>
      </header>

      <section className="legacy-home-launcher" aria-label="Ultimate B2 classroom launcher">
        <UnitColumn label="Units 1 to 5" items={units.slice(0, 5)} onOpenBook={onOpenBook} />

        <div className="legacy-home-identity">
          <div className="legacy-home-title" aria-label="Ultimate English B2">
            <span><i>ULTIMATE</i><em>ENGLISH</em></span>
            <strong>B2</strong>
          </div>
          <img src={studentsBookCover} alt="Ultimate B2 Students Book cover" decoding="async" />
          <p>Interactive classroom</p>
          <small>{manifest.enabledActivityCount} activities · {manifest.pageCount} page spreads · offline</small>
        </div>

        <UnitColumn label="Units 6 to 10" items={units.slice(5)} onOpenBook={onOpenBook} />

        <div className="legacy-home-book-row" aria-label="Book editions">
          <button type="button" className="legacy-home-book-button available" aria-label="Open Students Book" onClick={() => onOpenBook()}>
            <BookOpen size={28} /><span>Students Book</span><small>Open</small>
          </button>
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
      </section>

      <nav className="legacy-home-classroom-toolbar" aria-label="Home classroom tools">
        {homeTools.map(({ label, icon: Icon }) => (
          <button key={label} type="button" disabled aria-label={`${label} — Locked`}>
            <Icon size={22} /><span>{label}</span><small>Locked</small>
          </button>
        ))}
      </nav>

    </main>
  );
}
