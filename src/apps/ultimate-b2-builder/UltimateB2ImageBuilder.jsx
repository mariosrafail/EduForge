import { ImageUp, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { UltimateB2ImageActivity } from "../../components/lms/activities/ultimate-b2/UltimateB2ImageActivity.jsx";
import { normalizeUltimateB2ImageAuthoring } from "../../data/ultimate-b2/imageAuthoringSchema.js";
import { ULTIMATE_B2_PAGE5_IMAGE_ID } from "../../data/ultimate-b2/page5AuthoringSchema.js";
import { resolveUltimateB2Page5Artwork } from "../../data/ultimate-b2/page5AuthoringData.js";
import { UltimateB2ExerciseVisualCapabilitiesEditor } from "./UltimateB2ExerciseVisualCapabilitiesEditor.jsx";

const sections = ["Content", "Preview"];
const instructionOptions = [{ value: "unit1.page5.exercise2.instruction", label: "Page 5 Exercise 2 publisher instruction" }];
const publisherCreateEndpoint = "/__hhplms/ultimate-b2-publisher-activities/create";

function endpoint(pathname, activityId) { return `${pathname}?activityId=${encodeURIComponent(activityId)}`; }

function fileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`${file.name} could not be read.`));
    reader.onload = () => resolve(String(reader.result || "").split(",", 2)[1] || "");
    reader.readAsDataURL(file);
  });
}

