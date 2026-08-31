import { useState } from "react";
import { Upload } from "lucide-react";

import { StudioField } from "../../../components/builder-studio/StudioControls.jsx";
import { uploadBuilderFont } from "./builderNativeActivityApi.js";

export function NativeCompleteSentencesFontControls({ bookSlug, componentSlug, fonts, selectedSlot, onSelect, onUploaded, onMessage }) {
  const [uploading, setUploading] = useState(false);

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    onMessage("Uploading TrueType font…");
    try {
      const value = await uploadBuilderFont({ bookSlug, componentSlug, file });
      onUploaded(value.font);
      onSelect(value.font);
      onMessage(value.idempotent ? "Existing component font selected." : "Font uploaded to this component's library and selected.");
    } catch (error) {
      onMessage(error.message || "Font upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return <>
    <StudioField label="Answer font">
      <select value={selectedSlot || ""} onChange={(event) => onSelect(fonts.find((font) => font.slot === event.target.value) || null)}>
        <option value="">Default application font</option>
        {fonts.map((font) => <option key={font.assetId} value={font.slot}>{font.displayLabel}</option>)}
      </select>
    </StudioField>
    <label className="studio-upload-action">
      <Upload aria-hidden="true" />
      <span><strong>{uploading ? "Uploading…" : "Upload TTF"}</strong><small>Reusable TrueType font, component-scoped</small></span>
      <input type="file" accept=".ttf,font/ttf" disabled={uploading} onChange={(event) => { upload(event.target.files?.[0]); event.target.value = ""; }} />
    </label>
  </>;
}
