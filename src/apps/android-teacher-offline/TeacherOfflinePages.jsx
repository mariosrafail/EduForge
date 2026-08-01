import {
  ArrowLeftRight,
  BookOpen,
  Expand,
  Maximize2,
  Minimize2,
  MonitorPlay,
  Move,
  PlayCircle,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { LegacyClassroomIcon, legacyClassroomAssets } from "./legacyClassroomAssets.js";
import ClassroomToolOverlay from "./ClassroomToolOverlay.jsx";
import ClassroomToolbar from "./ClassroomToolbar.jsx";
import TeacherOfflineUnitOverview from "./TeacherOfflineUnitOverview.jsx";
import { useTeacherOfflineSettings } from "./teacherOfflineSettings.js";
import { teacherStudentsBookUnitTitle } from "./teacherOfflineUnitMetadata.js";

const fitStorageKey = "teacher-offline:ultimate-b2:page-fit";
const minimumZoom = 1;
const maximumZoom = 4;

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

function initialFit() {
  let stored = null;
  try {
    stored = globalThis.sessionStorage?.getItem(fitStorageKey);
  } catch {
    // Storage can be unavailable in locked-down WebViews; use the profile default.
  }
  if (["fit-page", "fit-width"].includes(stored)) return stored;
  return "fit-page";
}

export default function TeacherOfflinePages({
  unit,
  selectedPageId,
  onSelectPage,
  onOpenActivity,
  onOpenMedia,
  onBackToLibrary,
  onOpenContents,
  onSelectUnit,
}) {
  const pages = unit?.pages || [];
  const settings = useTeacherOfflineSettings();
  const showLeftNavigation = settings.content.showNavbarLeft || (!settings.content.showNavbarLeft && !settings.content.showNavbarRight);
  const showRightNavigation = settings.content.showNavbarRight;
  const selectedIndex = pages.findIndex((page) => page.id === selectedPageId);
  const page = selectedIndex >= 0 ? pages[selectedIndex] : null;
  const classroomSurfaceKey = page ? `students-book:page:${page.id}` : "students-book:overview";
  const stageRef = useRef(null);
  const viewerRef = useRef(null);
  const pointerState = useRef(new Map());
  const gestureState = useRef(null);
  const gestureFrame = useRef(0);
  const didPan = useRef(false);
  const [assetError, setAssetError] = useState("");
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [stageSize, setStageSize] = useState({ width: 0, height: 0, paddingX: 0, paddingY: 0 });
  const [fitMode, setFitMode] = useState(initialFit);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [actionsOpen, setActionsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
      const style = getComputedStyle(stage);
      const next = {
        width: stage.clientWidth,
        height: stage.clientHeight,
        paddingX: parseFloat(style.paddingLeft) + parseFloat(style.paddingRight),
        paddingY: parseFloat(style.paddingTop) + parseFloat(style.paddingBottom),
      };
      setStageSize((current) => (
        current.width === next.width
        && current.height === next.height
        && current.paddingX === next.paddingX
        && current.paddingY === next.paddingY
      ) ? current : next);
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

  useEffect(() => {
    const update = () => setIsFullscreen(document.fullscreenElement === viewerRef.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

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

  const availableWidth = Math.max(0, stageSize.width - stageSize.paddingX);
  const availableHeight = Math.max(0, stageSize.height - stageSize.paddingY);
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
  const canPan = maxPan.x > 2 || maxPan.y > 2;

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
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await viewerRef.current?.requestFullscreen?.();
    } catch {
      // Android immersive mode remains active when browser fullscreen is unavailable.
    }
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
  if (!page) return (
    <TeacherOfflineUnitOverview
      key={`unit-overview-${unit.number}`}
      unit={unit}
      onSelectPage={onSelectPage}
      onSelectUnit={onSelectUnit}
      onBackToLibrary={onBackToLibrary}
      onOpenContents={onOpenContents}
    />
  );

  return (
    <section ref={viewerRef} className="teacher-offline-pages teacher-offline-pages-viewer">
      <header className="legacy-page-heading">
        <div aria-hidden="true" />
        {showLeftNavigation ? <div data-navbar-side="left">
          <h2>Unit {unit.number}</h2>
          <strong>{teacherStudentsBookUnitTitle(unit.number)}</strong>
        </div> : <div data-navbar-side="left" data-navbar-hidden="true" />}
        <div className="legacy-page-window-controls">
          <button type="button" disabled aria-disabled="true" title="Minimize — not available in this prototype"><Minimize2 size={20} /></button>
          <button type="button" onClick={onBackToLibrary} title="Close book" aria-label="Close book">×</button>
        </div>
      </header>

      <div className="teacher-offline-page-reader">
        <div
          ref={stageRef}
          className={`teacher-offline-page-stage ${canPan ? "can-pan" : ""}`}
          data-classroom-surface-id={classroomSurfaceKey}
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
          <ClassroomToolOverlay surfaceKey={classroomSurfaceKey} />
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

      <nav className="legacy-page-navigation" aria-label="Page navigation">
        {showRightNavigation ? <div data-navbar-side="right">
          <button type="button" className="legacy-page-round-button" onClick={onBackToLibrary} title="Library" aria-label="Library"><LegacyClassroomIcon name="home" /></button>
          <button type="button" className="legacy-page-round-button" onClick={() => onSelectPage("")} title="Unit overview" aria-label="Unit overview"><LegacyClassroomIcon name="back" /></button>
          <button type="button" className="legacy-page-round-button" disabled={selectedIndex === 0} onClick={() => onSelectPage(pages[selectedIndex - 1].id)} title="Previous page" aria-label="Previous page"><LegacyClassroomIcon name="previous" /></button>
        </div> : <div data-navbar-side="right" data-navbar-hidden="true" />}
        <span className="legacy-page-location">{page.title} · {page.label || `Page ${page.pageNumber}`}</span>
        <div>
          {actions.length > 0 && <button type="button" className="legacy-page-round-button legacy-page-activities-button" aria-expanded={actionsOpen} onClick={() => setActionsOpen((open) => !open)} title="Page activities" aria-label="Page activities"><MonitorPlay size={26} /></button>}
          <button type="button" className="legacy-page-round-button" onClick={onOpenContents} title="Contents and exercises" aria-label="Contents and exercises"><BookOpen size={25} /></button>
          <button type="button" className="legacy-page-round-button" disabled={selectedIndex === pages.length - 1} onClick={() => onSelectPage(pages[selectedIndex + 1].id)} title="Next page" aria-label="Next page"><LegacyClassroomIcon name="next" /></button>
        </div>
      </nav>

      <ClassroomToolbar
        surfaceKey={classroomSurfaceKey}
        onMagnify={() => changeZoom(Math.min(maximumZoom, zoom + 0.25))}
        viewControls={(
          <div className="legacy-viewer-tools" aria-label="Page fit and zoom controls">
            <button type="button" className={fitMode === "fit-page" ? "selected" : ""} aria-pressed={fitMode === "fit-page"} onClick={() => selectFitMode("fit-page")} title="Fit page" aria-label="Fit page"><Maximize2 /></button>
            <button type="button" className={fitMode === "fit-width" ? "selected" : ""} aria-pressed={fitMode === "fit-width"} onClick={() => selectFitMode("fit-width")} title="Fit width" aria-label="Fit width"><ArrowLeftRight /></button>
            <button type="button" disabled={zoom <= minimumZoom} onClick={() => changeZoom(zoom - 0.25)} title="Zoom out" aria-label="Zoom out"><ZoomOut /></button>
            <button type="button" disabled={zoom >= maximumZoom} onClick={() => changeZoom(zoom + 0.25)} title="Zoom in" aria-label="Zoom in"><ZoomIn /></button>
            <button type="button" disabled={zoom === 1 && !pan.x && !pan.y} onClick={resetView} title="Reset view" aria-label="Reset zoom"><RotateCcw /></button>
            <button type="button" onClick={toggleFullscreen} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"} aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>{isFullscreen ? <Minimize2 /> : <Expand />}</button>
          </div>
        )}
      />
    </section>
  );
}
