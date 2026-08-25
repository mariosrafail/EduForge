import { useEffect, useMemo, useState } from "react";
import { Eye, ImagePlus, Layers3, Plus, Trash2 } from "lucide-react";

import { StudioButton, StudioField, StudioSaveBar, StudioTabWorkspace } from "../../../components/builder-studio/StudioControls.jsx";
import { NativeDragDropAuthoringCanvas } from "../../../components/native-drag-drop/NativeDragDropAuthoringCanvas.jsx";
import { NativeDragDropStudentSurface } from "../../../components/native-drag-drop/NativeDragDropSurface.jsx";
import { NativeDragDropTeacherSurface } from "../../../components/native-drag-drop/NativeDragDropTeacherSurface.jsx";
import { createNativeChildId } from "../../../data/native-activities/nativeChildIdentity.js";
import { mergeNativeManagedAssetReference, removeNativeManagedAssetReferenceIfUnused } from "../../../data/native-activities/nativeActivityPublic.js";
import {
  assessNativeDragDropReadiness,
  NATIVE_DRAG_DROP_DEFAULT_SURFACE,
  NATIVE_DRAG_DROP_LIMITS,
  removeNativeDragDropImage,
  removeNativeDragDropPanel,
  removeNativeDragDropWord,
} from "../../../data/native-activities/nativeDragDrop.js";
import { getBuilderContent } from "./builderContentApi.js";
import { saveNativeActivityPair, uploadNativeActivityAsset } from "./builderNativeActivityApi.js";
import { projectNativeActivityPublicForAuthoring } from "./nativeActivityAuthoringProjection.js";
import "./nativeDragDropEditor.css";

const clone = (value) => structuredClone(value);
const tabs = [{ id: "content", label: "Content" }, { id: "layout", label: "Layout" }, { id: "answer-key", label: "Answer Key" }, { id: "preview", label: "Local Preview", icon: Eye }];
const previewRoot = (bookSlug, componentSlug, activityId, assetId) => `/builder/api/native-activities/books/${encodeURIComponent(bookSlug)}/components/${encodeURIComponent(componentSlug)}/activities/${encodeURIComponent(activityId)}/assets/${encodeURIComponent(assetId)}/preview`;

function moveInArray(list, index, delta) {
  const target = Math.max(0, Math.min(list.length - 1, index + delta));
  if (target === index) return;
  const [entry] = list.splice(index, 1); list.splice(target, 0, entry);
}

