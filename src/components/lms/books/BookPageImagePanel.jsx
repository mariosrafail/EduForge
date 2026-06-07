import { motion } from "framer-motion";
import { useState } from "react";

export function BookPageHotspots({ actions = [], onAction }) {
  if (!actions.length) return null;
  return (
    <div className="reading-spread-hotspots" aria-label="Book page shortcuts">
      {actions.map((action, index) => (
        <motion.button
          key={action.id || action.target || action.label}
          type="button"
          className="reading-spread-hotspot"
          style={{ top: action.top, left: action.left, width: action.width, height: action.height }}
          aria-label={action.ariaLabel || action.label}
          onClick={() => onAction?.(action)}
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.28 + index * 0.06, duration: 0.22, ease: "easeOut" }}
          whileHover={{ scale: 1.012 }}
          whileTap={{ scale: 0.985 }}
          data-sound-click="submit"
        >
          <span>{action.label}</span>
        </motion.button>
      ))}
    </div>
  );
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function getPointerPercent(event, element) {
  const rect = element.getBoundingClientRect();
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
    y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
    rect,
  };
}

export function EditableHotspotLayer({
  pageId = "",
  areas = [],
  editing = false,
  selectedAreaId = null,
  onSelectArea,
  onChangeAreas,
  onActivateArea,
}) {
  const [dragState, setDragState] = useState(null);
  const [draftArea, setDraftArea] = useState(null);

  const updateArea = (areaId, updater) => {
    onChangeAreas?.(areas.map((area) => (area.id === areaId ? updater(area) : area)));
  };

  const startDrawing = (event) => {
    if (!editing || event.target !== event.currentTarget) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getPointerPercent(event, event.currentTarget);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragState({ type: "draw", pointerId: event.pointerId, startX: point.x, startY: point.y, rect: point.rect });
    setDraftArea({ left: point.x, top: point.y, width: 0, height: 0 });
    onSelectArea?.(null);
  };

  const startMove = (event, area) => {
    if (!editing) return;
    event.preventDefault();
    event.stopPropagation();
    const layer = event.currentTarget.closest(".editable-hotspot-layer");
    const point = getPointerPercent(event, layer);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragState({ type: "move", pointerId: event.pointerId, areaId: area.id, startX: point.x, startY: point.y, area });
    onSelectArea?.(area.id);
  };

  const startResize = (event, area) => {
    if (!editing) return;
    event.preventDefault();
    event.stopPropagation();
    const layer = event.currentTarget.closest(".editable-hotspot-layer");
    const point = getPointerPercent(event, layer);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragState({ type: "resize", pointerId: event.pointerId, areaId: area.id, startX: point.x, startY: point.y, area });
    onSelectArea?.(area.id);
  };

  const handlePointerMove = (event) => {
    if (!editing || !dragState) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getPointerPercent(event, event.currentTarget);

    if (dragState.type === "draw") {
      const left = Math.min(dragState.startX, point.x);
      const top = Math.min(dragState.startY, point.y);
      setDraftArea({
        left,
        top,
        width: Math.abs(point.x - dragState.startX),
        height: Math.abs(point.y - dragState.startY),
      });
      return;
    }

    if (dragState.type === "move") {
      const dx = point.x - dragState.startX;
      const dy = point.y - dragState.startY;
      updateArea(dragState.areaId, (area) => ({
        ...area,
        left: clamp(dragState.area.left + dx, 0, 100 - area.width),
        top: clamp(dragState.area.top + dy, 0, 100 - area.height),
      }));
      return;
    }

    if (dragState.type === "resize") {
      const dx = point.x - dragState.startX;
      const dy = point.y - dragState.startY;
      updateArea(dragState.areaId, (area) => ({
        ...area,
        width: clamp(dragState.area.width + dx, 3, 100 - area.left),
        height: clamp(dragState.area.height + dy, 3, 100 - area.top),
      }));
    }
  };

  const finishDrag = (event) => {
    if (!editing || !dragState) return;
    event.preventDefault();
    event.stopPropagation();

    if (dragState.type === "draw" && draftArea) {
      const minWidth = (20 / Math.max(dragState.rect.width, 1)) * 100;
      const minHeight = (20 / Math.max(dragState.rect.height, 1)) * 100;
      if (draftArea.width >= minWidth && draftArea.height >= minHeight) {
        const nextArea = {
          id: `area-${Date.now()}`,
          pageId,
          left: draftArea.left,
          top: draftArea.top,
          width: draftArea.width,
          height: draftArea.height,
          label: "Clickable area",
          actionType: "none",
          actionTargetId: null,
          actionPayload: {},
        };
        onChangeAreas?.([...areas, nextArea]);
        onSelectArea?.(nextArea.id);
      }
    }

    setDraftArea(null);
    setDragState(null);
  };

  if (!editing && !areas.length) return null;

  return (
    <div
      className={`editable-hotspot-layer ${editing ? "editing" : ""}`}
      onPointerDown={startDrawing}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      aria-label="Editable clickable areas"
    >
      {areas.map((area, index) => {
        const selected = selectedAreaId === area.id;
        const style = {
          left: `${area.left}%`,
          top: `${area.top}%`,
          width: `${area.width}%`,
          height: `${area.height}%`,
        };

        return (
          <button
            key={area.id}
            type="button"
            className={`editable-hotspot-box ${selected ? "selected" : ""}`}
            style={style}
            aria-label={area.label || `Clickable area ${index + 1}`}
            onPointerDown={(event) => startMove(event, area)}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (editing) {
                onSelectArea?.(area.id);
                return;
              }
              onActivateArea?.(area);
            }}
            data-sound-click={editing ? "tab" : "submit"}
          >
            <span>{area.label || `Area ${index + 1}`}</span>
            {editing && (
              <span
                className="editable-hotspot-resize-handle"
                role="presentation"
                onPointerDown={(event) => startResize(event, area)}
              />
            )}
          </button>
        );
      })}
      {editing && draftArea && (
        <span
          className="editable-hotspot-box draft"
          style={{
            left: `${draftArea.left}%`,
            top: `${draftArea.top}%`,
            width: `${draftArea.width}%`,
            height: `${draftArea.height}%`,
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
