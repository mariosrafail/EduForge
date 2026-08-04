import {
  Eye,
  EyeOff,
  Eraser,
  Keyboard,
  Pencil,
  Printer,
  Redo2,
  ScanSearch,
  Timer,
  Trash2,
  Trophy,
  Type,
  Undo2,
  X,
  ZoomOut,
} from "lucide-react";
import { useEffect, useState } from "react";

import { CLASSROOM_COLORS, CLASSROOM_STROKES, DRAWING_TOOLS, useClassroomTools } from "./ClassroomToolsContext.jsx";
import { legacyClassroomAssets } from "./legacyClassroomAssets.js";

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  return `${minutes}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function ToolButton({ active = false, label, shortLabel = label, onClick, disabled = false, legacyIcon, children, className = "" }) {
  const icon = legacyIcon ? legacyClassroomAssets.icons.teacherTools[legacyIcon] : null;
  return (
    <button type="button" className={`${active ? "selected" : ""} ${className}`.trim()} aria-label={label} aria-pressed={active} title={label} disabled={disabled} onClick={onClick}>
      {icon ? <img className="legacy-teacher-tool-icon" src={active ? icon.active : icon.normal} alt="" draggable="false" /> : children}<span>{shortLabel}</span>
    </button>
  );
}

export default function ClassroomToolbar({ surfaceKey }) {
  const {
    activeTool,
    setActiveTool,
    color,
    setColor,
    strokeWidth,
    setStrokeWidth,
    getDrawingHistory,
    clearDrawing,
    undoDrawing,
    redoDrawing,
    getOverlays,
    clearCovers,
    setSpotlight,
    clearAllMarkup,
    getRegionZoom,
    resetRegionZoom,
    openPanel,
    setOpenPanel,
    requestKeyboard,
    message,
    setMessage,
    timer,
    setTimer,
    setTimerMinutes,
    scores,
    setScores,
  } = useClassroomTools();
  const [manualMinutes, setManualMinutes] = useState(5);
  const history = getDrawingHistory(surfaceKey);
  const overlays = getOverlays(surfaceKey);
  const regionZoom = getRegionZoom(surfaceKey);
  const drawingMode = DRAWING_TOOLS.has(activeTool);
  const presentationMode = ["cover", "spotlight", "zoom-region"].includes(activeTool);

  useEffect(() => {
    setActiveTool("pointer");
    setOpenPanel("");
    resetRegionZoom(surfaceKey);
  }, [surfaceKey]);

  const focusStage = () => setTimeout(() => {
    document.querySelector(`[data-classroom-surface-id="${CSS.escape(surfaceKey)}"]`)?.focus({ preventScroll: true });
  }, 0);
  const exitMode = () => {
    setActiveTool("pointer");
    setOpenPanel("");
    focusStage();
  };
  const enterMode = (tool) => {
    resetRegionZoom(surfaceKey);
    setActiveTool(tool);
    setOpenPanel("");
  };
  const clearDrawings = () => {
    if (history.present.length && globalThis.confirm("Clear drawings and text for this view?")) clearDrawing(surfaceKey);
  };
  const runClearAction = (kind) => {
    const labels = {
      drawing: "Clear drawings and text for this view?",
      covers: "Clear all covers for this view?",
      spotlight: "Clear the spotlight for this view?",
      all: "Clear all classroom markup for this view?",
    };
    if (!globalThis.confirm(labels[kind])) return;
    if (kind === "drawing") clearDrawing(surfaceKey);
    if (kind === "covers") clearCovers(surfaceKey);
    if (kind === "spotlight") setSpotlight(surfaceKey, null);
    if (kind === "all") clearAllMarkup(surfaceKey);
    setOpenPanel("");
  };
  const printCurrentView = () => {
    const target = [...document.querySelectorAll("[data-classroom-surface-id]")]
      .find((element) => element.dataset.classroomSurfaceId === surfaceKey);
    if (!target || typeof globalThis.print !== "function") {
      setMessage("Printing is not available on this device.");
      return;
    }
    target.classList.add("classroom-stage-print-target");
    const cleanup = () => target.classList.remove("classroom-stage-print-target");
    globalThis.addEventListener("afterprint", cleanup, { once: true });
    try {
      globalThis.print();
    } catch {
      cleanup();
      setMessage("Printing is not available on this device.");
    }
    setTimeout(cleanup, 5000);
  };
  const resetScores = () => {
    if (globalThis.confirm("Reset both team scores?")) setScores({ a: 0, b: 0 });
  };
  const closePanel = () => { setOpenPanel(""); focusStage(); };

  const modeTitle = drawingMode ? "PEN MODE"
    : activeTool === "cover" ? "COVER MODE"
      : activeTool === "spotlight" ? "SPOTLIGHT MODE"
        : activeTool === "zoom-region" ? "ZOOM MODE" : "";

  return (
    <>
      {modeTitle && (
        <div className="classroom-mode-banner" role="status">
          <div><strong>{modeTitle}</strong>{drawingMode && <span>{activeTool === "pen" ? "Pen" : activeTool === "eraser" ? "Eraser" : "Text"}</span>}</div>
          <button type="button" aria-label={`Exit ${modeTitle.toLowerCase()}`} title={`Exit ${modeTitle.toLowerCase()}`} onClick={exitMode}><X /></button>
        </div>
      )}

      <div className={`legacy-classroom-viewer-toolbar classroom-teaching-toolbar ${drawingMode ? "drawing-mode" : presentationMode ? "presentation-mode" : regionZoom ? "zoom-active" : "normal-mode"}`} role="toolbar" aria-label="Classroom teaching tools">
        {drawingMode ? (
          <div className="classroom-tool-primary classroom-drawing-tools">
            <ToolButton legacyIcon="pencil" active={activeTool === "pen"} label="Pen tool" shortLabel="Pen" onClick={() => setActiveTool("pen")}><Pencil /></ToolButton>
            <ToolButton legacyIcon="eraser" active={activeTool === "eraser"} label="Eraser tool" shortLabel="Eraser" onClick={() => setActiveTool("eraser")}><Eraser /></ToolButton>
            <ToolButton legacyIcon="text" active={activeTool === "text"} label="Text tool" shortLabel="Text" onClick={() => setActiveTool("text")}><Type /></ToolButton>
            <div className="classroom-tool-options" aria-label="Drawing colour and size">
              <span>Colour</span>
              {CLASSROOM_COLORS.map((option) => <button key={option} type="button" className={`classroom-colour-choice ${color === option ? "selected" : ""}`} style={{ "--tool-color": option }} aria-label={`Use ${option} colour`} aria-pressed={color === option} onClick={() => setColor(option)} />)}
              <span>Size</span>
              {CLASSROOM_STROKES.map((option) => <button key={option} type="button" className={`classroom-size-choice ${strokeWidth === option ? "selected" : ""}`} aria-label={`Use ${option} pixel stroke`} aria-pressed={strokeWidth === option} onClick={() => setStrokeWidth(option)}><i style={{ width: option * 2, height: option * 2 }} /></button>)}
            </div>
            <ToolButton legacyIcon="undo" label="Undo drawing" shortLabel="Undo" disabled={!history.past.length} onClick={() => undoDrawing(surfaceKey)}><Undo2 /></ToolButton>
            <ToolButton legacyIcon="redo" label="Redo drawing" shortLabel="Redo" disabled={!history.future.length} onClick={() => redoDrawing(surfaceKey)}><Redo2 /></ToolButton>
            <ToolButton legacyIcon="clear" label="Clear drawings and text" shortLabel="Clear" disabled={!history.present.length} onClick={clearDrawings}><Trash2 /></ToolButton>
            {activeTool === "text" && <ToolButton legacyIcon="keyboard" label="Show on-screen keyboard" shortLabel="Keyboard" onClick={requestKeyboard}><Keyboard /></ToolButton>}
          </div>
        ) : presentationMode ? (
          <div className="classroom-mode-instruction">
            <strong>{activeTool === "cover" ? "Drag to place a cover" : activeTool === "spotlight" ? "Drag to reveal a region" : "Drag the region to zoom"}</strong>
            <button type="button" aria-label={`Exit ${modeTitle.toLowerCase()}`} onClick={exitMode}><X /><span>Exit</span></button>
          </div>
        ) : regionZoom ? (
          <div className="classroom-zoom-active-tools"><ToolButton legacyIcon="zoom" active label="Zoom out" shortLabel="Zoom out" onClick={() => { resetRegionZoom(surfaceKey); focusStage(); }}><ZoomOut /></ToolButton></div>
        ) : (
          <div className="classroom-tool-primary classroom-normal-tools">
            <ToolButton legacyIcon="pencil" label="Pen tool" shortLabel="Pen" onClick={() => enterMode("pen")}><Pencil /></ToolButton>
            <ToolButton legacyIcon="zoom" label="Zoom region" shortLabel="Zoom" onClick={() => enterMode("zoom-region")}><ScanSearch /></ToolButton>
            <ToolButton legacyIcon="hide" label="Cover area tool" shortLabel="Cover" onClick={() => enterMode("cover")}><EyeOff /></ToolButton>
            <ToolButton legacyIcon="show" label="Spotlight reveal tool" shortLabel="Spotlight" onClick={() => enterMode("spotlight")}><Eye /></ToolButton>
            <ToolButton legacyIcon="timer" active={openPanel === "timer"} label="Open timer" shortLabel="Timer" onClick={() => setOpenPanel((current) => current === "timer" ? "" : "timer")}><Timer /></ToolButton>
            <ToolButton legacyIcon="score" active={openPanel === "scoreboard"} label="Open scoreboard" shortLabel="Score" onClick={() => setOpenPanel((current) => current === "scoreboard" ? "" : "scoreboard")}><Trophy /></ToolButton>
            <ToolButton legacyIcon="print" label="Print current view" shortLabel="Print" onClick={printCurrentView}><Printer /></ToolButton>
            <ToolButton legacyIcon="clear" active={openPanel === "clear"} label="Clear classroom markup" shortLabel="Trash" onClick={() => setOpenPanel((current) => current === "clear" ? "" : "clear")}><Trash2 /></ToolButton>
          </div>
        )}
      </div>

      {openPanel === "timer" && (
        <aside className="classroom-floating-panel classroom-timer-panel" aria-label="Classroom timer">
          <header><Timer /><strong>Classroom timer</strong><button type="button" aria-label="Close timer" onClick={closePanel}>×</button></header>
          <output aria-live="polite">{formatTime(timer.remaining)}</output>
          <div className="classroom-timer-presets">{[1, 2, 5, 10].map((minutes) => <button key={minutes} type="button" onClick={() => setTimerMinutes(minutes)}>{minutes} min</button>)}</div>
          <label>Minutes <input type="number" inputMode="numeric" min="1" max="99" value={manualMinutes} onChange={(event) => setManualMinutes(event.target.value)} /></label>
          <div>
            <button type="button" onClick={() => setTimer((current) => ({ ...current, running: !current.running && current.remaining > 0 }))}>{timer.running ? "Pause" : "Start"}</button>
            <button type="button" onClick={() => setTimerMinutes(manualMinutes)}>Set</button>
            <button type="button" onClick={() => setTimer((current) => ({ ...current, remaining: current.duration, running: false }))}>Reset</button>
          </div>
        </aside>
      )}

      {openPanel === "scoreboard" && (
        <aside className="classroom-floating-panel classroom-scoreboard" aria-label="Two-team scoreboard">
          <header><Trophy /><strong>Scoreboard</strong><button type="button" aria-label="Close scoreboard" onClick={closePanel}>×</button></header>
          {[["a", "Team A"], ["b", "Team B"]].map(([key, label]) => (
            <section key={key}><strong>{label}</strong><output aria-label={`${label} score`}>{scores[key]}</output><div>
              <button type="button" aria-label={`Subtract point from ${label}`} onClick={() => setScores((current) => ({ ...current, [key]: Math.max(0, current[key] - 1) }))}>−1</button>
              <button type="button" aria-label={`Add point to ${label}`} onClick={() => setScores((current) => ({ ...current, [key]: current[key] + 1 }))}>+1</button>
            </div></section>
          ))}
          <button type="button" className="classroom-score-reset" onClick={resetScores}>Reset scoreboard</button>
        </aside>
      )}

      {openPanel === "clear" && (
        <aside className="classroom-floating-panel classroom-clear-panel" aria-label="Clear current view">
          <header><Trash2 /><strong>Clear current view</strong><button type="button" aria-label="Close clear menu" onClick={closePanel}>×</button></header>
          <button type="button" disabled={!history.present.length} onClick={() => runClearAction("drawing")}>Drawings &amp; text</button>
          <button type="button" disabled={!overlays.covers.length} onClick={() => runClearAction("covers")}>Covers</button>
          <button type="button" disabled={!overlays.spotlight} onClick={() => runClearAction("spotlight")}>Spotlight</button>
          <button type="button" disabled={!history.present.length && !overlays.covers.length && !overlays.spotlight} onClick={() => runClearAction("all")}>All classroom markup</button>
        </aside>
      )}
      {message && <div className="classroom-tool-message" role="status">{message}</div>}
    </>
  );
}
