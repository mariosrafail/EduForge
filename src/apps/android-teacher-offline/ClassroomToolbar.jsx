import {
  Eye,
  EyeOff,
  Eraser,
  Keyboard,
  Pencil,
  Printer,
  Redo2,
  RotateCcw,
  ScanSearch,
  SlidersHorizontal,
  Timer,
  Trash2,
  Trophy,
  Type,
  Undo2,
} from "lucide-react";
import { useState } from "react";

import { CLASSROOM_COLORS, CLASSROOM_STROKES, useClassroomTools } from "./ClassroomToolsContext.jsx";

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  return `${minutes}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function ToolButton({ active = false, label, onClick, disabled = false, children, className = "" }) {
  return (
    <button
      type="button"
      className={`${active ? "selected" : ""} ${className}`.trim()}
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function ClassroomToolbar({ surfaceKey, viewControls = null, onMagnify }) {
  const {
    activeTool,
    setActiveTool,
    color,
    setColor,
    strokeWidth,
    setStrokeWidth,
    getHistory,
    commit,
    undo,
    redo,
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
  const history = getHistory(surfaceKey);
  const selectTool = (tool) => {
    setActiveTool((current) => current === tool ? "pointer" : tool);
    setOpenPanel("");
  };
  const clearAnnotations = () => {
    if (!history.present.length) return;
    if (globalThis.confirm("Clear all annotations, covers, and spotlight for this view?")) {
      commit(surfaceKey, []);
      setActiveTool("pointer");
    }
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
      setMessage("Print dialog requested for the current classroom view.");
    } catch {
      cleanup();
      setMessage("Printing is not available on this device.");
    }
    setTimeout(cleanup, 5000);
  };
  const resetScores = () => {
    if (globalThis.confirm("Reset both team scores?")) setScores({ a: 0, b: 0 });
  };

  return (
    <>
      <div className="legacy-classroom-viewer-toolbar classroom-teaching-toolbar" role="toolbar" aria-label="Classroom teaching tools">
        {viewControls}
        <div className="classroom-tool-primary">
          <ToolButton active={activeTool === "pen"} label="Pen tool" onClick={() => selectTool("pen")}><Pencil /></ToolButton>
          <ToolButton active={activeTool === "eraser"} label="Eraser tool" onClick={() => selectTool("eraser")}><Eraser /></ToolButton>
          <ToolButton active={activeTool === "text"} label="Text tool" onClick={() => selectTool("text")}><Type /></ToolButton>
          <ToolButton label="Undo annotation" disabled={!history.past.length} onClick={() => undo(surfaceKey)}><Undo2 /></ToolButton>
          <ToolButton label="Redo annotation" disabled={!history.future.length} onClick={() => redo(surfaceKey)}><Redo2 /></ToolButton>
          <ToolButton active={openPanel === "more"} label="More classroom tools" onClick={() => setOpenPanel((current) => current === "more" ? "" : "more")}><SlidersHorizontal /></ToolButton>
        </div>

        {["pen", "text", "cover"].includes(activeTool) && (
          <div className="classroom-tool-options" aria-label="Annotation color and size">
            <span>Colour</span>
            {CLASSROOM_COLORS.map((option) => (
              <button key={option} type="button" className={color === option ? "selected" : ""} style={{ "--tool-color": option }} aria-label={`Use ${option} colour`} onClick={() => setColor(option)} />
            ))}
            <span>Size</span>
            {CLASSROOM_STROKES.map((option) => (
              <button key={option} type="button" className={strokeWidth === option ? "selected" : ""} aria-label={`Use ${option} pixel stroke`} onClick={() => setStrokeWidth(option)}><i style={{ width: option * 2, height: option * 2 }} /></button>
            ))}
          </div>
        )}

        {openPanel === "more" && (
          <div className="classroom-more-tools" aria-label="Additional classroom tools">
            <ToolButton active={activeTool === "spotlight"} label="Spotlight reveal tool" onClick={() => selectTool("spotlight")}><Eye /></ToolButton>
            <ToolButton active={activeTool === "cover"} label="Cover area tool" onClick={() => selectTool("cover")}><EyeOff /></ToolButton>
            <ToolButton label="Magnify current view" onClick={() => { onMagnify?.(); setOpenPanel(""); }}><ScanSearch /></ToolButton>
            <ToolButton label="Open timer" onClick={() => setOpenPanel("timer")}><Timer /></ToolButton>
            <ToolButton label="Open scoreboard" onClick={() => setOpenPanel("scoreboard")}><Trophy /></ToolButton>
            <ToolButton label="Show on-screen keyboard" disabled={activeTool !== "text"} onClick={() => { requestKeyboard(); setOpenPanel(""); }}><Keyboard /></ToolButton>
            <ToolButton label="Print current view" onClick={printCurrentView}><Printer /></ToolButton>
            <ToolButton label="Clear current annotations" disabled={!history.present.length} onClick={clearAnnotations}><Trash2 /></ToolButton>
            <ToolButton label="Stop active tool" disabled={activeTool === "pointer"} onClick={() => selectTool("pointer")}><RotateCcw /></ToolButton>
          </div>
        )}
      </div>

      {openPanel === "timer" && (
        <aside className="classroom-floating-panel classroom-timer-panel" aria-label="Classroom timer">
          <header><Timer /><strong>Classroom timer</strong><button type="button" aria-label="Close timer" onClick={() => setOpenPanel("")}>×</button></header>
          <output aria-live="polite">{formatTime(timer.remaining)}</output>
          <div className="classroom-timer-presets">
            {[1, 2, 5, 10].map((minutes) => <button key={minutes} type="button" onClick={() => setTimerMinutes(minutes)}>{minutes} min</button>)}
          </div>
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
          <header><Trophy /><strong>Scoreboard</strong><button type="button" aria-label="Close scoreboard" onClick={() => setOpenPanel("")}>×</button></header>
          {[["a", "Team A"], ["b", "Team B"]].map(([key, label]) => (
            <section key={key}>
              <strong>{label}</strong><output aria-label={`${label} score`}>{scores[key]}</output>
              <div>
                <button type="button" aria-label={`Subtract point from ${label}`} onClick={() => setScores((current) => ({ ...current, [key]: Math.max(0, current[key] - 1) }))}>−1</button>
                <button type="button" aria-label={`Add point to ${label}`} onClick={() => setScores((current) => ({ ...current, [key]: current[key] + 1 }))}>+1</button>
              </div>
            </section>
          ))}
          <button type="button" className="classroom-score-reset" onClick={resetScores}>Reset scoreboard</button>
        </aside>
      )}
      {message && <div className="classroom-tool-message" role="status">{message}</div>}
    </>
  );
}
