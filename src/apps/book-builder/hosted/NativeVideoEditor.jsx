import { useEffect, useState } from "react";
import { FileText, FileUp, Trash2, Upload, Video } from "lucide-react";

import { createNativeChildId } from "../../../data/native-activities/nativeChildIdentity.js";
import { mergeNativeManagedAssetReference, removeNativeManagedAssetReferenceIfUnused } from "../../../data/native-activities/nativeActivityPublic.js";
import { parseTimedTextSrt } from "../../../data/timed-media/timedText.js";
import { uploadNativeActivityAsset } from "./builderNativeActivityApi.js";
import { convertWorksheetUploadToPdf } from "./imageWorksheetPdf.js";

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "Size unavailable";
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 1 : 2)} MiB`;
}

function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.round(Number(milliseconds || 0) / 1_000));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = String(seconds % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${remainder}` : `${minutes}:${remainder}`;
}

function browserVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const element = document.createElement("video");
    const url = URL.createObjectURL(file);
    const cleanup = () => { URL.revokeObjectURL(url); element.removeAttribute("src"); };
    element.preload = "metadata";
    element.onloadedmetadata = () => {
      const durationMs = Math.round(element.duration * 1_000);
      cleanup();
      if (!Number.isSafeInteger(durationMs) || durationMs < 1) reject(new Error("Video duration is unavailable."));
      else resolve(durationMs);
    };
    element.onerror = () => { cleanup(); reject(new Error("The selected MP4 cannot be read by this browser.")); };
    element.src = url;
  });
}

function detachVideo(document) {
  const slot = document.video?.assetSlot;
  const worksheetSlot = document.video?.worksheet?.assetSlot;
  delete document.video;
  if (slot) removeNativeManagedAssetReferenceIfUnused(document, slot);
  if (worksheetSlot) removeNativeManagedAssetReferenceIfUnused(document, worksheetSlot);
}

function videoIsComplete(video) {
  return Boolean(video?.assetSlot && video.cues?.length && video.durationMs > 0 && video.cues.every((cue) => cue.endMs <= video.durationMs));
}

