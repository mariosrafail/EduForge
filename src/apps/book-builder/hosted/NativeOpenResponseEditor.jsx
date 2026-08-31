import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BookOpenText, Eye, FileText, Film, ImagePlus, Layers3, LayoutPanelTop, Plus, ShieldCheck, Trash2, Upload } from "lucide-react";

import { StageSelectionFrame } from "../../../components/builder-studio/StageSelectionFrame.jsx";
import { QuickNumber } from "../../../components/builder-studio/StageGeometryControls.jsx";
import { StudioButton, StudioCanvasToolbar, StudioField, StudioSaveBar, StudioTabWorkspace } from "../../../components/builder-studio/StudioControls.jsx";
import { NativeOpenResponseFontSurface } from "../../../components/native-open-response/NativeOpenResponseSurface.jsx";
import { NativeOpenResponseTeacherSurface } from "../../../components/native-open-response/NativeOpenResponseTeacherSurface.jsx";
import { NativeOpenResponseStudentSurface } from "../../../components/native-open-response/NativeOpenResponseStudentSurface.jsx";
import { NativeReadableTextPresentation } from "../../../components/native-readable-text/NativeReadableTextPresentation.jsx";
import { createNativeChildId } from "../../../data/native-activities/nativeChildIdentity.js";
import { mergeNativeManagedAssetReference, removeNativeManagedAssetReferenceIfUnused } from "../../../data/native-activities/nativeActivityPublic.js";
import { duplicateNativeImage } from "../../../data/native-activities/nativeImage.js";
import { assessNativeOpenResponseReadiness, commitNativeOpenResponseConfiguredFontSize, createNativeOpenResponseQuestion, initialNativeOpenResponseArtworkArea, nativeOpenResponseLinePositions, nativeOpenResponsePanelPromptIds, nativeOpenResponsePanelResponseIds, promoteNativeOpenResponsePanels, removeNativeOpenResponsePanel, resizeNativeOpenResponseRegion, updateNativeOpenResponsePanelMembership } from "../../../data/native-activities/nativeOpenResponse.js";
import { autoFitNativeOpenResponseAnswer } from "../../../data/native-activities/nativeOpenResponseAutoFit.js";
import { getBuilderContent } from "./builderContentApi.js";
import { getBuilderFontLibrary, nativeFontPreviewUrl, saveNativeActivityPair, uploadNativeActivityArtwork } from "./builderNativeActivityApi.js";
import { projectNativeActivityPublicForAuthoring } from "./nativeActivityAuthoringProjection.js";
import { NativeReadableTextEditor } from "./NativeReadableTextEditor.jsx";
import { NativeVideoEditor } from "./NativeVideoEditor.jsx";
import { NativeActivityFontControls } from "./NativeCompleteSentencesFontControls.jsx";

const clone = (value) => structuredClone(value);
const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);

function assetPreviewRoot(bookSlug, componentSlug, activityId, assetId) {
  return `/builder/api/native-activities/books/${encodeURIComponent(bookSlug)}/components/${encodeURIComponent(componentSlug)}/activities/${encodeURIComponent(activityId)}/assets/${encodeURIComponent(assetId)}/preview`;
}

function geometryLabel(type) { return type === "prompt" ? "Prompt" : type === "response" ? "Response region" : "Artwork"; }
function blocksMiddlePan(target) { return target instanceof Element && Boolean(target.closest("button,input,textarea,select,a,summary,[contenteditable='true']")); }
function answerFitMessage(presentation, fit) {
  if (!fit) return `Requested ${presentation.answerFontSizeMax}px · rendered size is unavailable until a model answer exists.`;
  if (!fit?.fits) return `Requested ${presentation.answerFontSizeMax}px · rendered ${fit?.fontSize}px · overflow: ${fit?.overflowReason}.`;
  const lines = `${fit.lines.length} line${fit.lines.length === 1 ? "" : "s"}`;
  return fit.fontSize < presentation.answerFontSizeMax
    ? `Auto-fit applied: requested ${presentation.answerFontSizeMax}px · rendered ${fit.fontSize}px across ${lines}.`
    : `Requested and rendered at ${fit.fontSize}px across ${lines}.`;
}
const tabs = [
  { id: "content", label: "Content", icon: FileText },
  { id: "layout", label: "Layout", icon: LayoutPanelTop },
  { id: "readable-text", label: "Readable Text", icon: BookOpenText },
  { id: "video", label: "Video", icon: Film },
  { id: "preview", label: "Local Preview", icon: Eye },
];

