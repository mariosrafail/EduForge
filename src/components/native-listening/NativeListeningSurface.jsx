import { useEffect, useMemo, useRef, useState } from "react";

import { NativeAudioTextHotspotButtons } from "../native-readable-text/NativeAudioTextHotspots.jsx";
import { findNativeListeningCue, formatNativeListeningTime, transcriptScrollTarget } from "./nativeListeningRuntime.js";
import "./nativeListening.css";

function referenceForSlot(document, slot) { return document.assets.find((asset) => asset.slot === slot) || null; }

function ListeningPlayer({ audioRef, audioUrl, durationMs, panelIndex, setPanelIndex, currentMs, setCurrentMs, playing, setAudioError, finishedRef }) {
  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (audio.paused) {
      setPanelIndex(1);
      if (finishedRef.current || audio.ended || (durationMs > 0 && (currentMs >= durationMs || audio.currentTime * 1_000 >= durationMs))) {
        audio.currentTime = 0;
        setCurrentMs(0);
      }
      finishedRef.current = false;
      setAudioError(false);
      const promise = audio.play();
      if (promise?.catch) promise.catch(() => setAudioError(true));
    } else audio.pause();
  };
  const seek = (event) => {
    const next = Number(event.target.value);
    if (!audioRef.current || !Number.isFinite(next)) return;
    audioRef.current.currentTime = next / 1_000;
    finishedRef.current = false;
    setCurrentMs(next);
  };
  return <div className="native-listening-player" data-panel={panelIndex + 1}>
    <button type="button" className="native-listening-play" onClick={togglePlay} disabled={!audioUrl} aria-label={playing ? "Pause Listening audio" : "Play Listening audio"}>{playing ? "Pause" : "Play"}</button>
    <input type="range" min="0" max={Math.max(durationMs, 1)} step="100" value={Math.min(currentMs, Math.max(durationMs, 1))} onChange={seek} aria-label="Listening audio position" disabled={!audioUrl || !durationMs} />
    <output aria-label="Listening audio time">{formatNativeListeningTime(currentMs)} / {formatNativeListeningTime(durationMs)}</output>
  </div>;
}

function ListeningQuestions({ interaction, responses, updateResponse, readOnly, modelAnswers, revealed, toggleReveal, activeSnippet, setActiveSnippet }) {
  const snippetPresentation = {
    hotspots: interaction.snippetHotspots.map((hotspot) => ({ ...hotspot, panelId: null, activityArea: hotspot.area })),
    activeHotspotId: activeSnippet,
    onToggle: (id) => setActiveSnippet((current) => current === id ? null : id),
  };
  const selectedSnippet = interaction.snippetHotspots.find((hotspot) => hotspot.id === activeSnippet);
  const cueById = new Map(interaction.cues.map((cue) => [cue.id, cue]));
  const surface = { width: interaction.panels[0].sourceWidth, height: interaction.panels[0].sourceHeight };
  return <section className="native-listening-panel native-listening-questions" aria-label="Panel 1: Questions">
    <div className="native-listening-snippet-space" aria-live="polite">
      {selectedSnippet ? <blockquote>{selectedSnippet.cueIds.map((id) => cueById.get(id)?.text).filter(Boolean).join(" ")}</blockquote> : <p>Use a transcript control to focus an excerpt, or press Play to begin.</p>}
    </div>
    <div className="native-listening-question-list">
      {interaction.questions.map((question, index) => <label key={question.id} className="native-listening-question">
        <strong>{index + 1}. {question.prompt}</strong>
        {modelAnswers ? <button type="button" className="native-listening-model-answer" aria-pressed={revealed.has(question.id)} onClick={() => toggleReveal(question.id)}>{revealed.has(question.id) ? modelAnswers.get(question.id) : "Reveal model answer"}</button> : <textarea aria-label={`Response to question ${index + 1}`} value={responses.get(question.id) || ""} readOnly={readOnly} onChange={(event) => updateResponse(question.id, event.target.value)} />}
      </label>)}
      {!interaction.questions.length ? <p>No pre-listening questions.</p> : null}
    </div>
    <div className="native-listening-snippet-stage" style={{ aspectRatio: `${surface.width} / ${surface.height}` }}>
      <NativeAudioTextHotspotButtons surface={surface} presentation={snippetPresentation} />
    </div>
  </section>;
}

function ListeningTranscript({ document, interaction, assetUrl, activeCueId, cueRefs, transcriptRef }) {
  const panel = interaction.panels[1];
  const background = referenceForSlot(document, panel.backgroundAssetSlot);
  const style = {
    left: `${panel.transcriptArea.x / panel.sourceWidth * 100}%`,
    top: `${panel.transcriptArea.y / panel.sourceHeight * 100}%`,
    width: `${panel.transcriptArea.width / panel.sourceWidth * 100}%`,
    height: `${panel.transcriptArea.height / panel.sourceHeight * 100}%`,
  };
  return <section className="native-listening-panel native-listening-transcript-panel" aria-label="Panel 2: Synchronized transcript">
    <div className="native-listening-transcript-stage" style={{ aspectRatio: `${panel.sourceWidth} / ${panel.sourceHeight}`, backgroundImage: background ? `url(${assetUrl(background.assetId)})` : undefined }}>
      <div ref={transcriptRef} className="native-listening-transcript" style={style} tabIndex="0" aria-label="Listening transcript">
        {interaction.cues.map((cue) => <p key={cue.id} ref={(node) => { if (node) cueRefs.current.set(cue.id, node); else cueRefs.current.delete(cue.id); }} className={cue.id === activeCueId ? "is-active" : ""} data-cue-id={cue.id} aria-current={cue.id === activeCueId ? "true" : undefined}>{cue.text}</p>)}
      </div>
    </div>
  </section>;
}

