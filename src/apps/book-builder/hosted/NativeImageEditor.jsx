import { useEffect, useMemo, useRef, useState } from "react";

import { NativeImageSurface } from "../../../components/native-image/NativeImageSurface.jsx";
import { logicalAreaStyle } from "../../../components/native-open-response/NativeOpenResponseSurface.jsx";
import { createNativeChildId } from "../../../data/native-activities/nativeChildIdentity.js";
import { mergeNativeManagedAssetReference } from "../../../data/native-activities/nativeActivityPublic.js";
import { assessNativeImageReadiness, duplicateNativeImage, NATIVE_IMAGE_LIMITS, removeNativeImage } from "../../../data/native-activities/nativeImage.js";
import { getBuilderContent } from "./builderContentApi.js";
import { saveNativeActivityPair, uploadNativeActivityAsset } from "./builderNativeActivityApi.js";

const clone = (value) => structuredClone(value);
const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);
const previewRoot = (bookSlug, componentSlug, activityId, assetId) => `/builder/api/native-activities/books/${encodeURIComponent(bookSlug)}/components/${encodeURIComponent(componentSlug)}/activities/${encodeURIComponent(activityId)}/assets/${encodeURIComponent(assetId)}/preview`;

export function NativeImageEditor({ bookSlug, componentSlug, activityId, placementLabel, onDirtyChange = () => {}, onSaved = () => {} }) {
  const [state, setState] = useState({ kind: "loading", message: "" });
  const [publicDraft, setPublicDraft] = useState(null);
  const [teacherDraft, setTeacherDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState("content");
  const [selectedId, setSelectedId] = useState(null);
  const drag = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading", message: "" }); setPublicDraft(null); setTeacherDraft(null); setDirty(false); setSelectedId(null); onDirtyChange(false);
    Promise.all([
      getBuilderContent({ bookSlug, componentSlug, resource: "native-activity-public", documentKey: activityId }, { signal: controller.signal }),
      getBuilderContent({ bookSlug, componentSlug, resource: "native-activity-teacher", documentKey: activityId }, { signal: controller.signal }),
    ]).then(([publicValue, teacherValue]) => {
      if (controller.signal.aborted) return;
      setPublicDraft(publicValue.document); setTeacherDraft(teacherValue.document);
      setSelectedId(publicValue.document.parts[0].interaction.images[0]?.id || null);
      setState({ kind: "ready", publicRevision: publicValue.revision, teacherRevision: teacherValue.revision, message: "Saved draft" });
    }).catch((error) => { if (!controller.signal.aborted) setState({ kind: "error", message: error.message }); });
    return () => controller.abort();
  }, [activityId, bookSlug, componentSlug]);

  const interaction = publicDraft?.parts[0].interaction;
  const selectedImage = interaction?.images.find((item) => item.id === selectedId) || null;
  const readiness = useMemo(() => publicDraft ? assessNativeImageReadiness(publicDraft) : null, [publicDraft]);
  const mutate = (mutator) => { setPublicDraft((current) => { const next = clone(current); mutator(next); return next; }); setDirty(true); onDirtyChange(true); };

  const upload = async (file) => {
    if (!file || interaction.images.length >= NATIVE_IMAGE_LIMITS.images) return;
    setUploading(true); setState((current) => ({ ...current, message: "Uploading image…" }));
    try {
      const requestedSlot = createNativeChildId("asset");
      const uploaded = await uploadNativeActivityAsset({ bookSlug, componentSlug, activityId, assetSlot: requestedSlot, file });
      const imageId = createNativeChildId("img");
      mutate((next) => {
        const current = next.parts[0].interaction;
        next.assets = mergeNativeManagedAssetReference(next.assets, uploaded.reference);
        current.images.push({ id: imageId, assetSlot: uploaded.reference.slot, area: { x: 160, y: 120, width: 320, height: 220 }, order: current.images.length, altText: "", decorative: false, fit: "contain", locked: false });
      });
      setSelectedId(imageId); setTab("layout"); setState((current) => ({ ...current, message: "Image uploaded; save the draft to attach it." }));
    } catch (error) { setState((current) => ({ ...current, message: error.message })); }
    finally { setUploading(false); }
  };

  const updateArea = (key, raw) => {
    const value = Number(raw); if (!Number.isFinite(value) || !selectedImage || selectedImage.locked) return;
    mutate((next) => {
      const item = next.parts[0].interaction.images.find((entry) => entry.id === selectedId);
      const surface = next.parts[0].interaction.surface;
      item.area[key] = key === "x" ? clamp(value, 0, surface.width - item.area.width) : key === "y" ? clamp(value, 0, surface.height - item.area.height)
        : key === "width" ? clamp(value, 1, surface.width - item.area.x) : clamp(value, 1, surface.height - item.area.y);
    });
  };
  const beginDrag = (event, mode) => {
    if (!selectedImage || selectedImage.locked) return;
    event.preventDefault(); event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { mode, x: event.clientX, y: event.clientY, area: clone(selectedImage.area) };
  };
  const moveDrag = (event) => {
    if (!drag.current || !selectedImage) return;
    const surfaceElement = event.currentTarget.closest(".native-or-surface");
    const scale = interaction.surface.width / surfaceElement.getBoundingClientRect().width;
    const dx = (event.clientX - drag.current.x) * scale; const dy = (event.clientY - drag.current.y) * scale;
    const original = drag.current.area;
    if (drag.current.mode === "move") { updateArea("x", original.x + dx); updateArea("y", original.y + dy); }
    else { updateArea("width", original.width + dx); updateArea("height", original.height + dy); }
  };
  const duplicate = () => {
    if (!selectedImage || interaction.images.length >= NATIVE_IMAGE_LIMITS.images) return;
    const duplicateId = createNativeChildId("img");
    mutate((next) => duplicateNativeImage(next.parts[0].interaction, selectedId, duplicateId)); setSelectedId(duplicateId);
  };
  const remove = () => {
    if (!selectedImage || !globalThis.confirm("Remove this image instance from the draft? Its asset root is removed only when no image instances use it.")) return;
    const currentIndex = interaction.images.findIndex((entry) => entry.id === selectedId);
    const nextId = interaction.images[currentIndex + 1]?.id || interaction.images[currentIndex - 1]?.id || null;
    mutate((next) => removeNativeImage(next, selectedId)); setSelectedId(nextId);
  };
  const moveOrder = (where) => {
    if (!selectedImage) return;
    mutate((next) => {
      const list = next.parts[0].interaction.images; const item = list.find((entry) => entry.id === selectedId); const index = list.indexOf(item);
      const target = where === "back" ? 0 : where === "front" ? list.length - 1 : clamp(index + where, 0, list.length - 1);
      if (index === target) return; list.splice(index, 1); list.splice(target, 0, item); list.forEach((entry, order) => { entry.order = order; });
    });
  };
  const updateSelected = (mutator) => mutate((next) => mutator(next.parts[0].interaction.images.find((entry) => entry.id === selectedId)));

  const save = async () => {
    setState((current) => ({ ...current, saving: true, message: "Saving…" }));
    try {
      const value = await saveNativeActivityPair({ bookSlug, componentSlug, activityId, expectedPublicRevision: state.publicRevision, expectedTeacherRevision: state.teacherRevision, publicDocument: publicDraft, teacherDocument: teacherDraft });
      setPublicDraft(value.publicDocument); setTeacherDraft(value.teacherDocument); setDirty(false); onDirtyChange(false);
      setState({ kind: "ready", publicRevision: value.publicRevision, teacherRevision: value.teacherRevision, saving: false, message: "Draft saved." });
      onSaved(value.publicRevision);
    } catch (error) { setState((current) => ({ ...current, saving: false, message: error.status === 409 ? "This draft changed elsewhere. Reload before saving; your unsaved edits are preserved." : error.message })); }
  };

  if (state.kind === "loading") return <section className="native-activity-foundation" role="status">Loading native Image…</section>;
  if (state.kind === "error" || !publicDraft || !teacherDraft) return <section className="native-activity-foundation" role="alert">{state.message || "Native draft is unavailable."}</section>;
  const assetUrl = (assetId) => previewRoot(bookSlug, componentSlug, activityId, assetId);
  return <section className="native-activity-foundation native-image-editor native-or-editor">
    <header><div><span>Native draft · publishable when referenced and complete</span><h2>{publicDraft.metadata.title}</h2></div><dl><div><dt>Stable ID</dt><dd><code>{activityId}</code></dd></div><div><dt>Kind</dt><dd>Image</dd></div><div><dt>Placement</dt><dd>{placementLabel}</dd></div><div><dt>Revisions</dt><dd>Public {state.publicRevision} · Teacher {state.teacherRevision}</dd></div></dl></header>
    <nav className="native-or-tabs" aria-label="Image authoring"><button type="button" aria-current={tab === "content" ? "page" : undefined} onClick={() => setTab("content")}>Content</button><button type="button" aria-current={tab === "layout" ? "page" : undefined} onClick={() => setTab("layout")}>Layout</button><button type="button" aria-current={tab === "preview" ? "page" : undefined} onClick={() => setTab("preview")}>Local Preview</button></nav>
    {tab === "content" ? <div className="native-or-content"><div className="native-activity-foundation-fields"><label><span>Activity title</span><input value={publicDraft.metadata.title} maxLength={300} onChange={(event) => mutate((next) => { next.metadata.title = event.target.value; })} /></label><label><span>Visible instruction</span><textarea value={publicDraft.metadata.visibleInstructionText} maxLength={2000} rows={3} onChange={(event) => mutate((next) => { next.metadata.visibleInstructionText = event.target.value; })} /></label></div><p>{interaction.images.length} image instance{interaction.images.length === 1 ? "" : "s"} in this composition.</p></div> : null}
    {tab === "layout" ? <div className="native-or-layout"><div><NativeImageSurface document={publicDraft} assetUrl={assetUrl} selectedId={selectedId} onSelect={setSelectedId}>
      {selectedImage && !selectedImage.locked ? <span className="native-or-manipulator" style={{ ...logicalAreaStyle(selectedImage.area, interaction.surface), zIndex: 90 }} onPointerDown={(event) => beginDrag(event, "move")} onPointerMove={moveDrag} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}><span className="native-or-resize" onPointerDown={(event) => { event.stopPropagation(); beginDrag(event, "resize"); }} /></span> : null}
    </NativeImageSurface></div><aside className="native-or-properties"><label className="native-or-upload"><span>{uploading ? "Uploading…" : "Upload image"}</span><input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading || interaction.images.length >= NATIVE_IMAGE_LIMITS.images} onChange={(event) => { upload(event.target.files?.[0]); event.target.value = ""; }} /></label>
      {selectedImage ? <><h3>Image</h3><code>{selectedImage.id}</code>{["x", "y", "width", "height"].map((key) => <label key={key}><span>{key.toUpperCase()}</span><input type="number" min={key === "width" || key === "height" ? 1 : 0} step="1" value={selectedImage.area[key]} disabled={selectedImage.locked} onChange={(event) => updateArea(key, event.target.value)} /></label>)}<label><input type="checkbox" checked={selectedImage.locked} onChange={(event) => updateSelected((item) => { item.locked = event.target.checked; })} /> Lock position and size</label><label><span>Alt text</span><textarea value={selectedImage.altText} maxLength={2000} onChange={(event) => updateSelected((item) => { item.altText = event.target.value; })} /></label><label><input type="checkbox" checked={selectedImage.decorative} onChange={(event) => updateSelected((item) => { item.decorative = event.target.checked; })} /> Decorative</label><label><span>Fit</span><select value={selectedImage.fit} onChange={(event) => updateSelected((item) => { item.fit = event.target.value; })}><option value="contain">Contain</option><option value="cover">Cover</option></select></label><div className="native-or-order-actions"><button type="button" disabled={selectedImage.order === 0} onClick={() => moveOrder("back")}>Send to Back</button><button type="button" disabled={selectedImage.order === 0} onClick={() => moveOrder(-1)}>Send Backward</button><button type="button" disabled={selectedImage.order === interaction.images.length - 1} onClick={() => moveOrder(1)}>Bring Forward</button><button type="button" disabled={selectedImage.order === interaction.images.length - 1} onClick={() => moveOrder("front")}>Bring to Front</button></div><button type="button" disabled={interaction.images.length >= NATIVE_IMAGE_LIMITS.images} onClick={duplicate}>Duplicate image</button><button type="button" onClick={remove}>Remove image</button></> : <p>Upload or select an image.</p>}
      <section className="native-or-layers"><h3>Image Layers</h3>{[...interaction.images].sort((left, right) => right.order - left.order).map((item) => <button type="button" key={item.id} aria-current={selectedId === item.id ? "true" : undefined} onClick={() => setSelectedId(item.id)}><span>{item.altText || (item.decorative ? "Decorative image" : item.id)}</span>{item.locked ? <small>Locked</small> : null}</button>)}</section>
    </aside></div> : null}
    {tab === "preview" ? <div className="native-or-preview"><p><strong>Local Preview</strong> may include unsaved editor changes. Use the shared Review button for the last saved deployed Viewer state.</p><h3>{publicDraft.metadata.title}</h3>{publicDraft.metadata.visibleInstructionText ? <p>{publicDraft.metadata.visibleInstructionText}</p> : null}<NativeImageSurface document={publicDraft} assetUrl={assetUrl} /></div> : null}
    <aside className="native-or-readiness" role="status"><strong>{readiness.ready ? "Draft is future-publish ready" : "Incomplete draft"}</strong>{readiness.issues.length ? <ul>{readiness.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : null}</aside>
    <footer><span data-dirty={dirty || undefined} role="status">{dirty ? "Unsaved changes" : state.message}</span><button type="button" disabled={!dirty || state.saving || !publicDraft.metadata.title.trim()} onClick={save}>{state.saving ? "Saving…" : "Save Draft"}</button></footer>
  </section>;
}
