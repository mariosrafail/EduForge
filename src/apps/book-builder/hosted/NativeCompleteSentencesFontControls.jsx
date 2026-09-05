import { useEffect, useState } from "react";
import { Upload } from "lucide-react";

import { StudioField } from "../../../components/builder-studio/StudioControls.jsx";
import { uploadBuilderFont } from "./builderNativeActivityApi.js";

export function NativeActivityFontControls({ bookSlug, componentSlug, fonts, selectedSlot, onSelect, onUploaded, onMessage, label = "Answer font", onUploadStateChange }) {
  const [uploading, setUploading] = useState(false);
  useEffect(() => { onUploadStateChange?.(uploading); return () => onUploadStateChange?.(false); }, [uploading, onUploadStateChange]);
  const selectedFont = fonts.find((font) => font.slot === selectedSlot) || null;

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
    <StudioField label={label}>
      <select value={selectedSlot || ""} onChange={(event) => onSelect(fonts.find((font) => font.slot === event.target.value) || null)}>
        <option value="">Default application font</option>
        {fonts.map((font) => <option key={font.assetId} value={font.slot}>{font.displayLabel}</option>)}
      </select>
      <small role="status">{selectedFont ? `${selectedFont.displayLabel} · ${Math.ceil(selectedFont.byteSize / 1024)} KB · shared component font` : "Default application font · no managed font attached"}</small>
    </StudioField>
    <label className="studio-upload-action">
      <Upload aria-hidden="true" />
      <span><strong>{uploading ? "Uploading…" : "Upload TTF"}</strong><small>Reusable TrueType font, component-scoped</small></span>
      <input type="file" accept=".ttf,font/ttf" disabled={uploading} onChange={(event) => { upload(event.target.files?.[0]); event.target.value = ""; }} />
    </label>
  </>;
}

export const NativeCompleteSentencesFontControls = NativeActivityFontControls;
