import { useEffect, useMemo, useState } from "react";
import { BookOpenText, Eye, FileText, Film, ImagePlus, KeyRound, LayoutPanelTop, Plus, Trash2, Upload } from "lucide-react";

import { StudioButton, StudioCanvasToolbar, StudioField, StudioSaveBar, StudioTabWorkspace } from "../../../components/builder-studio/StudioControls.jsx";
import { QuickNumber, StageGeometryControls } from "../../../components/builder-studio/StageGeometryControls.jsx";
import { NativeCompleteSentencesHotspotCanvas } from "../../../components/native-complete-sentences/NativeCompleteSentencesHotspotCanvas.jsx";
import { NativeCompleteSentencesStudentSurface, NativeCompleteSentencesTeacherSurface } from "../../../components/native-complete-sentences/NativeCompleteSentencesSurface.jsx";
import { createNativeChildId } from "../../../data/native-activities/nativeChildIdentity.js";
import { mergeNativeManagedAssetReference, removeNativeManagedAssetReferenceIfUnused } from "../../../data/native-activities/nativeActivityPublic.js";
import { assessNativeCompleteSentencesReadiness, assessNativeCompleteSentencesSaveability, NATIVE_COMPLETE_SENTENCES_DEFAULT_HOTSPOT_PRESENTATION, NATIVE_COMPLETE_SENTENCES_LIMITS, normalizeNativeCompleteSentencesInteraction } from "../../../data/native-activities/nativeCompleteSentences.js";
import { addNativeCompleteSentencesItem, alignNativeCompleteSentencesAnswers, createNativeCompleteSentencesPanel, findNextUnusedNativeCompleteSentencesItemId, nativeCompleteSentencesMarkedSentence, parseNativeCompleteSentencesMarkedSentence, removeNativeCompleteSentencesItem, removeNativeCompleteSentencesPanel, replaceNativeCompleteSentencesBackground } from "../../../data/native-activities/nativeCompleteSentencesAuthoring.js";
import { getBuilderContent } from "./builderContentApi.js";
import { getBuilderFontLibrary, nativeFontPreviewUrl, saveNativeActivityPair, uploadNativeActivityAsset } from "./builderNativeActivityApi.js";
import { NativeCompleteSentencesFontControls } from "./NativeCompleteSentencesFontControls.jsx";
import { projectNativeActivityPublicForAuthoring } from "./nativeActivityAuthoringProjection.js";
import { NativeReadableTextEditor } from "./NativeReadableTextEditor.jsx";
import { NativeVideoEditor } from "./NativeVideoEditor.jsx";

const clone = (value) => structuredClone(value);
const tabs = [
  { id: "content", label: "Content", icon: FileText },
  { id: "visual", label: "Visual", icon: LayoutPanelTop },
  { id: "answer-key", label: "Answer Key", icon: KeyRound },
  { id: "readable-text", label: "Readable Text", icon: BookOpenText },
  { id: "video", label: "Video", icon: Film },
  { id: "preview", label: "Local Preview", icon: Eye },
];
const previewRoot = (bookSlug, componentSlug, activityId, assetId) => `/builder/api/native-activities/books/${encodeURIComponent(bookSlug)}/components/${encodeURIComponent(componentSlug)}/activities/${encodeURIComponent(activityId)}/assets/${encodeURIComponent(assetId)}/preview`;

