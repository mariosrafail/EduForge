import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Copy, Images, Trash2, Upload } from "lucide-react";
import { useState } from "react";

import { importTeacherProjectAsset } from "../bookBuilderApi.js";
import { changeTeacherPageLayout } from "./teacherProjectAuthoring.js";
import { friendlyTeacherError } from "./TeacherProjectAssetSlot.jsx";

const pageDescriptor = Object.freeze({ section: "pages", slot: "library", variant: "image", index: null });

function layoutSummary(entry) {
  if (entry.layout === "double-pair") return "Double · Two page images";
  if (entry.layout === "double-wide") return "Double · One spread image";
  return "Single page";
}

function PageImageField({ label, value, project, urls, writeEnabled, onAssign, onProjectChange, onChoose }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const asset = value ? project.assets[value] : null;
  const upload = async (file) => {
    if (!file) return;
    setPending(true); setError("");
    try {
      const result = await importTeacherProjectAsset(project.projectId, file, pageDescriptor);
      onProjectChange(result.project); onAssign(result.asset.assetId);
    } catch (reason) { setError(friendlyTeacherError(reason)); }
    finally { setPending(false); }
  };
  return (
    <section className={`teacher-page-image-field ${asset ? "has-asset" : "is-missing"}`} aria-label={label}>
      <div className="teacher-page-image-field-preview">{asset && urls[value] ? <img src={urls[value]} alt="" /> : <Images aria-hidden="true" />}</div>
      <div className="teacher-page-image-field-copy"><strong>{label}</strong>{asset ? <><span title={asset.originalFilename}>{asset.originalFilename}</span><small>{asset.width} × {asset.height}</small></> : <span>No image assigned</span>}</div>
      <div className="teacher-page-image-actions">
        <button type="button" className="studio-button secondary" disabled={!writeEnabled || pending} onClick={onChoose}>{asset ? "Change" : "Choose from library"}</button>
        <label className="studio-button secondary"><input className="teacher-visually-hidden-file" type="file" accept="image/png,image/jpeg,image/webp" disabled={!writeEnabled || pending} aria-label={`Upload new ${label.toLowerCase()}`} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; upload(file); }} /><Upload aria-hidden="true" />{pending ? "Uploading…" : "Upload new"}</label>
        {asset && <button type="button" className="studio-button secondary danger" disabled={!writeEnabled || pending} onClick={() => onAssign(null)}>Clear</button>}
      </div>
      {error && <small className="studio-validation-errors" role="alert">{error}</small>}
    </section>
  );
}

