import { useEffect, useRef, useState } from "react";
import { CheckSquare, ChevronDown, Lock, Send } from "lucide-react";

export function TeacherAssignControl({ exercise, classOptions }) {
  const [selectedClasses, setSelectedClasses] = useState([classOptions[0]]);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const popoverRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsideClick = (event) => {
      if (!popoverRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const toggleClass = (className) => {
    setSelectedClasses((current) => (
      current.includes(className) ? current.filter((item) => item !== className) : [...current, className]
    ));
    setMessage("");
  };

  const assignExercise = () => {
    const targets = selectedClasses.length ? selectedClasses : [classOptions[0]];
    setSelectedClasses(targets);
    setMessage(`Exercise assigned to ${targets.join(", ")}.`);
    setOpen(false);
  };

  return (
    <div className="teacher-assign-popover" ref={popoverRef}>
      <button
        className="teacher-assign-toggle"
        type="button"
        aria-expanded={open}
        aria-label={`Assign ${exercise.title} to class`}
        title="Assign to class"
        onClick={() => setOpen((current) => !current)}
        data-sound-click="tab"
      >
        <CheckSquare size={17} />
        <span>Assign</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="teacher-assign-menu" role="dialog" aria-label={`Choose classes for ${exercise.title}`} onClick={(event) => event.stopPropagation()}>
          <strong>Assign to class</strong>
          <div className="book-browser-class-picker">
            {classOptions.map((className) => (
              <label key={className}>
                <input type="checkbox" checked={selectedClasses.includes(className)} onChange={() => toggleClass(className)} />
                <span>{className}</span>
              </label>
            ))}
          </div>
          <button className="primary-action compact-action" type="button" onClick={assignExercise} data-sound-click="submit">
            <Send size={16} /> Assign
          </button>
        </div>
      )}
      {message && <small className="book-browser-success">{message}</small>}
    </div>
  );
}

export function DisabledAssignControl() {
  return (
    <div className="teacher-assign-popover">
      <button className="teacher-assign-toggle disabled" type="button" disabled title="Not available in demo">
        <Lock size={16} />
        <span>Locked</span>
      </button>
      <small className="book-browser-muted">Not available in demo</small>
    </div>
  );
}
