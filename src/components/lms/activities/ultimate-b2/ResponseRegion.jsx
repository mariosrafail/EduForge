import { useState } from "react";

import "./responseRegion.css";

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);

function percentageArea(region, surface) {
  const area = region?.area || {};
  if ([area.left, area.top, area.width, area.height].every(Number.isFinite)) return area;
  if (!surface?.width || !surface?.height) return { left: 0, top: 0, width: 1, height: 1 };
  return {
    left: (area.x / surface.width) * 100,
    top: (area.y / surface.height) * 100,
    width: (area.width / surface.width) * 100,
    height: (area.height / surface.height) * 100,
  };
}

export function responseRegionStyle(region, surface = null) {
  const area = percentageArea(region, surface);
  const presentation = region?.presentation || {};
  return {
    left: `${area.left}%`, top: `${area.top}%`, width: `${area.width}%`, height: `${area.height}%`,
    "--response-region-padding-x": `${presentation.paddingX ?? 10}px`,
    "--response-region-padding-y": `${presentation.paddingY ?? 7}px`,
    "--response-region-line-spacing": `${presentation.lineSpacing ?? 29}px`,
    "--response-region-font-size": `${18 * (presentation.fontScale ?? 1)}px`,
  };
}

export function ResponseRegion({ region, surface = null, revealed = false, revealText = "", onReveal = null, disabled = false, className = "" }) {
  const interactive = typeof onReveal === "function";
  const content = <span className="response-region-text">{revealed ? revealText : ""}</span>;
  const shared = {
    className: `response-region ${revealed ? "is-revealed" : "is-concealed"} ${className}`.trim(),
    style: responseRegionStyle(region, surface),
    "data-response-region-id": region.id,
    "data-revealed": revealed ? "true" : "false",
  };
  if (!interactive) return <div {...shared} aria-hidden="true">{content}</div>;
  return <button {...shared} type="button" aria-label={region.ariaLabel} aria-pressed={revealed} disabled={disabled} onClick={onReveal}>{content}</button>;
}

function pointerPercent(event, element) {
  const rect = element.getBoundingClientRect();
  return { x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100), y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100) };
}

export function EditableResponseRegionLayer({ regions, selectedRegionId, onSelectRegion, onChangeRegions, createRegion }) {
  const [drag, setDrag] = useState(null);
  const [draft, setDraft] = useState(null);

  const beginDraw = (event) => {
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    const point = pointerPercent(event, event.currentTarget);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ type: "draw", pointerId: event.pointerId, startX: point.x, startY: point.y });
    setDraft({ left: point.x, top: point.y, width: 0, height: 0 });
  };
  const beginMove = (event, region, type = "move") => {
    event.preventDefault(); event.stopPropagation();
    const layer = event.currentTarget.closest(".editable-response-region-layer");
    const point = pointerPercent(event, layer);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ type, pointerId: event.pointerId, startX: point.x, startY: point.y, region });
    onSelectRegion(region.id);
  };
  const move = (event) => {
    if (!drag) return;
    event.preventDefault();
    const point = pointerPercent(event, event.currentTarget);
    if (drag.type === "draw") {
      setDraft({ left: Math.min(drag.startX, point.x), top: Math.min(drag.startY, point.y), width: Math.abs(point.x - drag.startX), height: Math.abs(point.y - drag.startY) });
      return;
    }
    const dx = point.x - drag.startX;
    const dy = point.y - drag.startY;
    onChangeRegions(regions.map((region) => {
      if (region.id !== drag.region.id) return region;
      if (drag.type === "resize") return { ...region, width: clamp(drag.region.width + dx, 1, 100 - drag.region.left), height: clamp(drag.region.height + dy, 1, 100 - drag.region.top) };
      return { ...region, left: clamp(drag.region.left + dx, 0, 100 - drag.region.width), top: clamp(drag.region.top + dy, 0, 100 - drag.region.height) };
    }));
  };
  const finish = () => {
    if (drag?.type === "draw" && draft?.width >= 1 && draft?.height >= 1) {
      const created = createRegion(draft);
      const next = regions.some((region) => region.id === created.id)
        ? regions.map((region) => region.id === created.id ? created : region)
        : [...regions, created];
      onChangeRegions(next); onSelectRegion(created.id);
    }
    setDraft(null); setDrag(null);
  };

  return <div className="editable-response-region-layer" aria-label="Editable response regions" onPointerDown={beginDraw} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}>
    {regions.map((region, index) => <button
      key={region.id} type="button" aria-label={region.label || `Response region ${index + 1}`}
      className={`editable-response-region ${selectedRegionId === region.id ? "is-selected" : ""}`}
      style={{ left: `${region.left}%`, top: `${region.top}%`, width: `${region.width}%`, height: `${region.height}%` }}
      onPointerDown={(event) => beginMove(event, region)} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onSelectRegion(region.id); }}
    ><span>{region.label || `Response region ${index + 1}`}</span><span className="editable-response-region-handle" aria-hidden="true" onPointerDown={(event) => beginMove(event, region, "resize")} /></button>)}
    {draft && <span className="editable-response-region is-draft" aria-hidden="true" style={{ left: `${draft.left}%`, top: `${draft.top}%`, width: `${draft.width}%`, height: `${draft.height}%` }} />}
  </div>;
}
