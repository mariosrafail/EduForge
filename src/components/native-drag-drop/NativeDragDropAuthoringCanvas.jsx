import { useRef, useState } from "react";

import { StageSelectionFrame } from "../builder-studio/StageSelectionFrame.jsx";
import { clientPointToStage, logicalAreaStyle } from "../builder-studio/stageGeometry.js";

function drawnArea(start, current, stage) {
  const x = Math.max(0, Math.min(start.x, current.x));
  const y = Math.max(0, Math.min(start.y, current.y));
  const right = Math.min(stage.width, Math.max(start.x, current.x));
  const bottom = Math.min(stage.height, Math.max(start.y, current.y));
  return { x: Math.round(x), y: Math.round(y), width: Math.max(1, Math.round(right - x)), height: Math.max(1, Math.round(bottom - y)) };
}

export function NativeDragDropAuthoringCanvas({ document, panel, assetUrl, selection, onSelect, drawingTarget, onCreateTarget, onChangeImage, onChangeTarget, onDelete }) {
  const [draft, setDraft] = useState(null);
  const drag = useRef(null);
  const draftRef = useRef(null);
  const assets = new Map(document.assets.map((asset) => [asset.slot, asset]));
  const selectedImage = selection?.kind === "image" ? panel.images.find((image) => image.id === selection.id) : null;
  const selectedTarget = selection?.kind === "target" ? panel.dropTargets.find((target) => target.id === selection.id) : null;
  const begin = (event) => {
    if (!drawingTarget) { if (event.target === event.currentTarget) onSelect(null); return; }
    event.preventDefault();
    const start = clientPointToStage(event, event.currentTarget.getBoundingClientRect(), panel.surface);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { pointerId: event.pointerId, start };
    draftRef.current = { x: Math.round(start.x), y: Math.round(start.y), width: 1, height: 1 };
    setDraft(draftRef.current);
  };
  const move = (event) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    draftRef.current = drawnArea(drag.current.start, clientPointToStage(event, event.currentTarget.getBoundingClientRect(), panel.surface), panel.surface);
    setDraft(draftRef.current);
  };
  const finish = (event, cancelled = false) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    const area = draftRef.current;
    drag.current = null; draftRef.current = null; setDraft(null);
    if (!cancelled && area?.width >= 8 && area?.height >= 8) onCreateTarget(area);
  };
  return <div className={`native-drag-drop-authoring-stage${drawingTarget ? " is-drawing-target" : ""}`} style={{ aspectRatio: `${panel.surface.width} / ${panel.surface.height}` }} data-studio-stage onPointerDown={begin} onPointerMove={move} onPointerUp={(event) => finish(event)} onPointerCancel={(event) => finish(event, true)}>
    {panel.images.map((image) => {
      const reference = assets.get(image.assetSlot);
      return <button key={image.id} type="button" className={`native-drag-drop-authoring-image${selection?.kind === "image" && selection.id === image.id ? " is-selected" : ""}`} style={{ ...logicalAreaStyle(image.area, panel.surface), zIndex: image.order + 1, pointerEvents: drawingTarget ? "none" : undefined }} aria-label={`${image.altText || "Image layer"}${image.locked ? ", locked" : ""}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => onSelect({ kind: "image", id: image.id })}>{reference ? <img src={assetUrl(reference.assetId)} alt="" style={{ objectFit: image.fit }} draggable="false" /> : null}</button>;
    })}
    {panel.dropTargets.map((target, index) => <button key={target.id} type="button" className={`native-drag-drop-authoring-target${selection?.kind === "target" && selection.id === target.id ? " is-selected" : ""}`} style={{ ...logicalAreaStyle(target.area, panel.surface), zIndex: panel.images.length + 3, pointerEvents: drawingTarget ? "none" : undefined }} aria-label={`Drop target ${index + 1}: ${target.accessibleLabel}; capacity ${target.capacity}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => onSelect({ kind: "target", id: target.id })}><span>{index + 1} · {target.capacity}</span></button>)}
    {draft ? <div className="native-drag-drop-authoring-target is-draft" style={{ ...logicalAreaStyle(draft, panel.surface), zIndex: 80 }} /> : null}
    {selectedImage && !drawingTarget ? <StageSelectionFrame geometry={selectedImage.area} stage={panel.surface} label={selectedImage.altText || "Image"} locked={selectedImage.locked} preserveAspectRatio minWidth={24} minHeight={24} onChange={onChangeImage} onClear={() => onSelect(null)} onDelete={onDelete} /> : null}
    {selectedTarget && !drawingTarget ? <StageSelectionFrame geometry={selectedTarget.area} stage={panel.surface} label={selectedTarget.accessibleLabel} minWidth={8} minHeight={8} onChange={onChangeTarget} onClear={() => onSelect(null)} onDelete={onDelete} /> : null}
    {!panel.images.length ? <p className="native-drag-drop-authoring-empty">Add a background or image layer.</p> : null}
  </div>;
}
