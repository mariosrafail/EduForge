import { useEffect, useMemo, useState } from "react";
import { Headphones, Trash2, Upload } from "lucide-react";

import { NativeImageSurface } from "../../../components/native-image/NativeImageSurface.jsx";
import { NativeOpenResponseSurface } from "../../../components/native-open-response/NativeOpenResponseSurface.jsx";
import { NativeAudioTextFocusContent, nativeAudioHotspotArtwork } from "../../../components/native-readable-text/NativeAudioTextHotspots.jsx";
import { logicalAreaStyle } from "../../../components/builder-studio/stageGeometry.js";
import { nativeAudioTextHotspotTargets, normalizeNativeAudioTextHotspots } from "../../../data/native-activities/nativeAudioTextHotspots.js";
import { mergeNativeManagedAssetReference, removeNativeManagedAssetReferenceIfUnused } from "../../../data/native-activities/nativeActivityPublic.js";
import { createNativeChildId } from "../../../data/native-activities/nativeChildIdentity.js";
import { uploadNativeActivityAsset } from "./builderNativeActivityApi.js";
import "./nativeAudioTextHotspotEditor.css";

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

function defaultActivityArea(target) {
  const size = clamp(Math.round(Math.min(target.width, target.height) * 0.08), 24, 96);
  return { x: Math.round((target.width - size) / 2), y: Math.round((target.height - size) / 2), width: size, height: size };
}

function defaultFocusArea(readableText) {
  const width = Math.max(16, Math.round(readableText.sourceWidth * 0.88));
  const height = Math.max(16, Math.round(Math.min(readableText.sourceHeight * 0.24, width * 0.7)));
  return { x: Math.round((readableText.sourceWidth - width) / 2), y: 0, width, height };
}

function pointInSource(event, source) {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * source.width, 0, source.width),
    y: clamp(((event.clientY - rect.top) / rect.height) * source.height, 0, source.height),
  };
}

