import { useEffect, useRef, useState } from "react";
import { GripHorizontal, LockKeyhole } from "lucide-react";

import { clientPointToStage, logicalAreaStyle, moveStageGeometry, STAGE_RESIZE_HANDLES, transformStageGeometry } from "./stageGeometry.js";

const HANDLE_LABELS = Object.freeze({ nw: "top left", ne: "top right", sw: "bottom left", se: "bottom right" });

function isTextControl(target) {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

export function StageSelectionFrame({
  geometry,
  stage,
  label,
  locked = false,
  minWidth = 16,
  minHeight = 16,
  preserveAspectRatio = false,
  aspectRatio = null,
  moveFromGrip = false,
  onChange,
  onClear,
  onDelete,
  zIndex = 90,
}) {
  const [transient, setTransient] = useState(null);
  const interaction = useRef(null);
  const transientRef = useRef(null);
  const displayGeometry = transient || geometry;

  useEffect(() => () => { interaction.current = null; transientRef.current = null; }, []);
  useEffect(() => { if (!interaction.current) setTransient(null); }, [geometry]);

  const begin = (event, operation, handle = "se") => {
    if (locked) return;
    const stageElement = event.currentTarget.closest("[data-studio-stage]");
    if (!stageElement) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    interaction.current = {
      pointerId: event.pointerId,
      operation,
      handle,
      geometry: { ...geometry },
      startPoint: clientPointToStage(event, stageElement.getBoundingClientRect(), stage),
      stageElement,
    };
    transientRef.current = { ...geometry };
    setTransient({ ...geometry });
  };

  const move = (event) => {
    const current = interaction.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault();
    const next = transformStageGeometry({
      geometry: current.geometry,
      operation: current.operation,
      handle: current.handle,
      startPoint: current.startPoint,
      currentPoint: clientPointToStage(event, current.stageElement.getBoundingClientRect(), stage),
      stage,
      minWidth,
      minHeight,
      preserveAspectRatio,
      aspectRatio,
      locked,
    });
    transientRef.current = next;
    setTransient(next);
  };

  const finish = (event, cancelled = false) => {
    if (!interaction.current || interaction.current.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const next = transientRef.current;
    interaction.current = null;
    transientRef.current = null;
    setTransient(null);
    if (!cancelled && next) onChange?.(next);
  };

  const keyDown = (event) => {
    if (isTextControl(event.target)) return;
    if (event.key === "Escape") { event.preventDefault(); onClear?.(); return; }
    if (["Delete", "Backspace"].includes(event.key) && onDelete) { event.preventDefault(); onDelete(); return; }
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!directions[event.key] || locked) return;
    event.preventDefault();
    const amount = event.shiftKey ? 10 : 1;
    onChange?.(moveStageGeometry(geometry, { x: directions[event.key][0] * amount, y: directions[event.key][1] * amount }, stage));
  };

  return <div
    className="studio-selection-frame"
    data-locked={locked || undefined}
    style={{ ...logicalAreaStyle(displayGeometry, stage), zIndex }}
    tabIndex={0}
    role="group"
    aria-label={`${label} selected${locked ? ", locked" : ""}`}
    onPointerDown={moveFromGrip ? undefined : (event) => begin(event, "move")}
    onPointerMove={move}
    onPointerUp={(event) => finish(event)}
    onPointerCancel={(event) => finish(event, true)}
    onClick={(event) => event.stopPropagation()}
    onKeyDown={keyDown}
  >
    <span className="studio-selection-label" onPointerDown={moveFromGrip ? (event) => begin(event, "move") : undefined}>
      {locked ? <LockKeyhole aria-hidden="true" /> : <GripHorizontal aria-hidden="true" />}{label}
    </span>
    {!locked && STAGE_RESIZE_HANDLES.map((handle) => <span
      key={handle}
      className="studio-resize-handle"
      data-handle={handle}
      role="button"
      tabIndex={-1}
      aria-label={`Resize ${label} from ${HANDLE_LABELS[handle]}`}
      onPointerDown={(event) => begin(event, "resize", handle)}
    />)}
  </div>;
}
