import { useEffect, useMemo, useRef, useState } from "react";

import { NativeOpenResponseSurface, logicalAreaStyle } from "../../../components/native-open-response/NativeOpenResponseSurface.jsx";
import { NativeOpenResponseTeacherSurface } from "../../../components/native-open-response/NativeOpenResponseTeacherSurface.jsx";
import { NativeOpenResponseStudentSurface } from "../../../components/native-open-response/NativeOpenResponseStudentSurface.jsx";
import { createNativeChildId } from "../../../data/native-activities/nativeChildIdentity.js";
import { mergeNativeManagedAssetReference } from "../../../data/native-activities/nativeActivityPublic.js";
import { assessNativeOpenResponseReadiness, createNativeOpenResponseQuestion, duplicateNativeOpenResponseArtwork, nativeOpenResponseLinePositions, removeNativeOpenResponseArtwork } from "../../../data/native-activities/nativeOpenResponse.js";
import { autoFitNativeOpenResponseAnswer } from "../../../data/native-activities/nativeOpenResponseAutoFit.js";
import { getBuilderContent } from "./builderContentApi.js";
import { saveNativeActivityPair, uploadNativeActivityArtwork } from "./builderNativeActivityApi.js";

const clone = (value) => structuredClone(value);
const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);

function assetPreviewRoot(bookSlug, componentSlug, activityId, assetId) {
  return `/builder/api/native-activities/books/${encodeURIComponent(bookSlug)}/components/${encodeURIComponent(componentSlug)}/activities/${encodeURIComponent(activityId)}/assets/${encodeURIComponent(assetId)}/preview`;
}

function geometryLabel(type) { return type === "prompt" ? "Prompt" : type === "response" ? "Response region" : "Artwork"; }

