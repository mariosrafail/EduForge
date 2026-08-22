import { useRef, useState } from "react";

import { StageSelectionFrame } from "../builder-studio/StageSelectionFrame.jsx";
import { clientPointToStage, logicalAreaStyle } from "../builder-studio/stageGeometry.js";

function integerArea(start, current, stage) {
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

export function NativeSingleChoiceHotspotCanvas({ panel, assetUrl = "", questions, selectedHotspotId, onSelect, onCreate, onChange, onDelete, drawingEnabled = false }) {
  const [draftArea, setDraftArea] = useState(null);
  const draw = useRef(null);
  const draftAreaRef = useRef(null);
  const stage = { width: panel.sourceWidth, height: panel.sourceHeight };
  const selected = panel.hotspots.find((hotspot) => hotspot.id === selectedHotspotId) || null;
  const questionById = new Map(questions.map((question) => [question.id, question]));

  const beginDraw = (event) => {
    if (event.target !== event.currentTarget) return;
    if (!drawingEnabled) {
      onSelect?.(null);
      return;
    }
    event.preventDefault();
    const point = clientPointToStage(event, event.currentTarget.getBoundingClientRect(), stage);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    draw.current = { pointerId: event.pointerId, start: point };
    draftAreaRef.current = { x: Math.round(point.x), y: Math.round(point.y), width: 1, height: 1 };
    setDraftArea(draftAreaRef.current);
  };
  const moveDraw = (event) => {
    if (!draw.current || draw.current.pointerId !== event.pointerId) return;
    draftAreaRef.current = integerArea(draw.current.start, clientPointToStage(event, event.currentTarget.getBoundingClientRect(), stage), stage);
    setDraftArea(draftAreaRef.current);
  };
  const finishDraw = (event, cancelled = false) => {
    if (!draw.current || draw.current.pointerId !== event.pointerId) return;
    const area = draftAreaRef.current;
    draw.current = null;
    draftAreaRef.current = null;
    setDraftArea(null);
    if (!cancelled && area && area.width >= 4 && area.height >= 4) onCreate?.(area);
  };

  return <div
    className={`native-single-choice-hotspot-canvas${drawingEnabled ? " is-drawing" : ""}`}
    style={{ aspectRatio: `${stage.width} / ${stage.height}` }}
    data-studio-stage
    data-surface-width={stage.width}
    data-surface-height={stage.height}
    onPointerDown={beginDraw}
    onPointerMove={moveDraw}
    onPointerUp={(event) => finishDraw(event)}
    onPointerCancel={(event) => finishDraw(event, true)}
  >
    {assetUrl ? <img src={assetUrl} alt="" draggable="false" /> : <p>Upload a background image for this panel.</p>}
    {panel.hotspots.map((hotspot, index) => {
      const question = questionById.get(hotspot.questionId);
      const option = question?.options.find((entry) => entry.id === hotspot.optionId);
      return <button key={hotspot.id} type="button" className={`native-single-choice-authoring-hotspot${selectedHotspotId === hotspot.id ? " is-selected" : ""}`} style={logicalAreaStyle(hotspot.area, stage)} onPointerDown={(event) => event.stopPropagation()} onClick={() => onSelect?.(hotspot.id)} aria-label={`Hotspot ${index + 1}: ${question?.prompt || "Unknown question"}, ${option?.text || "Unknown option"}`}><span>{index + 1}</span></button>;
    })}
    {draftArea ? <div className="native-single-choice-authoring-hotspot is-draft" style={logicalAreaStyle(draftArea, stage)} /> : null}
    {selected ? <StageSelectionFrame geometry={selected.area} stage={stage} label="Hotspot" minWidth={4} minHeight={4} onChange={(area) => onChange?.(Object.fromEntries(Object.entries(area).map(([key, value]) => [key, Math.round(value)])))} onClear={() => onSelect?.(null)} onDelete={onDelete} /> : null}
  </div>;
}