export default function TeacherProjectPageEntryCard({ entry, index, count, expanded, project, urls, writeEnabled, onChange, onMove, onDelete, onProjectChange, onChooseImage, onToggle }) {
  const complete = Boolean(entry.pageLabel && (entry.layout === "double-pair" ? entry.leftImage && entry.rightImage : entry.image));
  const update = (key, value) => onChange({ ...entry, [key]: value });
  const doublePage = entry.layout !== "single-page";
  return (
    <article className={`teacher-page-entry ${complete ? "is-complete" : "is-incomplete"} ${expanded ? "is-expanded" : "is-collapsed"}`} data-entry-id={entry.id}>
      <header className="teacher-page-entry-summary">
        <button type="button" className="teacher-page-entry-toggle" aria-expanded={expanded} aria-controls={`teacher-entry-editor-${entry.id}`} onClick={onToggle}>
          <span><strong>{entry.sectionTitle || `Page / Spread ${index + 1}`}</strong><small>pg {entry.pageLabel || "Label missing"} · {layoutSummary(entry)}</small></span>
          <span className={`teacher-page-status ${complete ? "complete" : "incomplete"}`}>{complete ? "Complete" : "Incomplete"}</span>
          {expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
        </button>
        <div className="teacher-page-entry-order" aria-label={`Order and delete entry ${index + 1}`}>
          <button type="button" className="studio-icon-button" title="Move up" disabled={!writeEnabled || index === 0} aria-label={`Move entry ${index + 1} up`} onClick={() => onMove(-1)}><ArrowUp aria-hidden="true" /></button>
          <button type="button" className="studio-icon-button" title="Move down" disabled={!writeEnabled || index === count - 1} aria-label={`Move entry ${index + 1} down`} onClick={() => onMove(1)}><ArrowDown aria-hidden="true" /></button>
          <button type="button" className="studio-icon-button danger" title="Delete" disabled={!writeEnabled} aria-label={`Delete entry ${index + 1}`} onClick={onDelete}><Trash2 aria-hidden="true" /></button>
        </div>
      </header>
      {expanded && <div className="teacher-page-entry-editor" id={`teacher-entry-editor-${entry.id}`}>
        <section className="teacher-page-information" aria-labelledby={`teacher-entry-information-${entry.id}`}>
          <header><span className="studio-eyebrow">Page information</span><h4 id={`teacher-entry-information-${entry.id}`}>Publisher labels</h4></header>
          <div className="teacher-page-metadata-fields">
            <label><span>Page label</span><input value={entry.pageLabel} maxLength="80" disabled={!writeEnabled} placeholder="e.g. 6-7" onChange={(event) => update("pageLabel", event.target.value)} /></label>
            <label><span>Section title <small>optional</small></span><input value={entry.sectionTitle} maxLength="120" disabled={!writeEnabled} placeholder="e.g. Reading" onChange={(event) => update("sectionTitle", event.target.value)} /></label>
          </div>
        </section>
        <section className="teacher-page-layout-editor" aria-labelledby={`teacher-entry-layout-${entry.id}`}>
          <header><span className="studio-eyebrow">Layout</span><h4 id={`teacher-entry-layout-${entry.id}`}>Page presentation</h4></header>
          <label className="teacher-checkbox teacher-page-double-toggle"><input type="checkbox" checked={doublePage} disabled={!writeEnabled} onChange={(event) => onChange(changeTeacherPageLayout(entry, event.target.checked ? "double-wide" : "single-page"))} /><span><strong>Double page</strong><small>Present this entry as one logical spread</small></span></label>
          {doublePage && <fieldset className="teacher-page-layout-choice"><legend>Source</legend><label><input type="radio" name={`layout-${entry.id}`} checked={entry.layout === "double-wide"} disabled={!writeEnabled} onChange={() => onChange(changeTeacherPageLayout(entry, "double-wide"))} /><span><strong>One spread image</strong><small>A single wide raster</small></span></label><label><input type="radio" name={`layout-${entry.id}`} checked={entry.layout === "double-pair"} disabled={!writeEnabled} onChange={() => onChange(changeTeacherPageLayout(entry, "double-pair"))} /><span><strong>Two page images</strong><small>Independent left and right rasters</small></span></label></fieldset>}
        </section>
        <section className="teacher-page-images-editor" aria-labelledby={`teacher-entry-images-${entry.id}`}>
          <header><span className="studio-eyebrow">Images</span><h4 id={`teacher-entry-images-${entry.id}`}>{entry.layout === "double-pair" ? "Left and right pages" : entry.layout === "double-wide" ? "Spread raster" : "Page raster"}</h4></header>
          <div className={`teacher-page-entry-images ${entry.layout}`}>
            {entry.layout === "double-pair" ? <><PageImageField label="Left page" value={entry.leftImage} {...{ project, urls, writeEnabled, onProjectChange }} onChoose={() => onChooseImage("leftImage")} onAssign={(value) => update("leftImage", value)} /><PageImageField label="Right page" value={entry.rightImage} {...{ project, urls, writeEnabled, onProjectChange }} onChoose={() => onChooseImage("rightImage")} onAssign={(value) => update("rightImage", value)} /></> : <PageImageField label={entry.layout === "double-wide" ? "Spread image" : "Page image"} value={entry.image} {...{ project, urls, writeEnabled, onProjectChange }} onChoose={() => onChooseImage("image")} onAssign={(value) => update("image", value)} />}
          </div>
        </section>
        <details className="teacher-page-entry-advanced"><summary>Advanced</summary><div><span>Internal ID</span><code>{entry.id}</code><button type="button" className="studio-icon-button" aria-label={`Copy internal ID for entry ${index + 1}`} onClick={() => navigator.clipboard?.writeText(entry.id)}><Copy aria-hidden="true" /></button></div></details>
      </div>}
    </article>
  );
}