export function NativeOpenResponseEditor({ bookSlug, componentSlug, activityId, placementLabel, onDirtyChange = () => {}, onSaved = () => {} }) {
  const [state, setState] = useState({ kind: "loading", publicRevision: 0, teacherRevision: 0, message: "" });
  const [publicDraft, setPublicDraft] = useState(null);
  const [teacherDraft, setTeacherDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState("content");
  const [preview, setPreview] = useState("student");
  const [selectedQuestionId, setSelectedQuestionId] = useState(null);
  const [selection, setSelection] = useState(null);
  const [uploading, setUploading] = useState(false);
  const drag = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading", publicRevision: 0, teacherRevision: 0, message: "" }); setPublicDraft(null); setTeacherDraft(null); setDirty(false); onDirtyChange(false);
    Promise.all([
      getBuilderContent({ bookSlug, componentSlug, resource: "native-activity-public", documentKey: activityId }, { signal: controller.signal }),
      getBuilderContent({ bookSlug, componentSlug, resource: "native-activity-teacher", documentKey: activityId }, { signal: controller.signal }),
    ]).then(([publicValue, teacherValue]) => {
      if (controller.signal.aborted) return;
      setPublicDraft(publicValue.document); setTeacherDraft(teacherValue.document);
      setState({ kind: "ready", publicRevision: publicValue.revision, teacherRevision: teacherValue.revision, message: "Saved draft" });
      setSelectedQuestionId(publicValue.document.parts[0].interaction.questions[0]?.id || null);
    }).catch((error) => { if (!controller.signal.aborted) setState({ kind: "error", message: error.message }); });
    return () => controller.abort();
  }, [activityId, bookSlug, componentSlug]);

  const markDirty = () => { setDirty(true); onDirtyChange(true); };
  const interaction = publicDraft?.parts[0].interaction;
  const questions = interaction?.questions || [];
  const selectedQuestion = questions.find((question) => question.id === selectedQuestionId) || null;
  const answer = teacherDraft?.parts[0].solution.modelAnswers.find((item) => item.questionId === selectedQuestionId) || null;
  const selectedArtwork = selection?.type === "artwork" ? interaction?.artwork.find((item) => item.id === selection.id) || null : null;
  const readiness = useMemo(() => publicDraft && teacherDraft ? assessNativeOpenResponseReadiness(publicDraft, teacherDraft) : null, [publicDraft, teacherDraft]);

  const mutatePublic = (mutator) => { setPublicDraft((current) => { const next = clone(current); mutator(next); return next; }); markDirty(); };
  const mutateTeacher = (mutator) => { setTeacherDraft((current) => { const next = clone(current); mutator(next); return next; }); markDirty(); };

  const addQuestion = () => {
    const id = createNativeChildId("q");
    mutatePublic((next) => next.parts[0].interaction.questions.push(createNativeOpenResponseQuestion(id, next.parts[0].interaction.questions.length)));
    mutateTeacher((next) => next.parts[0].solution.modelAnswers.push({ questionId: id, text: "" }));
    setSelectedQuestionId(id); setSelection({ type: "prompt", id });
  };
  const deleteQuestion = (id) => {
    if (!globalThis.confirm("Delete this question and its Teacher model answer?")) return;
    const index = questions.findIndex((question) => question.id === id);
    mutatePublic((next) => { next.parts[0].interaction.questions = next.parts[0].interaction.questions.filter((question) => question.id !== id); });
    mutateTeacher((next) => { next.parts[0].solution.modelAnswers = next.parts[0].solution.modelAnswers.filter((item) => item.questionId !== id); });
    const nextId = questions[index + 1]?.id || questions[index - 1]?.id || null; setSelectedQuestionId(nextId); setSelection(null);
  };
  const moveQuestion = (id, offset) => {
    const index = questions.findIndex((question) => question.id === id); const target = index + offset;
    if (target < 0 || target >= questions.length) return;
    mutatePublic((next) => { const list = next.parts[0].interaction.questions; [list[index], list[target]] = [list[target], list[index]]; });
    mutateTeacher((next) => { const byId = new Map(next.parts[0].solution.modelAnswers.map((item) => [item.questionId, item])); next.parts[0].solution.modelAnswers = publicDraft.parts[0].interaction.questions.map((question) => question.id).map((questionId, current) => current === index ? byId.get(questions[target].id) : current === target ? byId.get(questions[index].id) : byId.get(questionId)); });
  };
  const updateQuestion = (id, mutator) => mutatePublic((next) => mutator(next.parts[0].interaction.questions.find((question) => question.id === id)));
  const updateAnswer = (value) => mutateTeacher((next) => { next.parts[0].solution.modelAnswers.find((item) => item.questionId === selectedQuestionId).text = value; });

  const selectedArea = (() => {
    if (!selection || !interaction) return null;
    if (selection.type === "artwork") return interaction.artwork.find((item) => item.id === selection.id)?.area || null;
    const question = questions.find((item) => item.id === selection.id);
    return selection.type === "prompt" ? question?.promptArea : question?.responseRegion.area;
  })();
  const updateSelectedArea = (key, raw) => {
    const value = Number(raw); if (!Number.isFinite(value) || !selectedArea || selectedArtwork?.locked) return;
    const surface = interaction.surface;
    mutatePublic((next) => {
      const target = selection.type === "artwork" ? next.parts[0].interaction.artwork.find((item) => item.id === selection.id)
        : next.parts[0].interaction.questions.find((item) => item.id === selection.id);
      const area = selection.type === "artwork" ? target.area : selection.type === "prompt" ? target.promptArea : target.responseRegion.area;
      area[key] = key === "x" ? clamp(value, 0, surface.width - area.width) : key === "y" ? clamp(value, 0, surface.height - area.height)
        : key === "width" ? clamp(value, 1, surface.width - area.x) : clamp(value, 1, surface.height - area.y);
      if (selection.type === "response") {
        const p = target.responseRegion.presentation;
        p.lineWidth = Math.min(p.lineWidth, Math.max(1, area.width - 2 * p.paddingX));
        while (p.lineCount > 1 && p.paddingY + p.lineSpacing * p.lineCount > area.height - p.paddingY) p.lineCount -= 1;
        p.linePositions = nativeOpenResponseLinePositions(p);
      }
    });
  };

  const beginDrag = (event, mode) => {
    if (!selectedArea || selectedArtwork?.locked) return; event.preventDefault(); event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { mode, x: event.clientX, y: event.clientY, area: clone(selectedArea) };
  };
  const moveDrag = (event) => {
    if (!drag.current || !selection) return;
    const surfaceElement = event.currentTarget.closest(".native-or-surface");
    const scale = interaction.surface.width / surfaceElement.getBoundingClientRect().width;
    const dx = (event.clientX - drag.current.x) * scale; const dy = (event.clientY - drag.current.y) * scale;
    const original = drag.current.area;
    if (drag.current.mode === "move") { updateSelectedArea("x", original.x + dx); updateSelectedArea("y", original.y + dy); }
    else { updateSelectedArea("width", original.width + dx); updateSelectedArea("height", original.height + dy); }
  };

  const uploadArtwork = async (file) => {
    if (!file) return; setUploading(true); setState((current) => ({ ...current, message: "Uploading artwork…" }));
    const slot = createNativeChildId("asset");
    try {
      const uploaded = await uploadNativeActivityArtwork({ bookSlug, componentSlug, activityId, assetSlot: slot, file });
      const artworkId = createNativeChildId("art");
      mutatePublic((next) => {
        next.assets = mergeNativeManagedAssetReference(next.assets, uploaded.reference);
        next.parts[0].interaction.artwork.push({ id: artworkId, assetSlot: uploaded.reference.slot, area: { x: 160, y: 120, width: 320, height: 220 }, order: next.parts[0].interaction.artwork.length, altText: "", decorative: false, fit: "contain", locked: false });
      });
      setSelection({ type: "artwork", id: artworkId }); setTab("layout"); setState((current) => ({ ...current, message: "Artwork uploaded; save the draft to attach it." }));
    } catch (error) { setState((current) => ({ ...current, message: error.message })); }
    finally { setUploading(false); }
  };
  const removeArtwork = (id) => {
    if (!globalThis.confirm("Remove this artwork from the draft? The uploaded asset will remain retained for lifecycle cleanup.")) return;
    mutatePublic((next) => removeNativeOpenResponseArtwork(next, id));
    setSelection(null);
  };
  const duplicateArtwork = (id) => {
    const duplicateId = createNativeChildId("art");
    mutatePublic((next) => duplicateNativeOpenResponseArtwork(next.parts[0].interaction, id, duplicateId));
    setSelection({ type: "artwork", id: duplicateId });
  };

  const save = async () => {
    setState((current) => ({ ...current, saving: true, message: "Saving…" }));
    try {
      const value = await saveNativeActivityPair({ bookSlug, componentSlug, activityId, expectedPublicRevision: state.publicRevision, expectedTeacherRevision: state.teacherRevision, publicDocument: publicDraft, teacherDocument: teacherDraft });
      setPublicDraft(value.publicDocument); setTeacherDraft(value.teacherDocument); setDirty(false); onDirtyChange(false);
      setState({ kind: "ready", publicRevision: value.publicRevision, teacherRevision: value.teacherRevision, saving: false, message: "Draft saved." });
      onSaved(value.publicRevision);
    } catch (error) {
      setState((current) => ({ ...current, saving: false, message: error.status === 409 ? "This draft changed elsewhere. Reload before saving; your unsaved edits are preserved." : error.message }));
    }
  };

  if (state.kind === "loading") return <section className="native-activity-foundation" role="status">Loading native Open Response…</section>;
  if (state.kind === "error" || !publicDraft || !teacherDraft) return <section className="native-activity-foundation" role="alert">{state.message || "Native draft is unavailable."}</section>;
  const previewAsset = (assetId) => assetPreviewRoot(bookSlug, componentSlug, activityId, assetId);
  const fit = selectedQuestion && answer ? autoFitNativeOpenResponseAnswer({ text: answer.text, responseRegion: selectedQuestion.responseRegion }) : null;

  return <section className="native-activity-foundation native-or-editor">
    <header><div><span>Native draft · publishable when referenced and complete</span><h2>{publicDraft.metadata.title}</h2></div><dl><div><dt>Stable ID</dt><dd><code>{activityId}</code></dd></div><div><dt>Kind</dt><dd>Open Response</dd></div><div><dt>Placement</dt><dd>{placementLabel}</dd></div><div><dt>Revisions</dt><dd>Public {state.publicRevision} · Teacher {state.teacherRevision}</dd></div></dl></header>
    <nav className="native-or-tabs" aria-label="Open Response authoring"><button type="button" aria-current={tab === "content" ? "page" : undefined} onClick={() => setTab("content")}>Content</button><button type="button" aria-current={tab === "layout" ? "page" : undefined} onClick={() => setTab("layout")}>Layout</button><button type="button" aria-current={tab === "preview" ? "page" : undefined} onClick={() => setTab("preview")}>Local Preview</button></nav>
    {tab === "content" ? <div className="native-or-content">
      <div className="native-activity-foundation-fields"><label><span>Activity title</span><input value={publicDraft.metadata.title} maxLength={300} onChange={(event) => mutatePublic((next) => { next.metadata.title = event.target.value; })} /></label><label><span>Visible instruction</span><textarea value={publicDraft.metadata.visibleInstructionText} maxLength={2000} rows={3} onChange={(event) => mutatePublic((next) => { next.metadata.visibleInstructionText = event.target.value; })} /></label></div>
      <div className="native-or-question-workspace"><aside><button type="button" disabled={questions.length >= 20} onClick={addQuestion}>Add Question</button>{questions.map((question, index) => <button type="button" key={question.id} aria-current={selectedQuestionId === question.id ? "true" : undefined} onClick={() => setSelectedQuestionId(question.id)}>Question {index + 1}<code>{question.id}</code></button>)}</aside>
      {selectedQuestion ? <section className="native-or-question-editor"><header><strong>Question {questions.indexOf(selectedQuestion) + 1}</strong><code>{selectedQuestion.id}</code><div><button type="button" disabled={questions.indexOf(selectedQuestion) === 0} onClick={() => moveQuestion(selectedQuestion.id, -1)}>Move Up</button><button type="button" disabled={questions.indexOf(selectedQuestion) === questions.length - 1} onClick={() => moveQuestion(selectedQuestion.id, 1)}>Move Down</button><button type="button" onClick={() => deleteQuestion(selectedQuestion.id)}>Delete Question</button></div></header><label><span>Prompt</span><textarea value={selectedQuestion.prompt} maxLength={2000} rows={4} onChange={(event) => updateQuestion(selectedQuestion.id, (question) => { question.prompt = event.target.value; })} /></label><label><span>Private model answer (Teacher)</span><textarea value={answer?.text || ""} maxLength={5000} rows={5} onChange={(event) => updateAnswer(event.target.value)} /></label><p role="status" data-fit={fit?.fits}>{fit?.fits ? `Auto Fit: ${fit.lines.length} line${fit.lines.length === 1 ? "" : "s"} at ${fit.fontSize}px.` : `Auto Fit overflow: ${fit?.overflowReason}.`}</p></section> : <p>No questions yet. Add a question to begin.</p>}</div>
    </div> : null}
    {tab === "layout" ? <div className="native-or-layout"><div><NativeOpenResponseSurface document={publicDraft} assetUrl={previewAsset} selected={selection} onSelect={(value) => { setSelection(value); if (value.type !== "artwork") setSelectedQuestionId(value.id); }}>
      {selectedArea && !selectedArtwork?.locked ? <span className="native-or-manipulator" style={{ ...logicalAreaStyle(selectedArea, interaction.surface), zIndex: selection.type === "artwork" ? 39 : 90 }} onPointerDown={(event) => beginDrag(event, "move")} onPointerMove={moveDrag} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}><span className="native-or-resize" onPointerDown={(event) => { event.stopPropagation(); beginDrag(event, "resize"); }} /></span> : null}
    </NativeOpenResponseSurface></div><aside className="native-or-properties"><label className="native-or-upload"><span>{uploading ? "Uploading…" : "Upload graphic"}</span><input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => { uploadArtwork(event.target.files?.[0]); event.target.value = ""; }} /></label>{selection && selectedArea ? <><h3>{geometryLabel(selection.type)}</h3>{["x","y","width","height"].map((key) => <label key={key}><span>{key.toUpperCase()}</span><input type="number" min={key === "width" || key === "height" ? 1 : 0} step="1" value={selectedArea[key]} disabled={Boolean(selectedArtwork?.locked)} onChange={(event) => updateSelectedArea(key, event.target.value)} /></label>)}</> : <p>Select artwork, a prompt, or a response region.</p>}
      {selection?.type === "prompt" && selectedQuestion ? <><label><span>Prompt font size</span><input type="number" min="8" max="96" value={selectedQuestion.promptStyle.fontSize} onChange={(event) => updateQuestion(selectedQuestion.id, (question) => { question.promptStyle.fontSize = Number(event.target.value); })} /></label><label><span>Prompt alignment</span><select value={selectedQuestion.promptStyle.align} onChange={(event) => updateQuestion(selectedQuestion.id, (question) => { question.promptStyle.align = event.target.value; })}><option>left</option><option>center</option><option>right</option></select></label></> : null}
      {selection?.type === "response" && selectedQuestion ? <ResponseProperties question={selectedQuestion} update={(mutator) => updateQuestion(selectedQuestion.id, mutator)} fit={fit} /> : null}
      {selection?.type === "artwork" ? <ArtworkProperties item={interaction.artwork.find((item) => item.id === selection.id)} update={(mutator) => mutatePublic((next) => mutator(next.parts[0].interaction.artwork.find((item) => item.id === selection.id), next.parts[0].interaction.artwork))} duplicate={() => duplicateArtwork(selection.id)} remove={() => removeArtwork(selection.id)} /> : null}
      <section className="native-or-layers"><h3>Artwork Layers</h3>{[...interaction.artwork].sort((left, right) => right.order - left.order).map((item) => <button type="button" key={item.id} aria-current={selection?.type === "artwork" && selection.id === item.id ? "true" : undefined} onClick={() => setSelection({ type: "artwork", id: item.id })}><span>{item.altText || (item.decorative ? "Decorative graphic" : item.id)}</span>{item.locked ? <small>Locked</small> : null}</button>)}</section>
    </aside></div> : null}
    {tab === "preview" ? <div className="native-or-preview"><p><strong>Local Preview</strong> may include unsaved editor changes. Use the shared Review button for the last saved deployed Viewer state.</p><div className="native-or-preview-toggle"><button type="button" aria-pressed={preview === "student"} onClick={() => setPreview("student")}>Student Preview</button><button type="button" aria-pressed={preview === "teacher"} onClick={() => setPreview("teacher")}>Teacher Preview</button></div><h3>{publicDraft.metadata.title}</h3>{publicDraft.metadata.visibleInstructionText ? <p>{publicDraft.metadata.visibleInstructionText}</p> : null}<div hidden={preview !== "student"}><NativeOpenResponseStudentSurface document={publicDraft} assetUrl={previewAsset} /></div>{preview === "teacher" ? <NativeOpenResponseTeacherSurface publicDocument={publicDraft} teacherDocument={teacherDraft} assetUrl={previewAsset} /> : null}</div> : null}
    <aside className="native-or-readiness" role="status"><strong>{readiness.ready ? "Draft is future-publish ready" : "Incomplete draft"}</strong>{readiness.issues.length ? <ul>{readiness.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : null}</aside>
    <footer><span data-dirty={dirty || undefined} role="status">{dirty ? "Unsaved changes" : state.message}</span><button type="button" disabled={!dirty || state.saving || !publicDraft.metadata.title.trim()} onClick={save}>{state.saving ? "Saving…" : "Save Draft"}</button></footer>
  </section>;
}

