import { useEffect, useMemo, useState } from "react";
import { Eye, Plus, Trash2, Upload, Wrench } from "lucide-react";

import { StudioButton, StudioField, StudioStatus, StudioTabs } from "../../../components/builder-studio/StudioControls.jsx";
import { NativeCompleteSentencesHotspotCanvas } from "../../../components/native-complete-sentences/NativeCompleteSentencesHotspotCanvas.jsx";
import { NativeCompleteSentencesStudentSurface, NativeCompleteSentencesTeacherSurface } from "../../../components/native-complete-sentences/NativeCompleteSentencesSurface.jsx";
import { createNativeChildId } from "../../../data/native-activities/nativeChildIdentity.js";
import { mergeNativeManagedAssetReference } from "../../../data/native-activities/nativeActivityPublic.js";
import { assessNativeCompleteSentencesReadiness, NATIVE_COMPLETE_SENTENCES_LIMITS } from "../../../data/native-activities/nativeCompleteSentences.js";
import { addNativeCompleteSentencesItem, alignNativeCompleteSentencesAnswers, nativeCompleteSentencesMarkedSentence, parseNativeCompleteSentencesMarkedSentence, removeNativeCompleteSentencesItem, replaceNativeCompleteSentencesBackground } from "../../../data/native-activities/nativeCompleteSentencesAuthoring.js";
import { getBuilderContent } from "./builderContentApi.js";
import { saveNativeActivityPair, uploadNativeActivityAsset } from "./builderNativeActivityApi.js";
import { projectNativeActivityPublicForAuthoring } from "./nativeActivityAuthoringProjection.js";
import { NativeReadableTextEditor } from "./NativeReadableTextEditor.jsx";
import { NativeVideoEditor } from "./NativeVideoEditor.jsx";

const clone = (value) => structuredClone(value);
const tabs = [{ id: "front", label: "Front", icon: Eye }, { id: "back", label: "Back", icon: Wrench }];
const previewRoot = (bookSlug, componentSlug, activityId, assetId) => `/builder/api/native-activities/books/${encodeURIComponent(bookSlug)}/components/${encodeURIComponent(componentSlug)}/activities/${encodeURIComponent(activityId)}/assets/${encodeURIComponent(assetId)}/preview`;

