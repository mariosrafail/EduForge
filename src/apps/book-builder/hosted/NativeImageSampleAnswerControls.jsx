import { useEffect, useRef, useState } from "react";
import { createNativeChildId } from "../../../data/native-activities/nativeChildIdentity.js";
import { uploadNativeActivityAsset } from "./builderNativeActivityApi.js";

export function NativeImageSampleAnswerControls({ bookSlug, componentSlug, activityId, solution, onChange, onPendingChange }) {
  const operation = useRef(null);
  const [message, setMessage] = useState("");
  const pendingCallback = useRef(onPendingChange); pendingCallback.current = onPendingChange;
  useEffect(() => () => { if (operation.current) pendingCallback.current(false); operation.current = null; }, [bookSlug, componentSlug, activityId]);
  const sample = solution.sampleAnswer || { enabled: false, image: null };
  const upload = async (file) => {
    if (!file || operation.current) return;
    const token = {}; operation.current = token; onPendingChange(true); setMessage("Uploading protected answer image…");
    try {
      const uploaded = await uploadNativeActivityAsset({ bookSlug, componentSlug, activityId, assetSlot: createNativeChildId("answer"), file, purpose: "teacher-answer" });
      if (operation.current !== token) return;
      if (uploaded.reference.role !== "native_teacher_answer") throw new Error("Protected upload is unavailable.");
      onChange({ ...sample, image: { reference: uploaded.reference, mediaType: uploaded.metadata.mimeType, sourceWidth: uploaded.metadata.width, sourceHeight: uploaded.metadata.height, altText: sample.image?.altText || "Sample answer" } });
      setMessage("Protected image uploaded. Save Draft to retain it.");
    } catch { if (operation.current === token) setMessage("Protected image upload failed. The previous answer is preserved."); }
    finally { if (operation.current === token) { operation.current = null; onPendingChange(false); } }
  };
  return <fieldset disabled={Boolean(operation.current)}><legend>Teacher Sample answer</legend>
    <label><input type="checkbox" checked={sample.enabled} onChange={(event) => onChange({ ...sample, enabled: event.target.checked })} />Enable Sample answer</label>
    {sample.enabled ? <>
      <label>{sample.image ? "Replace Sample answer image" : "Upload Sample answer image"}<input type="file" aria-label="Sample answer image" accept="image/png,image/jpeg,image/webp" onChange={(event) => { upload(event.target.files?.[0]); event.target.value = ""; }} /></label>
      {sample.image ? <><label>Sample answer description<input aria-label="Sample answer description" maxLength={2000} value={sample.image.altText} onChange={(event) => onChange({ ...sample, image: { ...sample.image, altText: event.target.value } })} /></label><button type="button" onClick={() => onChange({ ...sample, image: null })}>Remove Sample answer image</button></> : <p>Upload an answer image before publication.</p>}
    </> : null}<p role="status">{message}</p>
  </fieldset>;
}