export function NativeVideoEditor({ bookSlug, componentSlug, activityId, publicDraft, mutatePublic, onIncompleteChange, onIntentChange, onStatusChange }) {
  const [enabled, setEnabled] = useState(Boolean(publicDraft.video));
  const [uploading, setUploading] = useState(false);
  const [pendingCues, setPendingCues] = useState(publicDraft.video?.cues || []);
  const video = publicDraft.video || null;
  const reference = video ? publicDraft.assets.find((asset) => asset.slot === video.assetSlot) : null;
  const worksheetReference = video?.worksheet ? publicDraft.assets.find((asset) => asset.slot === video.worksheet.assetSlot) : null;
  const incomplete = enabled && !videoIsComplete(video);

  useEffect(() => {
    setEnabled(Boolean(publicDraft.video));
    setPendingCues(publicDraft.video?.cues || []);
  }, [activityId]);
  useEffect(() => { onIncompleteChange(incomplete); }, [incomplete, onIncompleteChange]);

  const toggle = () => {
    if (enabled) {
      if (video) mutatePublic(detachVideo);
      else onIntentChange();
      setEnabled(false);
      setPendingCues([]);
      onStatusChange("Video disabled; managed bytes remain retained for lifecycle cleanup.");
      return;
    }
    onIntentChange();
    setEnabled(true);
    onIncompleteChange(true);
    onStatusChange("Upload one MP4 and one valid SRT subtitle file before saving.");
  };

  const uploadVideo = async (file) => {
    if (!file) return;
    setUploading(true);
    onStatusChange("Uploading MP4 video...");
    try {
      const browserDuration = browserVideoDuration(file).catch(() => null);
      const uploaded = await uploadNativeActivityAsset({ bookSlug, componentSlug, activityId, assetSlot: createNativeChildId("asset"), file });
      if (uploaded.metadata?.mimeType !== "video/mp4" || !Number.isSafeInteger(uploaded.metadata?.byteSize)) throw new Error("Uploaded media is not a validated MP4.");
      const durationMs = uploaded.metadata.durationMs || await browserDuration;
      if (!Number.isSafeInteger(durationMs) || durationMs < 1) throw new Error("Validated MP4 duration is unavailable. Upload the file again.");
      const cues = video?.cues || pendingCues;
      mutatePublic((next) => {
        const previousSlot = next.video?.assetSlot;
        next.assets = mergeNativeManagedAssetReference(next.assets, uploaded.reference);
        next.video = { kind: "managed-mp4", assetSlot: uploaded.reference.slot, fileName: file.name, byteSize: uploaded.metadata.byteSize, durationMs, cues, ...(next.video?.worksheet ? { worksheet: next.video.worksheet } : {}) };
        if (previousSlot && previousSlot !== uploaded.reference.slot) removeNativeManagedAssetReferenceIfUnused(next, previousSlot);
      });
      setEnabled(true);
      onStatusChange(cues.length && cues.every((cue) => cue.endMs <= durationMs)
        ? "MP4 uploaded; save the draft to attach it."
        : cues.length ? "MP4 uploaded, but a subtitle cue exceeds its duration. Replace the SRT before saving." : "MP4 uploaded. Import an SRT subtitle file before saving.");
    } catch (error) {
      onStatusChange(error.message || "MP4 upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const uploadWorksheet = async (file) => {
    if (!file || !video) return;
    setUploading(true); onStatusChange(file.type === "application/pdf" ? "Uploading Video Worksheet PDF..." : "Converting worksheet image to a single-page PDF...");
    try {
      const worksheetPdf = await convertWorksheetUploadToPdf(file);
      if (worksheetPdf.type !== "application/pdf" || !worksheetPdf.name.toLowerCase().endsWith(".pdf")) throw new Error("Worksheet conversion did not produce a canonical PDF upload.");
      if (worksheetPdf !== file) onStatusChange("Worksheet image converted. Uploading the canonical PDF...");
      const uploaded = await uploadNativeActivityAsset({ bookSlug, componentSlug, activityId, assetSlot: createNativeChildId("asset"), file: worksheetPdf, purpose: "video-worksheet" });
      if (uploaded.metadata?.mimeType !== "application/pdf" || !Number.isSafeInteger(uploaded.metadata?.byteSize)) throw new Error("Uploaded worksheet is not a validated PDF.");
      mutatePublic((next) => {
        const previousSlot = next.video.worksheet?.assetSlot;
        next.assets = mergeNativeManagedAssetReference(next.assets, uploaded.reference);
        next.video.worksheet = { assetSlot: uploaded.reference.slot, fileName: worksheetPdf.name, byteSize: uploaded.metadata.byteSize };
        if (previousSlot && previousSlot !== uploaded.reference.slot) removeNativeManagedAssetReferenceIfUnused(next, previousSlot);
      });
      onStatusChange("Video Worksheet attached; save the draft to keep it.");
    } catch (error) { onStatusChange(error.message || "Video Worksheet upload failed."); }
    finally { setUploading(false); }
  };

  const removeWorksheet = () => {
    if (!video?.worksheet) return;
    mutatePublic((next) => { const slot = next.video.worksheet.assetSlot; delete next.video.worksheet; removeNativeManagedAssetReferenceIfUnused(next, slot); });
    onStatusChange("Video Worksheet removed; save the draft to keep this change.");
  };

  const importSrt = async (file) => {
    if (!file) return;
    try {
      const cues = parseTimedTextSrt(await file.text(), { createId: () => createNativeChildId("cue"), label: "Video SRT" });
      if (video && cues.some((cue) => cue.endMs > video.durationMs)) throw new Error("Video SRT contains a cue beyond the MP4 duration.");
      setPendingCues(cues);
      if (video) mutatePublic((next) => { next.video.cues = cues; });
      else onIntentChange();
      onStatusChange(`${cues.length} video subtitle cue${cues.length === 1 ? "" : "s"} imported.`);
    } catch (error) {
      onStatusChange(error.message || "Video SRT import failed.");
    }
  };

  return <section className="native-video-editor" aria-labelledby={`${activityId}-video-heading`}>
    <header>
      <span className="studio-section-icon"><Video aria-hidden="true" /></span>
      <div><h3 id={`${activityId}-video-heading`}>Video</h3><p>Optional managed MP4 companion with synchronized SRT subtitles.</p></div>
      <button type="button" className="native-readable-text-toggle" role="switch" aria-label="Video" aria-checked={enabled} onClick={toggle}>{enabled ? "ON" : "OFF"}</button>
    </header>
    {!enabled ? <p className="native-readable-text-off">Optional video is disabled.</p> : null}
    {enabled ? <div className="native-video-editor-body">
      <div className="native-video-editor-status" data-complete={videoIsComplete(video) || undefined}>
        <strong>{videoIsComplete(video) ? "Video companion complete" : "Video companion incomplete"}</strong>
        <span>{video ? `${video.fileName} - ${formatBytes(video.byteSize)} - ${formatDuration(video.durationMs)}` : "MP4 required"}</span>
        <span>{(video?.cues || pendingCues).length ? `${(video?.cues || pendingCues).length} validated subtitle cues` : "SRT subtitles required"}</span>
      </div>
      <div className="native-video-editor-actions">
        <label className="studio-upload-action"><Upload aria-hidden="true" /><span><strong>{uploading ? "Uploading..." : video ? "Replace Video" : "Upload Video"}</strong><small>MP4 - maximum 100 MiB</small></span><input type="file" accept="video/mp4,.mp4" disabled={uploading} onChange={(event) => { uploadVideo(event.target.files?.[0]); event.target.value = ""; }} /></label>
        <label className="studio-upload-action"><FileUp aria-hidden="true" /><span><strong>{(video?.cues || pendingCues).length ? "Replace SRT" : "Upload SRT"}</strong><small>Validated timed subtitle text</small></span><input type="file" accept=".srt,application/x-subrip,text/plain" disabled={uploading} onChange={(event) => { importSrt(event.target.files?.[0]); event.target.value = ""; }} /></label>
      </div>
      <section className="native-video-worksheet-editor" aria-label="Video Worksheet PDF"><div><FileText aria-hidden="true" /><span><strong>Video Worksheet</strong><small>{worksheetReference ? `${video.worksheet.fileName} · ${formatBytes(video.worksheet.byteSize)}` : "No worksheet attached"}</small></span></div><label className="studio-upload-action"><Upload aria-hidden="true" /><span><strong>{worksheetReference ? "Replace worksheet" : "Upload worksheet"}</strong><small>PDF (25 MiB) or PNG, JPEG, WebP (10 MiB); images become one-page PDFs</small></span><input type="file" accept="application/pdf,.pdf,image/png,.png,image/jpeg,.jpg,.jpeg,image/webp,.webp" disabled={uploading || !video} onChange={(event) => { uploadWorksheet(event.target.files?.[0]); event.target.value = ""; }} /></label>{worksheetReference ? <button type="button" className="studio-button studio-button--danger-ghost" onClick={removeWorksheet}><Trash2 aria-hidden="true" /> Remove PDF</button> : null}</section>
      <button type="button" className="studio-button studio-button--danger-ghost" onClick={toggle}>Remove / Disable Video</button>
    </div> : null}
  </section>;
}