export function NativeCompleteSentencesEditor({ bookSlug, componentSlug, activityId, placementLabel, onDirtyChange = () => {}, onSaved = () => {} }) {
  const [state, setState] = useState({ kind: "loading", publicRevision: 0, teacherRevision: 0, message: "" });
  const [publicDraft, setPublicDraft] = useState(null); const [teacherDraft, setTeacherDraft] = useState(null);
  const [mode, setMode] = useState("back"); const [preview, setPreview] = useState("student"); const [dirty, setDirty] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState(null); const [selectedHotspotId, setSelectedHotspotId] = useState(null); const [drawItemId, setDrawItemId] = useState(""); const [drawing, setDrawing] = useState(false); const [uploading, setUploading] = useState(false); const [readableIncomplete, setReadableIncomplete] = useState(false); const [videoIncomplete, setVideoIncomplete] = useState(false);
  const [authoringSentences, setAuthoringSentences] = useState({});

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getBuilderContent({ bookSlug, componentSlug, resource: "native-activity-public", documentKey: activityId }, { signal: controller.signal }),
      getBuilderContent({ bookSlug, componentSlug, resource: "native-activity-teacher", documentKey: activityId }, { signal: controller.signal }),
    ]).then(([publicValue, teacherValue]) => {
      if (controller.signal.aborted) return;
      setPublicDraft(projectNativeActivityPublicForAuthoring(publicValue.document)); setTeacherDraft(teacherValue.document); setSelectedItemId(publicValue.document.parts[0].interaction.items[0]?.id || null);
      const answers = new Map(teacherValue.document.parts[0].solution.answers.map((entry) => [entry.itemId, entry.text]));
      setAuthoringSentences(Object.fromEntries(publicValue.document.parts[0].interaction.items.map((item) => [item.id, nativeCompleteSentencesMarkedSentence(item.prompt, answers.get(item.id) || "")])));
      setState({ kind: "ready", publicRevision: publicValue.revision, teacherRevision: teacherValue.revision, message: "Saved draft" });
    }).catch((error) => { if (!controller.signal.aborted) setState({ kind: "error", message: error.message }); });
    return () => controller.abort();
  }, [activityId, bookSlug, componentSlug]);

  const changed = () => { setDirty(true); onDirtyChange(true); };
  const mutatePublic = (mutator) => { setPublicDraft((current) => { const next = clone(current); mutator(next); return next; }); changed(); };
  const mutatePair = (mutator) => { const nextPublic = clone(publicDraft); const nextTeacher = clone(teacherDraft); mutator(nextPublic, nextTeacher); setPublicDraft(nextPublic); setTeacherDraft(nextTeacher); changed(); };
  const interaction = publicDraft?.parts[0].interaction; const items = interaction?.items || []; const presentation = interaction?.presentation;
  const selectedItem = items.find((item) => item.id === selectedItemId) || null; const selectedHotspot = presentation?.hotspots.find((hotspot) => hotspot.id === selectedHotspotId) || null;
  const markedSentence = selectedItem ? authoringSentences[selectedItem.id] ?? "" : "";
  const markedSentenceResult = selectedItem ? parseNativeCompleteSentencesMarkedSentence(markedSentence) : null;
  const authoringIssues = items.flatMap((item, index) => {
    const parsed = parseNativeCompleteSentencesMarkedSentence(authoringSentences[item.id] ?? "");
    return parsed.valid ? [] : [`Sentence ${index + 1}: ${parsed.error}`];
  });
  const readiness = useMemo(() => publicDraft && teacherDraft ? assessNativeCompleteSentencesReadiness(publicDraft, teacherDraft) : null, [publicDraft, teacherDraft]);
  const assetUrl = (assetId) => previewRoot(bookSlug, componentSlug, activityId, assetId);
  const backgroundReference = publicDraft?.assets.find((asset) => asset.slot === presentation?.backgroundAssetSlot);

  const addItem = () => { let id; mutatePair((nextPublic, nextTeacher) => { id = addNativeCompleteSentencesItem(nextPublic, nextTeacher); }); setAuthoringSentences((current) => ({ ...current, [id]: "" })); setSelectedItemId(id); };
  const removeItem = () => { if (!selectedItem || !globalThis.confirm("Delete this sentence, its private answer, and blank hotspot?")) return; const index = items.indexOf(selectedItem); mutatePair((nextPublic, nextTeacher) => removeNativeCompleteSentencesItem(nextPublic, nextTeacher, selectedItem.id)); setSelectedItemId(items[index + 1]?.id || items[index - 1]?.id || null); setSelectedHotspotId(null); };
  const moveItem = (offset) => mutatePair((nextPublic, nextTeacher) => { const list = nextPublic.parts[0].interaction.items; const index = list.findIndex((item) => item.id === selectedItemId); const target = index + offset; if (target >= 0 && target < list.length) [list[index], list[target]] = [list[target], list[index]]; alignNativeCompleteSentencesAnswers(nextPublic, nextTeacher); });
  const updateMarkedSentence = (value) => {
    setAuthoringSentences((current) => ({ ...current, [selectedItem.id]: value }));
    const parsed = parseNativeCompleteSentencesMarkedSentence(value);
    if (!parsed.valid) { changed(); return; }
    mutatePair((nextPublic, nextTeacher) => {
      nextPublic.parts[0].interaction.items.find((item) => item.id === selectedItem.id).prompt = parsed.prompt;
      nextTeacher.parts[0].solution.answers.find((entry) => entry.itemId === selectedItem.id).text = parsed.answer;
    });
  };
  const uploadBackground = async (file) => {
    if (!file) return; setUploading(true); setState((current) => ({ ...current, message: "Uploading background…" }));
    try {
      const uploaded = await uploadNativeActivityAsset({ bookSlug, componentSlug, activityId, assetSlot: createNativeChildId("asset"), file });
      if (!Number.isSafeInteger(uploaded.metadata?.width) || !Number.isSafeInteger(uploaded.metadata?.height)) throw new Error("Uploaded image dimensions are unavailable.");
      mutatePublic((next) => { next.assets = mergeNativeManagedAssetReference(next.assets, uploaded.reference); replaceNativeCompleteSentencesBackground(next, uploaded.reference, uploaded.metadata); });
      setSelectedHotspotId(null); setState((current) => ({ ...current, message: "Background replaced. Redraw blank hotspots for its intrinsic dimensions." }));
    } catch (error) { setState((current) => ({ ...current, message: error.message || "Background upload failed." })); } finally { setUploading(false); }
  };
  const createHotspot = (area) => {
    if (!drawItemId || presentation.hotspots.some((hotspot) => hotspot.itemId === drawItemId)) return;
    const hotspot = { id: createNativeChildId("hot"), itemId: drawItemId, area };
    mutatePublic((next) => next.parts[0].interaction.presentation.hotspots.push(hotspot)); setSelectedHotspotId(hotspot.id); setDrawing(false);
  };
  const updateHotspot = (mutator) => mutatePublic((next) => { const hotspot = next.parts[0].interaction.presentation.hotspots.find((entry) => entry.id === selectedHotspotId); if (hotspot) mutator(hotspot); });
  const deleteHotspot = () => { mutatePublic((next) => { next.parts[0].interaction.presentation.hotspots = next.parts[0].interaction.presentation.hotspots.filter((entry) => entry.id !== selectedHotspotId); }); setSelectedHotspotId(null); };
  const save = async () => {
    if (!readiness.ready || authoringIssues.length || readableIncomplete || videoIncomplete) return setState((current) => ({ ...current, message: "Resolve all authoring issues before saving." }));
    setState((current) => ({ ...current, saving: true, message: "Saving…" }));
    try { const value = await saveNativeActivityPair({ bookSlug, componentSlug, activityId, expectedPublicRevision: state.publicRevision, expectedTeacherRevision: state.teacherRevision, publicDocument: publicDraft, teacherDocument: teacherDraft }); setPublicDraft(value.publicDocument); setTeacherDraft(value.teacherDocument); setDirty(false); onDirtyChange(false); onSaved(value.publicRevision); setState({ kind: "ready", publicRevision: value.publicRevision, teacherRevision: value.teacherRevision, saving: false, message: "Draft saved." }); }
    catch (error) { setState((current) => ({ ...current, saving: false, message: error.status === 409 ? "This draft changed elsewhere. Reload before saving." : error.message })); }
  };

  if (state.kind === "loading") return <section className="native-activity-foundation" role="status">Loading native Complete the Sentences…</section>;
  if (state.kind === "error" || !publicDraft || !teacherDraft) return <section className="native-activity-foundation" role="alert">{state.message}</section>;
  const mapped = new Set(presentation.hotspots.map((hotspot) => hotspot.itemId));
  return <section className="native-activity-foundation native-single-choice-editor studio-editor">
    <header className="studio-editor-header"><div><span className="studio-eyebrow">{placementLabel} · Complete the Sentences</span><h2>{publicDraft.metadata.title}</h2><p>{readiness.ready ? "Content complete" : `${readiness.issues.length} items need attention`}</p></div><details className="builder-technical-details"><summary>Technical details</summary><code>{activityId}</code></details></header>
    <StudioTabs value={mode} onChange={setMode} tabs={tabs} label="Complete the Sentences sides" />
    {mode === "front" ? <div className="studio-preview-panel native-single-choice-front"><NativeCompleteSentencesStudentSurface document={publicDraft} assetUrl={assetUrl} /></div> : null}
    {mode === "back" ? <div className="native-single-choice-back"><section className="studio-content-panel"><div className="studio-form-grid"><StudioField label="Activity title"><input value={publicDraft.metadata.title} maxLength={300} onChange={(event) => mutatePublic((next) => { next.metadata.title = event.target.value; })} /></StudioField></div></section>
      <div className="native-or-question-workspace"><aside><StudioButton onClick={addItem} disabled={items.length >= NATIVE_COMPLETE_SENTENCES_LIMITS.items}><Plus />Add Sentence</StudioButton>{items.map((item, index) => <button type="button" key={item.id} aria-current={item.id === selectedItemId ? "true" : undefined} onClick={() => setSelectedItemId(item.id)}><strong>Sentence {index + 1}</strong><span>{authoringSentences[item.id] || item.prompt || "Untitled"}</span><code>{item.id}</code></button>)}</aside>{selectedItem ? <section className="native-or-question-editor"><header><strong>Sentence {items.indexOf(selectedItem) + 1}</strong><div><button type="button" disabled={items.indexOf(selectedItem) === 0} onClick={() => moveItem(-1)}>Move Up</button><button type="button" disabled={items.indexOf(selectedItem) === items.length - 1} onClick={() => moveItem(1)}>Move Down</button><button type="button" onClick={removeItem}>Delete</button></div></header><StudioField label="Full sentence with one marked answer"><textarea value={markedSentence} maxLength={NATIVE_COMPLETE_SENTENCES_LIMITS.promptLength + NATIVE_COMPLETE_SENTENCES_LIMITS.answerLength + 2} aria-invalid={!markedSentenceResult?.valid || undefined} aria-describedby={`${selectedItem.id}-marked-help`} onChange={(event) => updateMarkedSentence(event.target.value)} /></StudioField><p id={`${selectedItem.id}-marked-help`} className={markedSentenceResult?.valid ? "studio-field-help" : "studio-field-error"} role={markedSentenceResult?.valid ? undefined : "alert"}>{markedSentenceResult?.valid ? "The text inside *asterisks* is stored only in the private Teacher answer; students receive an explicit blank." : markedSentenceResult?.error}</p></section> : <p>Add a sentence to begin.</p>}</div>
      <section className="native-single-choice-visual-authoring"><header><div><h3>Visual blanks</h3><p>Managed background with one source-pixel hotspot per sentence.</p></div></header><div className="studio-visual-workspace"><section className="studio-canvas-column"><div className="studio-canvas-viewport"><div className="studio-artboard-wrap"><NativeCompleteSentencesHotspotCanvas presentation={presentation} assetUrl={backgroundReference ? assetUrl(backgroundReference.assetId) : ""} items={items} selectedHotspotId={selectedHotspotId} onSelect={(id) => { setSelectedHotspotId(id); setDrawing(false); }} onCreate={createHotspot} onChange={(area) => updateHotspot((hotspot) => { hotspot.area = area; })} onDelete={deleteHotspot} drawingEnabled={drawing} /></div></div></section><aside className="studio-inspector"><label className="studio-upload-action"><Upload /><span><strong>{uploading ? "Uploading…" : backgroundReference ? "Replace background" : "Upload background"}</strong><small>PNG, JPEG or WebP</small></span><input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => { uploadBackground(event.target.files?.[0]); event.target.value = ""; }} /></label><StudioField label="Sentence to map"><select value={drawItemId} onChange={(event) => { setDrawItemId(event.target.value); setDrawing(false); }}><option value="">Choose a sentence</option>{items.map((item, index) => <option key={item.id} value={item.id} disabled={mapped.has(item.id) && selectedHotspot?.itemId !== item.id}>Sentence {index + 1}: {item.prompt || "Untitled"}</option>)}</select></StudioField><StudioButton variant="primary" selected={drawing} disabled={!drawItemId || !backgroundReference || Boolean(selectedHotspot)} onClick={() => setDrawing((current) => !current)}>Draw blank hotspot</StudioButton>{selectedHotspot ? <><StudioField label="Hotspot binding"><select value={selectedHotspot.itemId} onChange={(event) => updateHotspot((hotspot) => { hotspot.itemId = event.target.value; })}>{items.map((item, index) => <option key={item.id} value={item.id} disabled={mapped.has(item.id) && item.id !== selectedHotspot.itemId}>Sentence {index + 1}</option>)}</select></StudioField><StudioButton variant="danger-ghost" onClick={deleteHotspot}><Trash2 />Delete Hotspot</StudioButton></> : null}</aside></div></section>
      <section className="native-or-preview"><div className="native-or-preview-toggle"><button type="button" aria-pressed={preview === "student"} onClick={() => setPreview("student")}>Student Preview</button><button type="button" aria-pressed={preview === "teacher"} onClick={() => setPreview("teacher")}>Teacher Preview</button></div>{preview === "student" ? <NativeCompleteSentencesStudentSurface document={publicDraft} assetUrl={assetUrl} /> : <NativeCompleteSentencesTeacherSurface publicDocument={publicDraft} teacherDocument={teacherDraft} assetUrl={assetUrl} />}</section>
    </div> : null}
    <NativeReadableTextEditor bookSlug={bookSlug} componentSlug={componentSlug} activityId={activityId} publicDraft={publicDraft} mutatePublic={mutatePublic} previewUrl={assetUrl} onIncompleteChange={setReadableIncomplete} onIntentChange={changed} onStatusChange={(message) => setState((current) => ({ ...current, message }))} />
    <NativeVideoEditor bookSlug={bookSlug} componentSlug={componentSlug} activityId={activityId} publicDraft={publicDraft} mutatePublic={mutatePublic} onIncompleteChange={setVideoIncomplete} onIntentChange={changed} onStatusChange={(message) => setState((current) => ({ ...current, message }))} />
    <aside className="studio-readiness" role="status" data-ready={readiness.ready && !authoringIssues.length && !readableIncomplete && !videoIncomplete || undefined}><strong>{readiness.ready && !authoringIssues.length && !readableIncomplete && !videoIncomplete ? "Ready to save" : "Before saving"}</strong>{readiness.issues.length || authoringIssues.length || readableIncomplete || videoIncomplete ? <ul>{[...new Set([...readiness.issues, ...authoringIssues])].map((issue) => <li key={issue}>{issue}</li>)}{readableIncomplete ? <li>Complete the Readable Text setup.</li> : null}{videoIncomplete ? <li>Complete the Video setup.</li> : null}</ul> : null}</aside>
    <footer className="studio-save-bar"><StudioStatus dirty={dirty} saving={state.saving} message={state.message} /><StudioButton variant="primary" disabled={!dirty || state.saving || !readiness.ready || authoringIssues.length > 0 || readableIncomplete || videoIncomplete} onClick={save}>{state.saving ? "Saving…" : "Save Draft"}</StudioButton></footer>
  </section>;
}
