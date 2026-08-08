import { Upload, XCircle } from "lucide-react";
import { useState } from "react";

import { importTeacherProjectAsset } from "../bookBuilderApi.js";

export function friendlyTeacherError(error) {
  const messages = {
    invalid_teacher_raster: "Unsupported or invalid image format.",
    teacher_asset_too_large: "This asset is too large.",
    invalid_teacher_gaf: "Invalid GAF bundle.",
    incomplete_teacher_gaf_bundle: "The GAF atlas bundle is incomplete.",
    teacher_project_revision_conflict: "The project changed in another session. Reload before continuing.",
    teacher_asset_still_referenced: "This asset is still being used.",
    teacher_project_already_exists: "That project slug already exists.",
  };
  return messages[error?.code] || error?.message || "The asset could not be imported.";
}

export function TeacherProjectAssetSlot({ label, assetId, project, urls, descriptor, accept = "image/png,image/jpeg,image/webp", writeEnabled, onImported, onClear }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const asset = assetId ? project.assets[assetId] : null;
  const importFile = async (file) => {
    if (!file) return;
    setPending(true); setError(""); setDragging(false);
    try {
      onImported(await importTeacherProjectAsset(project.projectId, file, descriptor));
    } catch (reason) { setError(friendlyTeacherError(reason)); }
    finally { setPending(false); }
  };
  return (
    <div className={`teacher-asset-slot ${asset ? "has-asset" : "is-missing"} ${dragging ? "is-dragging" : ""}`}
      onDragEnter={(event) => { if (writeEnabled) { event.preventDefault(); setDragging(true); } }}
      onDragOver={(event) => { if (writeEnabled) event.preventDefault(); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); if (writeEnabled) importFile(event.dataTransfer.files?.[0]); }}>
      <div className="teacher-asset-slot-preview">{asset && asset.mediaType.startsWith("image/") && urls[assetId] ? <img src={urls[assetId]} alt="" /> : <Upload aria-hidden="true" />}</div>
      <div className="teacher-asset-slot-copy"><strong>{label}</strong>{asset ? <><span title={asset.originalFilename}>{asset.originalFilename}</span><small>{asset.width ? `${asset.width} × ${asset.height} · ` : ""}{Math.ceil(asset.sizeBytes / 1024)} KB</small></> : <span>Missing</span>}{error && <small className="studio-validation-errors" role="alert">{error}</small>}</div>
      <div className="teacher-asset-slot-actions">
        <label className="studio-button secondary"><input type="file" accept={accept} disabled={!writeEnabled || pending} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; importFile(file); }} /><span>{pending ? "Importing…" : asset ? "Replace" : "Choose"}</span></label>
        {asset && <button type="button" className="studio-icon-button" disabled={!writeEnabled} aria-label={`Remove ${label} assignment`} onClick={onClear}><XCircle aria-hidden="true" /></button>}
      </div>
    </div>
  );
}
