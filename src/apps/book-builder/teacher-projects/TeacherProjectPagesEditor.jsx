import { ArrowDown, ArrowUp, GripVertical, Images, Plus, Trash2, Upload } from "lucide-react";
import { useMemo, useState } from "react";

import { importTeacherProjectAsset } from "../bookBuilderApi.js";
import { changeTeacherPageLayout, createTeacherPageEntry, TEACHER_PAGE_ENTRY_LIMIT } from "./teacherProjectAuthoring.js";
import { naturalCompare } from "./teacherProjectAssetMatcher.js";
import { friendlyTeacherError } from "./TeacherProjectAssetSlot.jsx";

const pageDescriptor = Object.freeze({ section: "pages", slot: "library", variant: "image", index: null });

function PageImageField({ label, value, project, pageAssets, urls, writeEnabled, onAssign, onProjectChange }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const upload = async (file) => {
    if (!file) return;
    setPending(true); setError("");
    try {
      const result = await importTeacherProjectAsset(project.projectId, file, pageDescriptor);
      onProjectChange(result.project); onAssign(result.asset.assetId);
    } catch (reason) { setError(friendlyTeacherError(reason)); }
    finally { setPending(false); }
  };
  const asset = value ? project.assets[value] : null;
  return (
    <div className={`teacher-page-image-field ${asset ? "has-asset" : "is-missing"}`}>
      <div className="teacher-page-image-field-preview">{asset && urls[value] ? <img src={urls[value]} alt="" /> : <Images aria-hidden="true" />}</div>
      <label><span>{label}</span><select value={value || ""} disabled={!writeEnabled || pending} onChange={(event) => onAssign(event.target.value || null)}><option value="">No image assigned</option>{pageAssets.map((candidate) => <option key={candidate.assetId} value={candidate.assetId}>{candidate.originalFilename} · {candidate.width}×{candidate.height}</option>)}</select></label>
      <label className="studio-button secondary"><input type="file" accept="image/png,image/jpeg,image/webp" disabled={!writeEnabled || pending} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; upload(file); }} /><Upload aria-hidden="true" />{pending ? "Uploading…" : asset ? "Replace" : "Upload new"}</label>
      {error && <small className="studio-validation-errors" role="alert">{error}</small>}
    </div>
  );
}

function PageEntry({ entry, index, count, project, pageAssets, urls, writeEnabled, onChange, onMove, onDelete, onProjectChange }) {
  const complete = Boolean(entry.pageLabel && (entry.layout === "double-pair" ? entry.leftImage && entry.rightImage : entry.image));
  const update = (key, value) => onChange({ ...entry, [key]: value });
  const doublePage = entry.layout !== "single-page";
  return (
    <article className={`teacher-page-entry ${complete ? "is-complete" : "is-incomplete"}`} data-entry-id={entry.id}>
      <header><GripVertical aria-hidden="true" /><div><strong>{entry.sectionTitle || entry.pageLabel || `Page / Spread ${index + 1}`}</strong><small>{entry.id}</small></div><span>{complete ? "Complete" : "Incomplete"}</span><div className="teacher-page-entry-order"><button type="button" className="studio-icon-button" disabled={!writeEnabled || index === 0} aria-label={`Move entry ${index + 1} up`} onClick={() => onMove(-1)}><ArrowUp /></button><button type="button" className="studio-icon-button" disabled={!writeEnabled || index === count - 1} aria-label={`Move entry ${index + 1} down`} onClick={() => onMove(1)}><ArrowDown /></button><button type="button" className="studio-icon-button danger" disabled={!writeEnabled} aria-label={`Delete entry ${index + 1}`} onClick={onDelete}><Trash2 /></button></div></header>
      <div className="teacher-page-entry-fields"><label><span>Page label</span><input value={entry.pageLabel} maxLength="80" disabled={!writeEnabled} placeholder="e.g. 6-7" onChange={(event) => update("pageLabel", event.target.value)} /></label><label><span>Section title <small>optional</small></span><input value={entry.sectionTitle} maxLength="120" disabled={!writeEnabled} placeholder="e.g. Reading" onChange={(event) => update("sectionTitle", event.target.value)} /></label><label className="teacher-checkbox"><input type="checkbox" checked={doublePage} disabled={!writeEnabled} onChange={(event) => onChange(changeTeacherPageLayout(entry, event.target.checked ? "double-wide" : "single-page"))} />Double page</label></div>
      {doublePage && <fieldset className="teacher-page-layout-choice"><legend>Double-page source</legend><label><input type="radio" name={`layout-${entry.id}`} checked={entry.layout === "double-wide"} disabled={!writeEnabled} onChange={() => onChange(changeTeacherPageLayout(entry, "double-wide"))} />One spread image</label><label><input type="radio" name={`layout-${entry.id}`} checked={entry.layout === "double-pair"} disabled={!writeEnabled} onChange={() => onChange(changeTeacherPageLayout(entry, "double-pair"))} />Two page images</label></fieldset>}
      <div className={`teacher-page-entry-images ${entry.layout}`}>
        {entry.layout === "double-pair" ? <><PageImageField label="Left page" value={entry.leftImage} {...{ project, pageAssets, urls, writeEnabled, onProjectChange }} onAssign={(value) => update("leftImage", value)} /><PageImageField label="Right page" value={entry.rightImage} {...{ project, pageAssets, urls, writeEnabled, onProjectChange }} onAssign={(value) => update("rightImage", value)} /></> : <PageImageField label={entry.layout === "double-wide" ? "Spread image" : "Page image"} value={entry.image} {...{ project, pageAssets, urls, writeEnabled, onProjectChange }} onAssign={(value) => update("image", value)} />}
      </div>
    </article>
  );
}