export function NativeOpenResponseEditor({ bookSlug, componentSlug, activityId, placementLabel, onDirtyChange = () => {}, onSaved = () => {} }) {
  const [state, setState] = useState({ kind: "loading", publicRevision: 0, teacherRevision: 0, message: "" });
  const [publicDraft, setPublicDraft] = useState(null);
  const [teacherDraft, setTeacherDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState("content");
  const [preview, setPreview] = useState("student");
  const [selectedQuestionId, setSelectedQuestionId] = useState(null);
  const [panelId, setPanelId] = useState(null);
  const [selection, setSelection] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [readableTextIncomplete, setReadableTextIncomplete] = useState(false);
  const [videoIncomplete, setVideoIncomplete] = useState(false);
  const [fonts, setFonts] = useState([]);
  const [panning, setPanning] = useState(false);
  const [fitViewportHeight, setFitViewportHeight] = useState(null);
  const canvasViewportRef = useRef(null);
  const panRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading", publicRevision: 0, teacherRevision: 0, message: "" }); setPublicDraft(null); setTeacherDraft(null); setTab("content"); setDirty(false); onDirtyChange(false);
    Promise.all([
      getBuilderContent({ bookSlug, componentSlug, resource: "native-activity-public", documentKey: activityId }, { signal: controller.signal }),
      getBuilderContent({ bookSlug, componentSlug, resource: "native-activity-teacher", documentKey: activityId }, { signal: controller.signal }),
      getBuilderFontLibrary({ bookSlug, componentSlug }, { signal: controller.signal }),
    ]).then(([publicValue, teacherValue, fontLibrary]) => {
      if (controller.signal.aborted) return;
      const projected = projectNativeActivityPublicForAuthoring(publicValue.document);
      projected.parts[0].interaction = promoteNativeOpenResponsePanels(projected.parts[0].interaction);
      setPublicDraft(projected); setTeacherDraft(teacherValue.document);
      setFonts(fontLibrary);
      setState({ kind: "ready", publicRevision: publicValue.revision, teacherRevision: teacherValue.revision, message: "Saved draft" });
      setSelectedQuestionId(publicValue.document.parts[0].interaction.questions[0]?.id || null);
      setPanelId(projected.parts[0].interaction.presentation.panels[0]?.id || null);
    }).catch((error) => { if (!controller.signal.aborted) setState({ kind: "error", message: error.message }); });
    return () => controller.abort();
  }, [activityId, bookSlug, componentSlug]);
  useEffect(() => {
    if (zoom !== 1 || !canvasViewportRef.current) return;
    canvasViewportRef.current.scrollLeft = 0;
    canvasViewportRef.current.scrollTop = 0;
  }, [zoom]);

  const markDirty = () => { setDirty(true); onDirtyChange(true); };
  const interaction = publicDraft?.parts[0].interaction;
  const questions = interaction?.questions || [];
  const panels = interaction?.presentation?.panels || [];
  const panel = panels.find((entry) => entry.id === panelId) || panels[0] || null;
  const selectedQuestion = questions.find((question) => question.id === selectedQuestionId) || null;
  const answer = teacherDraft?.parts[0].solution.modelAnswers.find((item) => item.questionId === selectedQuestionId) || null;
  const selectedArtwork = selection?.type === "artwork" ? panel?.images.find((item) => item.id === selection.id) || null : null;
  const questionPanelCount = (questionId) => panels.filter((entry) => nativeOpenResponsePanelPromptIds(entry).includes(questionId) || nativeOpenResponsePanelResponseIds(entry).includes(questionId)).length;
  const readiness = useMemo(() => publicDraft && teacherDraft ? assessNativeOpenResponseReadiness(publicDraft, teacherDraft) : null, [publicDraft, teacherDraft]);

  useLayoutEffect(() => {
    const viewport = canvasViewportRef.current;
    const surface = panel?.surface;
    if (tab !== "layout" || !viewport || !surface) return undefined;
    const measure = () => {
      const styles = getComputedStyle(viewport);
      const horizontalPadding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const verticalPadding = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
      const artboardWidth = Math.max(1, viewport.clientWidth - horizontalPadding);
      setFitViewportHeight(Math.ceil(artboardWidth * surface.height / surface.width + verticalPadding));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [panel?.surface.height, panel?.surface.width, tab]);

  const mutatePublic = (mutator) => { setPublicDraft((current) => { const next = clone(current); mutator(next); return next; }); markDirty(); };
  const mutateTeacher = (mutator) => { setTeacherDraft((current) => { const next = clone(current); mutator(next); return next; }); markDirty(); };

  const beginCanvasPan = (event) => {
    if (event.button !== 1 || blocksMiddlePan(event.target)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    panRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, scrollLeft: event.currentTarget.scrollLeft, scrollTop: event.currentTarget.scrollTop };
    setPanning(true);
  };
  const moveCanvasPan = (event) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.currentTarget.scrollLeft = pan.scrollLeft - (event.clientX - pan.clientX);
    event.currentTarget.scrollTop = pan.scrollTop - (event.clientY - pan.clientY);
  };
  const endCanvasPan = (event) => {
    if (!panRef.current || panRef.current.pointerId !== event.pointerId) return;
    event.preventDefault();
    panRef.current = null;
    setPanning(false);
  };
  const changeCanvasZoom = (nextZoom) => {
    setZoom(nextZoom);
    if (nextZoom === 1 && canvasViewportRef.current) {
      canvasViewportRef.current.scrollLeft = 0;
      canvasViewportRef.current.scrollTop = 0;
    }
  };

  const addQuestion = () => {
    const id = createNativeChildId("q");
    mutatePublic((next) => {
      const current = next.parts[0].interaction;
      current.questions.push(createNativeOpenResponseQuestion(id, current.questions.length));
      const targetPanel = current.presentation.panels.find((entry) => entry.id === panel?.id) || current.presentation.panels[0];
      if (targetPanel) {
        updateNativeOpenResponsePanelMembership(current, targetPanel.id, id, "prompt", true);
        updateNativeOpenResponsePanelMembership(current, targetPanel.id, id, "response", true);
      }
    });
    mutateTeacher((next) => next.parts[0].solution.modelAnswers.push({ questionId: id, text: "" }));
    setSelectedQuestionId(id); setSelection({ type: "prompt", id });
  };
  const deleteQuestion = (id) => {
    if (!globalThis.confirm("Delete this question and its Teacher model answer?")) return;
    const index = questions.findIndex((question) => question.id === id);
    mutatePublic((next) => { const current = next.parts[0].interaction; current.questions = current.questions.filter((question) => question.id !== id); current.presentation.panels.forEach((entry) => { if (Object.hasOwn(entry, "questionIds")) entry.questionIds = entry.questionIds.filter((questionId) => questionId !== id); else { entry.promptQuestionIds = entry.promptQuestionIds.filter((questionId) => questionId !== id); entry.responseQuestionIds = entry.responseQuestionIds.filter((questionId) => questionId !== id); } }); });
    mutateTeacher((next) => { next.parts[0].solution.modelAnswers = next.parts[0].solution.modelAnswers.filter((item) => item.questionId !== id); });
    const nextId = questions[index + 1]?.id || questions[index - 1]?.id || null; setSelectedQuestionId(nextId); setSelection(null);
  };
  const moveQuestion = (id, offset) => {
    const index = questions.findIndex((question) => question.id === id); const target = index + offset;
    if (target < 0 || target >= questions.length) return;
    mutatePublic((next) => {
      const interactionValue = next.parts[0].interaction;
      const list = interactionValue.questions;
      [list[index], list[target]] = [list[target], list[index]];
      const canonicalIds = list.map((question) => question.id);
      interactionValue.presentation.panels.forEach((entry) => {
        if (Object.hasOwn(entry, "questionIds")) return;
        for (const key of ["promptQuestionIds", "responseQuestionIds"]) {
          const membership = new Set(entry[key]);
          entry[key] = canonicalIds.filter((questionId) => membership.has(questionId));
        }
      });
    });
    mutateTeacher((next) => { const byId = new Map(next.parts[0].solution.modelAnswers.map((item) => [item.questionId, item])); next.parts[0].solution.modelAnswers = publicDraft.parts[0].interaction.questions.map((question) => question.id).map((questionId, current) => current === index ? byId.get(questions[target].id) : current === target ? byId.get(questions[index].id) : byId.get(questionId)); });
  };
  const updateQuestion = (id, mutator) => mutatePublic((next) => mutator(next.parts[0].interaction.questions.find((question) => question.id === id)));
  const updateAnswer = (value) => mutateTeacher((next) => { next.parts[0].solution.modelAnswers.find((item) => item.questionId === selectedQuestionId).text = value; });

  const selectedArea = (() => {
    if (!selection || !interaction) return null;
    if (selection.type === "artwork") return panel?.images.find((item) => item.id === selection.id)?.area || null;
    const question = questions.find((item) => item.id === selection.id);
    return selection.type === "prompt" ? question?.promptArea : question?.responseRegion.area;
  })();
  const commitSelectedArea = (nextArea) => {
    if (!selectedArea || selectedArtwork?.locked) return;
    const surface = panel.surface;
    mutatePublic((next) => {
      const nextPanel = next.parts[0].interaction.presentation.panels.find((entry) => entry.id === panel.id);
      const target = selection.type === "artwork" ? nextPanel.images.find((item) => item.id === selection.id)
        : next.parts[0].interaction.questions.find((item) => item.id === selection.id);
      const area = selection.type === "artwork" ? target.area : selection.type === "prompt" ? target.promptArea : target.responseRegion.area;
      const normalized = {
        x: clamp(nextArea.x, 0, surface.width - nextArea.width),
        y: clamp(nextArea.y, 0, surface.height - nextArea.height),
        width: 0,
        height: 0,
      };
      normalized.width = clamp(nextArea.width, 1, surface.width - normalized.x);
      normalized.height = clamp(nextArea.height, 1, surface.height - normalized.y);
      if (selection.type === "response") resizeNativeOpenResponseRegion(target.responseRegion, normalized);
      else Object.assign(area, normalized);
    });
  };
  const updateSelectedArea = (key, raw) => {
    const value = Number(raw);
    if (!Number.isFinite(value) || !selectedArea || selectedArtwork?.locked) return;
    const surface = panel.surface;
    const next = { ...selectedArea };
    next[key] = key === "x" ? clamp(value, 0, surface.width - next.width) : key === "y" ? clamp(value, 0, surface.height - next.height)
      : key === "width" ? clamp(value, 1, surface.width - next.x) : clamp(value, 1, surface.height - next.y);
    commitSelectedArea(next);
  };
  const changeResponsePresentation = (questionId, key, value) => updateQuestion(questionId, (target) => {
    const presentation = target.responseRegion.presentation;
    presentation[key] = value;
    if (key === "paddingX") presentation.lineWidth = Math.min(presentation.lineWidth, Math.max(1, target.responseRegion.area.width - 2 * value));
    if (key === "lineSpacing") {
      presentation.answerFontSizeMax = Math.min(presentation.answerFontSizeMax, Math.floor(value * .9), 72);
      presentation.answerFontSizeMin = Math.min(presentation.answerFontSizeMin, presentation.answerFontSizeMax);
    }
    if (key === "answerFontSizeMin") presentation.answerFontSizeMin = Math.min(Math.max(value, 8), presentation.answerFontSizeMax, 48);
    if (["paddingY", "lineSpacing", "lineCount"].includes(key)) presentation.linePositions = nativeOpenResponseLinePositions(presentation);
  });

  const recordUploadedFont = (font) => setFonts((current) => current.some((entry) => entry.assetId === font.assetId) ? current : [...current, font]);
  const setAnswerFont = (font) => mutatePublic((next) => {
    const target = next.parts[0].interaction.questions.find((question) => question.id === selectedQuestionId);
    const previousSlot = target.responseRegion.presentation.answerFontAssetSlot;
    if (font) {
      next.assets = mergeNativeManagedAssetReference(next.assets, { assetId: font.assetId, checksumSha256: font.checksumSha256, role: font.role, slot: font.slot });
      target.responseRegion.presentation.answerFontAssetSlot = font.slot;
    } else {
      delete target.responseRegion.presentation.answerFontAssetSlot;
    }
    if (previousSlot && previousSlot !== font?.slot) removeNativeManagedAssetReferenceIfUnused(next, previousSlot);
  });

  const uploadArtwork = async (file, { background = false, replaceId = null } = {}) => {
    if (!file) return; setUploading(true); setState((current) => ({ ...current, message: "Uploading artwork…" }));
    const slot = createNativeChildId("asset");
    try {
      const uploaded = await uploadNativeActivityArtwork({ bookSlug, componentSlug, activityId, assetSlot: slot, file });
      const artworkId = replaceId || createNativeChildId("img");
      mutatePublic((next) => {
        next.assets = mergeNativeManagedAssetReference(next.assets, uploaded.reference);
        const currentPanel = next.parts[0].interaction.presentation.panels.find((entry) => entry.id === panel.id);
        const replacing = currentPanel.images.find((entry) => entry.id === replaceId);
        if (replacing) {
          const previousSlot = replacing.assetSlot; replacing.assetSlot = uploaded.reference.slot;
          removeNativeManagedAssetReferenceIfUnused(next, previousSlot);
        } else {
          const image = { id: artworkId, assetSlot: uploaded.reference.slot, area: background ? { x: 0, y: 0, ...currentPanel.surface } : initialNativeOpenResponseArtworkArea(currentPanel.surface, uploaded.metadata), order: background ? 0 : currentPanel.images.length, altText: "", decorative: background, fit: background ? "cover" : "contain", locked: false };
          if (background) currentPanel.images.unshift(image); else currentPanel.images.push(image);
          currentPanel.images.forEach((entry, order) => { entry.order = order; });
        }
      });
      setSelection({ type: "artwork", id: artworkId }); setTab("layout"); setState((current) => ({ ...current, message: "Artwork uploaded; save the draft to attach it." }));
    } catch (error) { setState((current) => ({ ...current, message: error.message })); }
    finally { setUploading(false); }
  };
  const removeArtwork = (id) => {
    if (!globalThis.confirm("Remove this artwork from the draft? The uploaded asset will remain retained for lifecycle cleanup.")) return;
    mutatePublic((next) => { const currentPanel = next.parts[0].interaction.presentation.panels.find((entry) => entry.id === panel.id); const removed = currentPanel.images.find((entry) => entry.id === id); currentPanel.images = currentPanel.images.filter((entry) => entry.id !== id).map((entry, order) => ({ ...entry, order })); if (removed) removeNativeManagedAssetReferenceIfUnused(next, removed.assetSlot); });
    setSelection(null);
  };
  const duplicateArtwork = (id) => {
    const duplicateId = createNativeChildId("img");
    mutatePublic((next) => { const currentPanel = next.parts[0].interaction.presentation.panels.find((entry) => entry.id === panel.id); duplicateNativeImage({ kind: "image", surface: currentPanel.surface, images: currentPanel.images }, id, duplicateId); });
    setSelection({ type: "artwork", id: duplicateId });
  };

  const addPanel = () => {
    const id = createNativeChildId("panel");
    mutatePublic((next) => next.parts[0].interaction.presentation.panels.push({ id, surface: { width: 1024, height: 582 }, images: [], questionIds: [] }));
    setPanelId(id); setSelection(null);
  };
  const deletePanel = () => {
    if (!panel || !globalThis.confirm("Delete this visual panel? Its semantic questions and private model answers will be preserved as unassigned.")) return;
    const index = panels.indexOf(panel); const nextId = panels[index + 1]?.id || panels[index - 1]?.id || null;
    mutatePublic((next) => removeNativeOpenResponsePanel(next, panel.id)); setPanelId(nextId); setSelection(null);
  };
  const changePanelMembership = (questionId, membership, included) => {
    mutatePublic((next) => {
      const result = updateNativeOpenResponsePanelMembership(next.parts[0].interaction, panel.id, questionId, membership, included);
      if (result.repositioned) setState((current) => ({ ...current, message: `${membership === "prompt" ? "Prompt" : "Answer box"} geometry was clamped to fit this panel; review its layout.` }));
    });
    if (!included && selection?.id === questionId && selection.type === membership) setSelection(null);
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
  const previewAsset = (assetId) => publicDraft.assets.find((asset) => asset.assetId === assetId)?.role === "activity_font"
    ? nativeFontPreviewUrl(bookSlug, componentSlug, assetId)
    : assetPreviewRoot(bookSlug, componentSlug, activityId, assetId);
  const fit = selectedQuestion && answer ? autoFitNativeOpenResponseAnswer({ text: answer.text, responseRegion: selectedQuestion.responseRegion }) : null;
  const readinessIssues = [...readiness.issues, readableTextIncomplete ? "Upload a readable-text image." : "", videoIncomplete ? "Upload one MP4 and one valid SRT subtitle file." : ""].filter(Boolean);
  const readyToSave = readiness.ready && !readableTextIncomplete && !videoIncomplete;

  return <section className="native-activity-foundation native-or-editor studio-editor studio-open-response">
    <header className="studio-editor-header"><div><span className="studio-eyebrow">{placementLabel} · Open Response</span><h2>{publicDraft.metadata.title}</h2><p>{readiness.ready ? "Content complete" : "Content needs attention"}</p></div><details className="builder-technical-details"><summary>Technical details</summary><dl><div><dt>Stable ID</dt><dd><code>{activityId}</code></dd></div><div><dt>Revisions</dt><dd>Public {state.publicRevision} · Teacher {state.teacherRevision}</dd></div></dl></details></header>
    <StudioTabWorkspace id="native-open-response-tabs" value={tab} onChange={setTab} tabs={tabs} label="Open Response authoring modes">
    {tab === "layout" ? <section className="native-or-panel-authoring" aria-label="Visual panels"><header><strong>Visual panels</strong><button type="button" onClick={addPanel} disabled={panels.length >= 12}><Plus aria-hidden="true" /> Add Panel</button></header><div>{panels.map((entry, index) => { const promptCount = nativeOpenResponsePanelPromptIds(entry).length; const responseCount = nativeOpenResponsePanelResponseIds(entry).length; return <div key={entry.id}><button type="button" aria-current={panel?.id === entry.id ? "true" : undefined} onClick={() => { setPanelId(entry.id); setSelection(null); }}>Panel {index + 1} · {promptCount} prompt{promptCount === 1 ? "" : "s"} · {responseCount} box{responseCount === 1 ? "" : "es"} · {entry.images.length} image{entry.images.length === 1 ? "" : "s"}</button><button type="button" aria-label={`Move panel ${index + 1} up`} disabled={index === 0} onClick={() => { setPanelId(entry.id); mutatePublic((next) => { const list = next.parts[0].interaction.presentation.panels; const current = list.findIndex((item) => item.id === entry.id); [list[current - 1], list[current]] = [list[current], list[current - 1]]; }); }}>Move Up</button><button type="button" aria-label={`Move panel ${index + 1} down`} disabled={index === panels.length - 1} onClick={() => { setPanelId(entry.id); mutatePublic((next) => { const list = next.parts[0].interaction.presentation.panels; const current = list.findIndex((item) => item.id === entry.id); [list[current], list[current + 1]] = [list[current + 1], list[current]]; }); }}>Move Down</button></div>; })}</div></section> : null}
    {tab === "content" ? <div className="native-or-content">
      <div className="native-activity-foundation-fields"><label><span>Activity title</span><input value={publicDraft.metadata.title} maxLength={300} onChange={(event) => mutatePublic((next) => { next.metadata.title = event.target.value; })} /></label></div>
      <div className="native-or-question-workspace"><aside><button className="studio-primary-action" type="button" disabled={questions.length >= 20} onClick={addQuestion}><Plus aria-hidden="true" /> Add Question</button>{questions.map((question, index) => { const panelCount = questionPanelCount(question.id); return <button type="button" key={question.id} aria-current={selectedQuestionId === question.id ? "true" : undefined} onClick={() => setSelectedQuestionId(question.id)}><strong>Question {index + 1}</strong><span>{question.prompt.trim() || "Untitled question"}</span><small>{panelCount ? `Shown on ${panelCount} panel${panelCount === 1 ? "" : "s"}` : "Unassigned"}</small><code>{question.id}</code></button>; })}</aside>
      {selectedQuestion ? <section className="native-or-question-editor"><header><strong>Question {questions.indexOf(selectedQuestion) + 1}</strong><code>{selectedQuestion.id}</code><div><button type="button" disabled={questions.indexOf(selectedQuestion) === 0} title={questions.indexOf(selectedQuestion) === 0 ? "Already first" : undefined} onClick={() => moveQuestion(selectedQuestion.id, -1)}>Move Up</button><button type="button" disabled={questions.indexOf(selectedQuestion) === questions.length - 1} title={questions.indexOf(selectedQuestion) === questions.length - 1 ? "Already last" : undefined} onClick={() => moveQuestion(selectedQuestion.id, 1)}>Move Down</button><button className="studio-danger-action" type="button" onClick={() => deleteQuestion(selectedQuestion.id)}><Trash2 aria-hidden="true" /> Delete Question</button></div></header><label><span>Prompt</span><textarea value={selectedQuestion.prompt} maxLength={2000} rows={4} onChange={(event) => updateQuestion(selectedQuestion.id, (question) => { question.prompt = event.target.value; })} /></label><label className="studio-teacher-field"><span><ShieldCheck aria-hidden="true" /> Private model answer <small>Teacher only · never shown to students</small></span><textarea value={answer?.text || ""} maxLength={5000} rows={5} onChange={(event) => updateAnswer(event.target.value)} /></label><p role="status" data-fit={fit?.fits}>{answerFitMessage(selectedQuestion.responseRegion.presentation, fit)}</p></section> : <p>No questions yet. Add a question to begin.</p>}</div>
    </div> : null}
    {tab === "layout" && panel ? <PanelCompositionControls panel={panel} questions={questions} onChange={changePanelMembership} /> : null}
    {tab === "layout" ? panel ? <div className="native-or-layout studio-or-layout"><div className="studio-canvas-column"><StudioCanvasToolbar zoom={zoom} onZoomChange={changeCanvasZoom}>
      <div className="native-or-toolbar-actions"><label className="native-or-upload studio-upload-action"><ImagePlus aria-hidden="true" /><span>{uploading ? "Uploading…" : "Add Background"}</span><input aria-label="Add Background" type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => { uploadArtwork(event.target.files?.[0], { background: true }); event.target.value = ""; }} /></label><label className="native-or-upload studio-upload-action"><Layers3 aria-hidden="true" /><span>{uploading ? "Uploading…" : "Add Image"}</span><input aria-label="Add Image" type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => { uploadArtwork(event.target.files?.[0]); event.target.value = ""; }} /></label>{selectedArtwork ? <label className="native-or-upload studio-upload-action"><Upload aria-hidden="true" /><span>Replace image</span><input aria-label="Replace image" type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => { uploadArtwork(event.target.files?.[0], { replaceId: selectedArtwork.id }); event.target.value = ""; }} /></label> : null}<button className="studio-danger-action" type="button" onClick={deletePanel}><Trash2 aria-hidden="true" /> Delete Panel</button><section className="native-or-layers" aria-label="Artwork Layers"><strong>Artwork Layers</strong><div>{[...panel.images].sort((left, right) => right.order - left.order).map((item) => <button type="button" key={item.id} aria-current={selection?.type === "artwork" && selection.id === item.id ? "true" : undefined} onClick={() => setSelection({ type: "artwork", id: item.id })}><span>{item.altText || (item.decorative ? "Decorative graphic" : item.id)}</span>{item.locked ? <small>Locked</small> : null}</button>)}</div></section></div>
      <OpenResponseQuickControls selection={selection} area={selectedArea} question={selectedQuestion} artwork={selectedArtwork} artworkList={panel.images} surface={panel.surface} updateArea={updateSelectedArea} changeResponse={changeResponsePresentation} updateQuestion={updateQuestion} updateArtwork={(mutator) => mutatePublic((next) => { const list = next.parts[0].interaction.presentation.panels.find((entry) => entry.id === panel.id).images; mutator(list.find((item) => item.id === selection?.id), list); })} duplicateArtwork={() => duplicateArtwork(selection.id)} removeArtwork={() => removeArtwork(selection.id)} fit={fit} bookSlug={bookSlug} componentSlug={componentSlug} fonts={fonts} setAnswerFont={setAnswerFont} recordUploadedFont={recordUploadedFont} onMessage={(message) => setState((current) => ({ ...current, message }))} />
    </StudioCanvasToolbar><div ref={canvasViewportRef} className={`studio-canvas-viewport ${panning ? "is-middle-panning" : ""}`} style={fitViewportHeight ? { height: `${fitViewportHeight}px` } : undefined} data-middle-pan="true" onPointerDown={beginCanvasPan} onPointerMove={moveCanvasPan} onPointerUp={endCanvasPan} onPointerCancel={endCanvasPan} onAuxClick={(event) => { if (event.button === 1) event.preventDefault(); }}><div className="studio-artboard-wrap" style={{ width: `${zoom * 100}%` }}><NativeOpenResponseFontSurface className="studio-artboard" document={publicDraft} panel={panel} assetUrl={previewAsset} selected={selection} onSelect={(value) => { setSelection(value); if (value && value.type !== "artwork") setSelectedQuestionId(value.id); }}>
      {selectedArea ? <StageSelectionFrame geometry={selectedArea} stage={panel.surface} label={geometryLabel(selection.type)} locked={Boolean(selectedArtwork?.locked)} minWidth={selection.type === "response" ? Math.max(80, 2 * selectedQuestion.responseRegion.presentation.paddingX + 1) : 24} minHeight={selection.type === "response" ? Math.max(44, 2 * selectedQuestion.responseRegion.presentation.paddingY + selectedQuestion.responseRegion.presentation.lineSpacing) : 24} moveFromGrip={selection.type !== "artwork"} onChange={commitSelectedArea} onClear={() => setSelection(null)} onDelete={selection.type === "artwork" ? () => removeArtwork(selection.id) : undefined} zIndex={selection.type === "artwork" ? 39 : 90} /> : null}
    </NativeOpenResponseFontSurface></div></div><p className="studio-canvas-hint">Move using the selection grip · Resize from any corner · Middle-drag pans when zoomed · Arrow keys nudge</p></div></div> : <p>Add a panel to begin layout authoring.</p> : null}
    {tab === "preview" ? <div className="native-or-preview"><p><strong>Local Preview</strong> may include unsaved editor changes. Use the shared Review button for the last saved deployed Viewer state.</p><div className="native-or-preview-toggle"><button type="button" aria-pressed={preview === "student"} onClick={() => setPreview("student")}>Student Preview</button><button type="button" aria-pressed={preview === "teacher"} onClick={() => setPreview("teacher")}>Teacher Preview</button></div><h3>{publicDraft.metadata.title}</h3><NativeReadableTextPresentation document={publicDraft} assetUrl={previewAsset}>{(presentation, audioHotspotPresentation) => <><div hidden={preview !== "student"}><NativeOpenResponseStudentSurface document={publicDraft} assetUrl={previewAsset} audioHotspotPresentation={audioHotspotPresentation} /></div>{preview === "teacher" ? <NativeOpenResponseTeacherSurface publicDocument={publicDraft} teacherDocument={teacherDraft} assetUrl={previewAsset} presentation={presentation} audioHotspotPresentation={audioHotspotPresentation} /> : null}</>}</NativeReadableTextPresentation></div> : null}
    {tab === "readable-text" ? <NativeReadableTextEditor bookSlug={bookSlug} componentSlug={componentSlug} activityId={activityId} publicDraft={publicDraft} mutatePublic={mutatePublic} previewUrl={previewAsset} onIncompleteChange={setReadableTextIncomplete} onIntentChange={markDirty} onStatusChange={(message) => setState((current) => ({ ...current, message }))} /> : null}
    {tab === "video" ? <NativeVideoEditor bookSlug={bookSlug} componentSlug={componentSlug} activityId={activityId} publicDraft={publicDraft} mutatePublic={mutatePublic} onIncompleteChange={setVideoIncomplete} onIntentChange={markDirty} onStatusChange={(message) => setState((current) => ({ ...current, message }))} /> : null}
    </StudioTabWorkspace>
    <StudioSaveBar dirty={dirty} saving={state.saving} message={state.message} ready={readyToSave} issues={readinessIssues} disabled={!dirty || state.saving || !publicDraft.metadata.title.trim() || readableTextIncomplete || videoIncomplete} reason={!dirty ? "No unsaved changes" : readableTextIncomplete ? "Upload a readable-text image before saving" : videoIncomplete ? "Complete the Video setup before saving" : "Add an activity title before saving"} onSave={save} />
  </section>;
}

