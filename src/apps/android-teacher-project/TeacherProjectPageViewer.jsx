import { Move } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import ClassroomStageTransform from "../android-teacher-offline/ClassroomStageTransform.jsx";
import ClassroomToolOverlay from "../android-teacher-offline/ClassroomToolOverlay.jsx";
import ClassroomToolbar from "../android-teacher-offline/ClassroomToolbar.jsx";
import { useTeacherStage } from "../android-teacher-offline/TeacherFixedStage.jsx";
import { renderedDeltaToTeacherStage } from "../android-teacher-offline/teacherStageGeometry.js";
import TeacherProjectNavigation from "./TeacherProjectNavigation.jsx";

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

function entrySources(entry) {
  return entry.layout === "double-pair" ? [entry.leftImage, entry.rightImage] : [entry.image];
}

export default function TeacherProjectPageViewer({ config, unit, entryIndex, onHome, onBack, onSelectIndex }) {
  const entry = unit.entries[entryIndex];
  const stageRef = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const frame = useRef(0);
  const { scale: outerScale } = useTeacherStage();
  const [stage, setStage] = useState({ width: 0, height: 0, paddingX: 0, paddingY: 0 });
  const [sizes, setSizes] = useState([]);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const sources = entrySources(entry);
  const surfaceKey = `teacher-project:${config.projectId}:entry:${entry.id}`;

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return undefined;
    const update = () => {
      const style = getComputedStyle(node);
      setStage({ width: node.clientWidth, height: node.clientHeight, paddingX: parseFloat(style.paddingLeft) + parseFloat(style.paddingRight), paddingY: parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) });
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(node); globalThis.addEventListener?.("resize", update); update();
    return () => { observer?.disconnect(); globalThis.removeEventListener?.("resize", update); };
  }, [entry.id]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const loaded = sizes.length === sources.length && sizes.every(Boolean);
  const natural = loaded ? {
    width: entry.layout === "double-pair" ? sizes.reduce((sum, item) => sum + item.width, 0) : sizes[0].width,
    height: entry.layout === "double-pair" ? Math.max(...sizes.map((item) => item.height)) : sizes[0].height,
  } : { width: 0, height: 0 };
  const available = { width: Math.max(0, stage.width - stage.paddingX), height: Math.max(0, stage.height - stage.paddingY) };
  const fit = natural.width && natural.height ? Math.min(available.width / natural.width, available.height / natural.height) : 0;
  const rendered = { width: natural.width * fit * zoom, height: natural.height * fit * zoom };
  const maxPan = { x: Math.max(0, (rendered.width - available.width) / 2), y: Math.max(0, (rendered.height - available.height) / 2) };
  const bounded = { x: clamp(pan.x, -maxPan.x, maxPan.x), y: clamp(pan.y, -maxPan.y, maxPan.y) };
  const canPan = maxPan.x > 2 || maxPan.y > 2;
  const setBoundedZoom = (value) => { const next = clamp(value, 1, 4); setZoom(next); if (next === 1) setPan({ x: 0, y: 0 }); };
  const onPointerDown = (event) => {
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* synthetic or cancelled pointer */ }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    gesture.current = points.length === 2
      ? { type: "pinch", distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y), zoom }
      : { type: "pan", start: points[0], pan: bounded };
  };
  const onPointerMove = (event) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const points = [...pointers.current.values()];
      if (points.length === 2 && gesture.current?.type === "pinch") {
        const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        setBoundedZoom(gesture.current.zoom * distance / Math.max(1, gesture.current.distance));
      } else if (points.length === 1 && gesture.current?.type === "pan" && canPan) {
        setPan({
          x: clamp(gesture.current.pan.x + renderedDeltaToTeacherStage(points[0].x - gesture.current.start.x, outerScale), -maxPan.x, maxPan.x),
          y: clamp(gesture.current.pan.y + renderedDeltaToTeacherStage(points[0].y - gesture.current.start.y, outerScale), -maxPan.y, maxPan.y),
        });
      }
    });
  };
  const onPointerEnd = (event) => { pointers.current.delete(event.pointerId); gesture.current = null; };
  const recordSize = (index, event) => {
    const size = { width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight };
    setSizes((current) => { const next = [...current]; next[index] = size; return next; });
  };
  const unitNumber = Number(unit.id.slice("unit-".length));

  return (
    <main className="teacher-project-content-screen teacher-project-page-screen teacher-offline-pages teacher-offline-pages-viewer has-classroom-tools" style={{ "--legacy-classroom-background": config.background ? `url(${config.background})` : "none" }}>
      <header className="legacy-page-heading"><div aria-hidden="true" /><div><h2>Unit {unitNumber}</h2><strong>{entry.sectionTitle || `pg ${entry.pageLabel}`}</strong>{entry.sectionTitle && <span>pg {entry.pageLabel}</span>}</div><div aria-hidden="true" /></header>
      <section className="teacher-project-content-stage teacher-project-page-reader teacher-offline-page-reader">
        <div ref={stageRef} className={`teacher-project-page-stage teacher-offline-page-stage ${canPan ? "can-pan" : ""}`} data-classroom-surface-id={surfaceKey} data-entry-id={entry.id} data-layout={entry.layout} data-zoom={zoom.toFixed(2)} tabIndex={-1} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onWheel={(event) => { event.preventDefault(); setBoundedZoom(zoom + (event.deltaY < 0 ? .2 : -.2)); }}>
          <ClassroomStageTransform surfaceKey={surfaceKey}>
            {!failed && sources.every(Boolean) ? (
              <div className="teacher-project-page-composite" data-fit-mode="fit-page" style={{ width: `${rendered.width}px`, height: `${rendered.height}px`, transform: `translate3d(${bounded.x}px, ${bounded.y}px, 0)` }}>
                {sources.map((source, index) => <img key={`${entry.id}-${index}`} src={source} alt={index === 0 ? `Unit ${unitNumber}, ${entry.sectionTitle || "page"}, pg ${entry.pageLabel}` : ""} draggable="false" decoding="async" onLoad={(event) => recordSize(index, event)} onError={() => setFailed(true)} style={loaded ? { width: `${sizes[index].width * fit * zoom}px`, height: `${sizes[index].height * fit * zoom}px` } : undefined} />)}
                {canPan && <span className="teacher-page-pan-indicator" aria-hidden="true"><Move size={18} /></span>}
              </div>
            ) : <div className="teacher-offline-asset-error" role="alert">This required page asset is unavailable.</div>}
            <ClassroomToolOverlay surfaceKey={surfaceKey} />
          </ClassroomStageTransform>
        </div>
      </section>
      <TeacherProjectNavigation onHome={onHome} onBack={onBack} onPrevious={() => onSelectIndex(entryIndex - 1)} onNext={() => onSelectIndex(entryIndex + 1)} previousDisabled={entryIndex <= 0} nextDisabled={entryIndex >= unit.entries.length - 1} />
      <ClassroomToolbar surfaceKey={surfaceKey} items={config.toolbar} />
    </main>
  );
}
