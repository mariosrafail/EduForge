import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { NativeAudioTextFocusContent } from "./NativeAudioTextHotspots.jsx";
import "./nativeReadableText.css";

export function nextNativeReadableTextView(current, commandType, available) {
  if (commandType === "toggle-text" && available) return current === "text" ? "questions" : "text";
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
  const [view, setView] = useState("questions");
  const [activityState, setActivityState] = useState(() => defaultActivityState(document));
  const [activeHotspotId, setActiveHotspotId] = useState(null);
  const viewportRef = useRef(null);
  const [overflowing, setOverflowing] = useState(false);
  const lastCommandToken = useRef(presentation?.command?.token);
  const onStateChange = presentation?.onStateChange;

  useEffect(() => {
    setView("questions");
    setActivityState(defaultActivityState(document));
    setOverflowing(false);
    setActiveHotspotId(null);
    lastCommandToken.current = presentation?.command?.token;
  }, [document.activityId]);

  useEffect(() => {
    const command = presentation?.command;
    if (!command || command.token === lastCommandToken.current) return;
    lastCommandToken.current = command.token;
    if (["toggle-text", "reset-activity", "show-all", "show-next", "previous-panel", "next-panel"].includes(command.type)) setActiveHotspotId(null);
    setView((current) => nextNativeReadableTextView(current, command.type, available));
  }, [available, presentation?.command]);

  const onChildStateChange = useCallback((value) => {
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
    onStateChange?.({
      view: available ? view : "questions",
      readableTextAvailable: available,
      panelIndex: activityState.panelIndex,
      panelCount: activityState.panelCount,
      reveal: activityState.reveal,
      audioFocusActive: Boolean(activeHotspot),
    });
  }, [activeHotspot, activityState, available, onStateChange, view]);

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
    const update = () => setOverflowing(viewport.scrollHeight > viewport.clientHeight + 2);
    update();
    globalThis.addEventListener("resize", update);
    if (typeof ResizeObserver === "undefined") return () => globalThis.removeEventListener("resize", update);
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild);
    return () => { observer.disconnect(); globalThis.removeEventListener("resize", update); };
  }, [document.activityId, view]);

  const reference = available ? document.assets.find((asset) => asset.slot === document.readableText.assetSlot) : null;
  const effectiveView = available ? view : "questions";
  const activity = typeof children === "function" ? children(childPresentation, hotspotPresentation) : children;
  const focusOpen = effectiveView === "questions" && Boolean(activeHotspot);
  return <div className="native-readable-text-presentation" data-readable-text-available={available || undefined} data-presentation-view={effectiveView} data-audio-focus={focusOpen || undefined}>
    <div className="native-audio-text-focus-slot" hidden={!focusOpen}>{focusOpen ? <NativeAudioTextFocusContent document={document} hotspot={activeHotspot} assetUrl={assetUrl} autoPlay /> : null}</div>
    <div className={`native-readable-text-activity-view${focusOpen ? " is-audio-focus" : ""}`} hidden={effectiveView === "text"}>{activity}</div>
    {effectiveView === "text" && reference ? <section className="native-readable-text-view" aria-label="Readable text">
      <div ref={viewportRef} className="native-readable-text-scroll" tabIndex={0} data-overflowing={overflowing || undefined}>
        <img src={assetUrl(reference.assetId)} alt={document.readableText.altText} width={document.readableText.sourceWidth} height={document.readableText.sourceHeight} onLoad={() => {
          const viewport = viewportRef.current;
          if (viewport) setOverflowing(viewport.scrollHeight > viewport.clientHeight + 2);
        }} />
      </div>
      {overflowing ? <span className="native-readable-text-scroll-affordance" aria-hidden="true">SCROLL ↓</span> : null}
    </section> : null}
  </div>;
}
