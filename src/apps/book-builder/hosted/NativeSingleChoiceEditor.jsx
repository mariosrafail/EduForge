import { useEffect, useMemo, useState } from "react";
import { Eye, ImagePlus, LayoutPanelTop, Plus, Trash2, Upload, Wrench } from "lucide-react";

import { StudioButton, StudioCanvasToolbar, StudioField, StudioStatus, StudioTabs } from "../../../components/builder-studio/StudioControls.jsx";
import { NativeSingleChoiceHotspotCanvas } from "../../../components/native-single-choice/NativeSingleChoiceHotspotCanvas.jsx";
import { NativeSingleChoiceStudentSurface } from "../../../components/native-single-choice/NativeSingleChoiceStudentSurface.jsx";
import { NativeSingleChoiceTeacherSurface } from "../../../components/native-single-choice/NativeSingleChoiceTeacherSurface.jsx";
import { createNativeChildId } from "../../../data/native-activities/nativeChildIdentity.js";
import { mergeNativeManagedAssetReference, removeNativeManagedAssetReferenceIfUnused } from "../../../data/native-activities/nativeActivityPublic.js";
import { assessNativeSingleChoiceReadiness, NATIVE_SINGLE_CHOICE_LIMITS } from "../../../data/native-activities/nativeSingleChoice.js";
import {
  addUnansweredNativeSingleChoiceQuestion,
  alignNativeSingleChoiceAnswers,
  createNativeSingleChoiceVisualPanel,
  enableNativeSingleChoiceVisualPresentation,
  removeNativeSingleChoiceOption,
  removeNativeSingleChoiceQuestion,
  removeNativeSingleChoiceVisualPresentation,
  setNativeSingleChoiceCorrectAnswer,
} from "../../../data/native-activities/nativeSingleChoiceAuthoring.js";
import { getBuilderContent } from "./builderContentApi.js";
import { saveNativeActivityPair, uploadNativeActivityAsset } from "./builderNativeActivityApi.js";
import { projectNativeActivityPublicForAuthoring } from "./nativeActivityAuthoringProjection.js";
import { NativeReadableTextEditor } from "./NativeReadableTextEditor.jsx";
import { NativeVideoEditor } from "./NativeVideoEditor.jsx";

const clone = (value) => structuredClone(value);
const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);
const tabs = [{ id: "front", label: "Front", icon: Eye }, { id: "back", label: "Back", icon: Wrench }];
const previewRoot = (bookSlug, componentSlug, activityId, assetId) => `/builder/api/native-activities/books/${encodeURIComponent(bookSlug)}/components/${encodeURIComponent(componentSlug)}/activities/${encodeURIComponent(activityId)}/assets/${encodeURIComponent(assetId)}/preview`;
const bindingValue = (questionId, optionId) => `${questionId}:${optionId}`;

