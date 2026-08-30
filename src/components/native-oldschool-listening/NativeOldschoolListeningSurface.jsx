import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LegacyListeningPlayer } from "../listening-player/LegacyListeningPlayer.jsx";
import { NativeOpenResponseStudentSurface } from "../native-open-response/NativeOpenResponseStudentSurface.jsx";
import { NativeOpenResponseTeacherSurface } from "../native-open-response/NativeOpenResponseTeacherSurface.jsx";
import { formatNativeListeningTime } from "../native-listening/nativeListeningRuntime.js";
import { nativeListeningPlayerAssets } from "../native-listening/nativeListeningPlayerAssets.js";
import { findNativeOldschoolListeningCue, nativeOldschoolListeningCueScrollY, nativeOldschoolListeningFragmentFontSize, nativeOldschoolListeningRegionStyle, nativeOldschoolListeningScrollTarget, nativeOldschoolListeningTranscriptFragments } from "./nativeOldschoolListeningRuntime.js";
import "./nativeOldschoolListening.css";

function referenceForSlot(document, slot) { return document.assets.find((asset) => asset.slot === slot) || null; }

function asOpenResponseDocument(document) {
  const interaction = document.parts[0].interaction;
  return { ...document, kind: "open-response", parts: [{ ...document.parts[0], interaction: { kind: "open-response", surface: { width: interaction.panels[0].sourceWidth, height: interaction.panels[0].sourceHeight }, artwork: interaction.artwork, questions: interaction.questions } }] };
}

function OldschoolPage({ document, interaction, assetUrl, highlightedCueIds, pageViewportRef, pageCanvasRef }) {
  const panel = interaction.panels[1];
  const pageReference = referenceForSlot(document, panel.pageAssetSlot);
  const highlighted = new Set(highlightedCueIds);
  const highlightedCues = interaction.cues.filter((cue) => highlighted.has(cue.id));
  const transcriptFragments = nativeOldschoolListeningTranscriptFragments(interaction.cues);
  const exactRegionIds = new Set(transcriptFragments.filter((fragment) => fragment.exact).map((fragment) => fragment.regionId));
  return <section className="native-oldschool-listening-page-panel" aria-label="Synchronized listening page">
    <div ref={pageViewportRef} className="native-oldschool-listening-page-viewport" tabIndex="0" aria-label="Scrollable synchronized listening page">
      <div ref={pageCanvasRef} className="native-oldschool-listening-page-canvas" style={{ aspectRatio: `${panel.sourceWidth}/${panel.sourceHeight}` }}>
        {pageReference ? <img src={assetUrl(pageReference.assetId)} alt={panel.altText} draggable="false" /> : <p role="alert">Listening page image is unavailable.</p>}
        <svg className="native-oldschool-listening-transcript" viewBox={`0 0 ${panel.sourceWidth} ${panel.sourceHeight}`} preserveAspectRatio="none" aria-hidden="true">
          {transcriptFragments.filter((fragment) => fragment.text).map((fragment) => <foreignObject key={fragment.regionId} x={fragment.x} y={fragment.y} width={fragment.width} height={fragment.height} className="native-oldschool-listening-transcript-fragment" data-cue-id={fragment.cueId} data-region-id={fragment.regionId} data-exact={fragment.exact ? "true" : "false"} data-highlighted={fragment.exact && highlighted.has(fragment.cueId) ? "true" : "false"}><div xmlns="http://www.w3.org/1999/xhtml" style={{ fontSize: `${nativeOldschoolListeningFragmentFontSize(fragment)}px` }}>{fragment.exact ? <span className={`native-oldschool-listening-exact-text${highlighted.has(fragment.cueId) ? " is-active" : ""}`}>{fragment.text}</span> : fragment.text}</div></foreignObject>)}
        </svg>
        {highlightedCues.flatMap((cue) => cue.highlightRegions.filter((region) => !exactRegionIds.has(region.id)).map((region) => <div key={region.id} className="native-oldschool-listening-highlight" style={nativeOldschoolListeningRegionStyle(region, { width: panel.sourceWidth, height: panel.sourceHeight })} data-cue-id={cue.id} data-region-id={region.id} aria-hidden="true" />))}
      </div>
    </div>
    <p className="native-oldschool-listening-live" aria-live="polite">{highlightedCues.map((cue) => cue.text).join(" ")}</p>
  </section>;
}