export default function TeacherProjectPagesEditor({ project, content, urls, usage, writeEnabled, onContentChange, onProjectChange }) {
  const [unitId, setUnitId] = useState("unit-1");
  const [importState, setImportState] = useState({ pending: false, current: 0, total: 0, message: "" });
  const pageAssets = useMemo(() => Object.values(project.assets).filter((asset) => asset.relativePath.startsWith("assets/pages/")).sort((left, right) => naturalCompare(left.originalFilename, right.originalFilename)), [project]);
  const unit = content.studentsBook.units.find((candidate) => candidate.id === unitId) || content.studentsBook.units[0];
  const updateEntries = (mutation) => { const next = structuredClone(content); const target = next.studentsBook.units.find((candidate) => candidate.id === unit.id); mutation(target.entries); onContentChange(next); };
  const importMany = async (fileList) => {
    const files = [...fileList].filter((file) => /\.(?:png|jpe?g|webp)$/i.test(file.name)).sort((left, right) => naturalCompare(left.name, right.name));
    if (!files.length) { setImportState({ pending: false, current: 0, total: 0, message: "Select PNG, JPEG, or WebP page images." }); return; }
    let latest = project; const failures = [];
    setImportState({ pending: true, current: 0, total: files.length, message: "" });
    for (let index = 0; index < files.length; index += 1) {
      try { const result = await importTeacherProjectAsset(project.projectId, files[index], pageDescriptor); latest = result.project; }
      catch (reason) { failures.push(`${files[index].name}: ${friendlyTeacherError(reason)}`); }
      setImportState({ pending: true, current: index + 1, total: files.length, message: "" });
    }
    onProjectChange(latest);
    setImportState({ pending: false, current: files.length, total: files.length, message: failures.length ? `${files.length - failures.length} imported; ${failures.length} failed. ${failures.join(" ")}` : `${files.length} page images imported in natural filename order.` });
  };
  return (
    <div className="teacher-pages-editor">
      <aside className="teacher-pages-units" aria-label="Students Book Units">{content.studentsBook.units.map((candidate, index) => <button type="button" key={candidate.id} aria-current={candidate.id === unit.id ? "page" : undefined} onClick={() => setUnitId(candidate.id)}><span>Unit {index + 1}</span><small>{candidate.entries.length ? `${candidate.entries.length} ${candidate.entries.length === 1 ? "entry" : "entries"}` : "Empty"}</small></button>)}</aside>
      <div className="teacher-pages-authoring">
        <header><div><span className="studio-eyebrow">Students Book content</span><h3>Unit {Number(unit.id.slice(5))}</h3><p>Array order is the authoritative Previous/Next order.</p></div><div><label className="studio-button secondary"><input type="file" multiple accept="image/png,image/jpeg,image/webp" disabled={!writeEnabled || importState.pending} onChange={(event) => { const files = [...(event.target.files || [])]; event.target.value = ""; importMany(files); }} /><Images aria-hidden="true" />Import Page Images</label><button type="button" className="studio-button primary" disabled={!writeEnabled || unit.entries.length >= TEACHER_PAGE_ENTRY_LIMIT} onClick={() => updateEntries((entries) => entries.push(createTeacherPageEntry()))}><Plus aria-hidden="true" />Add Page / Spread</button></div></header>
        {importState.pending && <div className="teacher-page-import-progress" role="status"><span>Importing {importState.current} of {importState.total}…</span><progress value={importState.current} max={importState.total} /></div>}
        {importState.message && <p className="teacher-page-import-message" role="status">{importState.message}</p>}
        <div className="teacher-page-entry-list">{unit.entries.length ? unit.entries.map((entry, index) => <PageEntry key={entry.id} {...{ entry, index, project, pageAssets, urls, writeEnabled, onProjectChange }} count={unit.entries.length} onChange={(next) => updateEntries((entries) => { entries[index] = next; })} onMove={(direction) => updateEntries((entries) => { const destination = index + direction; if (destination < 0 || destination >= entries.length) return; [entries[index], entries[destination]] = [entries[destination], entries[index]]; })} onDelete={() => { const configured = entry.pageLabel || entry.sectionTitle || (entry.layout === "double-pair" ? entry.leftImage || entry.rightImage : entry.image); if (configured && !window.confirm(`Delete “${entry.sectionTitle || entry.pageLabel || "this entry"}”? Its image assets will remain in the library.`)) return; updateEntries((entries) => entries.splice(index, 1)); }} />) : <div className="teacher-pages-empty"><Images aria-hidden="true" /><h3>Unit {Number(unit.id.slice(5))} has no pages yet</h3><p>Import page rasters, then add ordered logical Page / Spread entries.</p></div>}</div>
        <section className="teacher-page-library"><header><h3>Page Image Library · {pageAssets.length}</h3><small>Natural filename order; library order never controls navigation.</small></header><div>{pageAssets.map((asset) => <article key={asset.assetId}><span className="teacher-page-library-thumb">{urls[asset.assetId] && <img src={urls[asset.assetId]} alt="" loading="lazy" />}</span><span><strong>{asset.originalFilename}</strong><small>{asset.width} × {asset.height} · {Math.ceil(asset.sizeBytes / 1024)} KB · {usage.get(asset.assetId)?.length || 0} uses</small></span></article>)}</div></section>
      </div>
    </div>
  );
}