function PanelCompositionControls({ panel, questions, onChange }) {
  const groups = [
    { membership: "prompt", heading: "Questions / prompts on this panel", selectLabel: "Add question prompt", included: nativeOpenResponsePanelPromptIds(panel) },
    { membership: "response", heading: "Answer boxes on this panel", selectLabel: "Add answer box", included: nativeOpenResponsePanelResponseIds(panel) },
  ];
  const questionLabel = (question) => {
    const index = questions.indexOf(question) + 1;
    const preview = question.prompt.trim().replace(/\s+/g, " ").slice(0, 72) || "Untitled question";
    return `Question ${index} — ${preview}`;
  };
  const questionNumber = (question) => `Question ${questions.indexOf(question) + 1}`;
  return <section className="native-or-panel-composition" aria-label="Selected panel composition">
    {groups.map((group) => {
      const included = questions.filter((question) => group.included.includes(question.id));
      const available = questions.filter((question) => !group.included.includes(question.id));
      return <fieldset key={group.membership}><legend>{group.heading}</legend><label><span>{group.selectLabel}</span><select aria-label={group.selectLabel} value="" disabled={!available.length} onChange={(event) => { if (event.target.value) onChange(event.target.value, group.membership, true); }}><option value="">{available.length ? "Choose an existing question" : "All questions included"}</option>{available.map((question) => <option key={question.id} value={question.id}>{questionLabel(question)}</option>)}</select></label><div className="native-or-panel-memberships">{included.length ? included.map((question) => <span key={question.id}><span>{questionLabel(question)}</span><button type="button" aria-label={`Remove ${questionNumber(question)} from ${group.membership === "prompt" ? "prompts" : "answer boxes"}`} onClick={() => onChange(question.id, group.membership, false)}>Remove</button></span>) : <p>None included.</p>}</div></fieldset>;
    })}
  </section>;
}

