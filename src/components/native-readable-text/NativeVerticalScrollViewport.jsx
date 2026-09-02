import { useCallback, useLayoutEffect, useRef, useState } from "react";

export function NativeVerticalScrollViewport({ id, className, ariaLabel, resetKey, children }) {
  const viewportRef = useRef(null);
  const trackRef = useRef(null);
  const dragRef = useRef(null);
  const [state, setState] = useState({ overflowing: false, top: 0, maximum: 0, viewport: 0, content: 0 });

  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    setState({
      overflowing: viewport.scrollHeight > viewport.clientHeight + 2,
      top: viewport.scrollTop,
      maximum: Math.max(0, viewport.scrollHeight - viewport.clientHeight),
      viewport: viewport.clientHeight,
      content: viewport.scrollHeight,
    });
  }, []);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    viewport.scrollTop = 0;
    measure();
    viewport.addEventListener("scroll", measure, { passive: true });
    globalThis.addEventListener("resize", measure);
    if (typeof ResizeObserver === "undefined") return () => { viewport.removeEventListener("scroll", measure); globalThis.removeEventListener("resize", measure); };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild);
    return () => { observer.disconnect(); viewport.removeEventListener("scroll", measure); globalThis.removeEventListener("resize", measure); };
  }, [measure, resetKey]);

  const scrollTo = (top) => {
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTop = Math.min(Math.max(0, top), Math.max(0, viewport.scrollHeight - viewport.clientHeight));
  };
  const keyDown = (event) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const increments = { ArrowUp: -40, ArrowDown: 40, PageUp: -viewport.clientHeight * 0.85, PageDown: viewport.clientHeight * 0.85 };
    if (event.key === "Home") { event.preventDefault(); scrollTo(0); }
    else if (event.key === "End") { event.preventDefault(); scrollTo(state.maximum); }
    else if (Object.hasOwn(increments, event.key)) { event.preventDefault(); scrollTo(viewport.scrollTop + increments[event.key]); }
  };
  const scrollFromTrackPoint = (clientY, grabRatio = 0.5) => {
    const track = trackRef.current;
    if (!track || !state.maximum) return;
    const rect = track.getBoundingClientRect();
    const thumbRatio = Math.min(1, Math.max(0.34, state.viewport / Math.max(1, state.content)));
    const thumbPixels = Math.max(24, rect.height * thumbRatio);
    scrollTo(((clientY - rect.top - thumbPixels * grabRatio) / Math.max(1, rect.height - thumbPixels)) * state.maximum);
  };
  const beginDrag = (event) => {
    event.preventDefault(); event.stopPropagation();
    const thumb = event.currentTarget.getBoundingClientRect();
    dragRef.current = { pointerId: event.pointerId, grabRatio: Math.min(1, Math.max(0, (event.clientY - thumb.top) / Math.max(1, thumb.height))) };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveDrag = (event) => { if (dragRef.current?.pointerId === event.pointerId) scrollFromTrackPoint(event.clientY, dragRef.current.grabRatio); };
  const endDrag = (event) => { if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null; };

  return <>
    <div id={id} ref={viewportRef} className={className} tabIndex={0} data-overflowing={state.overflowing || undefined} onLoadCapture={measure}>{children}</div>
    {state.overflowing ? <div ref={trackRef} className="native-readable-text-scroll-control" role="scrollbar" aria-label={ariaLabel} aria-controls={id} aria-orientation="vertical" aria-valuemin={0} aria-valuemax={Math.round(state.maximum)} aria-valuenow={Math.round(state.top)} tabIndex={0} onKeyDown={keyDown} onPointerDown={(event) => { if (event.target === event.currentTarget) scrollFromTrackPoint(event.clientY); }}><span className="native-readable-text-scroll-thumb" style={{ "--scroll-thumb-size": `${Math.max(0.34, state.viewport / Math.max(1, state.content)) * 100}%`, "--scroll-progress": `${state.maximum ? state.top / state.maximum : 0}` }} onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} /></div> : null}
  </>;
}
