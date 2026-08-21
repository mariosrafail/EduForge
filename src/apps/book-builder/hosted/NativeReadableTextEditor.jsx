import { useEffect, useState } from "react";
import { BookOpen, Upload } from "lucide-react";

import { createNativeChildId } from "../../../data/native-activities/nativeChildIdentity.js";
import { mergeNativeManagedAssetReference, removeNativeManagedAssetReferenceIfUnused } from "../../../data/native-activities/nativeActivityPublic.js";
import { uploadNativeActivityAsset } from "./builderNativeActivityApi.js";

function detachReadableText(document) {
  const slot = document.readableText?.assetSlot;
  delete document.readableText;
  if (slot) removeNativeManagedAssetReferenceIfUnused(document, slot);
}

export function NativeReadableTextEditor({ bookSlug, componentSlug, activityId, publicDraft, mutatePublic, previewUrl, onIncompleteChange, onIntentChange, onStatusChange }) {
  const [enabled, setEnabled] = useState(Boolean(publicDraft.readableText));
  const [uploading, setUploading] = useState(false);
  const readableText = publicDraft.readableText || null;
  const reference = readableText ? publicDraft.assets.find((asset) => asset.slot === readableText.assetSlot) : null;

  useEffect(() => setEnabled(Boolean(publicDraft.readableText)), [activityId]);
  const incomplete = enabled && (!readableText || !readableText.altText.trim());
  useEffect(() => { onIncompleteChange(incomplete); }, [incomplete, onIncompleteChange]);

  const toggle = () => {
    if (enabled) {
      if (readableText) mutatePublic(detachReadableText);
      else onIntentChange();
      setEnabled(false);
      onStatusChange("Readable Text disabled; managed bytes remain retained for lifecycle cleanup.");
      return;
    }
    onIntentChange();
    setEnabled(true);
    onIncompleteChange(true);
    onStatusChange("Upload a readable-text image before saving.");
  };

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    onStatusChange("Uploading readable-text image…");
    try {
      const uploaded = await uploadNativeActivityAsset({ bookSlug, componentSlug, activityId, assetSlot: createNativeChildId("asset"), file });
      if (!uploaded.metadata || !Number.isSafeInteger(uploaded.metadata.width) || !Number.isSafeInteger(uploaded.metadata.height)) throw new Error("Uploaded image dimensions are unavailable.");
      mutatePublic((next) => {
        const previousSlot = next.readableText?.assetSlot;
        next.assets = mergeNativeManagedAssetReference(next.assets, uploaded.reference);
        next.readableText = {
          kind: "image",
          assetSlot: uploaded.reference.slot,
          sourceWidth: uploaded.metadata.width,
          sourceHeight: uploaded.metadata.height,
          altText: next.readableText?.altText || "Readable text",
        };
        if (previousSlot && previousSlot !== uploaded.reference.slot) removeNativeManagedAssetReferenceIfUnused(next, previousSlot);
      });
      setEnabled(true);
      onIncompleteChange(false);
      onStatusChange("Readable-text image uploaded; save the draft to attach it.");
    } catch (error) {
      onStatusChange(error.message || "Readable-text image upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return <section className="native-readable-text-editor" aria-labelledby={`${activityId}-readable-text-heading`}>
    <header>
      <span className="studio-section-icon"><BookOpen aria-hidden="true" /></span>
      <div><h3 id={`${activityId}-readable-text-heading`}>Readable Text</h3><p>This image is opened from the Book / Show Text button in the interactive activity.</p></div>
      <button type="button" className="native-readable-text-toggle" role="switch" aria-label="Readable Text" aria-checked={enabled} onClick={toggle}>{enabled ? "ON" : "OFF"}</button>
    </header>
    {!enabled ? <p className="native-readable-text-off">Optional supporting reading is disabled.</p> : null}
    {enabled && !readableText ? <p className="native-readable-text-required" role="alert">Upload a readable-text image.</p> : null}
    {enabled && readableText && !readableText.altText.trim() ? <p className="native-readable-text-required" role="alert">Add an accessibility label.</p> : null}
    {enabled ? <div className="native-readable-text-body">
      {readableText && reference ? <figure>
        <img src={previewUrl(reference.assetId)} alt={readableText.altText} />
        <figcaption>{readableText.sourceWidth} × {readableText.sourceHeight}px</figcaption>
      </figure> : null}
      <label className="studio-upload-action"><Upload aria-hidden="true" /><span><strong>{uploading ? "Uploading…" : readableText ? "Replace image" : "Upload Readable Text Image"}</strong><small>PNG, JPEG or WebP</small></span><input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => { upload(event.target.files?.[0]); event.target.value = ""; }} /></label>
      {readableText ? <label className="studio-field"><span>Accessibility label</span><input value={readableText.altText} maxLength={300} onChange={(event) => mutatePublic((next) => { next.readableText.altText = event.target.value; })} /></label> : null}
      {readableText ? <button type="button" className="studio-button studio-button--danger-ghost" onClick={toggle}>Remove / Disable Readable Text</button> : null}
    </div> : null}
  </section>;
}