export function NativeSingleChoiceEditor({ bookSlug, componentSlug, activityId, placementLabel, onDirtyChange = () => {}, onSaved = () => {} }) {
  const [state, setState] = useState({ kind: "loading", publicRevision: 0, teacherRevision: 0, message: "" });
  const [publicDraft, setPublicDraft] = useState(null);
  const [teacherDraft, setTeacherDraft] = useState(null);
  const [mode, setMode] = useState("back");
  const [preview, setPreview] = useState("student");
  const [selectedQuestionId, setSelectedQuestionId] = useState(null);
  const [selectedPanelId, setSelectedPanelId] = useState(null);
  const [selectedHotspotId, setSelectedHotspotId] = useState(null);
  const [drawBinding, setDrawBinding] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [readableTextIncomplete, setReadableTextIncomplete] = useState(false);
  const [videoIncomplete, setVideoIncomplete] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getBuilderContent({ bookSlug, componentSlug, resource: "native-activity-public", documentKey: activityId }, { signal: controller.signal }),
      getBuilderContent({ bookSlug, componentSlug, resource: "native-activity-teacher", documentKey: activityId }, { signal: controller.signal }),
    ]).then(([publicValue, teacherValue]) => {
      if (controller.signal.aborted) return;
      const interaction = publicValue.document.parts[0].interaction;
      setPublicDraft(projectNativeActivityPublicForAuthoring(publicValue.document));
      setTeacherDraft(teacherValue.document);
      setSelectedQuestionId(interaction.questions[0]?.id || null);
      setSelectedPanelId(interaction.presentation?.panels[0]?.id || null);
      setState({ kind: "ready", publicRevision: publicValue.revision, teacherRevision: teacherValue.revision, message: "Saved draft" });
    }).catch((error) => { if (!controller.signal.aborted) setState({ kind: "error", message: error.message }); });
    return () => controller.abort();
  }, [activityId, bookSlug, componentSlug]);

  const changed = () => { setDirty(true); onDirtyChange(true); };
  const mutatePublic = (mutator) => { setPublicDraft((current) => { const next = clone(current); mutator(next); return next; }); changed(); };
  const mutatePair = (mutator) => {
    const nextPublic = clone(publicDraft); const nextTeacher = clone(teacherDraft);
    mutator(nextPublic, nextTeacher);
    setPublicDraft(nextPublic); setTeacherDraft(nextTeacher); changed();
  };

  const interaction = publicDraft?.parts[0].interaction;
  const questions = interaction?.questions || [];
  const presentation = interaction?.presentation || null;
  const panels = presentation?.panels || [];
  const selected = questions.find((question) => question.id === selectedQuestionId) || null;
  const selectedPanel = panels.find((panel) => panel.id === selectedPanelId) || null;
  const selectedHotspot = selectedPanel?.hotspots.find((hotspot) => hotspot.id === selectedHotspotId) || null;
  const answer = teacherDraft?.parts[0].solution.correctAnswers.find((item) => item.questionId === selectedQuestionId) || null;
  const readiness = useMemo(() => publicDraft && teacherDraft ? assessNativeSingleChoiceReadiness(publicDraft, teacherDraft) : null, [publicDraft, teacherDraft]);
  const assetUrlForSlot = (slot) => {
    const reference = publicDraft.assets.find((asset) => asset.slot === slot);
    return reference ? previewRoot(bookSlug, componentSlug, activityId, reference.assetId) : "";
  };
  const assetUrl = (assetId) => previewRoot(bookSlug, componentSlug, activityId, assetId);

  const addQuestion = () => {
    let questionId;
    mutatePair((nextPublic, nextTeacher) => { ({ questionId } = addUnansweredNativeSingleChoiceQuestion(nextPublic, nextTeacher)); });
    setSelectedQuestionId(questionId);
    setState((current) => ({ ...current, message: "New question needs an explicit correct answer." }));
  };
  const deleteQuestion = (questionId) => {
    if (!globalThis.confirm("Delete this question, its private answer, and its hotspots?")) return;
    const index = questions.findIndex((question) => question.id === questionId);
    mutatePair((nextPublic, nextTeacher) => removeNativeSingleChoiceQuestion(nextPublic, nextTeacher, questionId));
    setSelectedQuestionId(questions[index + 1]?.id || questions[index - 1]?.id || null);
    setSelectedHotspotId(null);
  };
  const moveQuestion = (offset) => {
    const index = questions.findIndex((question) => question.id === selectedQuestionId); const target = index + offset;
    if (target < 0 || target >= questions.length) return;
    mutatePair((nextPublic, nextTeacher) => {
      const list = nextPublic.parts[0].interaction.questions;
      [list[index], list[target]] = [list[target], list[index]];
      alignNativeSingleChoiceAnswers(nextPublic, nextTeacher);
    });
  };
  const setAnswer = (optionId) => mutatePair((nextPublic, nextTeacher) => setNativeSingleChoiceCorrectAnswer(nextPublic, nextTeacher, selectedQuestionId, optionId));
  const addOption = () => mutatePublic((next) => next.parts[0].interaction.questions.find((question) => question.id === selectedQuestionId).options.push({ id: createNativeChildId("opt"), text: "" }));
  const deleteOption = (optionId) => mutatePair((nextPublic, nextTeacher) => removeNativeSingleChoiceOption(nextPublic, nextTeacher, selectedQuestionId, optionId));
  const moveOption = (optionId, offset) => mutatePublic((next) => {
    const list = next.parts[0].interaction.questions.find((question) => question.id === selectedQuestionId).options;
    const index = list.findIndex((option) => option.id === optionId); const target = index + offset;
    if (target >= 0 && target < list.length) [list[index], list[target]] = [list[target], list[index]];
  });

  const enableVisual = () => {
    const panelId = createNativeChildId("panel");
    mutatePublic((next) => enableNativeSingleChoiceVisualPresentation(next, () => panelId));
    setSelectedPanelId(panelId); setSelectedHotspotId(null); setMode("back");
  };
  const disableVisual = () => {
    if (!globalThis.confirm("Remove the visual panels and hotspots? Semantic questions and private answers will remain.")) return;
    mutatePublic(removeNativeSingleChoiceVisualPresentation);
    setSelectedPanelId(null); setSelectedHotspotId(null); setDrawing(false);
  };
  const addPanel = () => {
    const panel = createNativeSingleChoiceVisualPanel();
    mutatePublic((next) => next.parts[0].interaction.presentation.panels.push(panel));
    setSelectedPanelId(panel.id); setSelectedHotspotId(null);
  };
  const movePanel = (offset) => mutatePublic((next) => {
    const list = next.parts[0].interaction.presentation.panels;
    const index = list.findIndex((panel) => panel.id === selectedPanelId); const target = index + offset;
    if (target >= 0 && target < list.length) [list[index], list[target]] = [list[target], list[index]];
  });
  const deletePanel = () => {
    if (!selectedPanel || !globalThis.confirm("Delete this visual panel and all of its hotspots?")) return;
    const index = panels.findIndex((panel) => panel.id === selectedPanel.id);
    mutatePublic((next) => {
      const slot = next.parts[0].interaction.presentation.panels.find((panel) => panel.id === selectedPanel.id)?.backgroundAssetSlot;
      next.parts[0].interaction.presentation.panels = next.parts[0].interaction.presentation.panels.filter((panel) => panel.id !== selectedPanel.id);
      if (slot) removeNativeManagedAssetReferenceIfUnused(next, slot);
    });
    setSelectedPanelId(panels[index + 1]?.id || panels[index - 1]?.id || null); setSelectedHotspotId(null);
  };
  const uploadBackground = async (file) => {
    if (!file || !selectedPanel) return;
    setUploading(true); setState((current) => ({ ...current, message: "Uploading panel background…" }));
    try {
      const uploaded = await uploadNativeActivityAsset({ bookSlug, componentSlug, activityId, assetSlot: createNativeChildId("asset"), file });
      if (!uploaded.metadata || !Number.isSafeInteger(uploaded.metadata.width) || !Number.isSafeInteger(uploaded.metadata.height)) throw new Error("Uploaded image dimensions are unavailable.");
      mutatePublic((next) => {
        const previousSlot = next.parts[0].interaction.presentation.panels.find((entry) => entry.id === selectedPanel.id)?.backgroundAssetSlot;
        next.assets = mergeNativeManagedAssetReference(next.assets, uploaded.reference);
        const panel = next.parts[0].interaction.presentation.panels.find((entry) => entry.id === selectedPanel.id);
        panel.backgroundAssetSlot = uploaded.reference.slot;
        panel.sourceWidth = uploaded.metadata.width;
        panel.sourceHeight = uploaded.metadata.height;
        panel.hotspots = [];
        if (previousSlot && previousSlot !== uploaded.reference.slot) removeNativeManagedAssetReferenceIfUnused(next, previousSlot);
      });
      setSelectedHotspotId(null); setState((current) => ({ ...current, message: "Background uploaded. Redraw hotspots for its intrinsic dimensions." }));
    } catch (error) { setState((current) => ({ ...current, message: error.message || "Background upload failed." })); }
    finally { setUploading(false); }
  };

  const parsedBinding = drawBinding.split(":");
  const createHotspot = (area) => {
    const [questionId, optionId] = parsedBinding;
    if (!selectedPanel || !questionId || !optionId) return;
    const duplicate = panels.some((panel) => panel.hotspots.some((hotspot) => hotspot.questionId === questionId && hotspot.optionId === optionId));
    if (duplicate) { setState((current) => ({ ...current, message: "That option already has a hotspot." })); return; }
    const hotspot = { id: createNativeChildId("hot"), questionId, optionId, area };
    mutatePublic((next) => next.parts[0].interaction.presentation.panels.find((panel) => panel.id === selectedPanel.id).hotspots.push(hotspot));
    setSelectedHotspotId(hotspot.id); setDrawing(false);
  };
  const updateHotspot = (mutator) => mutatePublic((next) => {
    const hotspot = next.parts[0].interaction.presentation.panels.find((panel) => panel.id === selectedPanelId)?.hotspots.find((entry) => entry.id === selectedHotspotId);
    if (hotspot) mutator(hotspot);
  });
  const deleteHotspot = () => {
    if (!selectedHotspot) return;
    mutatePublic((next) => {
      const panel = next.parts[0].interaction.presentation.panels.find((entry) => entry.id === selectedPanelId);
      panel.hotspots = panel.hotspots.filter((hotspot) => hotspot.id !== selectedHotspotId);
    });
    setSelectedHotspotId(null);
  };
  const updateHotspotArea = (key, raw) => {
    const value = Math.round(Number(raw)); if (!Number.isFinite(value) || !selectedHotspot || !selectedPanel) return;
    updateHotspot((hotspot) => {
      hotspot.area[key] = key === "x" ? clamp(value, 0, selectedPanel.sourceWidth - hotspot.area.width)
        : key === "y" ? clamp(value, 0, selectedPanel.sourceHeight - hotspot.area.height)
          : key === "width" ? clamp(value, 1, selectedPanel.sourceWidth - hotspot.area.x)
            : clamp(value, 1, selectedPanel.sourceHeight - hotspot.area.y);
    });
  };

  const save = async () => {
    if (!readiness.ready) { setState((current) => ({ ...current, message: "Resolve all authoring issues before saving." })); return; }
    setState((current) => ({ ...current, saving: true, message: "Saving…" }));
    try {
      const value = await saveNativeActivityPair({ bookSlug, componentSlug, activityId, expectedPublicRevision: state.publicRevision, expectedTeacherRevision: state.teacherRevision, publicDocument: publicDraft, teacherDocument: teacherDraft });
      setPublicDraft(value.publicDocument); setTeacherDraft(value.teacherDocument); setDirty(false); onDirtyChange(false); onSaved(value.publicRevision);
      setState({ kind: "ready", publicRevision: value.publicRevision, teacherRevision: value.teacherRevision, saving: false, message: "Draft saved." });
    } catch (error) { setState((current) => ({ ...current, saving: false, message: error.status === 409 ? "This draft changed elsewhere. Reload before saving." : error.message })); }
  };

  if (state.kind === "loading") return <section className="native-activity-foundation" role="status">Loading native Multiple Choice…</section>;
  if (state.kind === "error" || !publicDraft || !teacherDraft) return <section className="native-activity-foundation" role="alert">{state.message}</section>;

  const mappedBindings = new Set(panels.flatMap((panel) => panel.hotspots.map((hotspot) => bindingValue(hotspot.questionId, hotspot.optionId))));
  return <section className="native-activity-foundation native-single-choice-editor studio-editor">
    <header className="studio-editor-header"><div><span className="studio-eyebrow">{placementLabel} · Multiple Choice</span><h2>{publicDraft.metadata.title}</h2><p>{readiness.ready ? "Content complete" : `${readiness.issues.length} item${readiness.issues.length === 1 ? "" : "s"} need attention`}</p></div><details className="builder-technical-details"><summary>Technical details</summary><dl><div><dt>Stable ID</dt><dd><code>{activityId}</code></dd></div><div><dt>Revisions</dt><dd>Public {state.publicRevision} · Teacher {state.teacherRevision}</dd></div></dl></details></header>
    <StudioTabs value={mode} onChange={setMode} tabs={tabs} label="Multiple Choice sides" />

    {mode === "front" ? <div className="studio-preview-panel native-single-choice-front" role="tabpanel"><header><Eye aria-hidden="true" /><div><h3>Front</h3><p>This is the shared learner runtime using only the public draft.</p></div></header><h3>{publicDraft.metadata.title}</h3><NativeSingleChoiceStudentSurface document={publicDraft} assetUrl={assetUrl} /></div> : null}

    {mode === "back" ? <div className="native-single-choice-back" role="tabpanel">
      <section className="studio-content-panel"><header><div><span className="studio-section-icon"><Wrench aria-hidden="true" /></span><div><h3>Back</h3><p>Developer-only semantic, answer, panel, and hotspot authoring.</p></div></div></header><div className="studio-form-grid"><StudioField label="Activity title"><input maxLength={300} value={publicDraft.metadata.title} onChange={(event) => mutatePublic((next) => { next.metadata.title = event.target.value; })} /></StudioField></div></section>

      <div className="native-or-question-workspace"><aside><StudioButton onClick={addQuestion} disabled={questions.length >= NATIVE_SINGLE_CHOICE_LIMITS.questions}><Plus aria-hidden="true" />Add Question</StudioButton>{questions.map((question, index) => <button type="button" key={question.id} aria-current={selectedQuestionId === question.id ? "true" : undefined} onClick={() => setSelectedQuestionId(question.id)}><strong>Question {index + 1}</strong><span>{question.prompt.trim() || "Untitled question"}</span>{teacherDraft.parts[0].solution.correctAnswers.some((entry) => entry.questionId === question.id) ? null : <em>Needs answer</em>}<code>{question.id}</code></button>)}</aside>
      {selected ? <section className="native-or-question-editor"><header><strong>Question {questions.indexOf(selected) + 1}</strong><code>{selected.id}</code><div><button type="button" disabled={questions.indexOf(selected) === 0} onClick={() => moveQuestion(-1)}>Move Up</button><button type="button" disabled={questions.indexOf(selected) === questions.length - 1} onClick={() => moveQuestion(1)}>Move Down</button><button type="button" onClick={() => deleteQuestion(selected.id)}>Delete Question</button></div></header><StudioField label="Prompt"><textarea maxLength={NATIVE_SINGLE_CHOICE_LIMITS.promptLength} value={selected.prompt} onChange={(event) => mutatePublic((next) => { next.parts[0].interaction.questions.find((question) => question.id === selected.id).prompt = event.target.value; })} /></StudioField><fieldset><legend>Options and private correct answer {answer ? null : <em>· Needs answer</em>}</legend>{selected.options.map((option, index) => <div key={option.id}><input type="radio" name={`correct-${selected.id}`} aria-label={`Mark option ${index + 1} correct`} checked={answer?.correctOptionId === option.id} onChange={() => setAnswer(option.id)} /><input maxLength={NATIVE_SINGLE_CHOICE_LIMITS.optionTextLength} value={option.text} onChange={(event) => mutatePublic((next) => { next.parts[0].interaction.questions.find((question) => question.id === selected.id).options.find((item) => item.id === option.id).text = event.target.value; })} /><button type="button" disabled={index === 0} onClick={() => moveOption(option.id, -1)}>↑</button><button type="button" disabled={index === selected.options.length - 1} onClick={() => moveOption(option.id, 1)}>↓</button><button type="button" disabled={selected.options.length <= 2} onClick={() => deleteOption(option.id)}>Delete</button><code>{option.id}</code></div>)}</fieldset><StudioButton disabled={selected.options.length >= NATIVE_SINGLE_CHOICE_LIMITS.optionsMaximum} onClick={addOption}><Plus aria-hidden="true" />Add Option</StudioButton></section> : <p>No questions yet. Add a question to begin.</p>}</div>

      <section className="native-single-choice-visual-authoring"><header><div><span className="studio-section-icon"><LayoutPanelTop aria-hidden="true" /></span><div><h3>Visual presentation</h3><p>Optional managed backgrounds with option-bound source-pixel hotspots.</p></div></div>{presentation ? <StudioButton variant="danger-ghost" onClick={disableVisual}>Remove visual mode</StudioButton> : <StudioButton variant="primary" onClick={enableVisual}><ImagePlus aria-hidden="true" />Enable visual mode</StudioButton>}</header>
      {presentation ? <div className="studio-visual-workspace"><aside className="studio-navigator"><header><div><LayoutPanelTop aria-hidden="true" /><div><h3>Panels</h3><p>Visual pages inside part-1.</p></div></div><span className="studio-count">{panels.length}</span></header><div className="studio-layer-list">{panels.map((panel, index) => <button type="button" key={panel.id} aria-current={panel.id === selectedPanelId ? "true" : undefined} onClick={() => { setSelectedPanelId(panel.id); setSelectedHotspotId(null); setDrawing(false); }}><span><strong>Panel {index + 1}</strong><small>{panel.backgroundAssetSlot ? `${panel.sourceWidth} × ${panel.sourceHeight}` : "Needs background"}</small></span></button>)}</div><StudioButton onClick={addPanel} disabled={panels.length >= NATIVE_SINGLE_CHOICE_LIMITS.panels}><Plus aria-hidden="true" />Add Panel</StudioButton>{selectedPanel ? <><StudioButton onClick={() => movePanel(-1)} disabled={panels.indexOf(selectedPanel) === 0}>Move Up</StudioButton><StudioButton onClick={() => movePanel(1)} disabled={panels.indexOf(selectedPanel) === panels.length - 1}>Move Down</StudioButton><StudioButton variant="danger-ghost" onClick={deletePanel}><Trash2 aria-hidden="true" />Delete Panel</StudioButton></> : null}</aside>
      <section className="studio-canvas-column"><StudioCanvasToolbar zoom={zoom} onZoomChange={setZoom} /><div className="studio-canvas-viewport"><div className="studio-artboard-wrap" style={{ width: `${zoom * 100}%` }}>{selectedPanel ? <NativeSingleChoiceHotspotCanvas panel={selectedPanel} assetUrl={assetUrlForSlot(selectedPanel.backgroundAssetSlot)} questions={questions} selectedHotspotId={selectedHotspotId} onSelect={(id) => { setSelectedHotspotId(id); setDrawing(false); }} onCreate={createHotspot} onChange={(area) => updateHotspot((hotspot) => { hotspot.area = area; })} onDelete={deleteHotspot} drawingEnabled={drawing} /> : <p>Select a panel.</p>}</div></div><p className="studio-canvas-hint">Choose an unmapped option, enable Draw, then drag a rectangle. Selected hotspots move and resize with the shared frame.</p></section>
      <aside className="studio-inspector"><header><span className="studio-section-icon"><ImagePlus aria-hidden="true" /></span><div><h3>{selectedHotspot ? "Hotspot properties" : "Panel properties"}</h3><p>{selectedPanel ? `Panel ${panels.indexOf(selectedPanel) + 1}` : "Select a panel."}</p></div></header>{selectedPanel ? <><label className="studio-upload-action"><Upload aria-hidden="true" /><span><strong>{uploading ? "Uploading…" : selectedPanel.backgroundAssetSlot ? "Change background" : "Upload background"}</strong><small>PNG, JPEG or WebP</small></span><input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => { uploadBackground(event.target.files?.[0]); event.target.value = ""; }} /></label><StudioField label="Option to map"><select value={drawBinding} onChange={(event) => { setDrawBinding(event.target.value); setDrawing(false); }}><option value="">Choose question and option</option>{questions.flatMap((question, questionIndex) => question.options.map((option, optionIndex) => { const value = bindingValue(question.id, option.id); return <option key={value} value={value} disabled={mappedBindings.has(value) && (!selectedHotspot || value !== bindingValue(selectedHotspot.questionId, selectedHotspot.optionId))}>Question {questionIndex + 1}, option {optionIndex + 1}: {option.text || "Untitled"}</option>; }))}</select></StudioField><StudioButton variant="primary" selected={drawing} disabled={!drawBinding || !selectedPanel.backgroundAssetSlot || Boolean(selectedHotspot)} reason={!drawBinding ? "Choose an option first" : !selectedPanel.backgroundAssetSlot ? "Upload a background first" : selectedHotspot ? "Clear the selected hotspot first" : ""} onClick={() => setDrawing((current) => !current)}>Draw hotspot</StudioButton>{selectedHotspot ? <><StudioField label="Hotspot binding"><select value={bindingValue(selectedHotspot.questionId, selectedHotspot.optionId)} onChange={(event) => { const [questionId, optionId] = event.target.value.split(":"); updateHotspot((hotspot) => { hotspot.questionId = questionId; hotspot.optionId = optionId; }); setDrawBinding(event.target.value); }}>{questions.flatMap((question, questionIndex) => question.options.map((option, optionIndex) => { const value = bindingValue(question.id, option.id); return <option key={value} value={value} disabled={mappedBindings.has(value) && value !== bindingValue(selectedHotspot.questionId, selectedHotspot.optionId)}>Question {questionIndex + 1}, option {optionIndex + 1}: {option.text || "Untitled"}</option>; }))}</select></StudioField><div className="studio-number-grid">{["x", "y", "width", "height"].map((key) => <StudioField key={key} label={key[0].toUpperCase() + key.slice(1)}><input type="number" min={["width", "height"].includes(key) ? 1 : 0} step="1" value={selectedHotspot.area[key]} onChange={(event) => updateHotspotArea(key, event.target.value)} /></StudioField>)}</div><StudioButton variant="danger-ghost" onClick={deleteHotspot}><Trash2 aria-hidden="true" />Delete Hotspot</StudioButton></> : null}</> : <p>Select or add a panel.</p>}</aside></div> : null}
      </section>
      <section className="native-or-preview"><div className="native-or-preview-toggle"><button type="button" aria-pressed={preview === "student"} onClick={() => setPreview("student")}>Student Preview</button><button type="button" aria-pressed={preview === "teacher"} onClick={() => setPreview("teacher")}>Teacher Preview</button></div><h3>{publicDraft.metadata.title}</h3>{preview === "student" ? <NativeSingleChoiceStudentSurface document={publicDraft} assetUrl={assetUrl} /> : <NativeSingleChoiceTeacherSurface publicDocument={publicDraft} teacherDocument={teacherDraft} assetUrl={assetUrl} />}</section>
    </div> : null}

    <NativeReadableTextEditor bookSlug={bookSlug} componentSlug={componentSlug} activityId={activityId} publicDraft={publicDraft} mutatePublic={mutatePublic} previewUrl={assetUrl} onIncompleteChange={setReadableTextIncomplete} onIntentChange={changed} onStatusChange={(message) => setState((current) => ({ ...current, message }))} />
    <NativeVideoEditor bookSlug={bookSlug} componentSlug={componentSlug} activityId={activityId} publicDraft={publicDraft} mutatePublic={mutatePublic} onIncompleteChange={setVideoIncomplete} onIntentChange={changed} onStatusChange={(message) => setState((current) => ({ ...current, message }))} />
    <aside className="studio-readiness" role="status" data-ready={readiness.ready && !readableTextIncomplete && !videoIncomplete || undefined}><strong>{readiness.ready && !readableTextIncomplete && !videoIncomplete ? "Ready to save" : "Before saving"}</strong>{readiness.issues.length || readableTextIncomplete || videoIncomplete ? <ul>{readiness.issues.map((issue) => <li key={issue}>{issue}</li>)}{readableTextIncomplete ? <li>Upload a readable-text image.</li> : null}{videoIncomplete ? <li>Upload one MP4 and one valid SRT subtitle file.</li> : null}</ul> : <span>Semantic, answer, visual, and security checks pass.</span>}</aside>
    <footer className="studio-save-bar"><StudioStatus dirty={dirty} saving={state.saving} message={state.message} /><StudioButton variant="primary" disabled={!dirty || state.saving || !readiness.ready || readableTextIncomplete || videoIncomplete} reason={!dirty ? "No unsaved changes" : readableTextIncomplete ? "Upload a readable-text image before saving" : videoIncomplete ? "Complete the Video setup before saving" : !readiness.ready ? "Resolve all authoring issues before saving" : ""} onClick={save}>{state.saving ? "Saving…" : "Save Draft"}</StudioButton></footer>
  </section>;
}