function OpenResponseQuickControls({ selection, area, question, artwork, artworkList, surface, updateArea, changeResponse, updateQuestion, updateArtwork, duplicateArtwork, removeArtwork, fit, bookSlug, componentSlug, fonts, setAnswerFont, recordUploadedFont, onMessage }) {
  if (!selection || !area) return <p className="studio-canvas-selection-status">Select an object for quick controls</p>;
  const locked = Boolean(artwork?.locked);
  const presentation = question?.responseRegion.presentation;
  const moveOrder = (where) => updateArtwork((target, list) => {
    const index = list.indexOf(target);
    const nextIndex = where === "back" ? 0 : where === "front" ? list.length - 1 : clamp(index + where, 0, list.length - 1);
    if (index === nextIndex) return;
    list.splice(index, 1); list.splice(nextIndex, 0, target);
    list.forEach((entry, order) => { entry.order = order; });
  });
  return <div className="studio-canvas-context-controls" role="group" aria-label={`${geometryLabel(selection.type)} quick controls`}>
    <h3>{geometryLabel(selection.type)}</h3>
    <QuickNumber label="X" value={area.x} maximum={surface.width - area.width} disabled={locked} onChange={(value) => updateArea("x", value)} />
    <QuickNumber label="Y" value={area.y} maximum={surface.height - area.height} disabled={locked} onChange={(value) => updateArea("y", value)} />
    <QuickNumber label="Width" value={area.width} minimum={1} maximum={surface.width - area.x} disabled={locked} onChange={(value) => updateArea("width", value)} />
    <QuickNumber label="Height" value={area.height} minimum={1} maximum={surface.height - area.y} disabled={locked} onChange={(value) => updateArea("height", value)} />
    {selection.type === "response" && question ? <>
      <StudioField label="Accessibility label" className="studio-quick-field studio-quick-field--wide"><input value={question.responseRegion.ariaLabel} maxLength={300} onChange={(event) => updateQuestion(question.id, (target) => { target.responseRegion.ariaLabel = event.target.value; })} /></StudioField>
      <QuickNumber label="Padding X" value={question.responseRegion.presentation.paddingX} maximum={100} onChange={(value) => changeResponse(question.id, "paddingX", Number(value))} />
      <QuickNumber label="Padding Y" value={question.responseRegion.presentation.paddingY} maximum={100} onChange={(value) => changeResponse(question.id, "paddingY", Number(value))} />
      <QuickNumber label="Line count" value={presentation.lineCount} minimum={1} maximum={20} onChange={(value) => changeResponse(question.id, "lineCount", Number(value))} />
      <QuickNumber label="Line width" value={question.responseRegion.presentation.lineWidth} minimum={1} maximum={question.responseRegion.area.width - 2 * question.responseRegion.presentation.paddingX} onChange={(value) => changeResponse(question.id, "lineWidth", Number(value))} />
      <QuickNumber label="Line spacing" value={question.responseRegion.presentation.lineSpacing} minimum={8} maximum={120} onChange={(value) => changeResponse(question.id, "lineSpacing", Number(value))} />
      <QuickNumber label="Auto-fit minimum" value={presentation.answerFontSizeMin} minimum={8} maximum={Math.min(48, presentation.answerFontSizeMax)} onChange={(value) => changeResponse(question.id, "answerFontSizeMin", Number(value))} />
      <ConfiguredAnswerFontSize value={presentation.answerFontSizeMax} presentation={presentation} onChange={(value) => changeResponse(question.id, "answerFontSizeMax", value)} />
      <NativeActivityFontControls bookSlug={bookSlug} componentSlug={componentSlug} fonts={fonts} selectedSlot={presentation.answerFontAssetSlot} onSelect={setAnswerFont} onUploaded={recordUploadedFont} onMessage={onMessage} />
      <StudioField label="Answer text color" className="studio-quick-field"><input aria-label="Answer text color" type="color" value={presentation.color} onChange={(event) => changeResponse(question.id, "color", event.target.value)} /></StudioField>
      <StudioField label="Answer align" className="studio-quick-field"><select aria-label="Quick Answer align" value={presentation.align} onChange={(event) => changeResponse(question.id, "align", event.target.value)}><option>left</option><option>center</option><option>right</option></select></StudioField>
      <p className="native-or-toolbar-fit" role="status" data-fit={fit?.fits}>{answerFitMessage(presentation, fit)}</p>
    </> : null}
    {selection.type === "prompt" && question ? <><QuickNumber label="Font size" value={question.promptStyle.fontSize} minimum={8} maximum={96} onChange={(value) => updateQuestion(question.id, (target) => { target.promptStyle.fontSize = Number(value); })} /><StudioField label="Align" className="studio-quick-field"><select aria-label="Quick Align" value={question.promptStyle.align} onChange={(event) => updateQuestion(question.id, (target) => { target.promptStyle.align = event.target.value; })}><option>left</option><option>center</option><option>right</option></select></StudioField></> : null}
    {selection.type === "artwork" && artwork ? <>
      <StudioField label="Alt text" className="studio-quick-field studio-quick-field--wide"><input value={artwork.altText} maxLength={2000} onChange={(event) => updateArtwork((target) => { target.altText = event.target.value; })} /></StudioField>
      <label className="studio-quick-check"><input type="checkbox" checked={artwork.decorative} onChange={(event) => updateArtwork((target) => { target.decorative = event.target.checked; })} /> Decorative</label>
      <StudioField label="Fit" className="studio-quick-field"><select aria-label="Quick Fit" value={artwork.fit} onChange={(event) => updateArtwork((target) => { target.fit = event.target.value; })}><option value="contain">Contain</option><option value="cover">Cover</option></select></StudioField>
      <label className="studio-quick-check"><input aria-label="Lock position and size" type="checkbox" checked={artwork.locked} onChange={(event) => updateArtwork((target) => { target.locked = event.target.checked; })} /> Locked</label>
      <div className="native-or-order-actions"><button type="button" disabled={artwork.order === 0} onClick={() => moveOrder("back")}>Send to Back</button><button type="button" disabled={artwork.order === 0} onClick={() => moveOrder(-1)}>Send Backward</button><button type="button" disabled={artwork.order === artworkList.length - 1} onClick={() => moveOrder(1)}>Bring Forward</button><button type="button" disabled={artwork.order === artworkList.length - 1} onClick={() => moveOrder("front")}>Bring to Front</button></div>
      <button type="button" onClick={duplicateArtwork}>Duplicate graphic</button><button className="studio-danger-action" type="button" onClick={removeArtwork}>Remove graphic</button>
    </> : null}
  </div>;
}

