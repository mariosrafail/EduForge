import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { NativeAudioTextFocusContent } from "./NativeAudioTextHotspots.jsx";
import { NativeVideoPlayer } from "../native-video/NativeVideoPlayer.jsx";
import "./nativeReadableText.css";

export function nextNativeReadableTextView(current, commandType, available) {
  return nextNativeSupplementaryView(current, commandType, { readableText: available, video: false });
}

export function nextNativeSupplementaryView(current, commandType, available) {
  if (commandType === "toggle-text" && available.readableText) return current === "text" ? "questions" : "text";
  if (commandType === "toggle-video" && available.video) return current === "video" ? "questions" : "video";
  if (["reset-activity", "show-all", "show-next"].includes(commandType)) return "questions";
  return current;
}

const nonNegativeInteger = (value) => Number.isInteger(value) && value >= 0 ? value : 0;

function defaultActivityState(document) {
  const presentation = document?.parts?.[0]?.interaction?.presentation;
  return {
    panelIndex: 0,
    panelCount: presentation?.kind === "image-hotspot" ? presentation.panels?.length || 0 : 0,
    reveal: null,
  };
}

export function normalizeNativeChildPresentationState(value, fallback = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const panelCount = nonNegativeInteger(source.panelCount ?? fallback.panelCount);
  const panelIndex = Math.min(nonNegativeInteger(source.panelIndex ?? fallback.panelIndex), Math.max(0, panelCount - 1));
  const revealSource = source.reveal;
  const total = nonNegativeInteger(revealSource?.total);
  return {
    panelIndex,
    panelCount,
    reveal: revealSource?.supported === true ? {
      supported: true,
      total,
      revealed: Math.min(nonNegativeInteger(revealSource.revealed), total),
      pristine: revealSource.pristine === true,
    } : null,
  };
}