export function NativeOldschoolListeningSurface({ publicDocument, teacherDocument = null, assetUrl = () => "", responses = null, initialResponses = null, onResponsesChange = null, readOnly = false, presentation = null }) {
  const interaction = publicDocument.parts[0].interaction;
  const [view, setView] = useState("questions");
  const [currentMs, setCurrentMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [focusedCueIds, setFocusedCueIds] = useState([]);
  const [revealState, setRevealState] = useState({ supported: Boolean(teacherDocument), total: interaction.questions.length, revealed: 0, pristine: true });
  const audioRef = useRef(null); const pageViewportRef = useRef(null); const pageCanvasRef = useRef(null); const lastCommand = useRef(null); const raf = useRef(0); const lastSample = useRef(0);
  const audioReference = referenceForSlot(publicDocument, interaction.audioAssetSlot);
  const audioUrl = audioReference ? assetUrl(audioReference.assetId) : "";
  const openResponsePublic = useMemo(() => asOpenResponseDocument(publicDocument), [publicDocument]);
  const openResponseTeacher = useMemo(() => teacherDocument ? { ...teacherDocument, kind: "open-response", parts: [{ ...teacherDocument.parts[0], solution: { ...teacherDocument.parts[0].solution, kind: "open-response" } }] } : null, [teacherDocument]);
  const activeCue = useMemo(() => findNativeOldschoolListeningCue(interaction.cues, currentMs), [currentMs, interaction.cues]);
  const highlightedCueIds = focusedCueIds.length ? focusedCueIds : activeCue ? [activeCue.id] : [];

  const selectSnippet = useCallback((id) => {
    const hotspot = interaction.snippetHotspots.find((entry) => entry.id === id);
    if (!hotspot) return;
    setFocusedCueIds(hotspot.cueIds); setView("page");
    const first = interaction.cues.find((cue) => cue.id === hotspot.cueIds[0]);
    if (first && audioRef.current) { audioRef.current.currentTime = first.startMs / 1_000; setCurrentMs(first.startMs); }
  }, [interaction.cues, interaction.snippetHotspots]);
  const hotspotPresentation = useMemo(() => ({ hotspots: interaction.snippetHotspots.map((hotspot) => ({ ...hotspot, panelId: null, activityArea: hotspot.area })), activeHotspotId: null, onToggle: selectSnippet }), [interaction.snippetHotspots, selectSnippet]);
  const onOpenResponseState = useCallback((state) => { if (state?.reveal) setRevealState(state.reveal); }, []);
  const openResponsePresentation = useMemo(() => presentation ? { command: presentation.command, onStateChange: onOpenResponseState } : null, [onOpenResponseState, presentation?.command]);

  useEffect(() => {
    if (!playing) return undefined;
    const sample = (timestamp) => {
      if (timestamp - lastSample.current >= 32 && audioRef.current) { lastSample.current = timestamp; setCurrentMs(Math.round(audioRef.current.currentTime * 1_000)); }
      raf.current = requestAnimationFrame(sample);
    };
    raf.current = requestAnimationFrame(sample);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);

  useEffect(() => {
    if (view !== "page" || !highlightedCueIds.length || !pageViewportRef.current || !pageCanvasRef.current) return;
    const cue = interaction.cues.find((entry) => entry.id === highlightedCueIds[0]);
    const targetY = nativeOldschoolListeningCueScrollY(cue);
    const pane = pageViewportRef.current; const canvas = pageCanvasRef.current;
    const target = nativeOldschoolListeningScrollTarget({ targetY, sourceHeight: interaction.panels[1].sourceHeight, renderedHeight: canvas.offsetHeight, scrollTop: pane.scrollTop, viewportHeight: pane.clientHeight });
    if (Math.abs(target - pane.scrollTop) > 1) pane.scrollTo({ top: target, behavior: globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth" });
  }, [highlightedCueIds.join("\0"), interaction.cues, interaction.panels, view]);

  const reset = useCallback(() => {
    audioRef.current?.pause(); if (audioRef.current) audioRef.current.currentTime = 0;
    setPlaying(false); setCurrentMs(0); setView("questions"); setFocusedCueIds([]);
  }, []);

  useEffect(() => { reset(); }, [interaction.audioAssetSlot, publicDocument.activityId, reset]);
  useEffect(() => {
    const command = presentation?.command;
    if (!command || command.token === lastCommand.current) return;
    lastCommand.current = command.token;
    if (command.type === "reset-activity") reset();
    if (command.type === "previous-panel") { setView("questions"); setFocusedCueIds([]); }
    if (command.type === "next-panel") { setView("page"); setFocusedCueIds([]); }
    if (command.type === "toggle-text") { setView((current) => current === "page" ? "questions" : "page"); setFocusedCueIds([]); }
  }, [presentation?.command, reset]);
  useEffect(() => { presentation?.onStateChange?.({ view: view === "page" ? "text" : "questions", readableTextAvailable: true, panelNavigationActive: true, panelIndex: view === "page" ? 1 : 0, panelCount: 2, reveal: teacherDocument ? revealState : { supported: false, total: 0, revealed: 0, pristine: true } }); }, [presentation?.onStateChange, revealState, teacherDocument, view]);

  const play = () => { if (!audioRef.current || !audioUrl) return; setView("page"); setFocusedCueIds([]); if (audioRef.current.ended || currentMs >= interaction.audioDurationMs) { audioRef.current.currentTime = 0; setCurrentMs(0); } setAudioError(false); audioRef.current.play().catch(() => setAudioError(true)); };
  const pause = () => audioRef.current?.pause();
  const seek = (nextMs) => { if (!audioRef.current || !Number.isFinite(nextMs)) return; audioRef.current.currentTime = nextMs / 1_000; setCurrentMs(nextMs); setView("page"); setFocusedCueIds([]); };
  const toggleMute = () => { const next = !muted; setMuted(next); if (audioRef.current) audioRef.current.muted = next; };

  return <div className="native-oldschool-listening" data-panel={view === "questions" ? 1 : 2} data-view={view}>
    <div className="native-oldschool-listening-local-stage">
      <div className="native-oldschool-listening-activity-stage" style={{ aspectRatio: `${interaction.panels[0].sourceWidth}/${interaction.panels[0].sourceHeight}` }}>
        {view === "questions" && !teacherDocument ? <NativeOpenResponseStudentSurface document={openResponsePublic} assetUrl={assetUrl} responses={responses} initialResponses={initialResponses} onResponsesChange={onResponsesChange} readOnly={readOnly} audioHotspotPresentation={hotspotPresentation} /> : null}
        {view === "questions" && teacherDocument ? <NativeOpenResponseTeacherSurface publicDocument={openResponsePublic} teacherDocument={openResponseTeacher} assetUrl={assetUrl} presentation={openResponsePresentation} audioHotspotPresentation={hotspotPresentation} /> : null}
        {view === "page" ? <OldschoolPage document={publicDocument} interaction={interaction} assetUrl={assetUrl} highlightedCueIds={highlightedCueIds} pageViewportRef={pageViewportRef} pageCanvasRef={pageCanvasRef} /> : null}
        <div className="native-oldschool-listening-player-anchor"><LegacyListeningPlayer assets={nativeListeningPlayerAssets} currentMs={currentMs} durationMs={interaction.audioDurationMs} playing={playing} muted={muted} disabled={!audioUrl} formatTime={formatNativeListeningTime} onPlay={play} onPause={pause} onStop={reset} onSeek={seek} onToggleMute={toggleMute} /></div>
      </div>
    </div>
    {!audioUrl ? <p className="native-oldschool-listening-error" role="alert">Listening audio is unavailable.</p> : null}
    {audioError ? <p className="native-oldschool-listening-error" role="alert">Listening audio could not be played.</p> : null}
    <audio ref={audioRef} hidden preload="metadata" src={audioUrl} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={() => { if (audioRef.current) setCurrentMs(Math.round(audioRef.current.currentTime * 1_000)); }} onSeeked={() => { if (audioRef.current) setCurrentMs(Math.round(audioRef.current.currentTime * 1_000)); }} onEnded={reset} onError={() => setAudioError(true)} />
  </div>;
}

export function NativeOldschoolListeningStudentSurface({ document, ...props }) { return <NativeOldschoolListeningSurface publicDocument={document} {...props} />; }
export function NativeOldschoolListeningTeacherSurface(props) { return <NativeOldschoolListeningSurface {...props} />; }