export function NativeDragDropEditor({ bookSlug, componentSlug, activityId, placementLabel, onDirtyChange = () => {}, onSaved = () => {} }) {
  const [state, setState] = useState({ kind: "loading", message: "" });
  const [publicDraft, setPublicDraft] = useState(null);
  const [teacherDraft, setTeacherDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState("content");
  const [panelId, setPanelId] = useState(null);
  const [selection, setSelection] = useState(null);
  const [drawingTarget, setDrawingTarget] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewMode, setPreviewMode] = useState("student");

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading", message: "" }); setPublicDraft(null); setTeacherDraft(null); setTab("content"); setDirty(false); onDirtyChange(false);
    Promise.all([
      getBuilderContent({ bookSlug, componentSlug, resource: "native-activity-public", documentKey: activityId }, { signal: controller.signal }),
      getBuilderContent({ bookSlug, componentSlug, resource: "native-activity-teacher", documentKey: activityId }, { signal: controller.signal }),
    ]).then(([publicValue, teacherValue]) => {
      if (controller.signal.aborted) return;
      const projected = projectNativeActivityPublicForAuthoring(publicValue.document);
      setPublicDraft(projected); setTeacherDraft(teacherValue.document); setPanelId(projected.parts[0].interaction.panels[0]?.id || null);
      setState({ kind: "ready", publicRevision: publicValue.revision, teacherRevision: teacherValue.revision, message: "Draft saved." });
    }).catch((error) => { if (!controller.signal.aborted) setState({ kind: "error", message: error.message }); });
    return () => controller.abort();
  }, [activityId, bookSlug, componentSlug]);

  const interaction = publicDraft?.parts[0].interaction;
  const panel = interaction?.panels.find((entry) => entry.id === panelId) || interaction?.panels[0] || null;
  const selectedImage = selection?.kind === "image" ? panel?.images.find((entry) => entry.id === selection.id) : null;
  const selectedTarget = selection?.kind === "target" ? panel?.dropTargets.find((entry) => entry.id === selection.id) : null;
  const readiness = useMemo(() => publicDraft && teacherDraft ? assessNativeDragDropReadiness(publicDraft, teacherDraft) : null, [publicDraft, teacherDraft]);
  const mappings = new Map(teacherDraft?.parts[0].solution.mappings.map((mapping) => [mapping.targetId, mapping.wordId]) || []);
  const assetUrl = (assetId) => previewRoot(bookSlug, componentSlug, activityId, assetId);

  const markDirty = () => { setDirty(true); onDirtyChange(true); };
  const mutatePublic = (mutator) => { setPublicDraft((current) => { const next = clone(current); mutator(next); return next; }); markDirty(); };
  const mutateTeacher = (mutator) => { setTeacherDraft((current) => { const next = clone(current); mutator(next); return next; }); markDirty(); };
  const mutatePair = (mutator) => {
    const nextPublic = clone(publicDraft); const nextTeacher = clone(teacherDraft); mutator(nextPublic, nextTeacher);
    setPublicDraft(nextPublic); setTeacherDraft(nextTeacher); markDirty();
  };

  const addWord = () => mutatePublic((next) => next.parts[0].interaction.words.push({ id: createNativeChildId("word"), text: `Word ${next.parts[0].interaction.words.length + 1}` }));
  const deleteWord = (wordId) => {
    const isMapped = teacherDraft.parts[0].solution.mappings.some((mapping) => mapping.wordId === wordId);
    if (isMapped && !globalThis.confirm?.("Remove this word and its private target mapping? The activity will need a replacement mapping before it can be saved.")) return;
    mutatePair((nextPublic, nextTeacher) => removeNativeDragDropWord(nextPublic, nextTeacher, wordId));
  };
  const addPanel = () => {
    const id = createNativeChildId("panel");
    mutatePublic((next) => next.parts[0].interaction.panels.push({ id, surface: { ...NATIVE_DRAG_DROP_DEFAULT_SURFACE }, images: [], dropTargets: [] }));
    setPanelId(id); setSelection(null); setDrawingTarget(false);
  };
  const movePanel = (index, delta) => mutatePublic((next) => moveInArray(next.parts[0].interaction.panels, index, delta));
  const deletePanel = () => {
    if (!panel || !globalThis.confirm?.("Remove this panel, its targets, and its image layers?")) return;
    const nextId = interaction.panels.find((entry) => entry.id !== panel.id)?.id || null;
    mutatePair((nextPublic, nextTeacher) => removeNativeDragDropPanel(nextPublic, nextTeacher, panel.id));
    setPanelId(nextId); setSelection(null); setDrawingTarget(false);
  };
  const addTarget = (area) => {
    const used = new Set(teacherDraft.parts[0].solution.mappings.map((mapping) => mapping.wordId));
    const word = interaction.words.find((entry) => !used.has(entry.id));
    if (!word) { setState((current) => ({ ...current, message: "Add another word before drawing another target." })); setDrawingTarget(false); return; }
    const targetId = createNativeChildId("target");
    mutatePair((nextPublic, nextTeacher) => {
      const nextPanel = nextPublic.parts[0].interaction.panels.find((entry) => entry.id === panel.id);
      nextPanel.dropTargets.push({ id: targetId, area, accessibleLabel: `Drop target ${nextPanel.dropTargets.length + 1}` });
      nextTeacher.parts[0].solution.mappings.push({ targetId, wordId: word.id });
    });
    setSelection({ kind: "target", id: targetId }); setDrawingTarget(false);
  };
  const deleteSelection = () => {
    if (selectedImage) mutatePublic((next) => removeNativeDragDropImage(next, panel.id, selectedImage.id));
    if (selectedTarget) mutatePair((nextPublic, nextTeacher) => {
      const nextPanel = nextPublic.parts[0].interaction.panels.find((entry) => entry.id === panel.id);
      nextPanel.dropTargets = nextPanel.dropTargets.filter((entry) => entry.id !== selectedTarget.id);
      nextTeacher.parts[0].solution.mappings = nextTeacher.parts[0].solution.mappings.filter((entry) => entry.targetId !== selectedTarget.id);
    });
    setSelection(null);
  };

  const uploadImage = async (file, { background = false, replace = false } = {}) => {
    if (!file || !panel || uploading) return;
    setUploading(true); setState((current) => ({ ...current, message: "Uploading image…" }));
    try {
      const uploaded = await uploadNativeActivityAsset({ bookSlug, componentSlug, activityId, assetSlot: createNativeChildId("asset"), file });
      if (replace && selectedImage) {
        mutatePublic((next) => {
          const nextImage = next.parts[0].interaction.panels.find((entry) => entry.id === panel.id).images.find((entry) => entry.id === selectedImage.id);
          const oldSlot = nextImage.assetSlot; next.assets = mergeNativeManagedAssetReference(next.assets, uploaded.reference); nextImage.assetSlot = uploaded.reference.slot;
          removeNativeManagedAssetReferenceIfUnused(next, oldSlot);
        });
      } else {
        const imageId = createNativeChildId("img");
        mutatePublic((next) => {
          const nextPanel = next.parts[0].interaction.panels.find((entry) => entry.id === panel.id);
          next.assets = mergeNativeManagedAssetReference(next.assets, uploaded.reference);
          const image = { id: imageId, assetSlot: uploaded.reference.slot, area: background ? { x: 0, y: 0, ...nextPanel.surface } : { x: 160, y: 110, width: 360, height: 240 }, order: background ? 0 : nextPanel.images.length, altText: "", decorative: false, fit: background ? "cover" : "contain", locked: background };
          if (background) { nextPanel.images.unshift(image); nextPanel.images.forEach((entry, order) => { entry.order = order; }); } else nextPanel.images.push(image);
        });
        setSelection({ kind: "image", id: imageId });
      }
      setState((current) => ({ ...current, message: "Image uploaded; save to attach it." }));
    } catch { setState((current) => ({ ...current, message: "Image upload failed." })); }
    finally { setUploading(false); }
  };

  const setMapping = (targetId, wordId) => mutateTeacher((next) => {
    const list = next.parts[0].solution.mappings;
    const current = list.find((entry) => entry.targetId === targetId);
    const displaced = list.find((entry) => entry.wordId === wordId && entry.targetId !== targetId);
    if (displaced && !current) return;
    if (displaced && current) displaced.wordId = current.wordId;
    if (current) current.wordId = wordId; else list.push({ targetId, wordId });
  });
  const save = async () => {
    setState((current) => ({ ...current, saving: true, message: "Saving…" }));
    try {
      const value = await saveNativeActivityPair({ bookSlug, componentSlug, activityId, expectedPublicRevision: state.publicRevision, expectedTeacherRevision: state.teacherRevision, publicDocument: publicDraft, teacherDocument: teacherDraft });
      setPublicDraft(projectNativeActivityPublicForAuthoring(value.publicDocument)); setTeacherDraft(value.teacherDocument); setDirty(false); onDirtyChange(false);
      setState({ kind: "ready", publicRevision: value.publicRevision, teacherRevision: value.teacherRevision, saving: false, message: "Draft saved." }); onSaved(value.publicRevision);
    } catch (error) { setState((current) => ({ ...current, saving: false, message: error.status === 409 ? "This draft changed elsewhere. Reload before saving." : "Save failed. Your edits are preserved." })); }
  };

  if (state.kind === "loading") return <section className="native-activity-foundation studio-loading" role="status">Loading Drag &amp; Drop editor…</section>;
  if (state.kind === "error" || !publicDraft || !teacherDraft) return <section className="native-activity-foundation studio-error" role="alert">{state.message || "Native draft is unavailable."}</section>;

  return <section className="native-activity-foundation native-drag-drop-editor studio-editor">
    <header className="studio-editor-header"><div><span className="studio-eyebrow">{placementLabel} · Drag &amp; Drop</span><h2>{publicDraft.metadata.title}</h2><p>{readiness.ready ? "Content complete" : `${readiness.issues.length} item${readiness.issues.length === 1 ? "" : "s"} need attention`}</p></div><details className="builder-technical-details"><summary>Technical details</summary><code>{activityId}</code></details></header>
    <StudioTabWorkspace id="native-drag-drop-tabs" value={tab} onChange={(value) => { setTab(value); setDrawingTarget(false); }} tabs={tabs} label="Drag and Drop authoring modes">

    {tab === "content" ? <div className="studio-content-panel native-drag-drop-content"><StudioField label="Activity title"><input value={publicDraft.metadata.title} maxLength="300" onChange={(event) => mutatePublic((next) => { next.metadata.title = event.target.value; })} /></StudioField><section className="native-drag-drop-editor-list"><h3>Shared word bank</h3><StudioButton onClick={addWord} disabled={interaction.words.length >= NATIVE_DRAG_DROP_LIMITS.words}><Plus aria-hidden="true" />Add word</StudioButton>{interaction.words.map((word, index) => <div className="native-drag-drop-word-row" key={word.id}><input aria-label={`Word ${index + 1}`} value={word.text} maxLength={NATIVE_DRAG_DROP_LIMITS.wordTextLength} onChange={(event) => mutatePublic((next) => { next.parts[0].interaction.words[index].text = event.target.value; })} /><button type="button" aria-label={`Move word ${index + 1} up`} disabled={!index} onClick={() => mutatePublic((next) => moveInArray(next.parts[0].interaction.words, index, -1))}>↑</button><button type="button" aria-label={`Move word ${index + 1} down`} disabled={index === interaction.words.length - 1} onClick={() => mutatePublic((next) => moveInArray(next.parts[0].interaction.words, index, 1))}>↓</button><button type="button" aria-label={`Remove word ${index + 1}`} onClick={() => deleteWord(word.id)}><Trash2 aria-hidden="true" /></button></div>)}</section></div> : null}
    {tab === "layout" ? <div className="native-drag-drop-editor-grid">
      <aside className="native-drag-drop-editor-list"><h3>Panels</h3><StudioButton onClick={addPanel} disabled={interaction.panels.length >= NATIVE_DRAG_DROP_LIMITS.panels}><Plus aria-hidden="true" />Add panel</StudioButton>{interaction.panels.map((entry, index) => <div className="native-drag-drop-panel-row" key={entry.id}><button type="button" aria-current={panel?.id === entry.id ? "true" : undefined} onClick={() => { setPanelId(entry.id); setSelection(null); setDrawingTarget(false); }}>Panel {index + 1} · {entry.images.length} image{entry.images.length === 1 ? "" : "s"} · {entry.dropTargets.length} target{entry.dropTargets.length === 1 ? "" : "s"}</button><button type="button" aria-label={`Move panel ${index + 1} up`} disabled={!index} onClick={() => movePanel(index, -1)}>↑</button><button type="button" aria-label={`Move panel ${index + 1} down`} disabled={index === interaction.panels.length - 1} onClick={() => movePanel(index, 1)}>↓</button></div>)}
      </aside>
      <section className="native-drag-drop-editor-canvas"><div className="native-drag-drop-editor-actions">
        <label><ImagePlus aria-hidden="true" />Add Background<input type="file" accept="image/png,image/jpeg,image/webp" disabled={!panel || uploading || panel?.images.length >= NATIVE_DRAG_DROP_LIMITS.imagesPerPanel} onChange={(event) => { uploadImage(event.target.files?.[0], { background: true }); event.target.value = ""; }} /></label>
        <label><Layers3 aria-hidden="true" />Add Image<input type="file" accept="image/png,image/jpeg,image/webp" disabled={!panel || uploading || panel?.images.length >= NATIVE_DRAG_DROP_LIMITS.imagesPerPanel} onChange={(event) => { uploadImage(event.target.files?.[0]); event.target.value = ""; }} /></label>
        <StudioButton onClick={() => { setDrawingTarget((value) => !value); setSelection(null); }} disabled={!panel || !interaction.words.length}>{drawingTarget ? "Cancel drawing" : "Draw Drop Target"}</StudioButton>
        <StudioButton variant="danger-ghost" onClick={deletePanel} disabled={!panel}>Remove panel</StudioButton>
      </div>{panel ? <NativeDragDropAuthoringCanvas document={publicDraft} panel={panel} assetUrl={assetUrl} selection={selection} onSelect={setSelection} drawingTarget={drawingTarget} onCreateTarget={addTarget} onChangeImage={(area) => mutatePublic((next) => { next.parts[0].interaction.panels.find((entry) => entry.id === panel.id).images.find((entry) => entry.id === selectedImage.id).area = area; })} onChangeTarget={(area) => mutatePublic((next) => { next.parts[0].interaction.panels.find((entry) => entry.id === panel.id).dropTargets.find((entry) => entry.id === selectedTarget.id).area = area; })} onDelete={deleteSelection} /> : <p>Add a panel to begin.</p>}</section>
      <aside className="native-drag-drop-editor-inspector"><h3>{selectedImage ? "Image layer" : selectedTarget ? "Drop target" : "Properties"}</h3>{selectedImage ? <><StudioField label="Alt text"><textarea rows="3" value={selectedImage.altText} disabled={selectedImage.decorative} onChange={(event) => mutatePublic((next) => { next.parts[0].interaction.panels.find((entry) => entry.id === panel.id).images.find((entry) => entry.id === selectedImage.id).altText = event.target.value; })} /></StudioField><label><input type="checkbox" checked={selectedImage.decorative} onChange={(event) => mutatePublic((next) => { next.parts[0].interaction.panels.find((entry) => entry.id === panel.id).images.find((entry) => entry.id === selectedImage.id).decorative = event.target.checked; })} /> Decorative</label><label><input type="checkbox" checked={selectedImage.locked} onChange={(event) => mutatePublic((next) => { next.parts[0].interaction.panels.find((entry) => entry.id === panel.id).images.find((entry) => entry.id === selectedImage.id).locked = event.target.checked; })} /> Lock position and size</label><StudioField label="Fit"><select value={selectedImage.fit} onChange={(event) => mutatePublic((next) => { next.parts[0].interaction.panels.find((entry) => entry.id === panel.id).images.find((entry) => entry.id === selectedImage.id).fit = event.target.value; })}><option value="contain">Contain</option><option value="cover">Cover</option></select></StudioField><div className="native-drag-drop-editor-actions"><button type="button" disabled={selectedImage.order === 0} onClick={() => mutatePublic((next) => { const list = next.parts[0].interaction.panels.find((entry) => entry.id === panel.id).images; moveInArray(list, selectedImage.order, -1); list.forEach((entry, order) => { entry.order = order; }); })}>Send backward</button><button type="button" disabled={selectedImage.order === panel.images.length - 1} onClick={() => mutatePublic((next) => { const list = next.parts[0].interaction.panels.find((entry) => entry.id === panel.id).images; moveInArray(list, selectedImage.order, 1); list.forEach((entry, order) => { entry.order = order; }); })}>Bring forward</button></div><label className="native-drag-drop-replace">Replace image<input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => { uploadImage(event.target.files?.[0], { replace: true }); event.target.value = ""; }} /></label><StudioButton variant="danger-ghost" onClick={deleteSelection}>Remove image</StudioButton></> : null}{selectedTarget ? <><StudioField label="Accessible label"><input value={selectedTarget.accessibleLabel} maxLength={NATIVE_DRAG_DROP_LIMITS.targetLabelLength} onChange={(event) => mutatePublic((next) => { next.parts[0].interaction.panels.find((entry) => entry.id === panel.id).dropTargets.find((entry) => entry.id === selectedTarget.id).accessibleLabel = event.target.value; })} /></StudioField><StudioButton variant="danger-ghost" onClick={deleteSelection}>Remove target</StudioButton></> : null}</aside>
    </div> : null}

    {tab === "answer-key" ? <div className="native-drag-drop-mapping"><h3>Teacher-only correct mappings</h3><p>Mappings use stable identities; public word and target order never determines an answer.</p>{interaction.panels.map((entry, panelIndex) => <section key={entry.id}><h4>Panel {panelIndex + 1}</h4>{entry.dropTargets.map((target, targetIndex) => { const currentWordId = mappings.get(target.id) || ""; return <StudioField key={target.id} label={`${targetIndex + 1}. ${target.accessibleLabel}`}><select value={currentWordId} onChange={(event) => setMapping(target.id, event.target.value)}><option value="" disabled>Select correct word</option>{interaction.words.map((word, wordIndex) => <option key={word.id} value={word.id} disabled={!currentWordId && [...mappings.entries()].some(([otherTargetId, otherWordId]) => otherTargetId !== target.id && otherWordId === word.id)}>{word.text} · word {wordIndex + 1}</option>)}</select></StudioField>; })}</section>)}</div> : null}
    {tab === "preview" ? <div className="studio-preview-panel"><div className="native-drag-drop-editor-actions"><button type="button" aria-pressed={previewMode === "student"} onClick={() => setPreviewMode("student")}>Student Preview</button><button type="button" aria-pressed={previewMode === "teacher"} onClick={() => setPreviewMode("teacher")}>Teacher Preview</button></div>{previewMode === "student" ? <NativeDragDropStudentSurface document={publicDraft} assetUrl={assetUrl} /> : <NativeDragDropTeacherSurface publicDocument={publicDraft} teacherDocument={teacherDraft} assetUrl={assetUrl} />}</div> : null}
    </StudioTabWorkspace>
    <StudioSaveBar dirty={dirty} saving={state.saving} message={state.message} ready={readiness.ready} issues={readiness.issues} disabled={!dirty || state.saving || !readiness.ready || !publicDraft.metadata.title.trim()} reason={!readiness.ready ? "Complete every panel, target, and private mapping before saving" : !dirty ? "No unsaved changes" : ""} onSave={save} />
  </section>;
}
