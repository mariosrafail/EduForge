import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LegacyListeningPlayer } from "../listening-player/LegacyListeningPlayer.jsx";
import { NativeOpenResponseStudentSurface } from "../native-open-response/NativeOpenResponseStudentSurface.jsx";
import { NativeOpenResponseTeacherSurface } from "../native-open-response/NativeOpenResponseTeacherSurface.jsx";
import { formatNativeListeningTime, resolveNativeListeningHighlightedCueIds, transcriptScrollTarget } from "./nativeListeningRuntime.js";
import { nativeListeningPlayerAssets } from "./nativeListeningPlayerAssets.js";
import { pauseSiblingNativeMedia } from "../native-readable-text/nativeMediaArbitration.js";
import "./nativeListening.css";

function referenceForSlot(document, slot) { return document.assets.find((asset) => asset.slot === slot) || null; }

function asOpenResponseDocument(document) {
  const listening = document.parts[0].interaction;
  return {
    ...document,
    kind: "open-response",
    parts: [{ ...document.parts[0], interaction: {
      kind: "open-response",
      surface: { width: listening.panels[0].sourceWidth, height: listening.panels[0].sourceHeight },
      artwork: listening.artwork,
      questions: listening.questions,
    } }],
  };
}

function ListeningTranscript({ document, interaction, assetUrl, highlightedCueIds, playbackFocus, cueRefs, transcriptRef }) {
  const panel = interaction.panels[1];
  const background = referenceForSlot(document, panel.backgroundAssetSlot);
  const focused = new Set(highlightedCueIds);
  const style = {
    left: `${panel.transcriptArea.x / panel.sourceWidth * 100}%`, top: `${panel.transcriptArea.y / panel.sourceHeight * 100}%`,
    width: `${panel.transcriptArea.width / panel.sourceWidth * 100}%`, height: `${panel.transcriptArea.height / panel.sourceHeight * 100}%`,
  };
  return <section className="native-listening-panel native-listening-transcript-panel" aria-label="Show Text: synchronized transcript" data-focus-mode={playbackFocus ? "playback" : "reference"}>
    <div className="native-listening-transcript-stage" style={{ backgroundImage: background ? `url(${assetUrl(background.assetId)})` : undefined }}>
      <div ref={transcriptRef} className="native-listening-transcript" style={style} tabIndex="0" aria-label="Listening transcript">
        {interaction.cues.map((cue) => {
          const playbackActive = playbackFocus && focused.has(cue.id);
          const referenceActive = !playbackFocus && focused.has(cue.id);
          return <p key={cue.id} ref={(node) => { if (node) cueRefs.current.set(cue.id, node); else cueRefs.current.delete(cue.id); }} className={playbackActive ? "is-active" : referenceActive ? "is-reference" : ""} tabIndex={referenceActive ? -1 : undefined} data-cue-id={cue.id} data-reference-focus={referenceActive || undefined} aria-current={playbackActive || referenceActive ? "true" : undefined}>{cue.text}</p>;
        })}
      </div>
    </div>
  </section>;
}

