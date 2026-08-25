import { useRef, useState } from "react";
import { StageSelectionFrame } from "../builder-studio/StageSelectionFrame.jsx";
import { clientPointToStage, logicalAreaStyle } from "../builder-studio/stageGeometry.js";

function areaBetween(start, current, stage) {
  const left = Math.max(0, Math.min(start.x, current.x));
  const top = Math.max(0, Math.min(start.y, current.y));
  const right = Math.min(stage.width, Math.max(start.x, current.x));
  const bottom = Math.min(stage.height, Math.max(start.y, current.y));
  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.max(1, Math.round(right - left)),
    height: Math.max(1, Math.round(bottom - top)),
  };
}

export function NativeCompleteSentencesHotspotCanvas({ presentation, assetUrl = "", items, selectedHotspotId, locked = false, onSelect, onCreate, onChange, onDelete, drawingEnabled = false }) {
  const [draft, setDraft] = useState(null);
  const gesture = useRef(null);
  const stage = {
    width: presentation.sourceWidth,
    height: presentation.sourceHeight,
  };
  const selected = presentation.hotspots.find((hotspot) => hotspot.id === selectedHotspotId) || null;
  const begin = (event) => {
    if (event.target !== event.currentTarget) return;
    if (!drawingEnabled) return onSelect?.(null);
    event.preventDefault();
    const start = clientPointToStage(event, event.currentTarget.getBoundingClientRect(), stage);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    gesture.current = {
      pointerId: event.pointerId,
      start,
      area: {
        x: Math.round(start.x),
        y: Math.round(start.y),
        width: 1,
        height: 1,
      },
    };
    setDraft(gesture.current.area);
  };
  const move = (event) => {
    if (gesture.current?.pointerId === event.pointerId) {
      gesture.current.area = areaBetween(gesture.current.start, clientPointToStage(event, event.currentTarget.getBoundingClientRect(), stage), stage);
      setDraft(gesture.current.area);
    }
  };
  const end = (event, cancelled = false) => {
    if (gesture.current?.pointerId !== event.pointerId) return;
    const area = gesture.current.area;
    gesture.current = null;
    setDraft(null);
    if (!cancelled && area.width >= 4 && area.height >= 4) onCreate?.(area);
  };
  return (
    <div className={`native-single-choice-hotspot-canvas${drawingEnabled ? " is-drawing" : ""}`} style={{ aspectRatio: `${stage.width} / ${stage.height}` }} data-studio-stage onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={(event) => end(event, true)}>
      {assetUrl ? <img src={assetUrl} alt="" draggable="false" /> : <p>Upload a background image.</p>}
      {presentation.hotspots.map((hotspot, index) => (
        <button key={hotspot.id} type="button" className={`native-single-choice-authoring-hotspot${selectedHotspotId === hotspot.id ? " is-selected" : ""}`} style={logicalAreaStyle(hotspot.area, stage)} onPointerDown={(event) => event.stopPropagation()} onClick={() => onSelect?.(hotspot.id)} aria-label={`Blank hotspot ${index + 1}: ${items.find((item) => item.id === hotspot.itemId)?.prompt || "Unknown item"}`}>
          <span>{index + 1}</span>
        </button>
      ))}
      {draft ? <div className="native-single-choice-authoring-hotspot is-draft" style={logicalAreaStyle(draft, stage)} /> : null}
      {selected ? <StageSelectionFrame geometry={selected.area} stage={stage} label="Blank hotspot" locked={locked} minWidth={4} minHeight={4} onChange={(area) => onChange?.(Object.fromEntries(Object.entries(area).map(([key, value]) => [key, Math.round(value)])))} onClear={() => onSelect?.(null)} onDelete={onDelete} /> : null}
    </div>
  );
}
