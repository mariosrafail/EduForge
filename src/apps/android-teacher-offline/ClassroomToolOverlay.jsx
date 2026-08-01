import { Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { createClassroomElementId, useClassroomTools } from "./ClassroomToolsContext.jsx";

const CAPTURE_TOOLS = new Set(["pen", "eraser", "text", "spotlight", "cover", "zoom-region"]);

function clampUnit(value) {
  return Math.max(0, Math.min(1, value));
}

function pointsToPath(points, size) {
  return points.map((point, index) => `${index ? "L" : "M"} ${point.x * size.width} ${point.y * size.height}`).join(" ");
}

function normalizedRect(start, end) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(start.x - end.x),
    height: Math.abs(start.y - end.y),
  };
}

export default function ClassroomToolOverlay({ surfaceKey }) {
  const {
    activeTool,
    setActiveTool,
    color,
    strokeWidth,
    getDrawingHistory,
    commitDrawing,
    getOverlays,
    addCover,
    removeCover,
    setSpotlight,
    getRegionZoom,
    setRegionZoom,
    keyboardRequest,
  } = useClassroomTools();
  const overlayRef = useRef(null);
  const draftRef = useRef(null);
  const textInputRef = useRef(null);
  const maskId = useId().replaceAll(":", "");
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [draft, setDraft] = useState(null);
  const [textDraft, setTextDraft] = useState(null);
  const [selectedCoverId, setSelectedCoverId] = useState("");
  const [selectedCoverAnchor, setSelectedCoverAnchor] = useState(null);
  const drawing = getDrawingHistory(surfaceKey).present;
  const { covers, spotlight } = getOverlays(surfaceKey);
  const regionZoom = getRegionZoom(surfaceKey);
  const capturing = CAPTURE_TOOLS.has(activeTool) && !regionZoom;

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return undefined;
    const update = () => setSize({ width: overlay.clientWidth || 1, height: overlay.clientHeight || 1 });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(overlay);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    draftRef.current = null;
    setDraft(null);
    if (activeTool !== "text") setTextDraft(null);
  }, [activeTool, surfaceKey]);

  useEffect(() => { setSelectedCoverId(""); setSelectedCoverAnchor(null); }, [surfaceKey]);

  useEffect(() => {
    if (selectedCoverId && !covers.some(({ id }) => id === selectedCoverId)) {
      setSelectedCoverId("");
      setSelectedCoverAnchor(null);
    }
  }, [covers, selectedCoverId]);

  useEffect(() => {
    if (!selectedCoverId) return undefined;
    const deselect = (event) => {
      if (!event.target.closest(`[data-cover-id="${CSS.escape(selectedCoverId)}"]`)
        && !event.target.closest(".classroom-cover-delete")) { setSelectedCoverId(""); setSelectedCoverAnchor(null); }
    };
    document.addEventListener("pointerdown", deselect);
    return () => document.removeEventListener("pointerdown", deselect);
  }, [selectedCoverId]);

  useEffect(() => {
    if (!keyboardRequest || activeTool !== "text") return;
    if (!textDraft) setTextDraft({ x: 0.5, y: 0.45, value: "" });
    setTimeout(() => textInputRef.current?.focus(), 0);
  }, [activeTool, keyboardRequest, textDraft]);

  const pointFromEvent = (event) => {
    const rect = overlayRef.current.getBoundingClientRect();
    return {
      x: clampUnit((event.clientX - rect.left) / rect.width),
      y: clampUnit((event.clientY - rect.top) / rect.height),
    };
  };
  const finishText = () => {
    const value = textDraft?.value.trim();
    if (value) {
      commitDrawing(surfaceKey, (current) => [...current, {
        id: createClassroomElementId(),
        type: "text",
        x: textDraft.x,
        y: textDraft.y,
        value: value.slice(0, 240),
        color,
        fontSize: strokeWidth === 3 ? 26 : strokeWidth === 6 ? 36 : 48,
      }]);
    }
    setTextDraft(null);
  };
  const onPointerDown = (event) => {
    if (!capturing || event.button > 0 || event.target.closest(".classroom-text-editor")) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedCoverId("");
    const point = pointFromEvent(event);
    if (activeTool === "eraser") {
      const id = event.target.closest("[data-drawing-id]")?.dataset.drawingId;
      if (id) commitDrawing(surfaceKey, (current) => current.filter((element) => element.id !== id));
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    if (activeTool === "text") {
      setTextDraft({ ...point, value: "" });
      setTimeout(() => textInputRef.current?.focus(), 0);
      return;
    }
    const next = activeTool === "pen"
      ? { type: "stroke", points: [point], color, strokeWidth }
      : { type: activeTool, start: point, end: point };
    draftRef.current = next;
    setDraft(next);
  };
  const onPointerMove = (event) => {
    if (!draftRef.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.preventDefault();
    event.stopPropagation();
    const point = pointFromEvent(event);
    const current = draftRef.current;
    const next = current.type === "stroke"
      ? { ...current, points: [...current.points, point].slice(-600) }
      : { ...current, end: point };
    draftRef.current = next;
    setDraft(next);
  };
  const onPointerEnd = (event) => {
    const current = draftRef.current;
    if (!current) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (current.type === "stroke" && current.points.length > 1) {
      commitDrawing(surfaceKey, (elements) => [...elements, { ...current, id: createClassroomElementId() }]);
    } else if (["cover", "spotlight", "zoom-region"].includes(current.type)) {
      const rect = normalizedRect(current.start, current.end);
      if (rect.width > 0.015 && rect.height > 0.015) {
        if (current.type === "cover") addCover(surfaceKey, { id: createClassroomElementId(), type: "cover", ...rect });
        if (current.type === "spotlight") setSpotlight(surfaceKey, { id: createClassroomElementId(), type: "spotlight", ...rect });
        if (current.type === "zoom-region") {
          setRegionZoom(surfaceKey, rect);
          setActiveTool("pointer");
        }
      }
    }
    draftRef.current = null;
    setDraft(null);
  };

  const draftRect = draft && draft.type !== "stroke" ? normalizedRect(draft.start, draft.end) : null;
  const selectedCover = covers.find(({ id }) => id === selectedCoverId);
  const spotlightReveal = draftRect && draft?.type === "spotlight" ? draftRect : spotlight;

  return (
    <>
    <div
      ref={overlayRef}
      className={`classroom-tools-overlay ${capturing ? "is-editing" : ""} ${covers.length ? "has-covers" : ""} ${selectedCoverId ? "has-selected-cover" : ""} tool-${activeTool}`}
      data-active-classroom-tool={activeTool}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      aria-label="Classroom annotation layer"
    >
      <svg width="100%" height="100%" aria-hidden="true">
        {drawing.map((element) => element.type === "stroke" ? (
          <path key={element.id} data-drawing-id={element.id} d={pointsToPath(element.points, size)} fill="none" stroke={element.color} strokeWidth={element.strokeWidth} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        ) : (
          <text key={element.id} data-drawing-id={element.id} x={element.x * size.width} y={element.y * size.height} fill={element.color} fontSize={element.fontSize} fontWeight="800" paintOrder="stroke" stroke="rgba(255,255,255,.82)" strokeWidth="3">{element.value}</text>
        ))}
        {covers.map((cover) => (
          <rect
            key={cover.id}
            data-cover-id={cover.id}
            className={cover.id === selectedCoverId ? "classroom-cover selected" : "classroom-cover"}
            x={cover.x * size.width}
            y={cover.y * size.height}
            width={cover.width * size.width}
            height={cover.height * size.height}
            rx="8"
            fill="rgba(23,30,49,.94)"
            stroke={cover.id === selectedCoverId ? "#fff" : "rgba(255,255,255,.72)"}
            strokeWidth={cover.id === selectedCoverId ? 5 : 2}
            vectorEffect="non-scaling-stroke"
            onPointerDown={(event) => {
              if (activeTool === "pointer") {
                event.stopPropagation();
                const rect = event.currentTarget.getBoundingClientRect();
                setSelectedCoverId(cover.id);
                setSelectedCoverAnchor({ left: rect.right, top: rect.top });
              }
            }}
          />
        ))}
        {draft?.type === "stroke" && <path d={pointsToPath(draft.points, size)} fill="none" stroke={draft.color} strokeWidth={draft.strokeWidth} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
        {draftRect && draft.type === "cover" && <rect x={draftRect.x * size.width} y={draftRect.y * size.height} width={draftRect.width * size.width} height={draftRect.height * size.height} rx="8" fill="rgba(23,30,49,.86)" stroke="rgba(255,255,255,.82)" strokeWidth="3" />}
        {spotlightReveal && (
          <>
            <defs><mask id={maskId}><rect width="100%" height="100%" fill="white" /><rect x={spotlightReveal.x * size.width} y={spotlightReveal.y * size.height} width={spotlightReveal.width * size.width} height={spotlightReveal.height * size.height} rx="12" fill="black" /></mask></defs>
            <rect width="100%" height="100%" fill="rgba(3,10,27,.76)" mask={`url(#${maskId})`} />
            <rect x={spotlightReveal.x * size.width} y={spotlightReveal.y * size.height} width={spotlightReveal.width * size.width} height={spotlightReveal.height * size.height} rx="12" fill="none" stroke="#f4e84a" strokeWidth="4" vectorEffect="non-scaling-stroke" />
          </>
        )}
        {draftRect && draft.type === "zoom-region" && <rect className="classroom-zoom-selection" x={draftRect.x * size.width} y={draftRect.y * size.height} width={draftRect.width * size.width} height={draftRect.height * size.height} rx="8" />}
      </svg>
      {textDraft && (
        <form className="classroom-text-editor" style={{ left: `${textDraft.x * 100}%`, top: `${textDraft.y * 100}%` }} onSubmit={(event) => { event.preventDefault(); finishText(); }} onPointerDown={(event) => event.stopPropagation()}>
          <input ref={textInputRef} value={textDraft.value} maxLength={240} enterKeyHint="done" aria-label="Annotation text" placeholder="Type classroom note" onChange={(event) => setTextDraft((current) => ({ ...current, value: event.target.value }))} />
          <button type="submit">Add</button>
          <button type="button" onClick={() => setTextDraft(null)}>Cancel</button>
        </form>
      )}
    </div>
    {selectedCover && selectedCoverAnchor && createPortal(
      <button
        type="button"
        className="classroom-cover-delete"
        style={{ left: selectedCoverAnchor.left, top: selectedCoverAnchor.top }}
        aria-label="Delete selected cover"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => { removeCover(surfaceKey, selectedCover.id); setSelectedCoverId(""); setSelectedCoverAnchor(null); }}
      ><Trash2 /></button>,
      document.body,
    )}
    </>
  );
}