export function NativeListeningSurface({ publicDocument, teacherDocument = null, assetUrl = () => "", responses = null, initialResponses = null, onResponsesChange = null, readOnly = false, presentation = null }) {
  const interaction = publicDocument.parts[0].interaction;
  const [view, setView] = useState("questions");
  const [currentMs, setCurrentMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [playbackAssetSlot, setPlaybackAssetSlot] = useState(interaction.audioAssetSlot);
  const [playbackDurationMs, setPlaybackDurationMs] = useState(interaction.audioDurationMs);
  const [activeSnippet, setActiveSnippet] = useState(null);
  const [focusedCueIds, setFocusedCueIds] = useState([]);
  const [focusMode, setFocusMode] = useState("playback");
  const [revealState, setRevealState] = useState({ supported: Boolean(teacherDocument), total: interaction.questions.length, revealed: 0, pristine: true });
  const audioRef = useRef(null); const transcriptRef = useRef(null); const cueRefs = useRef(new Map());
  const lastCommand = useRef(null); const raf = useRef(0); const lastSample = useRef(0); const finishedRef = useRef(false); const pendingAutoplay = useRef(false);
  const audioReference = referenceForSlot(publicDocument, playbackAssetSlot);
  const audioUrl = audioReference ? assetUrl(audioReference.assetId) : "";
  const openResponsePublic = useMemo(() => asOpenResponseDocument(publicDocument), [publicDocument]);
  const openResponseTeacher = useMemo(() => teacherDocument ? { ...teacherDocument, kind: "open-response", parts: [{ ...teacherDocument.parts[0], solution: { ...teacherDocument.parts[0].solution, kind: "open-response" } }] } : null, [teacherDocument]);
  const playbackFocus = focusMode === "playback";
  const highlightedCueIds = useMemo(() => resolveNativeListeningHighlightedCueIds({ cues: interaction.cues, milliseconds: currentMs, focusMode, focusedCueIds }), [currentMs, focusMode, focusedCueIds, interaction.cues]);

  const selectSnippet = useCallback((id) => {
    const hotspot = interaction.snippetHotspots.find((entry) => entry.id === id);
    if (!hotspot) return;
    setActiveSnippet(id); setFocusedCueIds(hotspot.cueIds); setFocusMode("reference"); setView("transcript");
    if (hotspot.audioAssetSlot) {
      const audio = audioRef.current;
      audio?.pause(); if (audio) audio.currentTime = 0;
      finishedRef.current = false; setCurrentMs(0); setAudioError(false);
      if (playbackAssetSlot === hotspot.audioAssetSlot) audio?.play().catch(() => setAudioError(true));
      else { setPlaybackDurationMs(0); pendingAutoplay.current = true; setPlaybackAssetSlot(hotspot.audioAssetSlot); }
    } else {
      const audio = audioRef.current;
      audio?.pause(); if (audio) audio.currentTime = 0;
      finishedRef.current = false; pendingAutoplay.current = false; setCurrentMs(0); setAudioError(false);
      setPlaybackDurationMs(interaction.audioDurationMs); setPlaybackAssetSlot(interaction.audioAssetSlot);
    }
  }, [interaction.snippetHotspots, playbackAssetSlot]);
  const hotspotPresentation = useMemo(() => ({ hotspots: interaction.snippetHotspots.map((hotspot) => ({ ...hotspot, panelId: null, activityArea: hotspot.area })), activeHotspotId: activeSnippet, onToggle: selectSnippet }), [activeSnippet, interaction.snippetHotspots, selectSnippet]);
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

  const scrollCueId = highlightedCueIds[0];
  useEffect(() => {
    if (view !== "transcript" || !scrollCueId || !transcriptRef.current) return;
    const pane = transcriptRef.current; const node = cueRefs.current.get(scrollCueId); if (!node) return;
    const target = transcriptScrollTarget({ cueTop: node.offsetTop, cueBottom: node.offsetTop + node.offsetHeight, scrollTop: pane.scrollTop, viewportHeight: pane.clientHeight, scrollHeight: pane.scrollHeight });
    if (Math.abs(target - pane.scrollTop) > 1) pane.scrollTo({ top: target, behavior: globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth" });
    node.focus?.({ preventScroll: true });
  }, [scrollCueId, view]);

  useEffect(() => {
    const audio = audioRef.current;
    audio?.pause(); if (audio) audio.currentTime = 0;
    setPlaybackAssetSlot(interaction.audioAssetSlot); setPlaybackDurationMs(interaction.audioDurationMs); setCurrentMs(0); setPlaying(false); pendingAutoplay.current = false;
  }, [interaction.audioAssetSlot, publicDocument.activityId]);

  useEffect(() => {
    if (!pendingAutoplay.current || !audioUrl || !audioRef.current) return;
    pendingAutoplay.current = false;
    audioRef.current.load();
    audioRef.current.play().catch(() => setAudioError(true));
  }, [audioUrl]);

  useEffect(() => {
    const command = presentation?.command;
    if (!command || command.token === lastCommand.current) return;
    lastCommand.current = command.token;
    if (command.type === "reset-activity") {
      audioRef.current?.pause(); if (audioRef.current) audioRef.current.currentTime = 0;
      finishedRef.current = false; setCurrentMs(0); setView("questions"); setFocusMode("playback"); setFocusedCueIds([]); setActiveSnippet(null);
    }
    if (command.type === "previous-panel") { setView("questions"); setFocusMode("playback"); setFocusedCueIds([]); setActiveSnippet(null); }
    if (command.type === "next-panel") { setView("transcript"); setFocusMode("playback"); setFocusedCueIds([]); setActiveSnippet(null); }
    if (command.type === "toggle-text") { setView((current) => current === "transcript" ? "questions" : "transcript"); setFocusMode("playback"); setFocusedCueIds([]); setActiveSnippet(null); }
  }, [presentation?.command]);

  useEffect(() => {
    presentation?.onStateChange?.({ view: view === "transcript" ? "text" : "questions", readableTextAvailable: true, panelNavigationActive: true, panelIndex: view === "transcript" ? 1 : 0, panelCount: interaction.panels.length, reveal: teacherDocument ? revealState : { supported: false, total: 0, revealed: 0, pristine: true } });
  }, [interaction.panels.length, presentation?.onStateChange, revealState, teacherDocument, view]);

  const play = () => {
    const audio = audioRef.current; if (!audio || !audioUrl) return;
    const isMainTrack = playbackAssetSlot === interaction.audioAssetSlot;
    setView("transcript"); setFocusMode(isMainTrack ? "playback" : "reference");
    if (isMainTrack) { setActiveSnippet(null); setFocusedCueIds([]); }
    if (finishedRef.current || audio.ended || (playbackDurationMs > 0 && currentMs >= playbackDurationMs)) { audio.currentTime = 0; setCurrentMs(0); }
    finishedRef.current = false; setAudioError(false); audio.play().catch(() => setAudioError(true));
  };
  const pause = () => audioRef.current?.pause();
  const stop = () => { const audio = audioRef.current; audio?.pause(); if (audio) audio.currentTime = 0; finishedRef.current = false; setCurrentMs(0); setView("questions"); setFocusMode("playback"); setActiveSnippet(null); setFocusedCueIds([]); };
  const seek = (nextMs) => { if (!audioRef.current || !Number.isFinite(nextMs)) return; const isMainTrack = playbackAssetSlot === interaction.audioAssetSlot; audioRef.current.currentTime = nextMs / 1_000; finishedRef.current = false; setCurrentMs(nextMs); setView("transcript"); setFocusMode(isMainTrack ? "playback" : "reference"); if (isMainTrack) { setActiveSnippet(null); setFocusedCueIds([]); } };
  const toggleMute = () => { const next = !muted; setMuted(next); if (audioRef.current) audioRef.current.muted = next; };

  return <div className="native-listening" data-panel={view === "questions" ? 1 : 2} data-view={view}>
    <div className="native-listening-local-stage">
      <div className="native-listening-activity-stage" style={{ aspectRatio: `${interaction.panels[0].sourceWidth} / ${interaction.panels[0].sourceHeight}`, "--native-listening-stage-ratio": interaction.panels[0].sourceWidth / interaction.panels[0].sourceHeight }}>
        {view === "questions" && !teacherDocument ? <NativeOpenResponseStudentSurface document={openResponsePublic} assetUrl={assetUrl} responses={responses} initialResponses={initialResponses} onResponsesChange={onResponsesChange} readOnly={readOnly} audioHotspotPresentation={hotspotPresentation} /> : null}
        {view === "questions" && teacherDocument ? <NativeOpenResponseTeacherSurface publicDocument={openResponsePublic} teacherDocument={openResponseTeacher} assetUrl={assetUrl} presentation={openResponsePresentation} audioHotspotPresentation={hotspotPresentation} /> : null}
        {view === "transcript" ? <ListeningTranscript document={publicDocument} interaction={interaction} assetUrl={assetUrl} highlightedCueIds={highlightedCueIds} playbackFocus={playbackFocus} cueRefs={cueRefs} transcriptRef={transcriptRef} /> : null}
        <div className="native-listening-player-anchor"><LegacyListeningPlayer assets={nativeListeningPlayerAssets} currentMs={currentMs} durationMs={playbackDurationMs} playing={playing} muted={muted} disabled={!audioUrl} formatTime={formatNativeListeningTime} onPlay={play} onPause={pause} onStop={stop} onSeek={seek} onToggleMute={toggleMute} /></div>
      </div>
    </div>
    {!audioUrl ? <p className="native-listening-error" role="alert">Listening audio is unavailable.</p> : null}
    {audioError ? <p className="native-listening-error" role="alert">Listening audio could not be played.</p> : null}
    <audio ref={audioRef} hidden preload="metadata" src={audioUrl} onLoadedMetadata={() => { const duration = Math.round((audioRef.current?.duration || 0) * 1_000); if (duration > 0) setPlaybackDurationMs(duration); }} onPlay={(event) => { pauseSiblingNativeMedia(event.currentTarget); setPlaying(true); }} onPause={() => { setPlaying(false); if (audioRef.current) setCurrentMs(Math.round(audioRef.current.currentTime * 1_000)); }} onTimeUpdate={() => { if (audioRef.current) setCurrentMs(Math.round(audioRef.current.currentTime * 1_000)); }} onSeeked={() => { if (audioRef.current) setCurrentMs(Math.round(audioRef.current.currentTime * 1_000)); }} onEnded={() => { finishedRef.current = true; setPlaying(false); setCurrentMs(playbackDurationMs); }} onError={() => setAudioError(true)} />
  </div>;
}

export function NativeListeningStudentSurface({ document, ...props }) { return <NativeListeningSurface publicDocument={document} {...props} />; }
export function NativeListeningTeacherSurface(props) { return <NativeListeningSurface {...props} />; }