function ResponseProperties({ question, update, fit }) {
  const p = question.responseRegion.presentation;
  const change = (key, value) => update((target) => {
    const presentation = target.responseRegion.presentation;
    presentation[key] = value;
    if (["paddingY", "lineSpacing", "lineCount"].includes(key)) presentation.linePositions = nativeOpenResponseLinePositions(presentation);
  });
  return <><label><span>Accessibility label</span><input value={question.responseRegion.ariaLabel} maxLength={300} onChange={(event) => update((target) => { target.responseRegion.ariaLabel = event.target.value; })} /></label>{[["paddingX",0,100],["paddingY",0,100],["lineCount",1,20],["lineSpacing",8,120],["lineWidth",1,question.responseRegion.area.width],["answerFontSizeMin",8,48],["answerFontSizeMax",8,72]].map(([key,min,max]) => <label key={key}><span>{key}</span><input type="number" min={min} max={max} value={p[key]} onChange={(event) => change(key, Number(event.target.value))} /></label>)}<label><span>Answer alignment</span><select value={p.align} onChange={(event) => change("align", event.target.value)}><option>left</option><option>center</option><option>right</option></select></label><p role="status" data-fit={fit?.fits}>{fit?.fits ? "Auto Fit passes." : `Auto Fit overflow: ${fit?.overflowReason}.`}</p></>;
}

