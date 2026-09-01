import { StudioField } from "./StudioControls.jsx";
import { updateStageGeometryField } from "./stageGeometry.js";

export function QuickNumber({ label, value, minimum = 0, maximum, step = 1, disabled = false, onChange }) {
  return <StudioField label={label} className="studio-quick-field"><input aria-label={`Quick ${label}`} type="number" min={minimum} max={maximum} step={step} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></StudioField>;
}

export function StageGeometryControls({
  area,
  stage,
  onChange,
  locked = false,
  aspectRatio = null,
  minWidth = 1,
  minHeight = 1,
  label = "Geometry",
  className = "studio-number-grid",
}) {
  if (!area) return null;
  const update = (key, value) => onChange(updateStageGeometryField(area, key, value, stage, { aspectRatio, minWidth, minHeight }));
  return <div className={className} role="group" aria-label={`${label} geometry`}>
    <QuickNumber label="X" value={area.x} maximum={stage.width - area.width} disabled={locked} onChange={(value) => update("x", value)} />
    <QuickNumber label="Y" value={area.y} maximum={stage.height - area.height} disabled={locked} onChange={(value) => update("y", value)} />
    <QuickNumber label="Width" value={area.width} minimum={minWidth} maximum={stage.width - area.x} disabled={locked} onChange={(value) => update("width", value)} />
    <QuickNumber label="Height" value={area.height} minimum={minHeight} maximum={stage.height - area.y} disabled={locked} onChange={(value) => update("height", value)} />
  </div>;
}
