import {
  ArrowLeftRight,
  Grid2X2,
  Maximize2,
  MonitorPlay,
  Move,
  PlayCircle,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { TEACHER_VIEWPORT_PROFILES } from "./viewportProfiles.js";
import { LegacyClassroomIcon, legacyClassroomAssets } from "./legacyClassroomAssets.js";

const fitStorageKey = "teacher-offline:ultimate-b2:page-fit";
const minimumZoom = 1;
const maximumZoom = 4;
const unitNames = { 1: "Lights, Camera, Action!", 2: "Journeys of Discovery" };

function enabledActivities(page) {
  return (page?.activities || []).filter((activity) => activity.availability === "enabled");
}

function activityIdForAction(page, action) {
  const activities = enabledActivities(page);
  const direct = activities.find((activity) => (
    activity.id === action.activityKey || activity.activityKey === action.activityKey
  ));
  if (direct) return direct.id || direct.activityKey;
  const ordinal = action.target === "text-audio"
    ? 2
    : Number(String(action.target || "").match(/^exercise-(\d+)$/)?.[1]);
  if (ordinal) {
    return activities.find((activity) => String(activity.id).endsWith(`-o${ordinal}`))?.id || null;
  }
  return null;
}

function isPositionedAction(action) {
  return [action.top, action.left, action.width, action.height].every(Boolean);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function initialFit(profile) {
  let stored = null;
  try {
    stored = globalThis.sessionStorage?.getItem(fitStorageKey);
  } catch {
    // Storage can be unavailable in locked-down WebViews; use the profile default.
  }
  if (["fit-page", "fit-width"].includes(stored)) return stored;
  return profile === TEACHER_VIEWPORT_PROFILES.COMPACT ? "fit-width" : "fit-page";
}

function TeacherOfflineUnitOverview({ unit, pages, onSelectPage }) {
  return (
    <section className="teacher-offline-unit-overview" aria-label={`${unit.title} page overview`}>
      <header>
        <div>
          <span>Ultimate English B2 · Students Book</span>
          <h2>Unit {unit.number}</h2>
          <strong>{unitNames[Number(unit.number)]}</strong>
        </div>
        <p>Select a section to open the printed page and its classroom activities.</p>
      </header>
      <div className="teacher-unit-overview-grid">
        {pages.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            className="teacher-unit-page-card"
            onClick={() => onSelectPage(candidate.id)}
            aria-label={`Open ${candidate.title}, ${candidate.label || `page ${candidate.pageNumber}`}`}
          >
            <span className="teacher-unit-page-thumb">
              <img src={candidate.images?.[0]} alt="" loading="eager" decoding="async" draggable="false" />
              <b>{candidate.label || `Page ${candidate.pageNumber}`}</b>
            </span>
            <span className="teacher-unit-page-copy">
              <strong>{candidate.title}</strong>
              <small>{candidate.activities?.filter((activity) => activity.availability === "enabled").length || 0} activities</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export default function TeacherOfflinePages({
  unit,
  selectedPageId,
  onSelectPage,
  onOpenActivity,
  onOpenMedia,
  viewportProfile,
}) {
  const pages = unit?.pages || [];
  const selectedIndex = pages.findIndex((page) => page.id === selectedPageId);
  const page = selectedIndex >= 0 ? pages[selectedIndex] : null;
  const stageRef = useRef(null);
  const pointerState = useRef(new Map());
  const gestureState = useRef(null);
  const gestureFrame = useRef(0);
  const didPan = useRef(false);
  const [assetError, setAssetError] = useState("");
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [fitMode, setFitMode] = useState(() => initialFit(viewportProfile));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [actionsOpen, setActionsOpen] = useState(false);

  useEffect(() => {
    setAssetError("");
    setNaturalSize({ width: 0, height: 0 });
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setActionsOpen(false);
  }, [page?.id, selectedPageId]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const update = () => {
      const next = { width: stage.clientWidth, height: stage.clientHeight };
      setStageSize((current) => current.width === next.width && current.height === next.height ? current : next);
    };
    if (typeof ResizeObserver === "undefined") {
      globalThis.addEventListener("resize", update);
      update();
      return () => globalThis.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    update();
    return () => observer.disconnect();
  }, [page?.id]);

  useEffect(() => () => cancelAnimationFrame(gestureFrame.current), []);

  const actions = useMemo(() => (page?.actions || []).filter((action) => {
    if (action.availability !== "enabled") return false;
    if (action.logicalKey) return true;
    return Boolean(activityIdForAction(page, action));
  }), [page]);

  const image = page?.images?.[0] || null;
  const openAction = (action) => {
    const activityId = activityIdForAction(page, action);
    if (activityId) {
      onOpenActivity(activityId);
      return;
    }
    if (action.logicalKey) {
      onOpenMedia({
        logicalKey: action.logicalKey,
        type: action.mediaType || action.classification,
        label: action.label,
      });
    }
  };

  const availableWidth = Math.max(0, stageSize.width - 16);
  const availableHeight = Math.max(0, stageSize.height - 16);
  const pageScale = naturalSize.width && naturalSize.height
    ? fitMode === "fit-width"
      ? availableWidth / naturalSize.width
      : Math.min(availableWidth / naturalSize.width, availableHeight / naturalSize.height)
    : 0;
  const renderedWidth = Math.round(naturalSize.width * pageScale * zoom);
  const renderedHeight = Math.round(naturalSize.height * pageScale * zoom);
  const maxPan = {
    x: Math.max(0, (renderedWidth - availableWidth) / 2),
    y: Math.max(0, (renderedHeight - availableHeight) / 2),
  };
  const boundedPan = {
    x: clamp(pan.x, -maxPan.x, maxPan.x),
    y: clamp(pan.y, -maxPan.y, maxPan.y),
  };
  const canPan = maxPan.x > 0 || maxPan.y > 0;

  useEffect(() => {
    if (!page || !naturalSize.width || !stageSize.width) return;
    globalThis.dispatchEvent(new CustomEvent("teacher:page-metrics", {
      detail: {
        pageId: page.id,
        fitMode,
        zoomPercent: Math.round(zoom * 100),
        stageWidth: stageSize.width,
        stageHeight: stageSize.height,
        renderedWidth,
        renderedHeight,
      },
    }));
  }, [fitMode, naturalSize, page?.id, renderedHeight, renderedWidth, stageSize, zoom]);

  const selectFitMode = (nextMode) => {
    setFitMode(nextMode);
    try {
      globalThis.sessionStorage?.setItem(fitStorageKey, nextMode);
    } catch {
      // Fit still works when WebView storage is unavailable.
    }
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  const changeZoom = (nextZoom) => {
    setZoom(clamp(nextZoom, minimumZoom, maximumZoom));
    if (nextZoom <= minimumZoom && fitMode === "fit-page") setPan({ x: 0, y: 0 });
  };
  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  const updatePan = (next) => setPan({
    x: clamp(next.x, -maxPan.x, maxPan.x),
    y: clamp(next.y, -maxPan.y, maxPan.y),
  });

  const onPointerDown = (event) => {
    didPan.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointerState.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointerState.current.values()];
    if (points.length === 1) {
      gestureState.current = { type: "pan", start: points[0], pan: boundedPan };
    } else if (points.length === 2) {
      gestureState.current = {
        type: "pinch",
        distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
        zoom,
      };
    }
  };
  const onPointerMove = (event) => {
    if (!pointerState.current.has(event.pointerId)) return;
    pointerState.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const latestPoints = [...pointerState.current.values()];
    if (latestPoints.length > 1 || (
      latestPoints.length === 1
      && gestureState.current?.start
      && Math.hypot(
        latestPoints[0].x - gestureState.current.start.x,
        latestPoints[0].y - gestureState.current.start.y,
      ) > 6
    )) {
      didPan.current = true;
    }
    if (gestureFrame.current) return;
    gestureFrame.current = requestAnimationFrame(() => {
      gestureFrame.current = 0;
      const points = [...pointerState.current.values()];
      if (points.length === 2 && gestureState.current?.type === "pinch") {
        const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        changeZoom(gestureState.current.zoom * distance / Math.max(1, gestureState.current.distance));
      } else if (points.length === 1 && gestureState.current?.type === "pan" && canPan) {
        updatePan({
          x: gestureState.current.pan.x + points[0].x - gestureState.current.start.x,
          y: gestureState.current.pan.y + points[0].y - gestureState.current.start.y,
        });
      }
    });
  };
  const onPointerEnd = (event) => {
    pointerState.current.delete(event.pointerId);
    gestureState.current = null;
  };
  const onWheel = (event) => {
    if (!event.ctrlKey && Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
    event.preventDefault();
    changeZoom(zoom + (event.deltaY < 0 ? 0.2 : -0.2));
  };

  if (!pages.length) return <section className="teacher-offline-empty">No local pages are installed for this unit.</section>;
  if (!page) return <TeacherOfflineUnitOverview unit={unit} pages={pages} onSelectPage={onSelectPage} />;

  return (
    <section className="teacher-offline-pages">
      <div className="teacher-offline-page-reader">
        <header>
          <div className="teacher-page-toolbar-group">
            <button type="button" className="teacher-unit-overview-trigger" onClick={() => onSelectPage("")} title="Unit overview">
              <Grid2X2 size={20} /><span>Unit overview</span>
            </button>
            <button type="button" disabled={selectedIndex === 0} onClick={() => onSelectPage(pages[selectedIndex - 1].id)} title="Previous page">
              <LegacyClassroomIcon name="previous" /><span className="teacher-responsive-label">Previous</span>
            </button>
          </div>
          <div className="teacher-offline-page-title">
            <span>Unit {unit.number} · {unitNames[Number(unit.number)]}</span>
            <strong>{page.title} · {page.label || `Page ${page.pageNumber}`}</strong>
          </div>
          <div className="teacher-page-fit-controls" aria-label="Page fit and zoom controls">
            <button type="button" className={fitMode === "fit-page" ? "selected" : ""} aria-pressed={fitMode === "fit-page"} onClick={() => selectFitMode("fit-page")} title="Fit page">
              <Maximize2 size={19} /><span>Fit page</span>
            </button>
            <button type="button" className={fitMode === "fit-width" ? "selected" : ""} aria-pressed={fitMode === "fit-width"} onClick={() => selectFitMode("fit-width")} title="Fit width">
              <ArrowLeftRight size={19} /><span>Fit width</span>
            </button>
            <button type="button" disabled={zoom <= minimumZoom} onClick={() => changeZoom(zoom - 0.25)} aria-label="Zoom out" title="Zoom out"><ZoomOut size={19} /></button>
            <button type="button" disabled={zoom >= maximumZoom} onClick={() => changeZoom(zoom + 0.25)} aria-label="Zoom in" title="Zoom in"><ZoomIn size={19} /></button>
            <button type="button" disabled={zoom === 1 && !pan.x && !pan.y} onClick={resetView} aria-label="Reset zoom" title="Reset zoom"><RotateCcw size={19} /></button>
          </div>
          <div className="teacher-page-toolbar-group teacher-page-next-group">
            {actions.length > 0 && (
              <button type="button" className="teacher-page-actions-trigger" aria-expanded={actionsOpen} onClick={() => setActionsOpen((open) => !open)} title="Page activities">
                <MonitorPlay size={20} /><span>Activities</span>
              </button>
            )}
            <button type="button" disabled={selectedIndex === pages.length - 1} onClick={() => onSelectPage(pages[selectedIndex + 1].id)} title="Next page">
              <span className="teacher-responsive-label">Next</span><LegacyClassroomIcon name="next" />
            </button>
          </div>
        </header>

        <div
          ref={stageRef}
          className={`teacher-offline-page-stage ${canPan ? "can-pan" : ""}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onWheel={onWheel}
        >
          {image && !assetError ? (
            <div
              className="teacher-offline-page-image"
              data-fit-mode={fitMode}
              data-zoom={zoom.toFixed(2)}
              style={{
                width: `${renderedWidth}px`,
                height: `${renderedHeight}px`,
                transform: `translate3d(${boundedPan.x}px, ${boundedPan.y}px, 0)`,
              }}
            >
              <img
                key={page.id}
                src={image}
                alt={`${unit.title}, ${page.title}, ${page.label}`}
                draggable="false"
                loading="eager"
                decoding="async"
                onLoad={(event) => setNaturalSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })}
                onError={() => setAssetError("This required page asset is unavailable.")}
              />
              {actions.filter(isPositionedAction).map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className="teacher-offline-page-hotspot"
                  style={{ top: action.top, left: action.left, width: action.width, height: action.height, "--legacy-hotspot": `url(${legacyClassroomAssets.controls.activityHotspot})` }}
                  onClick={(event) => {
                    if (didPan.current) {
                      event.preventDefault();
                      event.stopPropagation();
                      return;
                    }
                    openAction(action);
                  }}
                  aria-label={action.ariaLabel || action.label}
                >
                  <span>{action.label}</span>
                </button>
              ))}
              {canPan && <span className="teacher-page-pan-indicator" aria-hidden="true"><Move size={18} /></span>}
            </div>
          ) : (
            <div className="teacher-offline-asset-error" role="alert">{assetError || "This required page asset is unavailable."}</div>
          )}
        </div>

        {actions.length > 0 && (
          <nav className={`teacher-offline-page-actions ${actionsOpen ? "open" : ""}`} aria-label="Page activities and media">
            {actions.map((action) => (
              <button key={action.id} type="button" onClick={() => openAction(action)}>
                {action.classification === "activity" ? <MonitorPlay size={19} /> : <PlayCircle size={19} />}
                {action.label}
              </button>
            ))}
          </nav>
        )}
      </div>
    </section>
  );
}