function ConfiguredAnswerFontSize({ value, presentation, onChange }) {
  const [draft, setDraft] = useState(String(value));
  const [message, setMessage] = useState("Commit with Enter or leave the field.");
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    if (!draft.trim()) {
      setMessage("Enter a whole-number requested size; the previous value is still saved.");
      return;
    }
    const numeric = Number(draft);
    try {
      const result = commitNativeOpenResponseConfiguredFontSize(presentation, numeric);
      onChange(result.value);
      setDraft(String(result.value));
      setMessage(result.clamped
        ? `Clamped to ${result.value}px; allowed range is ${result.bounds.minimum}–${result.bounds.maximum}px.`
        : `Requested size committed at ${result.value}px.`);
    } catch (error) {
      setMessage(`${error.message} The previous value is still saved.`);
    }
  };
  return <StudioField label="Requested answer size" className="studio-quick-field studio-quick-field--wide">
    <input type="number" inputMode="numeric" step="1" value={draft} aria-describedby="native-or-requested-size-status" onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => {
      if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
      if (event.key === "Escape") { event.preventDefault(); setDraft(String(value)); setMessage("Edit cancelled; the saved value is unchanged."); }
    }} />
    <small id="native-or-requested-size-status" role="status">{message}</small>
  </StudioField>;
}
