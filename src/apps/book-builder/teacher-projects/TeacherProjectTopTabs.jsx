import { useRef } from "react";

export default function TeacherProjectTopTabs({ sections, selectedId, statusFor, onSelect }) {
  const refs = useRef(new Map());
  const moveFocus = (currentId, direction) => {
    const index = sections.findIndex(([id]) => id === currentId);
    const nextIndex = direction === "home" ? 0
      : direction === "end" ? sections.length - 1
        : (index + direction + sections.length) % sections.length;
    const nextId = sections[nextIndex][0];
    onSelect(nextId);
    refs.current.get(nextId)?.focus();
  };
  const onKeyDown = (event, id) => {
    const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : event.key === "Home" ? "home" : event.key === "End" ? "end" : null;
    if (direction === null) return;
    event.preventDefault();
    moveFocus(id, direction);
  };
  return (
    <nav className="teacher-project-top-tabs" aria-label="Teacher Project sections">
      <div role="tablist" aria-label="Teacher Project sections">
        {sections.map(([id, label]) => (
          <button
            type="button"
            role="tab"
            id={`teacher-tab-${id}`}
            aria-controls="teacher-section-panel"
            aria-selected={selectedId === id}
            tabIndex={selectedId === id ? 0 : -1}
            key={id}
            ref={(node) => { if (node) refs.current.set(id, node); else refs.current.delete(id); }}
            onClick={() => onSelect(id)}
            onKeyDown={(event) => onKeyDown(event, id)}
          >
            <span>{label}</span>
            <small>{statusFor(id)}</small>
          </button>
        ))}
      </div>
    </nav>
  );
}
