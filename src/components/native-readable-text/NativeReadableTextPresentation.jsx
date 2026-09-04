import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { NativeAudioTextFocusContent } from "./NativeAudioTextHotspots.jsx";
import { NativeVerticalScrollViewport } from "./NativeVerticalScrollViewport.jsx";
import { NativeVideoPlayer } from "../native-video/NativeVideoPlayer.jsx";
import { NativeVideoWorksheetAction, openNativeVideoWorksheet } from "../native-video/NativeVideoWorksheetAction.jsx";
import { NativeSupplementalAudioPresentation } from "./NativeSupplementalAudioPresentation.jsx";
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
    panelNavigationActive: source.panelNavigationActive === true,
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
  const [worksheetMessage, setWorksheetMessage] = useState("");
  const activityViewRef = useRef(null);
  const worksheetDetailsRef = useRef(null);
  const lastCommandToken = useRef(presentation?.command?.token);
  const onStateChange = presentation?.onStateChange;

  useEffect(() => {
    setView("questions");
    setActivityState(defaultActivityState(document));
    setChildSupplementaryState({ view: "questions", readableTextAvailable: false });
    setActiveHotspotId(null);
    setWorksheetMessage("");
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
        && current.panelNavigationActive === next.panelNavigationActive
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
      panelNavigationActive: activityState.panelNavigationActive,
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

  const reference = available ? document.assets.find((asset) => asset.slot === document.readableText.assetSlot) : null;
  const effectiveView = view === "text" && !available || view === "video" && !videoAvailable ? "questions" : view;
  const activity = typeof children === "function" ? children(childPresentation, hotspotPresentation) : children;
  const focusOpen = effectiveView === "questions" && Boolean(activeHotspot);
  const videoReference = videoAvailable ? document.assets.find((asset) => asset.slot === document.video.assetSlot) : null;
  const worksheetReference = document.video?.worksheet ? document.assets.find((asset) => asset.slot === document.video.worksheet.assetSlot) : null;
  worksheetDetailsRef.current = worksheetReference ? { video: document.video, worksheetSrc: assetUrl(worksheetReference.assetId) } : null;
  const openWorksheet = useCallback(() => {
    const details = worksheetDetailsRef.current;
    if (!details) return;
    setWorksheetMessage("");
    openNativeVideoWorksheet(details).catch(() => setWorksheetMessage("Video Worksheet could not be saved."));
  }, []);
  const externalWorksheetControl = typeof presentation?.onWorksheetActionChange === "function";
  useEffect(() => {
    if (!externalWorksheetControl) return undefined;
    presentation.onWorksheetActionChange(worksheetReference ? { id: "video-worksheet", label: "Video Worksheet", ariaLabel: "Open Video Worksheet", iconName: "videoWorksheet", onClick: openWorksheet } : null);
    return () => presentation.onWorksheetActionChange(null);
  }, [document.activityId, externalWorksheetControl, openWorksheet, presentation?.onWorksheetActionChange, worksheetReference?.assetId]);
  const internalNavigation = !presentation && (available || videoAvailable);
  const fallbackWorksheetControl = Boolean(worksheetReference) && !externalWorksheetControl;
  return <div className="native-readable-text-presentation" data-native-media-scope="" data-native-kind={document.kind} data-readable-text-available={available || undefined} data-video-available={videoAvailable || undefined} data-supplemental-audio={Boolean(document.supplementalAudio) || undefined} data-presentation-view={effectiveView} data-audio-focus={focusOpen || undefined} data-internal-navigation={internalNavigation || undefined}>
    <div className="native-audio-text-focus-slot" hidden={!focusOpen}>{focusOpen ? <NativeAudioTextFocusContent document={document} hotspot={activeHotspot} assetUrl={assetUrl} autoPlay /> : null}</div>
    <div ref={activityViewRef} className={`native-readable-text-activity-view${focusOpen ? " is-audio-focus" : ""}`} hidden={effectiveView === "text" || effectiveView === "video"}>{activity}</div>
    {effectiveView === "text" && reference ? <section className="native-readable-text-view" aria-label="Readable text">
      <NativeVerticalScrollViewport id={`${document.activityId}-readable-scroll`} className="native-readable-text-scroll" ariaLabel="Readable text vertical scroll" resetKey={`${document.activityId}:${effectiveView}`}>
        <img src={assetUrl(reference.assetId)} alt={document.readableText.altText} width={document.readableText.sourceWidth} height={document.readableText.sourceHeight} />
      </NativeVerticalScrollViewport>
    </section> : null}
    {effectiveView === "video" && videoReference ? <div className="native-video-presentation-view"><NativeVideoPlayer video={document.video} src={assetUrl(videoReference.assetId)} /></div> : null}
    <NativeSupplementalAudioPresentation document={document} assetUrl={assetUrl} presentationView={effectiveView} command={presentation?.command} />
    {worksheetMessage ? <p className="native-video-worksheet-message" role="status">{worksheetMessage}</p> : null}
    {internalNavigation || fallbackWorksheetControl ? <nav className="native-supplementary-navigation" aria-label="Activity presentation">
      {available ? <button type="button" aria-pressed={effectiveView === "text"} onClick={() => setView((current) => nextNativeSupplementaryView(current, "toggle-text", { readableText: available, video: videoAvailable }))}>{effectiveView === "text" ? "Questions" : "Read Text"}</button> : null}
      {videoAvailable ? <button type="button" aria-pressed={effectiveView === "video"} onClick={() => setView((current) => nextNativeSupplementaryView(current, "toggle-video", { readableText: available, video: videoAvailable }))}>{effectiveView === "video" ? "Questions" : "Video"}</button> : null}
      {fallbackWorksheetControl ? <NativeVideoWorksheetAction video={document.video} worksheetSrc={assetUrl(worksheetReference.assetId)} onError={setWorksheetMessage} /> : null}
    </nav> : null}
  </div>;
}
