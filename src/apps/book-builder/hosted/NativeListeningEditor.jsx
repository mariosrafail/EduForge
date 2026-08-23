import { useEffect, useMemo, useRef, useState } from "react";
import { FileUp, Plus, Trash2, Upload } from "lucide-react";

import { StageSelectionFrame } from "../../../components/builder-studio/StageSelectionFrame.jsx";
import { StudioButton, StudioField, StudioStatus } from "../../../components/builder-studio/StudioControls.jsx";
import { NativeListeningStudentSurface, NativeListeningTeacherSurface } from "../../../components/native-listening/NativeListeningSurface.jsx";
import { findNativeListeningCue, formatNativeListeningTime, parseNativeListeningDisplayTime, parseNativeListeningSrt } from "../../../components/native-listening/nativeListeningRuntime.js";
import { createNativeChildId } from "../../../data/native-activities/nativeChildIdentity.js";
import { mergeNativeManagedAssetReference, removeNativeManagedAssetReferenceIfUnused } from "../../../data/native-activities/nativeActivityPublic.js";
import { assessNativeListeningReadiness, NATIVE_LISTENING_LIMITS } from "../../../data/native-activities/nativeListening.js";
import { getBuilderContent } from "./builderContentApi.js";
import { saveNativeActivityPair, uploadNativeActivityAsset } from "./builderNativeActivityApi.js";
import { projectNativeActivityPublicForAuthoring } from "./nativeActivityAuthoringProjection.js";
import { NativeReadableTextEditor } from "./NativeReadableTextEditor.jsx";
import { NativeVideoEditor } from "./NativeVideoEditor.jsx";

const clone = (value) => structuredClone(value);
const previewRoot = (bookSlug, componentSlug, activityId, assetId) => `/builder/api/native-activities/books/${encodeURIComponent(bookSlug)}/components/${encodeURIComponent(componentSlug)}/activities/${encodeURIComponent(activityId)}/assets/${encodeURIComponent(assetId)}/preview`;

function replaceAsset(next, uploaded, previousSlot) {
  next.assets = mergeNativeManagedAssetReference(next.assets, uploaded.reference);
  if (previousSlot && previousSlot !== uploaded.reference.slot) removeNativeManagedAssetReferenceIfUnused(next, previousSlot);
}

function mediaDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = () => { URL.revokeObjectURL(url); audio.removeAttribute("src"); };
    audio.onloadedmetadata = () => { const duration = Math.round(audio.duration * 1_000); done(); Number.isSafeInteger(duration) && duration > 0 ? resolve(duration) : reject(new Error("Audio duration is unavailable.")); };
    audio.onerror = () => { done(); reject(new Error("Audio duration is unavailable.")); };
    audio.preload = "metadata"; audio.src = url;
  });
}

