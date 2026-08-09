import { Images, Plus, Upload } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { importTeacherProjectAsset } from "../bookBuilderApi.js";
import { createTeacherPageEntry, TEACHER_PAGE_ENTRY_LIMIT } from "./teacherProjectAuthoring.js";
import { naturalCompare } from "./teacherProjectAssetMatcher.js";
import { friendlyTeacherError } from "./TeacherProjectAssetSlot.jsx";
import TeacherProjectPageEntryCard from "./TeacherProjectPageEntryCard.jsx";
import TeacherProjectPageImagePicker from "./TeacherProjectPageImagePicker.jsx";

const pageDescriptor = Object.freeze({ section: "pages", slot: "library", variant: "image", index: null });

export default function TeacherProjectPagesEditor({ project, content, urls, usage, writeEnabled, onContentChange, onProjectChange }) {
  const [unitId, setUnitId] = useState("unit-1");
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [picker, setPicker] = useState({ open: false, entryId: "", field: "" });
  const [importState, setImportState] = useState({ pending: false, current: 0, total: 0, message: "" });
  const pageAssets = useMemo(() => Object.values(project.assets).filter((asset) => asset.relativePath.startsWith("assets/pages/")).sort((left, right) => naturalCompare(left.originalFilename, right.originalFilename)), [project]);
  const unit = content.studentsBook.units.find((candidate) => candidate.id === unitId) || content.studentsBook.units[0];
  const updateEntries = (mutation) => { const next = structuredClone(content); const target = next.studentsBook.units.find((candidate) => candidate.id === unit.id); mutation(target.entries); onContentChange(next); };
  const closePicker = useCallback(() => setPicker({ open: false, entryId: "", field: "" }), []);
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
  const addEntry = () => {
    const entry = createTeacherPageEntry();
    updateEntries((entries) => entries.push(entry));
    setExpandedIds((current) => new Set(current).add(entry.id));
  };
  const assignPickedImage = (assetId) => {
    if (!picker.entryId || !picker.field) return;
    updateEntries((entries) => {
      const entry = entries.find((candidate) => candidate.id === picker.entryId);
      if (entry) entry[picker.field] = assetId;
    });
  };
  const onUnitKeyDown = (event, index) => {
    const nextIndex = event.key === "ArrowRight" ? (index + 1) % content.studentsBook.units.length
      : event.key === "ArrowLeft" ? (index - 1 + content.studentsBook.units.length) % content.studentsBook.units.length
        : event.key === "Home" ? 0 : event.key === "End" ? content.studentsBook.units.length - 1 : null;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextUnit = content.studentsBook.units[nextIndex];
    setUnitId(nextUnit.id);
    event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')[nextIndex]?.focus();
  };
  return (
    <div className="teacher-pages-editor">
      <nav className="teacher-pages-unit-tabs" aria-label="Students Book Units"><div role="tablist" aria-label="Students Book Units">{content.studentsBook.units.map((candidate, index) => <button type="button" role="tab" id={`teacher-unit-tab-${candidate.id}`} aria-controls="teacher-unit-workspace" aria-selected={candidate.id === unit.id} tabIndex={candidate.id === unit.id ? 0 : -1} key={candidate.id} onClick={() => setUnitId(candidate.id)} onKeyDown={(event) => onUnitKeyDown(event, index)}><span>Unit {index + 1}</span><small>{candidate.entries.length ? `${candidate.entries.length} ${candidate.entries.length === 1 ? "entry" : "entries"}` : "Empty"}</small></button>)}</div></nav>
      <section className="teacher-pages-authoring" id="teacher-unit-workspace" role="tabpanel" aria-labelledby={`teacher-unit-tab-${unit.id}`}>
        <header className="teacher-pages-workspace-header"><div><span className="studio-eyebrow">Students Book content</span><h3>Unit {Number(unit.id.slice(5))}</h3><p><strong>{unit.entries.length} Page / Spread {unit.entries.length === 1 ? "entry" : "entries"}</strong> · Previous / Next follows this order.</p></div><div className="teacher-pages-workspace-actions"><button type="button" className="studio-button secondary" onClick={() => setPicker({ open: true, entryId: "", field: "" })}><Images aria-hidden="true" />Page Image Library</button><label className="studio-button secondary"><input className="teacher-visually-hidden-file" type="file" multiple accept="image/png,image/jpeg,image/webp" aria-label="Import page images" disabled={!writeEnabled || importState.pending} onChange={(event) => { const files = [...(event.target.files || [])]; event.target.value = ""; importMany(files); }} /><Upload aria-hidden="true" />{importState.pending ? "Importing…" : "Import Images"}</label><button type="button" className="studio-button primary" disabled={!writeEnabled || unit.entries.length >= TEACHER_PAGE_ENTRY_LIMIT} onClick={addEntry}><Plus aria-hidden="true" />Add Page / Spread</button></div></header>
        {importState.pending && <div className="teacher-page-import-progress" role="status"><span>Importing {importState.current} of {importState.total}…</span><progress value={importState.current} max={importState.total} /></div>}
        {importState.message && <p className="teacher-page-import-message" role="status">{importState.message}</p>}
        <div className="teacher-page-entry-list">{unit.entries.length ? unit.entries.map((entry, index) => <TeacherProjectPageEntryCard key={entry.id} {...{ entry, index, project, urls, writeEnabled, onProjectChange }} count={unit.entries.length} expanded={expandedIds.has(entry.id)} onToggle={() => setExpandedIds((current) => { const next = new Set(current); if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id); return next; })} onChooseImage={(field) => setPicker({ open: true, entryId: entry.id, field })} onChange={(next) => updateEntries((entries) => { entries[index] = next; })} onMove={(direction) => updateEntries((entries) => { const destination = index + direction; if (destination < 0 || destination >= entries.length) return; [entries[index], entries[destination]] = [entries[destination], entries[index]]; })} onDelete={() => { const configured = entry.pageLabel || entry.sectionTitle || (entry.layout === "double-pair" ? entry.leftImage || entry.rightImage : entry.image); if (configured && !window.confirm(`Delete “${entry.sectionTitle || entry.pageLabel || "this entry"}”? Its image assets will remain in the library.`)) return; updateEntries((entries) => entries.splice(index, 1)); setExpandedIds((current) => { const next = new Set(current); next.delete(entry.id); return next; }); }} />) : <div className="teacher-pages-empty"><Images aria-hidden="true" /><h3>Unit {Number(unit.id.slice(5))} has no pages yet</h3><p>Import page rasters, then add ordered logical Page / Spread entries.</p></div>}</div>
      </section>
      <TeacherProjectPageImagePicker open={picker.open} selectionMode={Boolean(picker.entryId)} pageAssets={pageAssets} urls={urls} usage={usage} onSelect={assignPickedImage} onClose={closePicker} />
    </div>
  );
}