export function NativeCompleteSentencesEditor({ bookSlug, componentSlug, activityId, placementLabel, onDirtyChange = () => {}, onSaved = () => {} }) {
  const [state, setState] = useState({
    kind: "loading",
    publicRevision: 0,
    teacherRevision: 0,
    message: "",
  });
  const [publicDraft, setPublicDraft] = useState(null);
  const [teacherDraft, setTeacherDraft] = useState(null);
  const [authoringSentences, setAuthoringSentences] = useState({});
  const [tab, setTab] = useState("content");
  const [preview, setPreview] = useState("student");
  const [dirty, setDirty] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [selectedPanelId, setSelectedPanelId] = useState(null);
  const [selectedHotspotId, setSelectedHotspotId] = useState(null);
  const [lockedHotspotIds, setLockedHotspotIds] = useState(() => new Set());
  const [drawItemId, setDrawItemId] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fonts, setFonts] = useState([]);
  const [zoom, setZoom] = useState(1);
  const [readableIncomplete, setReadableIncomplete] = useState(false);
  const [videoIncomplete, setVideoIncomplete] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setTab("content");
    setDirty(false);
    setLockedHotspotIds(new Set());
    onDirtyChange(false);
    Promise.all([
      getBuilderContent(
        {
          bookSlug,
          componentSlug,
          resource: "native-activity-public",
          documentKey: activityId,
        },
        { signal: controller.signal },
      ),
      getBuilderContent(
        {
          bookSlug,
          componentSlug,
          resource: "native-activity-teacher",
          documentKey: activityId,
        },
        { signal: controller.signal },
      ),
      getBuilderFontLibrary({ bookSlug, componentSlug }, { signal: controller.signal }),
    ])
      .then(([publicValue, teacherValue, fontLibrary]) => {
        if (controller.signal.aborted) return;
        const projected = projectNativeActivityPublicForAuthoring(publicValue.document);
        projected.parts[0].interaction = normalizeNativeCompleteSentencesInteraction(projected.parts[0].interaction, { assets: projected.assets });
        setPublicDraft(projected);
        setTeacherDraft(teacherValue.document);
        setFonts(fontLibrary);
        setSelectedItemId(projected.parts[0].interaction.items[0]?.id || null);
        setSelectedPanelId(projected.parts[0].interaction.presentation.panels[0]?.id || null);
        const answers = new Map(teacherValue.document.parts[0].solution.answers.map((entry) => [entry.itemId, entry.text]));
        setAuthoringSentences(Object.fromEntries(publicValue.document.parts[0].interaction.items.map((item) => [item.id, nativeCompleteSentencesMarkedSentence(item.prompt, answers.get(item.id) || "")])));
        setState({
          kind: "ready",
          publicRevision: publicValue.revision,
          teacherRevision: teacherValue.revision,
          message: "Saved draft",
        });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setState({ kind: "error", message: error.message });
      });
    return () => controller.abort();
  }, [activityId, bookSlug, componentSlug]);

  const changed = () => {
    setDirty(true);
    onDirtyChange(true);
  };
  const mutatePublic = (mutator) => {
    setPublicDraft((current) => {
      const next = clone(current);
      mutator(next);
      return next;
    });
    changed();
  };
  const mutatePair = (mutator) => {
    const nextPublic = clone(publicDraft);
    const nextTeacher = clone(teacherDraft);
    mutator(nextPublic, nextTeacher);
    setPublicDraft(nextPublic);
    setTeacherDraft(nextTeacher);
    changed();
  };
  const interaction = publicDraft?.parts[0].interaction;
  const items = interaction?.items || [];
  const presentation = interaction?.presentation;
  const panels = presentation?.panels || [];
  const mappedItemIds = new Set(panels.flatMap((panel) => panel.hotspots.map((hotspot) => hotspot.itemId)));
  const nextDrawItemId = findNextUnusedNativeCompleteSentencesItemId(items, panels, drawItemId);
  const selectedPanel = panels.find((panel) => panel.id === selectedPanelId) || panels[0] || null;
  const selectedItem = items.find((item) => item.id === selectedItemId) || null;
  const selectedAnswer = teacherDraft?.parts[0].solution.answers.find((entry) => entry.itemId === selectedItemId) || null;
  const selectedHotspot = selectedPanel?.hotspots.find((hotspot) => hotspot.id === selectedHotspotId) || null;
  const selectedHotspotLocked = selectedHotspot ? lockedHotspotIds.has(selectedHotspot.id) : false;
  const markedSentence = selectedItem ? (authoringSentences[selectedItem.id] ?? "") : "";
  const markedSentenceResult = selectedItem ? parseNativeCompleteSentencesMarkedSentence(markedSentence) : null;
  const authoringIssues = items.flatMap((item, index) => {
    const parsed = parseNativeCompleteSentencesMarkedSentence(authoringSentences[item.id] ?? "");
    return parsed.valid ? [] : [`Sentence ${index + 1}: ${parsed.error}`];
  });
  const readiness = useMemo(() => (publicDraft && teacherDraft ? assessNativeCompleteSentencesReadiness(publicDraft, teacherDraft) : null), [publicDraft, teacherDraft]);
  const saveability = useMemo(() => (publicDraft && teacherDraft ? assessNativeCompleteSentencesSaveability(publicDraft, teacherDraft) : null), [publicDraft, teacherDraft]);
  const assetUrl = (assetId) => previewRoot(bookSlug, componentSlug, activityId, assetId);
  const previewAssetUrl = (assetId) => publicDraft?.assets.find((asset) => asset.assetId === assetId)?.role === "activity_font" ? nativeFontPreviewUrl(bookSlug, componentSlug, assetId) : assetUrl(assetId);
  const backgroundReference = publicDraft?.assets.find((asset) => asset.slot === selectedPanel?.backgroundAssetSlot);

  useEffect(() => {
    const next = nextDrawItemId || "";
    if (drawItemId === next) return;
    setDrawItemId(next);
    setDrawing(false);
  }, [drawItemId, nextDrawItemId]);

  const addItem = () => {
    let id;
    mutatePair((nextPublic, nextTeacher) => {
      id = addNativeCompleteSentencesItem(nextPublic, nextTeacher);
    });
    setAuthoringSentences((current) => ({ ...current, [id]: "" }));
    setSelectedItemId(id);
  };
  const removeItem = () => {
    if (!selectedItem || !globalThis.confirm("Delete this sentence, its private answer, and blank hotspot?")) return;
    const index = items.indexOf(selectedItem);
    mutatePair((nextPublic, nextTeacher) => removeNativeCompleteSentencesItem(nextPublic, nextTeacher, selectedItem.id));
    setSelectedItemId(items[index + 1]?.id || items[index - 1]?.id || null);
    setSelectedHotspotId(null);
  };
  const moveItem = (offset) =>
    mutatePair((nextPublic, nextTeacher) => {
      const list = nextPublic.parts[0].interaction.items;
      const index = list.findIndex((item) => item.id === selectedItemId);
      const target = index + offset;
      if (target >= 0 && target < list.length) [list[index], list[target]] = [list[target], list[index]];
      alignNativeCompleteSentencesAnswers(nextPublic, nextTeacher);
    });
  const addPanel = () => {
    const panel = createNativeCompleteSentencesPanel();
    mutatePublic((next) => next.parts[0].interaction.presentation.panels.push(panel));
    setSelectedPanelId(panel.id);
    setSelectedHotspotId(null);
  };
  const movePanel = (offset) => mutatePublic((next) => {
    const list = next.parts[0].interaction.presentation.panels;
    const index = list.findIndex((panel) => panel.id === selectedPanelId);
    const target = index + offset;
    if (index >= 0 && target >= 0 && target < list.length) [list[index], list[target]] = [list[target], list[index]];
  });
  const deletePanel = () => {
    if (!selectedPanel || panels.length <= 1 || !globalThis.confirm("Delete this panel, its background, and all of its hotspots?")) return;
    const index = panels.indexOf(selectedPanel);
    mutatePublic((next) => removeNativeCompleteSentencesPanel(next, selectedPanel.id));
    setSelectedPanelId(panels[index + 1]?.id || panels[index - 1]?.id || null);
    setSelectedHotspotId(null);
  };
  const updateMarkedSentence = (value) => {
    setAuthoringSentences((current) => ({
      ...current,
      [selectedItem.id]: value,
    }));
    const parsed = parseNativeCompleteSentencesMarkedSentence(value);
    if (!parsed.valid) {
      changed();
      return;
    }
    mutatePair((nextPublic, nextTeacher) => {
      nextPublic.parts[0].interaction.items.find((item) => item.id === selectedItem.id).prompt = parsed.prompt;
      nextTeacher.parts[0].solution.answers.find((entry) => entry.itemId === selectedItem.id).text = parsed.answer;
    });
  };
  const updateAnswer = (value) => {
    setAuthoringSentences((current) => ({
      ...current,
      [selectedItem.id]: nativeCompleteSentencesMarkedSentence(selectedItem.prompt, value),
    }));
    mutatePair((_nextPublic, nextTeacher) => {
      nextTeacher.parts[0].solution.answers.find((entry) => entry.itemId === selectedItem.id).text = value;
    });
  };
  const uploadBackground = async (file) => {
    if (!file || !selectedPanel) return;
    setUploading(true);
    setState((current) => ({ ...current, message: "Uploading background…" }));
    try {
      const uploaded = await uploadNativeActivityAsset({
        bookSlug,
        componentSlug,
        activityId,
        assetSlot: createNativeChildId("asset"),
        file,
      });
      if (!Number.isSafeInteger(uploaded.metadata?.width) || !Number.isSafeInteger(uploaded.metadata?.height)) throw new Error("Uploaded image dimensions are unavailable.");
      const dimensionsChanged = selectedPanel.sourceWidth !== uploaded.metadata.width || selectedPanel.sourceHeight !== uploaded.metadata.height;
      mutatePublic((next) => {
        next.assets = mergeNativeManagedAssetReference(next.assets, uploaded.reference);
        replaceNativeCompleteSentencesBackground(next, selectedPanel.id, uploaded.reference, uploaded.metadata);
      });
      if (dimensionsChanged) setSelectedHotspotId(null);
      setState((current) => ({
        ...current,
        message: dimensionsChanged ? "Background dimensions changed. Redraw this panel's blank hotspots." : "Background replaced. Existing hotspot geometry was preserved.",
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        message: error.message || "Background upload failed.",
      }));
    } finally {
      setUploading(false);
    }
  };
  const setHotspotFont = (font) => {
    if (!selectedHotspot) return;
    mutatePublic((next) => {
      const hotspot = next.parts[0].interaction.presentation.panels.find((panel) => panel.id === selectedPanel.id)?.hotspots.find((entry) => entry.id === selectedHotspot.id);
      if (!hotspot) return;
      const previousSlot = hotspot.presentation.fontAssetSlot;
      if (font) {
        next.assets = mergeNativeManagedAssetReference(next.assets, { assetId: font.assetId, checksumSha256: font.checksumSha256, role: font.role, slot: font.slot });
        hotspot.presentation.fontAssetSlot = font.slot;
      } else hotspot.presentation.fontAssetSlot = null;
      if (previousSlot && previousSlot !== hotspot.presentation.fontAssetSlot) removeNativeManagedAssetReferenceIfUnused(next, previousSlot);
    });
  };
  const recordUploadedFont = (font) => setFonts((current) => [...current.filter((entry) => entry.assetId !== font.assetId), font]);
  const createHotspot = (area) => {
    const itemId = findNextUnusedNativeCompleteSentencesItemId(items, panels, drawItemId);
    if (!itemId || !selectedPanel) return;
    const hotspot = {
      id: createNativeChildId("hot"),
      itemId,
      area,
      presentation: {
        ...NATIVE_COMPLETE_SENTENCES_DEFAULT_HOTSPOT_PRESENTATION,
      },
    };
    mutatePublic((next) => next.parts[0].interaction.presentation.panels.find((panel) => panel.id === selectedPanel.id).hotspots.push(hotspot));
    setSelectedHotspotId(hotspot.id);
    setDrawing(false);
  };
  const updateHotspot = (mutator) =>
    mutatePublic((next) => {
      const hotspot = next.parts[0].interaction.presentation.panels.find((panel) => panel.id === selectedPanelId)?.hotspots.find((entry) => entry.id === selectedHotspotId);
      if (hotspot) mutator(hotspot);
    });
  const updateHotspotArea = (area) => {
    if (!selectedHotspotLocked)
      updateHotspot((hotspot) => {
        hotspot.area = area;
      });
  };
  const deleteHotspot = () => {
    mutatePublic((next) => {
      const panel = next.parts[0].interaction.presentation.panels.find((entry) => entry.id === selectedPanelId);
      const fontSlot = panel.hotspots.find((entry) => entry.id === selectedHotspotId)?.presentation?.fontAssetSlot;
      panel.hotspots = panel.hotspots.filter((entry) => entry.id !== selectedHotspotId);
      if (fontSlot) removeNativeManagedAssetReferenceIfUnused(next, fontSlot);
    });
    setSelectedHotspotId(null);
  };
  const save = async () => {
    if (!saveability.saveable || authoringIssues.length || readableIncomplete || videoIncomplete)
      return setState((current) => ({
        ...current,
        message: "Resolve all authoring issues before saving.",
      }));
    setState((current) => ({ ...current, saving: true, message: "Saving…" }));
    try {
      const value = await saveNativeActivityPair({
        bookSlug,
        componentSlug,
        activityId,
        expectedPublicRevision: state.publicRevision,
        expectedTeacherRevision: state.teacherRevision,
        publicDocument: publicDraft,
        teacherDocument: teacherDraft,
      });
      setPublicDraft(value.publicDocument);
      setTeacherDraft(value.teacherDocument);
      setDirty(false);
      onDirtyChange(false);
      onSaved(value.publicRevision);
      setState({
        kind: "ready",
        publicRevision: value.publicRevision,
        teacherRevision: value.teacherRevision,
        saving: false,
        message: "Draft saved.",
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        saving: false,
        message: error.status === 409 ? "This draft changed elsewhere. Reload before saving." : error.message,
      }));
    }
  };

  if (state.kind === "loading")
    return (
      <section className="native-activity-foundation" role="status">
        Loading native Complete the Sentences…
      </section>
    );
  if (state.kind === "error" || !publicDraft || !teacherDraft)
    return (
      <section className="native-activity-foundation" role="alert">
        {state.message}
      </section>
    );
  const mapped = mappedItemIds;
  const readinessIssues = [...readiness.issues, ...authoringIssues, readableIncomplete ? "Complete the Readable Text setup." : "", videoIncomplete ? "Complete the Video setup." : ""].filter(Boolean);
  const readyToSave = saveability.saveable && !authoringIssues.length && !readableIncomplete && !videoIncomplete;
  const itemNavigation = (
    <aside>
      <StudioButton onClick={addItem} disabled={items.length >= NATIVE_COMPLETE_SENTENCES_LIMITS.items}>
        <Plus />
        Add Sentence
      </StudioButton>
      {items.map((item, index) => (
        <button type="button" key={item.id} aria-current={item.id === selectedItemId ? "true" : undefined} onClick={() => setSelectedItemId(item.id)}>
          <strong>Sentence {index + 1}</strong>
          <span>{authoringSentences[item.id] || item.prompt || "Untitled"}</span>
          <code>{item.id}</code>
        </button>
      ))}
    </aside>
  );

  return (
    <section className="native-activity-foundation native-single-choice-editor studio-editor">
      <header className="studio-editor-header">
        <div>
          <span className="studio-eyebrow">{placementLabel} · Complete the Sentences</span>
          <h2>{publicDraft.metadata.title}</h2>
          <p>{readiness.ready ? "Content complete" : `${readiness.issues.length} items need attention`}</p>
        </div>
        <details className="builder-technical-details">
          <summary>Technical details</summary>
          <code>{activityId}</code>
        </details>
      </header>
      <StudioTabWorkspace
        id="native-complete-sentences-tabs"
        value={tab}
        onChange={(value) => {
          setTab(value);
          setDrawing(false);
        }}
        tabs={tabs}
        label="Complete the Sentences authoring modes"
      >
        {tab === "content" ? (
          <div className="native-single-choice-back">
            <section className="studio-content-panel">
              <StudioField label="Activity title">
                <input
                  value={publicDraft.metadata.title}
                  maxLength={300}
                  onChange={(event) =>
                    mutatePublic((next) => {
                      next.metadata.title = event.target.value;
                    })
                  }
                />
              </StudioField>
            </section>
            <div className="native-or-question-workspace">
              {itemNavigation}
              {selectedItem ? (
                <section className="native-or-question-editor">
                  <header>
                    <strong>Sentence {items.indexOf(selectedItem) + 1}</strong>
                    <div>
                      <button type="button" disabled={items.indexOf(selectedItem) === 0} onClick={() => moveItem(-1)}>
                        Move Up
                      </button>
                      <button type="button" disabled={items.indexOf(selectedItem) === items.length - 1} onClick={() => moveItem(1)}>
                        Move Down
                      </button>
                      <button type="button" onClick={removeItem}>
                        Delete
                      </button>
                    </div>
                  </header>
                  <StudioField label="Full sentence with one marked answer">
                    <textarea value={markedSentence} maxLength={NATIVE_COMPLETE_SENTENCES_LIMITS.promptLength + NATIVE_COMPLETE_SENTENCES_LIMITS.answerLength + 2} aria-invalid={!markedSentenceResult?.valid || undefined} aria-describedby={`${selectedItem.id}-marked-help`} onChange={(event) => updateMarkedSentence(event.target.value)} />
                  </StudioField>
                  <p id={`${selectedItem.id}-marked-help`} className={markedSentenceResult?.valid ? "studio-field-help" : "studio-field-error"} role={markedSentenceResult?.valid ? undefined : "alert"}>
                    {markedSentenceResult?.valid ? "The text inside *asterisks* is stored only in the private Teacher answer; students receive an explicit blank." : markedSentenceResult?.error}
                  </p>
                </section>
              ) : (
                <p>Add a sentence to begin.</p>
              )}
            </div>
          </div>
        ) : null}
        {tab === "visual" ? (
          <section className="native-single-choice-back">
            <div className="native-single-choice-visual-authoring">
              <header>
                <div>
                  <h3>Visual blanks</h3>
                  <p>Managed background with one source-pixel hotspot per sentence.</p>
                </div>
              </header>
              <div className="studio-visual-workspace">
                <aside className="studio-navigator">
                  <header><div><LayoutPanelTop aria-hidden="true" /><div><h3>Panels</h3><p>Visual pages inside part-1.</p></div></div><span className="studio-count">{panels.length}</span></header>
                  <div className="studio-layer-list">
                    {panels.map((panel, index) => <button type="button" key={panel.id} aria-current={panel.id === selectedPanel?.id ? "true" : undefined} onClick={() => { setSelectedPanelId(panel.id); setSelectedHotspotId(null); setDrawing(false); }}><span><strong>Panel {index + 1}</strong><small>{panel.backgroundAssetSlot ? `${panel.sourceWidth} × ${panel.sourceHeight}` : "Needs background"}</small></span></button>)}
                  </div>
                  <StudioButton onClick={addPanel} disabled={panels.length >= NATIVE_COMPLETE_SENTENCES_LIMITS.panels}><Plus aria-hidden="true" />Add Panel</StudioButton>
                  {selectedPanel ? <>
                    <StudioButton onClick={() => movePanel(-1)} disabled={panels.indexOf(selectedPanel) === 0}>Move Up</StudioButton>
                    <StudioButton onClick={() => movePanel(1)} disabled={panels.indexOf(selectedPanel) === panels.length - 1}>Move Down</StudioButton>
                    <StudioButton variant="danger-ghost" onClick={deletePanel} disabled={panels.length <= 1}><Trash2 aria-hidden="true" />Delete Panel</StudioButton>
                  </> : null}
                </aside>
                <section className="studio-canvas-column">
                  <StudioCanvasToolbar zoom={zoom} onZoomChange={setZoom} />
                  <div className="studio-canvas-viewport">
                    <div className="studio-artboard-wrap" style={{ width: `${zoom * 100}%` }}>
                      {selectedPanel ? <NativeCompleteSentencesHotspotCanvas
                        presentation={selectedPanel}
                        assetUrl={backgroundReference ? assetUrl(backgroundReference.assetId) : ""}
                        items={items}
                        selectedHotspotId={selectedHotspotId}
                        locked={selectedHotspotLocked}
                        onSelect={(id) => {
                          setSelectedHotspotId(id);
                          setDrawing(false);
                        }}
                        onCreate={createHotspot}
                        onChange={updateHotspotArea}
                        onDelete={deleteHotspot}
                        drawingEnabled={drawing}
                      /> : <p>Select a panel.</p>}
                    </div>
                  </div>
                </section>
                <aside className="studio-inspector">
                  <header><span className="studio-section-icon"><ImagePlus aria-hidden="true" /></span><div><h3>{selectedHotspot ? "Hotspot properties" : "Panel properties"}</h3><p>{selectedPanel ? `Panel ${panels.indexOf(selectedPanel) + 1}` : "Select a panel."}</p></div></header>
                  {selectedPanel ? <>
                  <label className="studio-upload-action">
                    <Upload />
                    <span>
                      <strong>{uploading ? "Uploading…" : backgroundReference ? "Replace background" : "Upload background"}</strong>
                      <small>PNG, JPEG or WebP</small>
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={uploading}
                      onChange={(event) => {
                        uploadBackground(event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                  </label>
                  <StudioField label="Sentence to map">
                    <select
                      value={drawItemId}
                      onChange={(event) => {
                        setDrawItemId(event.target.value);
                        setDrawing(false);
                      }}
                    >
                      <option value="">Choose a sentence</option>
                      {items.map((item, index) => (
                        <option key={item.id} value={item.id} disabled={mapped.has(item.id) && selectedHotspot?.itemId !== item.id}>
                          Sentence {index + 1}: {item.prompt || "Untitled"}
                        </option>
                      ))}
                    </select>
                  </StudioField>
                  <StudioButton variant="primary" selected={drawing} disabled={!drawItemId || !backgroundReference || Boolean(selectedHotspot) || mapped.has(drawItemId)} onClick={() => setDrawing((current) => !current)}>
                    Draw blank hotspot
                  </StudioButton>
                  {selectedHotspot ? (
                    <>
                      <StudioField label="Hotspot binding">
                        <select
                          value={selectedHotspot.itemId}
                          onChange={(event) =>
                            updateHotspot((hotspot) => {
                              hotspot.itemId = event.target.value;
                            })
                          }
                        >
                          {items.map((item, index) => (
                            <option key={item.id} value={item.id} disabled={mapped.has(item.id) && item.id !== selectedHotspot.itemId}>
                              Sentence {index + 1}
                            </option>
                          ))}
                        </select>
                      </StudioField>
                      <label className="studio-quick-check">
                        <input
                          type="checkbox"
                          checked={selectedHotspotLocked}
                          onChange={(event) =>
                            setLockedHotspotIds((current) => {
                              const next = new Set(current);
                              if (event.target.checked) next.add(selectedHotspot.id);
                              else next.delete(selectedHotspot.id);
                              return next;
                            })
                          }
                        />
                        Lock hotspot position
                      </label>
                      <StageGeometryControls area={selectedHotspot.area} stage={{ width: selectedPanel.sourceWidth, height: selectedPanel.sourceHeight }} label="Complete Sentences hotspot" minWidth={4} minHeight={4} locked={selectedHotspotLocked} onChange={updateHotspotArea} />
                      <QuickNumber
                        label="Answer font size"
                        value={selectedHotspot.presentation.fontSize}
                        minimum={NATIVE_COMPLETE_SENTENCES_LIMITS.fontSizeMinimum}
                        onChange={(value) =>
                          updateHotspot((hotspot) => {
                            const fontSize = Math.round(Number(value));
                            if (Number.isFinite(fontSize) && fontSize >= NATIVE_COMPLETE_SENTENCES_LIMITS.fontSizeMinimum) hotspot.presentation.fontSize = fontSize;
                          })
                        }
                      />
                      <NativeCompleteSentencesFontControls
                        bookSlug={bookSlug}
                        componentSlug={componentSlug}
                        fonts={fonts}
                        selectedSlot={selectedHotspot.presentation.fontAssetSlot}
                        onSelect={setHotspotFont}
                        onUploaded={recordUploadedFont}
                        onMessage={(message) => setState((current) => ({ ...current, message }))}
                      />
                      <StudioField label="Answer text color" className="studio-quick-field">
                        <input
                          aria-label="Answer text color"
                          type="color"
                          value={selectedHotspot.presentation.color}
                          onChange={(event) =>
                            updateHotspot((hotspot) => {
                              hotspot.presentation.color = event.target.value;
                            })
                          }
                        />
                      </StudioField>
                      <StudioButton variant="danger-ghost" onClick={deleteHotspot}>
                        <Trash2 />
                        Delete Hotspot
                      </StudioButton>
                    </>
                  ) : <p>Draw or select a hotspot to style its answer.</p>}
                  </> : <p>Select or add a panel.</p>}
                </aside>
              </div>
            </div>
          </section>
        ) : null}
        {tab === "answer-key" ? (
          <div className="native-single-choice-back">
            <section className="studio-content-panel">
              <header>
                <div>
                  <span className="studio-section-icon">
                    <KeyRound />
                  </span>
                  <div>
                    <h3>Private answer key</h3>
                    <p>Teacher-only answers remain outside the public activity document.</p>
                  </div>
                </div>
              </header>
            </section>
            <div className="native-or-question-workspace">
              {itemNavigation}
              {selectedItem ? (
                <section className="native-or-question-editor">
                  <strong>Sentence {items.indexOf(selectedItem) + 1}</strong>
                  <p>{selectedItem.prompt}</p>
                  <StudioField label="Correct answer">
                    <input value={selectedAnswer?.text || ""} maxLength={NATIVE_COMPLETE_SENTENCES_LIMITS.answerLength} onChange={(event) => updateAnswer(event.target.value)} />
                  </StudioField>
                </section>
              ) : (
                <p>Add a sentence to begin.</p>
              )}
            </div>
          </div>
        ) : null}
        {tab === "readable-text" ? <NativeReadableTextEditor bookSlug={bookSlug} componentSlug={componentSlug} activityId={activityId} publicDraft={publicDraft} mutatePublic={mutatePublic} previewUrl={assetUrl} onIncompleteChange={setReadableIncomplete} onIntentChange={changed} onStatusChange={(message) => setState((current) => ({ ...current, message }))} /> : null}
        {tab === "video" ? <NativeVideoEditor bookSlug={bookSlug} componentSlug={componentSlug} activityId={activityId} publicDraft={publicDraft} mutatePublic={mutatePublic} onIncompleteChange={setVideoIncomplete} onIntentChange={changed} onStatusChange={(message) => setState((current) => ({ ...current, message }))} /> : null}
        {tab === "preview" ? (
          <div className="studio-preview-panel">
            <header>
              <Eye />
              <div>
                <h3>Local Preview</h3>
                <p>Preview includes the current unsaved draft. Review remains pinned to saved state.</p>
              </div>
            </header>
            <div className="native-or-preview-toggle">
              <button type="button" aria-pressed={preview === "student"} onClick={() => setPreview("student")}>
                Student Preview
              </button>
              <button type="button" aria-pressed={preview === "teacher"} onClick={() => setPreview("teacher")}>
                Teacher Preview
              </button>
            </div>
            {preview === "student" ? <NativeCompleteSentencesStudentSurface document={publicDraft} assetUrl={previewAssetUrl} /> : <NativeCompleteSentencesTeacherSurface publicDocument={publicDraft} teacherDocument={teacherDraft} assetUrl={previewAssetUrl} />}
          </div>
        ) : null}
      </StudioTabWorkspace>
      <StudioSaveBar dirty={dirty} saving={state.saving} message={state.message} ready={readyToSave} issues={readinessIssues} disabled={!dirty || state.saving || !readyToSave} reason={!dirty ? "No unsaved changes" : !readyToSave ? "Resolve all authoring issues before saving" : ""} onSave={save} />
    </section>
  );
}
