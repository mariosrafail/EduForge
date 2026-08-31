import { StageSelectionFrame } from "../builder-studio/StageSelectionFrame.jsx";
import { logicalAreaStyle } from "../builder-studio/stageGeometry.js";

export function NativeSingleChoiceHotspotCanvas({ panel, assetUrl = "", questions, selectedHotspotId, onSelect, onChangeArea, onDelete }) {
  const stage = { width: panel.sourceWidth, height: panel.sourceHeight };
  const selected = panel.hotspots.find((hotspot) => hotspot.id === selectedHotspotId) || null;
  const questionById = new Map(questions.map((question) => [question.id, question]));

  return <div
    className="native-single-choice-hotspot-canvas"
    style={{ aspectRatio: `${stage.width} / ${stage.height}` }}
    data-studio-stage
    data-surface-width={stage.width}
    data-surface-height={stage.height}
    onPointerDown={(event) => { if (event.target === event.currentTarget) onSelect?.(null); }}
  >
    {assetUrl ? <img src={assetUrl} alt="" draggable="false" /> : <p>Upload a background image for this panel.</p>}
    {panel.hotspots.map((hotspot, index) => {
      const question = questionById.get(hotspot.questionId);
      const option = question?.options.find((entry) => entry.id === hotspot.optionId);
      return <button type="button" className={`native-single-choice-authoring-hotspot${selectedHotspotId === hotspot.id ? " is-selected" : ""}`} style={logicalAreaStyle(hotspot.area, stage)} onPointerDown={(event) => event.stopPropagation()} onClick={() => onSelect?.(hotspot.id)} aria-label={`Hotspot ${index + 1}: ${question?.prompt || "Unknown question"}, ${option?.text || "Unknown option"}`}><span>{index + 1}</span></button>;
    })}
    {selected ? <StageSelectionFrame geometry={selected.area} stage={stage} label="Hotspot" minWidth={4} minHeight={4} onChange={(area) => onChangeArea?.(Object.fromEntries(Object.entries(area).map(([key, value]) => [key, Math.round(value)])))} onClear={() => onSelect?.(null)} onDelete={onDelete} /> : null}
  </div>;
}