function ActivityCanvas({ document, target, hotspot, assetUrl, onPlace }) {
  const interaction = document.parts[0].interaction;
  const marker = hotspot ? <span className="native-audio-hotspot-authoring-marker" style={logicalAreaStyle(hotspot.activityArea, target)}><img src={nativeAudioHotspotArtwork.active} alt="" /></span> : null;
  let content = null;
  if (document.kind === "image") content = <NativeImageSurface document={document} assetUrl={assetUrl} />;
  else if (document.kind === "open-response") content = <NativeOpenResponseSurface document={document} assetUrl={assetUrl} />;
  else {
    const panel = interaction.presentation?.panels?.find((entry) => entry.id === target.panelId);
    const reference = document.assets.find((asset) => asset.slot === panel?.backgroundAssetSlot);
    content = reference ? <img className="native-audio-hotspot-panel-image" src={assetUrl(reference.assetId)} alt={`Panel ${interaction.presentation.panels.indexOf(panel) + 1}`} /> : null;
  }
  return <div className="native-audio-hotspot-authoring-stage" style={{ aspectRatio: `${target.width} / ${target.height}` }} onClick={(event) => onPlace(pointInSource(event, target))} onKeyDown={(event) => {
    if (!["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    onPlace({ x: target.width / 2, y: target.height / 2 });
  }} role="button" tabIndex={0} aria-label="Place audio hotspot on activity">
    <div className="native-audio-hotspot-authoring-stage-content" aria-hidden="true">{content}</div>
    {marker}
  </div>;
}

function FocusCanvas({ readableText, imageUrl, hotspot, onFocusArea }) {
  const [start, setStart] = useState(null);
  const bounds = { width: readableText.sourceWidth, height: readableText.sourceHeight };
  return <div
    className="native-audio-hotspot-focus-editor"
    style={{ aspectRatio: `${bounds.width} / ${bounds.height}` }}
    onPointerDown={(event) => { event.currentTarget.setPointerCapture?.(event.pointerId); setStart(pointInSource(event, bounds)); }}
    onPointerUp={(event) => {
      if (!start) return;
      const end = pointInSource(event, bounds);
      const x = Math.round(Math.min(start.x, end.x));
      const y = Math.round(Math.min(start.y, end.y));
      const width = Math.round(Math.abs(start.x - end.x));
      const height = Math.round(Math.abs(start.y - end.y));
      setStart(null);
      if (width >= 16 && height >= 16) onFocusArea({ x, y, width, height });
    }}
    role="group"
    aria-label="Draw readable text focus region"
  >
    <img src={imageUrl} alt={readableText.altText} draggable="false" />
    {hotspot ? <span className="native-audio-hotspot-focus-box" style={logicalAreaStyle(hotspot.readableFocusArea, bounds)} /> : null}
  </div>;
}

export function NativeAudioTextHotspotEditor({ bookSlug, componentSlug, activityId, publicDraft, mutatePublic, previewUrl, onIncompleteChange, onStatusChange }) {
  const targets = nativeAudioTextHotspotTargets(publicDraft);
  const hotspots = publicDraft.audioTextHotspots?.hotspots || [];
  const [selectedId, setSelectedId] = useState(hotspots[0]?.id || null);
  const [uploading, setUploading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  useEffect(() => { setSelectedId(publicDraft.audioTextHotspots?.hotspots?.[0]?.id || null); setPreviewing(false); }, [activityId]);
  const selected = hotspots.find((hotspot) => hotspot.id === selectedId) || hotspots[0] || null;
  const selectedTarget = targets.find((target) => target.panelId === selected?.panelId) || targets[0] || null;
  const readableReference = publicDraft.assets.find((asset) => asset.slot === publicDraft.readableText?.assetSlot);
  const incomplete = useMemo(() => {
    if (!publicDraft.audioTextHotspots) return false;
    try { normalizeNativeAudioTextHotspots(publicDraft.audioTextHotspots, publicDraft); return false; } catch { return true; }
  }, [publicDraft]);
  useEffect(() => { onIncompleteChange(incomplete); }, [incomplete, onIncompleteChange]);

  if (!publicDraft.readableText || !readableReference) return <section className="native-audio-hotspot-editor" aria-disabled="true"><h3>Audio / Text Hotspots</h3><p>Enable and upload Readable Text before adding audio hotspots.</p></section>;

  const updateSelected = (mutator) => mutatePublic((next) => {
    const hotspot = next.audioTextHotspots?.hotspots?.find((entry) => entry.id === selected.id);
    if (hotspot) mutator(hotspot, next);
  });
  const add = () => {
    if (!targets.length || hotspots.length >= 16) return;
    const id = createNativeChildId("aud");
    const target = targets[0];
    mutatePublic((next) => {
      next.audioTextHotspots ||= { hotspots: [] };
      next.audioTextHotspots.hotspots.push({
        id,
        panelId: target.panelId,
        activityArea: defaultActivityArea(target),
        readableFocusArea: defaultFocusArea(next.readableText),
        audioAssetSlot: "",
        label: `Listen to excerpt ${next.audioTextHotspots.hotspots.length + 1}`,
      });
    });
    setSelectedId(id);
    onStatusChange("Place the hotspot, draw its readable-text focus region, and upload an MP3.");
  };
  const remove = () => mutatePublic((next) => {
    const removed = next.audioTextHotspots.hotspots.find((hotspot) => hotspot.id === selected.id);
    next.audioTextHotspots.hotspots = next.audioTextHotspots.hotspots.filter((hotspot) => hotspot.id !== selected.id);
    if (!next.audioTextHotspots.hotspots.length) delete next.audioTextHotspots;
    if (removed?.audioAssetSlot) removeNativeManagedAssetReferenceIfUnused(next, removed.audioAssetSlot);
    setSelectedId(next.audioTextHotspots?.hotspots?.[0]?.id || null);
    setPreviewing(false);
  });
  const uploadAudio = async (file) => {
    if (!file || !selected) return;
    setUploading(true);
    onStatusChange("Uploading hotspot MP3…");
    try {
      const uploaded = await uploadNativeActivityAsset({ bookSlug, componentSlug, activityId, assetSlot: createNativeChildId("asset"), file });
      if (uploaded.metadata?.mimeType !== "audio/mpeg") throw new Error("Uploaded hotspot audio is not an MP3.");
      updateSelected((hotspot, next) => {
        const previousSlot = hotspot.audioAssetSlot;
        next.assets = mergeNativeManagedAssetReference(next.assets, uploaded.reference);
        hotspot.audioAssetSlot = uploaded.reference.slot;
        if (previousSlot) removeNativeManagedAssetReferenceIfUnused(next, previousSlot);
      });
      onStatusChange("Hotspot MP3 uploaded; save the draft to attach it.");
    } catch (error) {
      onStatusChange(error.message || "Hotspot MP3 upload failed.");
    } finally { setUploading(false); }
  };
  const audioReference = selected ? publicDraft.assets.find((asset) => asset.slot === selected.audioAssetSlot) : null;

  return <section className="native-audio-hotspot-editor" aria-labelledby={`${activityId}-audio-hotspots-heading`}>
    <header><span className="studio-section-icon"><Headphones aria-hidden="true" /></span><div><h3 id={`${activityId}-audio-hotspots-heading`}>Audio / Text Hotspots</h3><p>Place a publisher listening cue, focus a readable excerpt, and attach one MP3.</p></div></header>
    {!targets.length ? <p role="alert">This text-only activity has no safe visual stage for audio hotspots.</p> : <button type="button" className="studio-button studio-button--primary" disabled={hotspots.length >= 16} onClick={add}>Add audio hotspot</button>}
    {hotspots.length ? <div className="native-audio-hotspot-list" role="tablist" aria-label="Audio hotspots">{hotspots.map((hotspot, index) => <button key={hotspot.id} type="button" role="tab" aria-selected={hotspot.id === selected?.id} onClick={() => { setSelectedId(hotspot.id); setPreviewing(false); }}>Hotspot {index + 1}</button>)}</div> : <p>No audio hotspots added.</p>}
    {selected && selectedTarget ? <div className="native-audio-hotspot-authoring">
      {targets.length > 1 ? <label className="studio-field"><span>Activity panel</span><select value={selected.panelId || ""} onChange={(event) => {
        const target = targets.find((entry) => entry.panelId === event.target.value);
        updateSelected((hotspot) => { hotspot.panelId = target.panelId; hotspot.activityArea = defaultActivityArea(target); });
      }}>{targets.map((target, index) => <option key={target.panelId} value={target.panelId}>Panel {index + 1}</option>)}</select></label> : null}
      <div><h4>1. Place on activity</h4><ActivityCanvas document={publicDraft} target={selectedTarget} hotspot={selected} assetUrl={previewUrl} onPlace={(point) => updateSelected((hotspot) => {
        hotspot.activityArea.x = Math.round(clamp(point.x - hotspot.activityArea.width / 2, 0, selectedTarget.width - hotspot.activityArea.width));
        hotspot.activityArea.y = Math.round(clamp(point.y - hotspot.activityArea.height / 2, 0, selectedTarget.height - hotspot.activityArea.height));
      })} /></div>
      <div><h4>2. Draw readable-text focus</h4><FocusCanvas readableText={publicDraft.readableText} imageUrl={previewUrl(readableReference.assetId)} hotspot={selected} onFocusArea={(area) => updateSelected((hotspot) => { hotspot.readableFocusArea = area; })} /></div>
      <label className="studio-field"><span>Hotspot accessible label</span><input value={selected.label} maxLength={160} onChange={(event) => updateSelected((hotspot) => { hotspot.label = event.target.value; })} /></label>
      <label className="studio-upload-action"><Upload aria-hidden="true" /><span><strong>{uploading ? "Uploading…" : audioReference ? "Replace MP3" : "Upload MP3"}</strong><small>MP3, up to 50 MB</small></span><input type="file" accept="audio/mpeg,.mp3" disabled={uploading} onChange={(event) => { uploadAudio(event.target.files?.[0]); event.target.value = ""; }} /></label>
      {audioReference ? <audio controls preload="metadata" src={previewUrl(audioReference.assetId)} aria-label={`Preview ${selected.label}`} /> : <p role="alert">Upload an MP3 for this hotspot.</p>}
      <div className="native-audio-hotspot-actions"><button type="button" className="studio-button" disabled={!audioReference} onClick={() => setPreviewing((value) => !value)}>{previewing ? "Close hotspot preview" : "Test hotspot"}</button><button type="button" className="studio-button studio-button--danger-ghost" onClick={remove}><Trash2 aria-hidden="true" />Remove hotspot</button></div>
      {previewing && audioReference ? <div className="native-audio-hotspot-authoring-preview"><NativeAudioTextFocusContent document={publicDraft} hotspot={selected} assetUrl={previewUrl} autoPlay /><ActivityCanvas document={publicDraft} target={selectedTarget} hotspot={selected} assetUrl={previewUrl} onPlace={() => {}} /></div> : null}
    </div> : null}
  </section>;
}