function ListeningTimingPlayer({ audioUrl, durationMs, cues, selectedCueId, onTime }) {
  const audioRef = useRef(null);
  const [currentMs, setCurrentMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const active = findNativeListeningCue(cues, currentMs);
  const update = () => { const value = Math.round((audioRef.current?.currentTime || 0) * 1_000); setCurrentMs(value); onTime(value); };
  return <section className="native-listening-timing-player">
    <audio ref={audioRef} hidden src={audioUrl} preload="metadata" onTimeUpdate={update} onSeeked={update} onPlay={() => setPlaying(true)} onPause={() => { setPlaying(false); update(); }} onEnded={() => setPlaying(false)} />
    <button type="button" disabled={!audioUrl} onClick={() => audioRef.current?.paused ? audioRef.current.play().catch(() => {}) : audioRef.current?.pause()}>{playing ? "Pause" : "Play"}</button>
    <input type="range" min="0" max={Math.max(durationMs,1)} step="100" value={Math.min(currentMs,Math.max(durationMs,1))} disabled={!audioUrl || !durationMs} onChange={(event) => { const value = Number(event.target.value); audioRef.current.currentTime = value / 1_000; setCurrentMs(value); onTime(value); }} aria-label="Timing playhead" />
    <output>{formatNativeListeningTime(currentMs)} / {formatNativeListeningTime(durationMs)}</output>
    <p aria-live="polite">{active ? `Active: ${active.text}` : selectedCueId ? "Selected cue is not active at the playhead." : "No active cue."}</p>
  </section>;
}

export function NativeListeningEditor({ bookSlug, componentSlug, activityId, placementLabel, onDirtyChange = () => {}, onSaved = () => {} }) {
  const [state, setState] = useState({ kind: "loading", publicRevision: 0, teacherRevision: 0, saving: false, message: "" });
  const [publicDraft, setPublicDraft] = useState(null);
  const [teacherDraft, setTeacherDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [panel, setPanel] = useState(0);
  const [preview, setPreview] = useState("author");
  const [selectedQuestionId, setSelectedQuestionId] = useState(null);
  const [selectedCueId, setSelectedCueId] = useState(null);
  const [selectedSnippetId, setSelectedSnippetId] = useState(null);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [uploading, setUploading] = useState("");
  const [readableTextIncomplete, setReadableTextIncomplete] = useState(false);
  const [videoIncomplete, setVideoIncomplete] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading", publicRevision: 0, teacherRevision: 0, saving: false, message: "" }); setPublicDraft(null); setTeacherDraft(null); setDirty(false); onDirtyChange(false);
    Promise.all([
      getBuilderContent({ bookSlug, componentSlug, resource: "native-activity-public", documentKey: activityId }, { signal: controller.signal }),
      getBuilderContent({ bookSlug, componentSlug, resource: "native-activity-teacher", documentKey: activityId }, { signal: controller.signal }),
    ]).then(([publicValue, teacherValue]) => {
      if (controller.signal.aborted) return;
      setPublicDraft(projectNativeActivityPublicForAuthoring(publicValue.document)); setTeacherDraft(teacherValue.document);
      setState({ kind: "ready", publicRevision: publicValue.revision, teacherRevision: teacherValue.revision, saving: false, message: "Saved draft" });
      setSelectedQuestionId(publicValue.document.parts[0].interaction.questions[0]?.id || null);
      setSelectedCueId(publicValue.document.parts[0].interaction.cues[0]?.id || null);
    }).catch((error) => { if (!controller.signal.aborted) setState({ kind: "error", message: error.message }); });
    return () => controller.abort();
  }, [activityId, bookSlug, componentSlug]);

  const changed = () => { setDirty(true); onDirtyChange(true); };
  const mutatePublic = (mutator) => { setPublicDraft((current) => { const next = clone(current); mutator(next); return next; }); changed(); };
  const mutateTeacher = (mutator) => { setTeacherDraft((current) => { const next = clone(current); mutator(next); return next; }); changed(); };
  const mutatePair = (mutator) => { setPublicDraft((currentPublic) => { const nextPublic = clone(currentPublic); setTeacherDraft((currentTeacher) => { const nextTeacher = clone(currentTeacher); mutator(nextPublic, nextTeacher); return nextTeacher; }); return nextPublic; }); changed(); };
  const interaction = publicDraft?.parts[0].interaction;
  const questions = interaction?.questions || [];
  const cues = interaction?.cues || [];
  const snippets = interaction?.snippetHotspots || [];
  const selectedQuestion = questions.find((entry) => entry.id === selectedQuestionId) || null;
  const selectedCue = cues.find((entry) => entry.id === selectedCueId) || null;
  const selectedSnippet = snippets.find((entry) => entry.id === selectedSnippetId) || null;
  const readiness = useMemo(() => publicDraft && teacherDraft ? assessNativeListeningReadiness(publicDraft, teacherDraft) : null, [publicDraft, teacherDraft]);
  const assetUrl = (assetId) => previewRoot(bookSlug, componentSlug, activityId, assetId);
  const audioReference = publicDraft?.assets.find((asset) => asset.slot === interaction?.audioAssetSlot);
  const backgroundReference = publicDraft?.assets.find((asset) => asset.slot === interaction?.panels[1].backgroundAssetSlot);

  const addQuestion = () => { const id = createNativeChildId("q"); mutatePair((nextPublic, nextTeacher) => { nextPublic.parts[0].interaction.questions.push({ id, prompt: "" }); nextTeacher.parts[0].solution.modelAnswers.push({ questionId: id, text: "" }); }); setSelectedQuestionId(id); };
  const removeQuestion = () => { if (!selectedQuestion || !globalThis.confirm("Delete this question and its Teacher model answer?")) return; const index = questions.indexOf(selectedQuestion); mutatePair((nextPublic, nextTeacher) => { nextPublic.parts[0].interaction.questions = nextPublic.parts[0].interaction.questions.filter((entry) => entry.id !== selectedQuestion.id); nextTeacher.parts[0].solution.modelAnswers = nextTeacher.parts[0].solution.modelAnswers.filter((entry) => entry.questionId !== selectedQuestion.id); }); setSelectedQuestionId(questions[index + 1]?.id || questions[index - 1]?.id || null); };
  const moveQuestion = (offset) => mutatePair((nextPublic, nextTeacher) => { const publicItems = nextPublic.parts[0].interaction.questions; const teacherItems = nextTeacher.parts[0].solution.modelAnswers; const index = publicItems.findIndex((entry) => entry.id === selectedQuestionId); const target = index + offset; if (target < 0 || target >= publicItems.length) return; [publicItems[index], publicItems[target]] = [publicItems[target], publicItems[index]]; nextTeacher.parts[0].solution.modelAnswers = publicItems.map((question) => teacherItems.find((answer) => answer.questionId === question.id)); });

  const addCue = () => { const id = createNativeChildId("cue"); const startMs = cues.at(-1)?.endMs || 0; mutatePublic((next) => next.parts[0].interaction.cues.push({ id, startMs, endMs: startMs + 1_000, text: "New transcript cue" })); setSelectedCueId(id); };
  const removeCue = () => { if (!selectedCue) return; const index = cues.indexOf(selectedCue); mutatePublic((next) => { next.parts[0].interaction.cues = next.parts[0].interaction.cues.filter((entry) => entry.id !== selectedCue.id); next.parts[0].interaction.snippetHotspots = next.parts[0].interaction.snippetHotspots.map((hotspot) => ({ ...hotspot, cueIds: hotspot.cueIds.filter((id) => id !== selectedCue.id) })).filter((hotspot) => hotspot.cueIds.length); }); setSelectedCueId(cues[index + 1]?.id || cues[index - 1]?.id || null); };
  const moveCue = (offset) => mutatePublic((next) => { const list = next.parts[0].interaction.cues; const index = list.findIndex((entry) => entry.id === selectedCueId); const target = index + offset; if (target >= 0 && target < list.length) [list[index], list[target]] = [list[target], list[index]]; });
  const setCueTime = (key, value) => {
    try {
      if (typeof value !== "number" && selectedCue && String(value).trim() === formatNativeListeningTime(selectedCue[key])) return;
      const milliseconds = typeof value === "number" ? value : parseNativeListeningDisplayTime(value);
      mutatePublic((next) => { next.parts[0].interaction.cues.find((entry) => entry.id === selectedCueId)[key] = milliseconds; });
    } catch (error) { setState((current) => ({ ...current, message: error.message })); }
  };

  const importSrt = async (file) => {
    if (!file) return;
    try { const imported = parseNativeListeningSrt(await file.text(), { createId: () => createNativeChildId("cue") }); mutatePublic((next) => { next.parts[0].interaction.cues = imported; next.parts[0].interaction.snippetHotspots = []; }); setSelectedCueId(imported[0]?.id || null); setSelectedSnippetId(null); setState((current) => ({ ...current, message: `${imported.length} SRT cues imported.` })); }
    catch (error) { setState((current) => ({ ...current, message: error.message })); }
  };

  const uploadAudio = async (file) => {
    if (!file) return; setUploading("audio");
    try { const durationMs = await mediaDuration(file); const uploaded = await uploadNativeActivityAsset({ bookSlug, componentSlug, activityId, assetSlot: createNativeChildId("asset"), file }); mutatePublic((next) => { const current = next.parts[0].interaction; const previousSlot = current.audioAssetSlot; replaceAsset(next, uploaded, previousSlot); current.audioAssetSlot = uploaded.reference.slot; current.audioDurationMs = durationMs; if (previousSlot) removeNativeManagedAssetReferenceIfUnused(next, previousSlot); }); setState((current) => ({ ...current, message: cues.some((cue) => cue.endMs > durationMs) ? "MP3 replaced; existing cues exceed its duration and must be corrected." : "Listening MP3 uploaded." })); }
    catch (error) { setState((current) => ({ ...current, message: error.message || "MP3 upload failed." })); } finally { setUploading(""); }
  };
  const uploadBackground = async (file) => {
    if (!file) return; setUploading("background");
    try { const uploaded = await uploadNativeActivityAsset({ bookSlug, componentSlug, activityId, assetSlot: createNativeChildId("asset"), file }); if (!uploaded.metadata?.width || !uploaded.metadata?.height) throw new Error("Background dimensions are unavailable."); mutatePublic((next) => { const panelTwo = next.parts[0].interaction.panels[1]; const previousSlot = panelTwo.backgroundAssetSlot; replaceAsset(next, uploaded, previousSlot); panelTwo.backgroundAssetSlot = uploaded.reference.slot; panelTwo.sourceWidth = uploaded.metadata.width; panelTwo.sourceHeight = uploaded.metadata.height; panelTwo.transcriptArea = { x: Math.round(uploaded.metadata.width * .08), y: Math.round(uploaded.metadata.height * .08), width: Math.round(uploaded.metadata.width * .84), height: Math.round(uploaded.metadata.height * .84) }; if (previousSlot) removeNativeManagedAssetReferenceIfUnused(next, previousSlot); }); setState((current) => ({ ...current, message: "Background uploaded; transcript region reset for its intrinsic dimensions." })); }
    catch (error) { setState((current) => ({ ...current, message: error.message || "Background upload failed." })); } finally { setUploading(""); }
  };

  const addSnippet = () => { if (!cues.length) return; const id = createNativeChildId("aud"); mutatePublic((next) => { const index = next.parts[0].interaction.snippetHotspots.length; next.parts[0].interaction.snippetHotspots.push({ id, area: { x: 880 - (index % 4) * 64, y: 36 + Math.floor(index / 4) * 58, width: 48, height: 48 }, cueIds: [next.parts[0].interaction.cues[0].id], label: `Transcript excerpt ${index + 1}` }); }); setSelectedSnippetId(id); };
  const removeSnippet = () => { if (!selectedSnippet) return; mutatePublic((next) => { next.parts[0].interaction.snippetHotspots = next.parts[0].interaction.snippetHotspots.filter((entry) => entry.id !== selectedSnippet.id); }); setSelectedSnippetId(null); };

  const save = async () => {
    setState((current) => ({ ...current, saving: true, message: "Saving…" }));
    try { const value = await saveNativeActivityPair({ bookSlug, componentSlug, activityId, expectedPublicRevision: state.publicRevision, expectedTeacherRevision: state.teacherRevision, publicDocument: publicDraft, teacherDocument: teacherDraft }); setPublicDraft(value.publicDocument); setTeacherDraft(value.teacherDocument); setDirty(false); onDirtyChange(false); onSaved(value.publicRevision); setState({ kind: "ready", publicRevision: value.publicRevision, teacherRevision: value.teacherRevision, saving: false, message: "Draft saved." }); }
    catch (error) { setState((current) => ({ ...current, saving: false, message: error.message || "Save failed." })); }
  };

  if (state.kind === "loading") return <section className="native-activity-foundation" role="status">Loading Listening draft…</section>;
  if (state.kind === "error" || !publicDraft || !teacherDraft) return <section className="native-activity-foundation" role="alert">{state.message}</section>;
  const panelOne = interaction.panels[0]; const panelTwo = interaction.panels[1];
  return <section className="native-activity-foundation native-listening-editor studio-editor">
    <header className="studio-editor-header"><div><span className="studio-eyebrow">{placementLabel} · Listening</span><h2>{publicDraft.metadata.title}</h2><p>{readiness.ready ? "Content complete" : `${readiness.issues.length} items need attention`}</p></div><details className="builder-technical-details"><summary>Technical details</summary><code>{activityId}</code></details></header>
    <section className="studio-content-panel"><div className="studio-form-grid"><StudioField label="Activity title"><input value={publicDraft.metadata.title} maxLength="300" onChange={(event) => mutatePublic((next) => { next.metadata.title = event.target.value; })} /></StudioField></div></section>
    <nav className="native-listening-editor-panels" aria-label="Listening panel authoring"><button type="button" aria-current={panel === 0 ? "page" : undefined} onClick={() => setPanel(0)}>Panel 1 <small>Questions</small></button><button type="button" aria-current={panel === 1 ? "page" : undefined} onClick={() => setPanel(1)}>Panel 2 <small>Synchronized transcript</small></button></nav>
    {panel === 0 ? <div className="native-listening-editor-grid"><section><header><h3>Open Response questions</h3><StudioButton onClick={addQuestion} disabled={questions.length >= NATIVE_LISTENING_LIMITS.questions}><Plus /> Add Question</StudioButton></header><div className="native-listening-editor-list">{questions.map((question,index) => <button type="button" key={question.id} aria-current={question.id === selectedQuestionId ? "true" : undefined} onClick={() => setSelectedQuestionId(question.id)}>Question {index + 1}: {question.prompt || "Untitled"}</button>)}</div>{selectedQuestion ? <div className="studio-content-panel"><StudioField label="Public prompt"><textarea value={selectedQuestion.prompt} onChange={(event) => mutatePublic((next) => { next.parts[0].interaction.questions.find((entry) => entry.id === selectedQuestion.id).prompt = event.target.value; })} /></StudioField><StudioField label="Teacher-only model answer"><textarea value={teacherDraft.parts[0].solution.modelAnswers.find((entry) => entry.questionId === selectedQuestion.id)?.text || ""} onChange={(event) => mutateTeacher((next) => { next.parts[0].solution.modelAnswers.find((entry) => entry.questionId === selectedQuestion.id).text = event.target.value; })} /></StudioField><div><button type="button" disabled={questions.indexOf(selectedQuestion) === 0} onClick={() => moveQuestion(-1)}>Move Up</button><button type="button" disabled={questions.indexOf(selectedQuestion) === questions.length - 1} onClick={() => moveQuestion(1)}>Move Down</button><button type="button" onClick={removeQuestion}>Delete</button></div></div> : null}</section>
      <section><header><h3>Transcript snippet controls</h3><StudioButton onClick={addSnippet} disabled={!cues.length || snippets.length >= NATIVE_LISTENING_LIMITS.snippets}><Plus /> Add Hotspot</StudioButton></header><div className="native-listening-editor-list">{snippets.map((snippet,index) => <button type="button" key={snippet.id} aria-current={snippet.id === selectedSnippetId ? "true" : undefined} onClick={() => setSelectedSnippetId(snippet.id)}>Hotspot {index + 1}: {snippet.label}</button>)}</div><div className="native-listening-hotspot-canvas" data-studio-stage data-surface-width={panelOne.sourceWidth} data-surface-height={panelOne.sourceHeight} style={{ aspectRatio: `${panelOne.sourceWidth}/${panelOne.sourceHeight}` }}>{snippets.map((snippet) => <button type="button" key={snippet.id} className="native-listening-hotspot-dot" style={{ left: `${snippet.area.x/panelOne.sourceWidth*100}%`, top: `${snippet.area.y/panelOne.sourceHeight*100}%`, width: `${snippet.area.width/panelOne.sourceWidth*100}%`, height: `${snippet.area.height/panelOne.sourceHeight*100}%` }} onClick={() => setSelectedSnippetId(snippet.id)} aria-label={snippet.label} />)}{selectedSnippet ? <StageSelectionFrame geometry={selectedSnippet.area} stage={{ width: panelOne.sourceWidth, height: panelOne.sourceHeight }} label="Transcript snippet hotspot" preserveAspectRatio onChange={(geometry) => mutatePublic((next) => { next.parts[0].interaction.snippetHotspots.find((entry) => entry.id === selectedSnippet.id).area = Object.fromEntries(Object.entries(geometry).map(([key,value]) => [key,Math.round(value)])); })} onDelete={removeSnippet} /> : null}</div>{selectedSnippet ? <div className="studio-content-panel"><StudioField label="Accessible label"><input value={selectedSnippet.label} onChange={(event) => mutatePublic((next) => { next.parts[0].interaction.snippetHotspots.find((entry) => entry.id === selectedSnippet.id).label = event.target.value; })} /></StudioField><fieldset><legend>Transcript cues to display</legend>{cues.map((cue,index) => <label key={cue.id}><input type="checkbox" checked={selectedSnippet.cueIds.includes(cue.id)} onChange={(event) => mutatePublic((next) => { const target = next.parts[0].interaction.snippetHotspots.find((entry) => entry.id === selectedSnippet.id); target.cueIds = event.target.checked ? [...target.cueIds, cue.id] : target.cueIds.filter((id) => id !== cue.id); })} /> Cue {index + 1}: {cue.text}</label>)}</fieldset><StudioButton variant="danger-ghost" onClick={removeSnippet}><Trash2 /> Delete Hotspot</StudioButton></div> : null}</section></div> : null}
    {panel === 1 ? <div className="native-listening-editor-grid"><section><h3>Managed presentation assets</h3><label className="studio-upload-action"><Upload /><span><strong>{uploading === "audio" ? "Uploading…" : audioReference ? "Replace MP3" : "Upload MP3"}</strong><small>MP3 · maximum 50 MiB</small></span><input type="file" accept="audio/mpeg,.mp3" disabled={Boolean(uploading)} onChange={(event) => { uploadAudio(event.target.files?.[0]); event.target.value = ""; }} /></label><label className="studio-upload-action"><Upload /><span><strong>{uploading === "background" ? "Uploading…" : backgroundReference ? "Replace background" : "Upload background"}</strong><small>PNG, JPEG or WebP</small></span><input type="file" accept="image/png,image/jpeg,image/webp" disabled={Boolean(uploading)} onChange={(event) => { uploadBackground(event.target.files?.[0]); event.target.value = ""; }} /></label><div className="native-listening-layout-canvas" data-studio-stage data-surface-width={panelTwo.sourceWidth} data-surface-height={panelTwo.sourceHeight} style={{ aspectRatio: `${panelTwo.sourceWidth}/${panelTwo.sourceHeight}`, backgroundImage: backgroundReference ? `url(${assetUrl(backgroundReference.assetId)})` : undefined }}><div className="native-listening-layout-transcript">Transcript region</div><StageSelectionFrame geometry={panelTwo.transcriptArea} stage={{ width: panelTwo.sourceWidth, height: panelTwo.sourceHeight }} label="Transcript region" minWidth={120} minHeight={120} onChange={(geometry) => mutatePublic((next) => { next.parts[0].interaction.panels[1].transcriptArea = Object.fromEntries(Object.entries(geometry).map(([key,value]) => [key,Math.round(value)])); })} /></div></section>
      <section><header><h3>Transcript timing</h3><label className="studio-upload-action"><FileUp /><span><strong>Import SRT</strong><small>Replaces current cues after validation</small></span><input type="file" accept=".srt,application/x-subrip,text/plain" onChange={(event) => { importSrt(event.target.files?.[0]); event.target.value = ""; }} /></label></header><ListeningTimingPlayer audioUrl={audioReference ? assetUrl(audioReference.assetId) : ""} durationMs={interaction.audioDurationMs} cues={cues} selectedCueId={selectedCueId} onTime={setPlayheadMs} /><div className="native-listening-editor-list">{cues.map((cue,index) => <button type="button" key={cue.id} aria-current={cue.id === selectedCueId ? "true" : undefined} onClick={() => setSelectedCueId(cue.id)}>Cue {index + 1} · {formatNativeListeningTime(cue.startMs)}–{formatNativeListeningTime(cue.endMs)} · {cue.text}</button>)}</div><StudioButton onClick={addCue} disabled={cues.length >= NATIVE_LISTENING_LIMITS.cues}><Plus /> Add Cue</StudioButton>{selectedCue ? <div className="studio-content-panel"><StudioField label="Transcript text"><textarea value={selectedCue.text} onChange={(event) => mutatePublic((next) => { next.parts[0].interaction.cues.find((entry) => entry.id === selectedCue.id).text = event.target.value; })} /></StudioField><div className="studio-number-grid"><StudioField label="Start (MM:SS)"><input key={`start-${selectedCue.id}-${selectedCue.startMs}`} defaultValue={formatNativeListeningTime(selectedCue.startMs)} onBlur={(event) => setCueTime("startMs", event.target.value)} /></StudioField><StudioButton onClick={() => setCueTime("startMs", playheadMs)}>Set Start</StudioButton><StudioField label="End (MM:SS)"><input key={`end-${selectedCue.id}-${selectedCue.endMs}`} defaultValue={formatNativeListeningTime(selectedCue.endMs)} onBlur={(event) => setCueTime("endMs", event.target.value)} /></StudioField><StudioButton onClick={() => setCueTime("endMs", playheadMs)}>Set End</StudioButton></div><div><button type="button" disabled={cues.indexOf(selectedCue) === 0} onClick={() => setSelectedCueId(cues[cues.indexOf(selectedCue)-1]?.id)}>Previous</button><button type="button" disabled={cues.indexOf(selectedCue) === cues.length - 1} onClick={() => setSelectedCueId(cues[cues.indexOf(selectedCue)+1]?.id)}>Next</button><button type="button" disabled={cues.indexOf(selectedCue) === 0} onClick={() => moveCue(-1)}>Move Up</button><button type="button" disabled={cues.indexOf(selectedCue) === cues.length - 1} onClick={() => moveCue(1)}>Move Down</button><button type="button" onClick={removeCue}>Delete Cue</button></div></div> : null}</section></div> : null}
    <section className="native-or-preview"><div className="native-or-preview-toggle"><button type="button" aria-pressed={preview === "author"} onClick={() => setPreview("author")}>Authoring</button><button type="button" aria-pressed={preview === "student"} onClick={() => setPreview("student")}>Student Preview</button><button type="button" aria-pressed={preview === "teacher"} onClick={() => setPreview("teacher")}>Teacher Preview</button></div>{preview === "student" ? <NativeListeningStudentSurface document={publicDraft} assetUrl={assetUrl} /> : preview === "teacher" ? <NativeListeningTeacherSurface publicDocument={publicDraft} teacherDocument={teacherDraft} assetUrl={assetUrl} /> : null}</section>
    <NativeReadableTextEditor bookSlug={bookSlug} componentSlug={componentSlug} activityId={activityId} publicDraft={publicDraft} mutatePublic={mutatePublic} previewUrl={assetUrl} onIncompleteChange={setReadableTextIncomplete} onIntentChange={changed} onStatusChange={(message) => setState((current) => ({ ...current, message }))} />
    <NativeVideoEditor bookSlug={bookSlug} componentSlug={componentSlug} activityId={activityId} publicDraft={publicDraft} mutatePublic={mutatePublic} onIncompleteChange={setVideoIncomplete} onIntentChange={changed} onStatusChange={(message) => setState((current) => ({ ...current, message }))} />
    {dirty && state.message ? <p className="native-listening-editor-status" role="status">{state.message}</p> : null}
    <aside className="studio-readiness" role="status" data-ready={readiness.ready && !readableTextIncomplete && !videoIncomplete || undefined}><strong>{readiness.ready && !readableTextIncomplete && !videoIncomplete ? "Ready to save" : "Before saving"}</strong>{readiness.issues.length || readableTextIncomplete || videoIncomplete ? <ul>{readiness.issues.map((issue) => <li key={issue}>{issue}</li>)}{readableTextIncomplete ? <li>Upload a readable-text image.</li> : null}{videoIncomplete ? <li>Upload one MP4 and one valid SRT subtitle file.</li> : null}</ul> : <span>Audio, transcript, panels, assets, and Teacher separation pass.</span>}</aside>
    <footer className="studio-save-bar"><StudioStatus dirty={dirty} saving={state.saving} message={state.message} /><StudioButton variant="primary" disabled={!dirty || state.saving || !readiness.ready || readableTextIncomplete || videoIncomplete} reason={!dirty ? "No unsaved changes" : readableTextIncomplete ? "Upload a readable-text image before saving" : videoIncomplete ? "Complete the Video setup before saving" : !readiness.ready ? "Resolve all authoring issues before saving" : ""} onClick={save}>{state.saving ? "Saving…" : "Save Draft"}</StudioButton></footer>
  </section>;
}
