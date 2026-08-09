import { ImageUp, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { UltimateB2ImageActivity } from "../../components/lms/activities/ultimate-b2/UltimateB2ImageActivity.jsx";
import { resolveUltimateB2Page5Artwork } from "../../data/ultimate-b2/page5AuthoringData.js";
import { normalizeUltimateB2Page5ImageAuthoring } from "../../data/ultimate-b2/page5AuthoringSchema.js";
import { UltimateB2ExerciseVisualCapabilitiesEditor } from "./UltimateB2ExerciseVisualCapabilitiesEditor.jsx";

const activityId = "ultimate-b2-sb-u1-p1-o2";
const endpoint = `/__hhplms/ultimate-b2-page-5-authoring?activityId=${activityId}`;
const imageAssetEndpoint = `/__hhplms/ultimate-b2-page-5-image-asset?activityId=${activityId}`;
const managedImageBinding = "unit1.page5.exercise2.main-content";
const sections = ["Content", "Preview"];
const instructionOptions = [{ value: "unit1.page5.exercise2.instruction", label: "Page 5 Exercise 2 publisher instruction" }];

export function UltimateB2ImageBuilder() {
  const [payload, setPayload] = useState(null);
  const [section, setSection] = useState("Content");
  const [status, setStatus] = useState("Loading...");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [pendingImageFile, setPendingImageFile] = useState(null);
  const [localImagePreview, setLocalImagePreview] = useState("");
  const [selectedImageDimensions, setSelectedImageDimensions] = useState(null);

  useEffect(() => {
    let active = true;
    fetch(endpoint, { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Image activity authoring could not be loaded.");
      return body;
    }).then((body) => { if (active) { setPayload(body); setStatus("Saved"); } }).catch((requestError) => { if (active) { setStatus("Load failed"); setError(requestError.message); } });
    return () => { active = false; };
  }, []);

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
      const normalized = { activityId, publicAuthoring: normalizeUltimateB2Page5ImageAuthoring(payload.publicAuthoring) };
      if (pendingImageFile) {
        const uploadResponse = await fetch(imageAssetEndpoint, { method: "POST", headers: { "Content-Type": pendingImageFile.type }, body: pendingImageFile });
        const uploadBody = await uploadResponse.json();
        if (!uploadResponse.ok) throw new Error(uploadBody.error || "The selected image could not be uploaded.");
        if (uploadBody.binding !== managedImageBinding) throw new Error("The image upload returned an unexpected asset binding.");
      }
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(normalized) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Image activity authoring could not be saved.");
      setPayload(body); setPendingImageFile(null); setDirty(false); setStatus("Saved");
    } catch (requestError) { setStatus("Save failed"); setError(requestError.message); }
  };
  const previewDisplay = useMemo(() => payload ? ({
    ...payload.publicAuthoring,
    instructionImage: resolveUltimateB2Page5Artwork(payload.publicAuthoring.visualCapabilities.instructionImage),
    image: localImagePreview || resolveUltimateB2Page5Artwork(payload.publicAuthoring.mainImage),
  }) : null, [localImagePreview, payload]);
  const previewActivity = useMemo(() => ({ stableNormalizedId: activityId, title: "Unit opener Â· Exercise 2" }), []);

  if (!payload) return <section className="listening-builder"><p className="page5-builder-loading">{error || status}</p></section>;
  return (
    <section className="listening-builder page5-activity-builder">
      <header className="listening-builder-header"><div><span>Ultimate B2 Â· Page 5 authoring</span><h1>Image activity</h1><code>{activityId}</code></div><div className="builder-save-state" role="status" data-dirty={dirty || undefined}><strong>{status}</strong>{error && <small>{error}</small>}<button type="button" disabled={!dirty || status === "Saving"} onClick={save}><Save size={17} /> Save</button></div></header>
      <nav className="listening-builder-sections" aria-label="Image activity editor sections">{sections.map((name) => <button type="button" key={name} aria-selected={section === name} onClick={() => setSection(name)}>{name}</button>)}</nav>
      {section === "Content" && <div className="page5-builder-form">
        <UltimateB2ExerciseVisualCapabilitiesEditor visualCapabilities={payload.publicAuthoring.visualCapabilities} instructionOptions={instructionOptions} showTextOptions={[]} onChange={(updater) => change((next) => updater(next.publicAuthoring.visualCapabilities))} />
        <label>Instruction image alternative text<textarea value={payload.publicAuthoring.instructionImageAlt} onChange={(event) => change((next) => { next.publicAuthoring.instructionImageAlt = event.target.value; })} /></label>
        <fieldset className="image-activity-upload-fieldset"><legend>Main image</legend>
          <label className="image-activity-file-picker"><ImageUp size={20} /><span><strong>Browse your own image</strong><small>PNG, JPEG or WebP, up to 12 MB. The image is fitted without stretching or cropping.</small></span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setError("Choose a PNG, JPEG or WebP image."); event.target.value = ""; return; }
            if (file.size > 12 * 1024 * 1024) { setError("Image file is larger than 12 MB."); event.target.value = ""; return; }
            const bitmap = await createImageBitmap(file);
            const dimensions = { width: bitmap.width, height: bitmap.height };
            bitmap.close();
            if (localImagePreview) URL.revokeObjectURL(localImagePreview);
            setPendingImageFile(file);
            setSelectedImageDimensions(dimensions);
            setLocalImagePreview(URL.createObjectURL(file));
            change((next) => { next.publicAuthoring.mainImage = managedImageBinding; });
          }} /></label>
          <p className="image-activity-recommendation">Recommended main image: 16:9 landscape</p>
          <div className="image-activity-upload-state"><span>Selected image: <strong>{pendingImageFile ? pendingImageFile.name : "Current saved activity image"}</strong></span>{selectedImageDimensions && <span>{selectedImageDimensions.width} × {selectedImageDimensions.height} · {(selectedImageDimensions.width / selectedImageDimensions.height).toFixed(2)}:1</span>}</div>
          {selectedImageDimensions && Math.abs((selectedImageDimensions.width / selectedImageDimensions.height) / (16 / 9) - 1) > 0.03 && <p className="image-activity-ratio-warning" role="status">This image is not 16:9. It will remain fully visible using contain, with letterboxing where necessary.</p>}
        </fieldset>
        <label>Main image alternative text<textarea value={payload.publicAuthoring.mainImageAlt} onChange={(event) => change((next) => { next.publicAuthoring.mainImageAlt = event.target.value; })} /></label>
      </div>}
      {section === "Preview" && <div className="page5-builder-preview image-activity-preview"><UltimateB2ImageActivity activity={previewActivity} display={previewDisplay} /></div>}
    </section>
  );
}