function ArtworkProperties({ item, update, duplicate, remove }) {
  if (!item) return null;
  const moveOrder = (where) => update((target, list) => { const index = list.indexOf(target); const nextIndex = where === "back" ? 0 : where === "front" ? list.length - 1 : clamp(index + where, 0, list.length - 1); if (index === nextIndex) return; list.splice(index, 1); list.splice(nextIndex, 0, target); list.forEach((entry, order) => { entry.order = order; }); });
  return <><code>{item.id}</code><label><input type="checkbox" checked={item.locked} onChange={(event) => update((target) => { target.locked = event.target.checked; })} /> Lock position and size</label><label><span>Alt text</span><textarea value={item.altText} maxLength={2000} onChange={(event) => update((target) => { target.altText = event.target.value; })} /></label><label><input type="checkbox" checked={item.decorative} onChange={(event) => update((target) => { target.decorative = event.target.checked; })} /> Decorative</label><label><span>Fit</span><select value={item.fit} onChange={(event) => update((target) => { target.fit = event.target.value; })}><option value="contain">Contain</option><option value="cover">Cover</option></select></label><div className="native-or-order-actions"><button type="button" disabled={item.order === 0} onClick={() => moveOrder("back")}>Send to Back</button><button type="button" disabled={item.order === 0} onClick={() => moveOrder(-1)}>Send Backward</button><button type="button" onClick={() => moveOrder(1)}>Bring Forward</button><button type="button" onClick={() => moveOrder("front")}>Bring to Front</button></div><button type="button" onClick={duplicate}>Duplicate graphic</button><button type="button" onClick={remove}>Remove graphic</button></>;
}
