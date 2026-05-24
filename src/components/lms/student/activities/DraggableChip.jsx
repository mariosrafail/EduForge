import { useRef, useState } from "react";
import { DragTrail } from "./DragTrail.jsx";
import { useSoundEffects } from "../../../../context/SoundContext.jsx";

const maxTrailPoints = 5;
const minTrailDistance = 6;

export function DraggableChip({ id, label, disabled = false, used = false, onPick }) {
  const { playSound } = useSoundEffects();
  const [isDragging, setIsDragging] = useState(false);
  const [trailPoints, setTrailPoints] = useState([]);
  const lastTrailPointRef = useRef(null);
  const lastTickRef = useRef(0);

  const addTrailPoint = (event) => {
    if (!event.clientX || !event.clientY) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const previousPoint = lastTrailPointRef.current;
    const nextX = event.clientX;
    const nextY = event.clientY;
    const dx = previousPoint ? nextX - previousPoint.x : 0;
    const dy = previousPoint ? nextY - previousPoint.y : 0;
    const nextPoint = {
      id: `${Date.now()}-${Math.random()}`,
      x: nextX,
      y: nextY,
      width: rect.width,
      height: rect.height,
      dx,
      dy,
    };

    if (lastTrailPointRef.current) {
      const distance = Math.hypot(nextPoint.x - lastTrailPointRef.current.x, nextPoint.y - lastTrailPointRef.current.y);
      if (distance < minTrailDistance) return;
    }

    lastTrailPointRef.current = nextPoint;
    setTrailPoints((current) => [...current.slice(-(maxTrailPoints - 1)), nextPoint]);
    const now = performance.now();
    if (now - lastTickRef.current > 140) {
      playSound("dragMoveTick");
      lastTickRef.current = now;
    }
    window.setTimeout(() => {
      setTrailPoints((current) => current.filter((point) => point.id !== nextPoint.id));
    }, 260);
  };

  const handleDragStart = (event) => {
    event.currentTarget.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    event.dataTransfer.setData("application/x-hh-chip", JSON.stringify({ id, label }));
    const ghost = event.currentTarget.cloneNode(true);
    ghost.className = "drag-preview-card";
    ghost.style.position = "fixed";
    ghost.style.top = "-1000px";
    ghost.style.left = "-1000px";
    document.body.appendChild(ghost);
    event.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
    window.setTimeout(() => ghost.remove(), 0);
    playSound("dragStart");
    setIsDragging(true);
    setTrailPoints([]);
    lastTrailPointRef.current = null;
    lastTickRef.current = 0;
    addTrailPoint(event);
  };

  const endDrag = (event) => {
    event.currentTarget.classList.remove("is-dragging");
    setIsDragging(false);
    lastTrailPointRef.current = null;
    lastTickRef.current = 0;
    window.setTimeout(() => setTrailPoints([]), 460);
  };

  return (
    <>
      <button
        type="button"
        className={`draggable-chip ${used ? "used" : ""} ${isDragging ? "is-dragging" : ""}`}
        draggable={!disabled}
        disabled={disabled}
        onClick={() => onPick?.(id)}
        onDragStart={handleDragStart}
        onDrag={isDragging ? addTrailPoint : undefined}
        onDragEnd={endDrag}
      >
        <span className="chip-label">{label}</span>
      </button>
      <DragTrail points={trailPoints} />
    </>
  );
}
