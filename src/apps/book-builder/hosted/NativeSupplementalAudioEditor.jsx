import { useEffect, useState } from "react";
import { BookOpenText, Music, Upload } from "lucide-react";

import { createNativeChildId } from "../../../data/native-activities/nativeChildIdentity.js";
import { mergeNativeManagedAssetReference, removeNativeManagedAssetReferenceIfUnused } from "../../../data/native-activities/nativeActivityPublic.js";
import { uploadNativeActivityAsset } from "./builderNativeActivityApi.js";
import { nativeListeningMediaDuration } from "./nativeListeningEditorSupport.js";

function detachReference(document) {
  const slot = document.supplementalAudio?.reference?.assetSlot;
  if (document.supplementalAudio) delete document.supplementalAudio.reference;
  if (slot) removeNativeManagedAssetReferenceIfUnused(document, slot);
}

function detachSupplementalAudio(document) {
  const audioSlot = document.supplementalAudio?.assetSlot;
  const referenceSlot = document.supplementalAudio?.reference?.assetSlot;
  delete document.supplementalAudio;
  if (audioSlot) removeNativeManagedAssetReferenceIfUnused(document, audioSlot);
  if (referenceSlot) removeNativeManagedAssetReferenceIfUnused(document, referenceSlot);
}

const formatDuration = (milliseconds) => {
  const seconds = Math.max(0, Math.floor(Number(milliseconds || 0) / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

export function NativeSupplementalAudioEditor({ bookSlug, componentSlug, activityId, publicDraft, mutatePublic, previewUrl, onIncompleteChange, onIntentChange, onStatusChange, onUploadStateChange }) {
  const supplementalAudio = publicDraft.supplementalAudio || null;
  const [enabled, setEnabled] = useState(Boolean(supplementalAudio));
  const [referenceEnabled, setReferenceEnabled] = useState(Boolean(supplementalAudio?.reference));
  const [uploading, setUploading] = useState("");
  useEffect(() => { onUploadStateChange?.(Boolean(uploading)); return () => onUploadStateChange?.(false); }, [uploading, onUploadStateChange]);
  const audioAsset = supplementalAudio ? publicDraft.assets.find((asset) => asset.slot === supplementalAudio.assetSlot) : null;
  const reference = supplementalAudio?.reference || null;
  const referenceAsset = reference ? publicDraft.assets.find((asset) => asset.slot === reference.assetSlot) : null;
  const incomplete = enabled && (!supplementalAudio || !audioAsset || referenceEnabled && (!reference || !referenceAsset || !reference.altText.trim()));

  useEffect(() => {
    setEnabled(Boolean(publicDraft.supplementalAudio));
    setReferenceEnabled(Boolean(publicDraft.supplementalAudio?.reference));
    setUploading("");
  }, [activityId]);
  useEffect(() => { onIncompleteChange(incomplete); }, [incomplete, onIncompleteChange]);

  const toggleAudio = () => {
    if (enabled) {
      if (supplementalAudio) mutatePublic(detachSupplementalAudio);
      else onIntentChange();
      setEnabled(false); setReferenceEnabled(false);
      onStatusChange("Supplemental MP3 disabled; unused managed references were detached.");
      return;
    }
    onIntentChange(); setEnabled(true); onIncompleteChange(true);
    onStatusChange("Upload a supplemental MP3 before saving.");
  };

  const toggleReference = () => {
    if (referenceEnabled) {
      if (reference) mutatePublic(detachReference);
      else onIntentChange();
      setReferenceEnabled(false);
      onStatusChange("Supplemental audio Reference disabled.");
      return;
    }
    onIntentChange(); setReferenceEnabled(true); onIncompleteChange(true);
    onStatusChange("Upload a Reference image and add its accessibility label before saving.");
  };

  const uploadAudio = async (file) => {
    if (!file) return;
    setUploading("audio"); onStatusChange("Validating and uploading supplemental MP3…");
    try {
      const durationMs = await nativeListeningMediaDuration(file);
      const uploaded = await uploadNativeActivityAsset({ bookSlug, componentSlug, activityId, assetSlot: createNativeChildId("asset"), file });
      mutatePublic((next) => {
        const previousSlot = next.supplementalAudio?.assetSlot;
        const previousReference = next.supplementalAudio?.reference;
        next.assets = mergeNativeManagedAssetReference(next.assets, uploaded.reference);
        next.supplementalAudio = { assetSlot: uploaded.reference.slot, durationMs, ...(previousReference ? { reference: previousReference } : {}) };
        if (previousSlot && previousSlot !== uploaded.reference.slot) removeNativeManagedAssetReferenceIfUnused(next, previousSlot);
      });
      setEnabled(true);
      onStatusChange(`Supplemental MP3 uploaded (${formatDuration(durationMs)}); save the draft to attach it.`);
    } catch (error) { onStatusChange(error.message || "Supplemental MP3 upload failed."); }
    finally { setUploading(""); }
  };

  const uploadReference = async (file) => {
    if (!file || !supplementalAudio) return;
    setUploading("reference"); onStatusChange("Uploading supplemental audio Reference image…");
    try {
      const uploaded = await uploadNativeActivityAsset({ bookSlug, componentSlug, activityId, assetSlot: createNativeChildId("asset"), file });
      if (!Number.isSafeInteger(uploaded.metadata?.width) || !Number.isSafeInteger(uploaded.metadata?.height)) throw new Error("Uploaded Reference image dimensions are unavailable.");
      mutatePublic((next) => {
        const previousSlot = next.supplementalAudio?.reference?.assetSlot;
        next.assets = mergeNativeManagedAssetReference(next.assets, uploaded.reference);
        next.supplementalAudio.reference = {
          assetSlot: uploaded.reference.slot,
          sourceWidth: uploaded.metadata.width,
          sourceHeight: uploaded.metadata.height,
          altText: next.supplementalAudio.reference?.altText || "Supplemental audio reference",
        };
        if (previousSlot && previousSlot !== uploaded.reference.slot) removeNativeManagedAssetReferenceIfUnused(next, previousSlot);
      });
      setReferenceEnabled(true);
      onStatusChange("Reference image uploaded; save the draft to attach it.");
    } catch (error) { onStatusChange(error.message || "Reference image upload failed."); }
    finally { setUploading(""); }
  };

  return <section className="native-readable-text-editor native-supplemental-audio-editor" aria-labelledby={`${activityId}-supplemental-audio-heading`}>
    <header><span className="studio-section-icon"><Music aria-hidden="true" /></span><div><h3 id={`${activityId}-supplemental-audio-heading`}>Supplemental MP3</h3><p>Optional learner-facing audio using the classic Listening player.</p></div><button type="button" className="native-readable-text-toggle" role="switch" aria-label="Supplemental MP3" aria-checked={enabled} onClick={toggleAudio}>{enabled ? "ON" : "OFF"}</button></header>
    {!enabled ? <p className="native-readable-text-off">Optional supplemental audio is disabled.</p> : null}
    {enabled && !supplementalAudio ? <p className="native-readable-text-required" role="alert">Upload a supplemental MP3.</p> : null}
    {enabled ? <div className="native-readable-text-body">
      {supplementalAudio && audioAsset ? <div><audio controls preload="metadata" src={previewUrl(audioAsset.assetId)} aria-label="Supplemental MP3 preview" /><p>Detected duration: {formatDuration(supplementalAudio.durationMs)}</p></div> : null}
      <label className="studio-upload-action"><Upload aria-hidden="true" /><span><strong>{uploading === "audio" ? "Uploading…" : supplementalAudio ? "Replace MP3" : "Upload MP3"}</strong><small>MP3 · maximum 50 MiB</small></span><input type="file" accept="audio/mpeg,.mp3" disabled={Boolean(uploading)} onChange={(event) => { uploadAudio(event.target.files?.[0]); event.target.value = ""; }} /></label>
      {supplementalAudio ? <section className="native-supplemental-reference-editor"><header><BookOpenText aria-hidden="true" /><div><h4>Reference</h4><p>Optional large scrollable image opened from inside the audio player.</p></div><button type="button" className="native-readable-text-toggle" role="switch" aria-label="Supplemental MP3 Reference" aria-checked={referenceEnabled} onClick={toggleReference}>{referenceEnabled ? "ON" : "OFF"}</button></header>
        {referenceEnabled && !reference ? <p className="native-readable-text-required" role="alert">Upload a Reference image.</p> : null}
        {referenceEnabled ? <><label className="studio-upload-action"><Upload aria-hidden="true" /><span><strong>{uploading === "reference" ? "Uploading…" : reference ? "Replace Reference image" : "Upload Reference image"}</strong><small>PNG, JPEG or WebP</small></span><input type="file" accept="image/png,image/jpeg,image/webp" disabled={Boolean(uploading)} onChange={(event) => { uploadReference(event.target.files?.[0]); event.target.value = ""; }} /></label>{reference && referenceAsset ? <figure><img src={previewUrl(referenceAsset.assetId)} alt={reference.altText} /><figcaption>{reference.sourceWidth} × {reference.sourceHeight}px</figcaption></figure> : null}{reference ? <label className="studio-field"><span>Accessibility label</span><input value={reference.altText} maxLength={300} onChange={(event) => mutatePublic((next) => { next.supplementalAudio.reference.altText = event.target.value; })} /></label> : null}</> : null}
      </section> : null}
      {supplementalAudio ? <button type="button" className="studio-button studio-button--danger-ghost" onClick={toggleAudio}>Remove / Disable Supplemental MP3</button> : null}
    </div> : null}
  </section>;
}
