import { motion } from "framer-motion";
import { useState } from "react";
import { publishedHotspotActions, usePublishedComponentRelease } from "virtual:component-publication";

import {
  percentGeometryToStage,
  STAGE_RESIZE_HANDLES,
  stageGeometryToPercent,
  transformStageGeometry,
} from "../../builder-studio/stageGeometry.js";

export function BookPageHotspots({ actions = [], onAction, className = "", highlightedActivityKey = null }) {
  if (!actions.length) return null;
  return (
    <div className={`reading-spread-hotspots ${className}`.trim()} aria-label="Book page shortcuts">
      {actions.map((action, index) => (
        <motion.button
          key={action.id || action.target || action.label}
          type="button"
          className={`reading-spread-hotspot ${highlightedActivityKey && action.activityKey === highlightedActivityKey ? "assigned" : ""}`.trim()}
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

export function BookPageImageLayer({
  componentTitle,
  componentSlug,
  currentCustomHotspots,
  enableHotspotEditor,
  fitToScreen,
  hotspotEditingActive,
  onActivateArea,
  onAction,
  onChangeAreas,
  onRetry,
  onSelectArea,
  packageSlug,
  pageAssetError,
  pageAssetLoading,
  pageHotspotKey,
  selectedHotspotId,
  selectedImages,
  selectedSection,
  spreadClass,
  zoom,
  highlightedActivityKey = null,
}) {
  const publication = usePublishedComponentRelease();
  const usesPublishedHotspots = packageSlug === "ultimate-b2" && componentSlug === "students-book";
  const authoredHotspotActions = usesPublishedHotspots
    ? publishedHotspotActions(publication, {
      pageId: selectedSection.pageId,
      pageNumber: selectedSection.pageNumber,
      unitNumber: selectedSection.unitNumber,
    })
    : [];

  if (usesPublishedHotspots && publication.kind === "loading") {
    return <div className={`book-page-image-layer ${spreadClass}`}><div className="book-page-missing" role="status">Loading published content…</div></div>;
  }
  if (usesPublishedHotspots && publication.kind === "error") {
    return <div className={`book-page-image-layer ${spreadClass}`}><div className="book-page-missing" role="alert">{publication.message}</div></div>;
  }

  return (
    <div
      className={`book-page-image-layer ${spreadClass}`}
      style={{ transform: fitToScreen ? undefined : `scale(${zoom})`, transformOrigin: "center top" }}
    >
      {selectedImages.length ? selectedImages.map((image, index) => (
        <motion.img
          key={`${selectedSection.id}-${index}`}
          className="book-page-spread-image"
          src={image}
          alt={`${componentTitle} ${selectedSection.title} ${selectedSection.pages}${selectedImages.length > 1 ? ` page ${index + 1}` : ""}`}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.06, duration: 0.32, ease: "easeOut" }}
        />
      )) : pageAssetLoading ? (
        <div className="book-page-missing" role="status">Loading protected page...</div>
      ) : pageAssetError ? (
        <div className="book-page-missing" role="alert">Page unavailable. <button type="button" className="secondary-action compact-action" onClick={onRetry}>Retry</button></div>
      ) : (
        <div className="book-page-missing">Page asset is not available for online delivery.</div>
      )}
      <BookPageHotspots actions={selectedSection.actions} onAction={onAction} highlightedActivityKey={highlightedActivityKey} />
      <BookPageHotspots actions={authoredHotspotActions} onAction={onAction} className="authored-book-page-hotspots" highlightedActivityKey={highlightedActivityKey} />
      {enableHotspotEditor && (
        <EditableHotspotLayer
          pageId={pageHotspotKey}
          areas={currentCustomHotspots}
          editing={hotspotEditingActive}
          selectedAreaId={selectedHotspotId}
          onSelectArea={onSelectArea}
          onChangeAreas={onChangeAreas}
          onActivateArea={onActivateArea}
        />
      )}
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
  creating = editing,
  selectedAreaId = null,
  onSelectArea,
  onChangeAreas,
  onActivateArea,
  createArea,
}) {
  const [dragState, setDragState] = useState(null);
  const [draftArea, setDraftArea] = useState(null);

  const updateArea = (areaId, updater) => {
    onChangeAreas?.(areas.map((area) => (area.id === areaId ? updater(area) : area)));
  };

  const startDrawing = (event) => {
    if (!editing || !creating || event.target !== event.currentTarget) return;
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

  const startResize = (event, area, handle) => {
    if (!editing) return;
    event.preventDefault();
    event.stopPropagation();
    const layer = event.currentTarget.closest(".editable-hotspot-layer");
    const point = getPointerPercent(event, layer);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragState({ type: "resize", handle, pointerId: event.pointerId, areaId: area.id, startX: point.x, startY: point.y, area });
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
      const nextGeometry = transformStageGeometry({
        geometry: percentGeometryToStage(dragState.area),
        operation: "resize",
        handle: dragState.handle,
        startPoint: { x: dragState.startX, y: dragState.startY },
        currentPoint: point,
        stage: { width: 100, height: 100 },
        minWidth: 3,
        minHeight: 3,
      });
      updateArea(dragState.areaId, (area) => ({
        ...area,
        ...stageGeometryToPercent(nextGeometry),
      }));
    }
  };

  const finishDrag = (event, cancelled = false) => {
    if (!editing || !dragState) return;
    event.preventDefault();
    event.stopPropagation();

    if (!cancelled && dragState.type === "draw" && draftArea) {
      const minWidth = (20 / Math.max(dragState.rect.width, 1)) * 100;
      const minHeight = (20 / Math.max(dragState.rect.height, 1)) * 100;
      if (draftArea.width >= minWidth && draftArea.height >= minHeight) {
        const geometry = {
          left: draftArea.left,
          top: draftArea.top,
          width: draftArea.width,
          height: draftArea.height,
        };
        const nextArea = createArea?.(geometry) || {
          id: `area-${Date.now()}`,
          pageId,
          ...geometry,
          label: "Clickable area",
          actionType: "none",
          actionTargetId: null,
          actionPayload: {},
        };
        onChangeAreas?.([...areas, nextArea]);
        onSelectArea?.(nextArea.id);
      }
    }

    if (cancelled && ["move", "resize"].includes(dragState.type)) {
      updateArea(dragState.areaId, (area) => ({ ...area, ...dragState.area }));
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
      onPointerCancel={(event) => finishDrag(event, true)}
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
            onKeyDown={(event) => {
              if (!editing || !selected) return;
              const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
              const direction = directions[event.key];
              if (!direction) return;
              event.preventDefault();
              const step = event.shiftKey ? 1 : .1;
              updateArea(area.id, (current) => ({
                ...current,
                left: clamp(current.left + direction[0] * step, 0, 100 - current.width),
                top: clamp(current.top + direction[1] * step, 0, 100 - current.height),
              }));
            }}
          >
            <span>{area.label || `Area ${index + 1}`}</span>
            {editing && selected && STAGE_RESIZE_HANDLES.map((handle) => <span
              key={handle}
              className="editable-hotspot-resize-handle"
              data-handle={handle}
              role="presentation"
              aria-hidden="true"
              onPointerDown={(event) => startResize(event, area, handle)}
            />)}
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