export function UltimateB2ImageBuilder({ activityId = ULTIMATE_B2_PAGE5_IMAGE_ID, activity = null, onPublisherActivityCreated = () => undefined }) {
  const legacyPage5 = activityId === ULTIMATE_B2_PAGE5_IMAGE_ID;
  const draft = Boolean(activity?.publisherDraft);
  const authoringEndpoint = endpoint(legacyPage5 ? "/__hhplms/ultimate-b2-page-5-authoring" : "/__hhplms/ultimate-b2-image-authoring", activityId);
  const imageAssetEndpoint = endpoint(legacyPage5 ? "/__hhplms/ultimate-b2-page-5-image-asset" : "/__hhplms/ultimate-b2-image-asset", activityId);
  const [payload, setPayload] = useState(() => draft ? { activityId, record: activity, publicAuthoring: null } : null);
  const [title, setTitle] = useState(activity?.title || "Image activity");
  const [draftAlt, setDraftAlt] = useState(activity?.title || "Publisher image");
  const [section, setSection] = useState("Content");
  const [status, setStatus] = useState(draft ? "Draft · save requires an isolated authoring database" : "Loading...");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(draft);
  const [pendingImageFile, setPendingImageFile] = useState(null);
  const [localImagePreview, setLocalImagePreview] = useState("");
  const [selectedImageDimensions, setSelectedImageDimensions] = useState(null);

  useEffect(() => {
    if (draft) return undefined;
    let active = true;
    fetch(authoringEndpoint, { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Image activity authoring could not be loaded.");
      return body;
    }).then((body) => { if (active) { setPayload(body); setTitle(body.record?.title || activity?.title || "Image activity"); setStatus("Saved"); } }).catch((requestError) => { if (active) { setStatus("Load failed"); setError(requestError.message); } });
    return () => { active = false; };
  }, [activity?.title, authoringEndpoint, draft]);

  useEffect(() => {
    const beforeUnload = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  useEffect(() => () => { if (localImagePreview) URL.revokeObjectURL(localImagePreview); }, [localImagePreview]);

  const change = (updater) => {
    setPayload((current) => { const next = structuredClone(current); updater(next); return next; });
    setDirty(true); setStatus("Unsaved changes"); setError("");
  };

  const save = async () => {
    setStatus("Saving"); setError("");
    try {
      if (draft) {
        if (!pendingImageFile) throw new Error("Choose the publisher image before saving the new activity.");
        const response = await fetch(publisherCreateEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft: { pageId: activity.pageId, authoringKind: "image", title, clientMutationId: activity.clientMutationId, predictedActivityId: activityId }, source: { type: pendingImageFile.type, base64: await fileAsBase64(pendingImageFile), mainImageAlt: draftAlt } }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Publisher Image activity could not be created.");
        setPayload(body); setDirty(false); setStatus(body.warning ? "Saved with database synchronization pending" : "Saved to repository and official publisher database"); setError(body.warning || ""); onPublisherActivityCreated(body.record); return;
      }
      let publicAuthoring = structuredClone(payload.publicAuthoring);
      if (pendingImageFile) {
        const uploadResponse = await fetch(imageAssetEndpoint, { method: "POST", headers: { "Content-Type": pendingImageFile.type }, body: pendingImageFile });
        const uploadBody = await uploadResponse.json();
        if (!uploadResponse.ok) throw new Error(uploadBody.error || "The selected image could not be uploaded.");
        if (legacyPage5) {
          if (uploadBody.binding !== "unit1.page5.exercise2.main-content") throw new Error("The image upload returned an unexpected Page 5 asset binding.");
          publicAuthoring.mainImage = uploadBody.binding;
        } else publicAuthoring.mainImage = uploadBody.mainImage;
      }
      publicAuthoring = normalizeUltimateB2ImageAuthoring(publicAuthoring, activityId);
      const requestBody = legacyPage5 ? { activityId, publicAuthoring } : { activityId, title, publicAuthoring };
      const response = await fetch(authoringEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Image activity authoring could not be saved.");
      setPayload(body); setPendingImageFile(null); setDirty(false); setStatus(body.warning ? "Saved with database synchronization pending" : "Saved"); setError(body.warning || "");
      if (body.record) onPublisherActivityCreated(body.record);
    } catch (requestError) { setStatus("Save failed"); setError(requestError.message); }
  };

  const previewDisplay = useMemo(() => {
    if (draft) return localImagePreview ? { activityId, instructionImage: null, instructionImageAlt: "", image: localImagePreview, mainImageAlt: draftAlt } : null;
    if (!payload) return null;
    const authoring = payload.publicAuthoring;
    return {
      ...authoring,
      instructionImage: legacyPage5 ? resolveUltimateB2Page5Artwork(authoring.visualCapabilities.instructionImage) : null,
      image: localImagePreview || (legacyPage5 ? resolveUltimateB2Page5Artwork(authoring.mainImage) : endpoint("/__hhplms/ultimate-b2-image-asset", activityId) + `&file=${encodeURIComponent(authoring.mainImage.repositoryPath.split("/").at(-1))}`),
    };
  }, [activityId, draft, draftAlt, legacyPage5, localImagePreview, payload]);
  const previewActivity = useMemo(() => ({ stableNormalizedId: activityId, title }), [activityId, title]);

  if (!payload) return <section className="listening-builder"><p className="page5-builder-loading">{error || status}</p></section>;
  const authoring = payload.publicAuthoring;
  return (
    <section className="listening-builder page5-activity-builder" data-image-authoring-activity={activityId}>
      <header className="listening-builder-header"><div><span>Ultimate B2 · {activity?.pageLabel || "Image authoring"}</span><h1>Image activity</h1><code>{activityId}</code></div><div className="builder-save-state" role="status" data-dirty={dirty || undefined}><strong>{status}</strong>{error && <small>{error}</small>}<button type="button" disabled={!dirty || status === "Saving"} onClick={save}><Save size={17} /> Save</button></div></header>
      <nav className="listening-builder-sections" aria-label="Image activity editor sections">{sections.map((name) => <button type="button" key={name} aria-selected={section === name} disabled={draft && name === "Preview" && !localImagePreview} onClick={() => setSection(name)}>{name}</button>)}</nav>
      {section === "Content" && <div className="page5-builder-form">
        {!legacyPage5 && <label>Activity title<input aria-label="Activity title" value={title} onChange={(event) => { setTitle(event.target.value); setDirty(true); setStatus("Unsaved changes"); }} /></label>}
        {legacyPage5 && <UltimateB2ExerciseVisualCapabilitiesEditor visualCapabilities={authoring.visualCapabilities} instructionOptions={instructionOptions} showTextOptions={[]} onChange={(updater) => change((next) => updater(next.publicAuthoring.visualCapabilities))} />}
        {legacyPage5 && <label>Instruction image alternative text<textarea value={authoring.instructionImageAlt} onChange={(event) => change((next) => { next.publicAuthoring.instructionImageAlt = event.target.value; })} /></label>}
        <fieldset className="image-activity-upload-fieldset"><legend>Main image</legend>
          <label className="image-activity-file-picker"><ImageUp size={20} /><span><strong>Browse your own image</strong><small>PNG, JPEG or WebP, up to 12 MB. The image is fitted without stretching or cropping.</small></span><input aria-label="Publisher Image source file" type="file" accept="image/png,image/jpeg,image/webp" onChange={async (event) => {
            const file = event.target.files?.[0]; if (!file) return;
            if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setError("Choose a PNG, JPEG or WebP image."); event.target.value = ""; return; }
            if (file.size > 12 * 1024 * 1024) { setError("Image file is larger than 12 MB."); event.target.value = ""; return; }
            const bitmap = await createImageBitmap(file); const dimensions = { width: bitmap.width, height: bitmap.height }; bitmap.close();
            if (localImagePreview) URL.revokeObjectURL(localImagePreview);
            setPendingImageFile(file); setSelectedImageDimensions(dimensions); setLocalImagePreview(URL.createObjectURL(file)); setDirty(true); setStatus("Unsaved changes"); setError("");
          }} /></label>
          <p className="image-activity-recommendation">Recommended main image: 16:9 landscape</p>
          <div className="image-activity-upload-state"><span>Selected image: <strong>{pendingImageFile ? pendingImageFile.name : draft ? "Required" : "Current saved activity image"}</strong></span>{selectedImageDimensions && <span>{selectedImageDimensions.width} × {selectedImageDimensions.height} · {(selectedImageDimensions.width / selectedImageDimensions.height).toFixed(2)}:1</span>}</div>
          {selectedImageDimensions && Math.abs((selectedImageDimensions.width / selectedImageDimensions.height) / (16 / 9) - 1) > 0.03 && <p className="image-activity-ratio-warning" role="status">This image is not 16:9. It will remain fully visible using contain, with letterboxing where necessary.</p>}
        </fieldset>
        <label>Main image alternative text<textarea value={draft ? draftAlt : authoring.mainImageAlt} onChange={(event) => { if (draft) { setDraftAlt(event.target.value); setDirty(true); setStatus("Unsaved changes"); } else change((next) => { next.publicAuthoring.mainImageAlt = event.target.value; }); }} /></label>
      </div>}
      {section === "Preview" && previewDisplay && <div className="page5-builder-preview image-activity-preview"><UltimateB2ImageActivity activity={previewActivity} display={previewDisplay} /></div>}
    </section>
  );
}