export function NativeReadableTextPresentation({ document, assetUrl, presentation = null, children }) {
  const available = Boolean(document.readableText);
  const videoAvailable = Boolean(document.video);
  const [view, setView] = useState("questions");
  const [activityState, setActivityState] = useState(() => defaultActivityState(document));
  const [childSupplementaryState, setChildSupplementaryState] = useState({ view: "questions", readableTextAvailable: false });
  const [activeHotspotId, setActiveHotspotId] = useState(null);
  const viewportRef = useRef(null);
  const activityViewRef = useRef(null);
  const trackRef = useRef(null);
  const dragRef = useRef(null);
  const [scrollState, setScrollState] = useState({ overflowing: false, top: 0, maximum: 0, viewport: 0, content: 0 });
  const lastCommandToken = useRef(presentation?.command?.token);
  const onStateChange = presentation?.onStateChange;

  useEffect(() => {
    setView("questions");
    setActivityState(defaultActivityState(document));
    setChildSupplementaryState({ view: "questions", readableTextAvailable: false });
    setScrollState({ overflowing: false, top: 0, maximum: 0, viewport: 0, content: 0 });
    setActiveHotspotId(null);
    lastCommandToken.current = presentation?.command?.token;
  }, [document.activityId]);

  useEffect(() => {
    const command = presentation?.command;
    if (!command || command.token === lastCommandToken.current) return;
    lastCommandToken.current = command.token;
    if (["toggle-text", "toggle-video", "reset-activity", "show-all", "show-next", "previous-panel", "next-panel"].includes(command.type)) setActiveHotspotId(null);
    setView((current) => nextNativeSupplementaryView(current, command.type, { readableText: available, video: videoAvailable }));
  }, [available, presentation?.command, videoAvailable]);

  useEffect(() => {
    if (view !== "video") return;
    activityViewRef.current?.querySelectorAll("audio, video").forEach((media) => media.pause());
  }, [view]);

  const onChildStateChange = useCallback((value) => {
    setChildSupplementaryState((current) => {
      const next = { view: value?.view === "text" ? "text" : "questions", readableTextAvailable: value?.readableTextAvailable === true };
      return current.view === next.view && current.readableTextAvailable === next.readableTextAvailable ? current : next;
    });
    setActivityState((current) => {
      const next = normalizeNativeChildPresentationState(value, current);
      return current.panelIndex === next.panelIndex
        && current.panelCount === next.panelCount
        && current.reveal?.supported === next.reveal?.supported
        && current.reveal?.total === next.reveal?.total
        && current.reveal?.revealed === next.reveal?.revealed
        && current.reveal?.pristine === next.reveal?.pristine ? current : next;
    });
  }, []);

  const hotspots = useMemo(() => document.audioTextHotspots?.hotspots || [], [document.audioTextHotspots]);
  const activeHotspot = hotspots.find((hotspot) => hotspot.id === activeHotspotId) || null;

  useEffect(() => {
    if (!activeHotspot) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !event.defaultPrevented) setActiveHotspotId(null);
    };
    globalThis.addEventListener("keydown", closeOnEscape);
    return () => globalThis.removeEventListener("keydown", closeOnEscape);
  }, [activeHotspot]);

  useEffect(() => {
    const childTextAvailable = childSupplementaryState.readableTextAvailable;
    const reportedView = view === "questions"
      ? childSupplementaryState.view
      : view === "text" && !available || view === "video" && !videoAvailable ? "questions" : view;
    onStateChange?.({
      view: reportedView,
      readableTextAvailable: available || childTextAvailable,
      videoAvailable,
      panelIndex: activityState.panelIndex,
      panelCount: activityState.panelCount,
      reveal: activityState.reveal,
      audioFocusActive: Boolean(activeHotspot),
    });
  }, [activeHotspot, activityState, available, childSupplementaryState, onStateChange, videoAvailable, view]);

  const childPresentation = useMemo(() => presentation ? {
    command: presentation.command,
    onStateChange: onChildStateChange,
  } : null, [onChildStateChange, presentation?.command]);

  const hotspotPresentation = useMemo(() => ({
    hotspots,
    activeHotspotId,
    onToggle(hotspotId) { setView("questions"); setActiveHotspotId((current) => current === hotspotId ? null : hotspotId); },
    onPanelChange(panelId) {
      setActiveHotspotId((current) => {
        const active = hotspots.find((hotspot) => hotspot.id === current);
        return active && active.panelId !== panelId ? null : current;
      });
    },
  }), [activeHotspotId, hotspots]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || view !== "text") return undefined;
    const update = () => setScrollState({ overflowing: viewport.scrollHeight > viewport.clientHeight + 2, top: viewport.scrollTop, maximum: Math.max(0, viewport.scrollHeight - viewport.clientHeight), viewport: viewport.clientHeight, content: viewport.scrollHeight });
    update();
    viewport.addEventListener("scroll", update, { passive: true });
    globalThis.addEventListener("resize", update);
    if (typeof ResizeObserver === "undefined") return () => { viewport.removeEventListener("scroll", update); globalThis.removeEventListener("resize", update); };
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild);
    return () => { observer.disconnect(); viewport.removeEventListener("scroll", update); globalThis.removeEventListener("resize", update); };
  }, [document.activityId, view]);

  const scrollTo = useCallback((top) => {
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTop = Math.min(Math.max(0, top), Math.max(0, viewport.scrollHeight - viewport.clientHeight));
  }, []);
  const scrollControlKeyDown = (event) => {
    const viewport = viewportRef.current; if (!viewport) return;
    const increments = { ArrowUp: -40, ArrowDown: 40, PageUp: -viewport.clientHeight * 0.85, PageDown: viewport.clientHeight * 0.85 };
    if (event.key === "Home") { event.preventDefault(); scrollTo(0); }
    else if (event.key === "End") { event.preventDefault(); scrollTo(scrollState.maximum); }
    else if (Object.hasOwn(increments, event.key)) { event.preventDefault(); scrollTo(viewport.scrollTop + increments[event.key]); }
  };
  const scrollFromTrackPoint = (clientY, grabRatio = 0.5) => {
    const track = trackRef.current; if (!track || !scrollState.maximum) return;
    const rect = track.getBoundingClientRect(); const thumbRatio = Math.min(1, Math.max(0.34, scrollState.viewport / Math.max(1, scrollState.content)));
    const thumbPixels = Math.max(24, rect.height * thumbRatio); const travel = Math.max(1, rect.height - thumbPixels);
    scrollTo(((clientY - rect.top - thumbPixels * grabRatio) / travel) * scrollState.maximum);
  };
  const beginThumbDrag = (event) => {
    event.preventDefault(); event.stopPropagation(); const thumb = event.currentTarget.getBoundingClientRect();
    dragRef.current = { pointerId: event.pointerId, grabRatio: Math.min(1, Math.max(0, (event.clientY - thumb.top) / Math.max(1, thumb.height))) };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveThumb = (event) => { if (dragRef.current?.pointerId === event.pointerId) scrollFromTrackPoint(event.clientY, dragRef.current.grabRatio); };
  const endThumb = (event) => { if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null; };

  const reference = available ? document.assets.find((asset) => asset.slot === document.readableText.assetSlot) : null;
  const effectiveView = view === "text" && !available || view === "video" && !videoAvailable ? "questions" : view;
  const activity = typeof children === "function" ? children(childPresentation, hotspotPresentation) : children;
  const focusOpen = effectiveView === "questions" && Boolean(activeHotspot);
  const videoReference = videoAvailable ? document.assets.find((asset) => asset.slot === document.video.assetSlot) : null;
  const internalNavigation = !presentation && (available || videoAvailable);
  return <div className="native-readable-text-presentation" data-readable-text-available={available || undefined} data-video-available={videoAvailable || undefined} data-presentation-view={effectiveView} data-audio-focus={focusOpen || undefined} data-internal-navigation={internalNavigation || undefined}>
    <div className="native-audio-text-focus-slot" hidden={!focusOpen}>{focusOpen ? <NativeAudioTextFocusContent document={document} hotspot={activeHotspot} assetUrl={assetUrl} autoPlay /> : null}</div>
    <div ref={activityViewRef} className={`native-readable-text-activity-view${focusOpen ? " is-audio-focus" : ""}`} hidden={effectiveView === "text" || effectiveView === "video"}>{activity}</div>
    {effectiveView === "text" && reference ? <section className="native-readable-text-view" aria-label="Readable text">
      <div id={`${document.activityId}-readable-scroll`} ref={viewportRef} className="native-readable-text-scroll" tabIndex={0} data-overflowing={scrollState.overflowing || undefined}>
        <img src={assetUrl(reference.assetId)} alt={document.readableText.altText} width={document.readableText.sourceWidth} height={document.readableText.sourceHeight} onLoad={() => {
          const viewport = viewportRef.current;
          if (viewport) setScrollState({ overflowing: viewport.scrollHeight > viewport.clientHeight + 2, top: viewport.scrollTop, maximum: Math.max(0, viewport.scrollHeight - viewport.clientHeight), viewport: viewport.clientHeight, content: viewport.scrollHeight });
        }} />
      </div>
      {scrollState.overflowing ? <div ref={trackRef} className="native-readable-text-scroll-control" role="scrollbar" aria-label="Readable text vertical scroll" aria-controls={`${document.activityId}-readable-scroll`} aria-orientation="vertical" aria-valuemin={0} aria-valuemax={Math.round(scrollState.maximum)} aria-valuenow={Math.round(scrollState.top)} tabIndex={0} onKeyDown={scrollControlKeyDown} onPointerDown={(event) => { if (event.target === event.currentTarget) scrollFromTrackPoint(event.clientY); }}><span className="native-readable-text-scroll-thumb" style={{ "--scroll-thumb-size": `${Math.max(0.34, scrollState.viewport / Math.max(1, scrollState.content)) * 100}%`, "--scroll-progress": `${scrollState.maximum ? scrollState.top / scrollState.maximum : 0}` }} onPointerDown={beginThumbDrag} onPointerMove={moveThumb} onPointerUp={endThumb} onPointerCancel={endThumb} /></div> : null}
    </section> : null}
    {effectiveView === "video" && videoReference ? <div className="native-video-presentation-view"><NativeVideoPlayer video={document.video} src={assetUrl(videoReference.assetId)} /></div> : null}
    {internalNavigation ? <nav className="native-supplementary-navigation" aria-label="Activity presentation">
      {available ? <button type="button" aria-pressed={effectiveView === "text"} onClick={() => setView((current) => nextNativeSupplementaryView(current, "toggle-text", { readableText: available, video: videoAvailable }))}>{effectiveView === "text" ? "Questions" : "Read Text"}</button> : null}
      {videoAvailable ? <button type="button" aria-pressed={effectiveView === "video"} onClick={() => setView((current) => nextNativeSupplementaryView(current, "toggle-video", { readableText: available, video: videoAvailable }))}>{effectiveView === "video" ? "Questions" : "Video"}</button> : null}
    </nav> : null}
  </div>;
}
