import { teacherAvailableStudentsBookUnits } from "./teacherOfflineUnitMetadata.js";

export default function TeacherUnitSwitch({ className, selectedUnit, onSelectUnit }) {
  return (
    <nav className={`teacher-unit-switch ${className}`} aria-label="Book unit">
      {teacherAvailableStudentsBookUnits.map((unit) => {
        const selected = Number(selectedUnit) === unit.number;
        return (
          <button
            key={unit.number}
            type="button"
            className={selected ? "selected" : ""}
            aria-label={`Unit ${unit.number}`}
            aria-pressed={selected}
            data-unit-number={unit.number}
            data-unit-title={unit.title}
            onClick={() => onSelectUnit(unit.number)}
          >
            <span className="teacher-unit-switch-legacy-label">Unit {unit.number}</span>
            <span className="teacher-unit-switch-modern-label" aria-hidden="true">
              <b className="teacher-unit-switch-badge">{unit.number}</b>
              <span className="teacher-unit-switch-title">{unit.title}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