export function NativeListeningSurface({ publicDocument, teacherDocument = null, assetUrl = () => "", responses: controlledResponses = null, initialResponses = null, onResponsesChange = null, readOnly = false, presentation = null }) {
  const interaction = publicDocument.parts[0].interaction;
  const [panelIndex, setPanelIndex] = useState(0);
  const [currentMs, setCurrentMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [activeSnippet, setActiveSnippet] = useState(null);
  const [localResponses, setLocalResponses] = useState(() => new Map(Object.entries(initialResponses || {})));
  const [revealed, setRevealed] = useState(() => new Set());
  const audioRef = useRef(null);
  const transcriptRef = useRef(null);
  const cueRefs = useRef(new Map());
  const lastCommand = useRef(null);
  const raf = useRef(0);
  const lastSample = useRef(0);
  const finishedRef = useRef(false);
  const audioReference = referenceForSlot(publicDocument, interaction.audioAssetSlot);
  const audioUrl = audioReference ? assetUrl(audioReference.assetId) : "";
  const activeCue = useMemo(() => findNativeListeningCue(interaction.cues, currentMs), [interaction.cues, currentMs]);
  const modelAnswers = teacherDocument ? new Map(teacherDocument.parts[0].solution.modelAnswers.map((entry) => [entry.questionId, entry.text])) : null;
  const responses = controlledResponses instanceof Map ? controlledResponses : controlledResponses && typeof controlledResponses === "object" ? new Map(Object.entries(controlledResponses)) : localResponses;
  const updateResponse = (questionId, value) => {
    const next = new Map(responses).set(questionId, value);
    if (controlledResponses === null) setLocalResponses(next);
    onResponsesChange?.(Object.fromEntries(next));
  };

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
    if (panelIndex !== 1 || !activeCue || !transcriptRef.current) return;
    const pane = transcriptRef.current;
    const node = cueRefs.current.get(activeCue.id);
    if (!node) return;
    const target = transcriptScrollTarget({ cueTop: node.offsetTop, cueBottom: node.offsetTop + node.offsetHeight, scrollTop: pane.scrollTop, viewportHeight: pane.clientHeight, scrollHeight: pane.scrollHeight });
    if (Math.abs(target - pane.scrollTop) > 1) pane.scrollTo({ top: target, behavior: globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth" });
  }, [activeCue?.id, panelIndex]);

  useEffect(() => {
    const command = presentation?.command;
    if (!command || command.token === lastCommand.current) return;
    lastCommand.current = command.token;
    if (command.type === "reset-activity") { setRevealed(new Set()); setPanelIndex(0); finishedRef.current = false; if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; } setCurrentMs(0); }
    if (command.type === "show-all") setRevealed(new Set(interaction.questions.map((question) => question.id)));
    if (command.type === "show-next") setRevealed((current) => { const nextId = interaction.questions.find((question) => !current.has(question.id))?.id; return nextId ? new Set(current).add(nextId) : current; });
  }, [presentation?.command, interaction.questions]);

  useEffect(() => {
    presentation?.onStateChange?.({ panelIndex, panelCount: 2, reveal: teacherDocument ? { supported: true, total: interaction.questions.length, revealed: revealed.size, pristine: revealed.size === 0 } : { supported: false, total: 0, revealed: 0, pristine: true } });
  }, [panelIndex, presentation?.onStateChange, revealed, teacherDocument, interaction.questions.length]);

  const toggleReveal = (id) => setRevealed((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return <div className="native-listening" data-panel={panelIndex + 1}>
    <div className="native-listening-panel-tabs" role="tablist" aria-label="Listening panels">
      <button type="button" role="tab" aria-selected={panelIndex === 0} onClick={() => setPanelIndex(0)}>Panel 1</button>
      <button type="button" role="tab" aria-selected={panelIndex === 1} onClick={() => setPanelIndex(1)}>Panel 2</button>
    </div>
    {panelIndex === 0 ? <ListeningQuestions {...{ interaction, responses, updateResponse, readOnly, modelAnswers, revealed, toggleReveal, activeSnippet, setActiveSnippet }} /> : <ListeningTranscript {...{ document: publicDocument, interaction, assetUrl, activeCueId: activeCue?.id || null, cueRefs, transcriptRef }} />}
    {!audioUrl ? <p className="native-listening-error" role="alert">Listening audio is unavailable.</p> : null}
    {audioError ? <p className="native-listening-error" role="alert">Listening audio could not be played.</p> : null}
    <ListeningPlayer {...{ audioRef, audioUrl, durationMs: interaction.audioDurationMs, panelIndex, setPanelIndex, currentMs, setCurrentMs, playing, setAudioError, finishedRef }} />
    <audio ref={audioRef} hidden preload="metadata" src={audioUrl} onPlay={() => setPlaying(true)} onPause={() => { setPlaying(false); if (audioRef.current) setCurrentMs(Math.round(audioRef.current.currentTime * 1_000)); }} onTimeUpdate={() => { if (audioRef.current) setCurrentMs(Math.round(audioRef.current.currentTime * 1_000)); }} onSeeked={() => { if (audioRef.current) setCurrentMs(Math.round(audioRef.current.currentTime * 1_000)); }} onEnded={() => { finishedRef.current = true; setPlaying(false); setCurrentMs(interaction.audioDurationMs); }} onError={() => setAudioError(true)} />
  </div>;
}

export function NativeListeningStudentSurface({ document, ...props }) { return <NativeListeningSurface publicDocument={document} {...props} />; }
export function NativeListeningTeacherSurface(props) { return <NativeListeningSurface {...props} />; }
