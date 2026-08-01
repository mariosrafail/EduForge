import { useEffect, useId, useRef, useState } from "react";

import { createClassroomElementId, useClassroomTools } from "./ClassroomToolsContext.jsx";

const EDITING_TOOLS = new Set(["pen", "eraser", "text", "spotlight", "cover"]);

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
    color,
    strokeWidth,
    getHistory,
    commit,
    keyboardRequest,
  } = useClassroomTools();
  const overlayRef = useRef(null);
  const draftRef = useRef(null);
  const textInputRef = useRef(null);
  const maskId = useId().replaceAll(":", "");
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [draft, setDraft] = useState(null);
  const [textDraft, setTextDraft] = useState(null);
  const history = getHistory(surfaceKey);
  const elements = history.present;
  const editing = EDITING_TOOLS.has(activeTool);

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
    if (activeTool !== "text") setTextDraft(null);
  }, [activeTool, surfaceKey]);

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
      commit(surfaceKey, (current) => [...current, {
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
    if (!editing || event.button > 0 || event.target.closest(".classroom-text-editor")) return;
    event.stopPropagation();
    const point = pointFromEvent(event);
    if (activeTool === "eraser") {
      const id = event.target.closest("[data-annotation-id]")?.dataset.annotationId;
      if (id) commit(surfaceKey, (current) => current.filter((element) => element.id !== id));
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
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (current.type === "stroke" && current.points.length > 1) {
      commit(surfaceKey, (elementsNow) => [...elementsNow, { ...current, id: createClassroomElementId() }]);
    } else if (["cover", "spotlight"].includes(current.type)) {
      const rect = normalizedRect(current.start, current.end);
      if (rect.width > 0.015 && rect.height > 0.015) {
        commit(surfaceKey, (elementsNow) => {
          const withoutPriorSpotlight = current.type === "spotlight"
            ? elementsNow.filter((element) => element.type !== "spotlight")
            : elementsNow;
          return [...withoutPriorSpotlight, {
            id: createClassroomElementId(),
            type: current.type,
            ...rect,
            color,
          }];
        });
      }
    }
    draftRef.current = null;
    setDraft(null);
  };

  const renderElement = (element) => {
    if (element.type === "stroke") {
      return <path key={element.id} data-annotation-id={element.id} d={pointsToPath(element.points, size)} fill="none" stroke={element.color} strokeWidth={element.strokeWidth} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
    }
    if (element.type === "text") {
      return <text key={element.id} data-annotation-id={element.id} x={element.x * size.width} y={element.y * size.height} fill={element.color} fontSize={element.fontSize} fontWeight="800" paintOrder="stroke" stroke="rgba(255,255,255,.82)" strokeWidth="3">{element.value}</text>;
    }
    if (element.type === "cover") {
      return <rect key={element.id} data-annotation-id={element.id} x={element.x * size.width} y={element.y * size.height} width={element.width * size.width} height={element.height * size.height} rx="8" fill="rgba(23,30,49,.92)" stroke={element.color} strokeWidth="3" vectorEffect="non-scaling-stroke" />;
    }
    return null;
  };
  const spotlight = elements.findLast((element) => element.type === "spotlight");
  const draftRect = draft && draft.type !== "stroke" ? normalizedRect(draft.start, draft.end) : null;

  return (
    <div
      ref={overlayRef}
      className={`classroom-tools-overlay ${editing ? "is-editing" : ""} tool-${activeTool}`}
      data-active-classroom-tool={activeTool}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      aria-label="Classroom annotation layer"
    >
      <svg width="100%" height="100%" aria-hidden="true">
        {elements.filter((element) => element.type !== "spotlight").map(renderElement)}
        {draft?.type === "stroke" && <path d={pointsToPath(draft.points, size)} fill="none" stroke={draft.color} strokeWidth={draft.strokeWidth} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
        {draftRect && draft.type === "cover" && <rect x={draftRect.x * size.width} y={draftRect.y * size.height} width={draftRect.width * size.width} height={draftRect.height * size.height} rx="8" fill="rgba(23,30,49,.82)" stroke={color} strokeWidth="3" />}
        {(spotlight || (draftRect && draft.type === "spotlight")) && (() => {
          const reveal = draftRect && draft.type === "spotlight" ? draftRect : spotlight;
          return (
            <>
              <defs><mask id={maskId}><rect width="100%" height="100%" fill="white" /><rect x={reveal.x * size.width} y={reveal.y * size.height} width={reveal.width * size.width} height={reveal.height * size.height} rx="12" fill="black" /></mask></defs>
              <rect data-annotation-id={spotlight?.id} width="100%" height="100%" fill="rgba(3,10,27,.76)" mask={`url(#${maskId})`} />
              <rect x={reveal.x * size.width} y={reveal.y * size.height} width={reveal.width * size.width} height={reveal.height * size.height} rx="12" fill="none" stroke="#f4e84a" strokeWidth="4" vectorEffect="non-scaling-stroke" />
            </>
          );
        })()}
      </svg>
      {textDraft && (
        <form
          className="classroom-text-editor"
          style={{ left: `${textDraft.x * 100}%`, top: `${textDraft.y * 100}%` }}
          onSubmit={(event) => { event.preventDefault(); finishText(); }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <input
            ref={textInputRef}
            value={textDraft.value}
            maxLength={240}
            enterKeyHint="done"
            aria-label="Annotation text"
            placeholder="Type classroom note"
            onChange={(event) => setTextDraft((current) => ({ ...current, value: event.target.value }))}
          />
          <button type="submit">Add</button>
          <button type="button" onClick={() => setTextDraft(null)}>Cancel</button>
        </form>
      )}
      {editing && <span className="classroom-active-tool-label">{activeTool}</span>}
    </div>
  );
}
