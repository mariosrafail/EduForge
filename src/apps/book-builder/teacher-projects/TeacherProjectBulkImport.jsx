import { CheckCircle2, FolderOpen, Upload, X, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { importTeacherProjectAsset } from "../bookBuilderApi.js";
import { assignTeacherTarget } from "./teacherProjectAuthoring.js";
import { BULK_IMPORT_FILE_LIMIT, MATCH_CONFIDENCE, matchTeacherProjectAssets } from "./teacherProjectAssetMatcher.js";
import { friendlyTeacherError } from "./TeacherProjectAssetSlot.jsx";

const FILTERS = ["All", "Mapped", "Needs review", "Unmatched", "Missing"];

function compatibleCandidates(candidates, target) {
  if (target.kind === "audio") return candidates.filter((item) => item.kind === "audio");
  if (target.kind === "gaf") return candidates.filter((item) => item.kind === "gaf");
  if (target.kind === "png") return candidates.filter((item) => item.extension === "png");
  return candidates.filter((item) => item.kind === "image");
}

function isRequiredMapping(mapping) {
  return mapping.target.section !== "animation" || mapping.target.variant === "gaf" || mapping.target.index === 0;
}

export default function TeacherProjectBulkImport({ open, project, shell, writeEnabled, onClose, onApplied }) {
  const headingRef = useRef(null);
  const [plan, setPlan] = useState(null);
  const [selection, setSelection] = useState({});
  const [filter, setFilter] = useState("All");
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [importCommonAudio, setImportCommonAudio] = useState(true);
  useEffect(() => {
    if (!open) return undefined;
    headingRef.current?.focus();
    const escape = (event) => { if (event.key === "Escape" && !progress) onClose(); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open, onClose, progress]);
  const scan = (fileList) => {
    setError(""); setResult(null);
    try {
      const next = matchTeacherProjectAssets([...fileList], shell);
      setPlan(next);
      setSelection(Object.fromEntries(next.mappings.map((mapping) => [mapping.target.key, mapping.confidence === MATCH_CONFIDENCE.HIGH ? mapping.candidateId : ""])));
    } catch (reason) { setError(friendlyTeacherError(reason)); }
  };
  const counts = useMemo(() => {
    if (!plan) return null;
    const mapped = plan.mappings.filter((item) => selection[item.target.key]).length;
    const review = plan.mappings.filter((item) => item.confidence === MATCH_CONFIDENCE.AMBIGUOUS && !selection[item.target.key]).length;
    const missing = plan.mappings.filter((item) => isRequiredMapping(item) && !item.existing && !selection[item.target.key]).length;
    return { mapped, review, missing, unmatched: plan.unmatched.length };
  }, [plan, selection]);
  const visibleMappings = useMemo(() => !plan ? [] : plan.mappings.filter((mapping) => {
    if (filter === "Mapped") return Boolean(selection[mapping.target.key]);
    if (filter === "Needs review") return mapping.confidence === MATCH_CONFIDENCE.AMBIGUOUS && !selection[mapping.target.key];
    if (filter === "Missing") return isRequiredMapping(mapping) && !mapping.existing && !selection[mapping.target.key];
    if (filter === "Unmatched") return false;
    return mapping.existing || isRequiredMapping(mapping) || mapping.candidateId || mapping.confidence === MATCH_CONFIDENCE.AMBIGUOUS;
  }), [filter, plan, selection]);
  const apply = async () => {
    const selectedMappings = plan.mappings.filter((mapping) => selection[mapping.target.key]);
    const selectedIds = new Set(selectedMappings.map((mapping) => selection[mapping.target.key]));
    if (importCommonAudio) plan.commonAudio.forEach((candidate) => selectedIds.add(candidate.id));
    const files = [...selectedIds].map((id) => plan.candidates.find((candidate) => candidate.id === id)).filter(Boolean);
    const imported = new Map();
    const failures = [];
    let latestProject = project;
    setProgress({ current: 0, total: files.length }); setResult(null); setError("");
    for (let index = 0; index < files.length; index += 1) {
      const candidate = files[index];
      const firstMapping = selectedMappings.find((mapping) => selection[mapping.target.key] === candidate.id);
      const descriptor = firstMapping?.target.descriptor || { section: "audio", slot: "library", variant: "sound", index: null };
      try {
        const response = await importTeacherProjectAsset(project.projectId, candidate.file, descriptor);
        latestProject = response.project;
        imported.set(candidate.id, response.asset.assetId);
      } catch (reason) { failures.push({ name: candidate.name, message: friendlyTeacherError(reason) }); }
      setProgress({ current: index + 1, total: files.length });
    }
    const nextShell = structuredClone(shell);
    let assignments = 0;
    for (const mapping of selectedMappings) {
      const assetId = imported.get(selection[mapping.target.key]);
      if (assetId) { assignTeacherTarget(nextShell, mapping.target, assetId); assignments += 1; }
    }
    setProgress(null);
    setResult({ imported: imported.size, failed: failures, assignments });
    onApplied({ project: latestProject, shell: nextShell, message: failures.length ? `${imported.size} assets imported; ${failures.length} failed. Shell mappings have unsaved changes.` : `${imported.size} assets imported. Shell mappings have unsaved changes.` });
  };
  if (!open) return null;
  return (
    <div className="teacher-modal-backdrop" role="presentation">
      <section className="teacher-bulk-import" role="dialog" aria-modal="true" aria-labelledby="teacher-import-title">
        <header><div><span className="studio-eyebrow">Suggestion-based workflow</span><h2 id="teacher-import-title" tabIndex="-1" ref={headingRef}>Import assets</h2><p>Files are scanned locally first. Nothing is uploaded until you choose Apply.</p></div><button type="button" className="studio-icon-button" aria-label="Close Import Assets" disabled={Boolean(progress)} onClick={onClose}><X aria-hidden="true" /></button></header>
        {!plan && <div className="teacher-import-pickers"><label className="teacher-import-picker"><FolderOpen aria-hidden="true" /><strong>Select folder</strong><span>Use a prepared shell asset folder</span><input type="file" multiple webkitdirectory="" directory="" disabled={!writeEnabled} onChange={(event) => scan(event.target.files)} /></label><label className="teacher-import-picker"><Upload aria-hidden="true" /><strong>Select multiple files</strong><span>Up to {BULK_IMPORT_FILE_LIMIT} explicit files</span><input type="file" multiple disabled={!writeEnabled} onChange={(event) => scan(event.target.files)} /></label></div>}
        {error && <p className="studio-validation-errors" role="alert">{error}</p>}
        {plan && <>
          <div className="teacher-import-summary" aria-label="Import scan summary"><span><strong>{plan.candidates.length}</strong> selected</span><span><strong>{counts.mapped}</strong> mapped</span><span><strong>{counts.review}</strong> need review</span><span><strong>{counts.unmatched}</strong> unmatched</span><span><strong>{counts.missing}</strong> required slots missing</span></div>
          <div className="teacher-import-filters" role="group" aria-label="Mapping filters">{FILTERS.map((item) => <button type="button" key={item} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>)}</div>
          <div className="teacher-import-review" tabIndex="0">
            {filter !== "Unmatched" && visibleMappings.map((mapping) => <label className={`teacher-import-mapping ${mapping.confidence.toLowerCase()}`} key={mapping.target.key}><span><strong>{mapping.target.label}</strong><small>{mapping.reason}</small></span><select aria-label={`Candidate for ${mapping.target.label}`} value={selection[mapping.target.key] || ""} disabled={mapping.existing || Boolean(progress)} onChange={(event) => setSelection((current) => ({ ...current, [mapping.target.key]: event.target.value }))}><option value="">{mapping.existing ? "Already assigned" : "No mapping"}</option>{compatibleCandidates(plan.candidates, mapping.target).map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.relativePath}</option>)}</select><b>{mapping.existing ? "SAVED" : selection[mapping.target.key] ? "MAPPED" : mapping.confidence}</b></label>)}
            {filter === "Unmatched" && <ul className="teacher-unmatched-assets">{plan.unmatched.map((candidate) => <li key={candidate.id}>{candidate.kind === "unsupported" ? <XCircle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}<span><strong>{candidate.relativePath}</strong><small>{candidate.kind === "unsupported" ? "Unsupported candidate; it will not be uploaded" : candidate.kind === "audio" ? "Reusable audio candidate" : "No deterministic slot match"}</small></span></li>)}</ul>}
          </div>
          {plan.commonAudio.length > 0 && <label className="teacher-import-common-audio"><input type="checkbox" checked={importCommonAudio} onChange={(event) => setImportCommonAudio(event.target.checked)} />Import {plan.commonAudio.length} reusable button/click sound{plan.commonAudio.length === 1 ? "" : "s"} into the Audio Library</label>}
          {progress && <div className="teacher-import-progress" role="status"><span>Importing {progress.current} of {progress.total} assets…</span><progress value={progress.current} max={Math.max(1, progress.total)} /></div>}
          {result && <div className={result.failed.length ? "teacher-import-result partial" : "teacher-import-result"} role="status"><strong>{result.imported} unique assets imported · {result.assignments} draft mappings applied</strong>{result.failed.map((failure) => <span key={failure.name}>{failure.name}: {failure.message}</span>)}</div>}
          <footer><button type="button" className="studio-button secondary" disabled={Boolean(progress)} onClick={() => { setPlan(null); setSelection({}); setResult(null); }}>Choose different files</button><button type="button" className="studio-button secondary" disabled={Boolean(progress)} onClick={onClose}>Cancel</button><button type="button" className="studio-button primary" disabled={Boolean(progress) || (!counts.mapped && !(importCommonAudio && plan.commonAudio.length))} onClick={apply}>{progress ? "Applying…" : "Apply mappings"}</button></footer>
        </>}
      </section>
    </div>
  );
}
