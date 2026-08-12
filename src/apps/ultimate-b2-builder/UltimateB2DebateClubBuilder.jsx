import { FileDown, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { UltimateB2DebateClubActivity } from "../../components/lms/activities/ultimate-b2/UltimateB2DebateClubActivity.jsx";
import { EditableResponseRegionLayer } from "../../components/lms/activities/ultimate-b2/ResponseRegion.jsx";
import { normalizeUltimateB2DebateClubAuthoring, ULTIMATE_B2_DEBATE_CLUB_ID } from "../../data/ultimate-b2/readingExerciseAuthoringSchema.js";
import { projectStudentReadingActivity, projectTeacherReadingSolution } from "../../data/ultimate-b2/readingExerciseProjections.js";
import { UltimateB2ExerciseVisualCapabilitiesEditor } from "./UltimateB2ExerciseVisualCapabilitiesEditor.jsx";

const activityId = ULTIMATE_B2_DEBATE_CLUB_ID;
const endpoint = `/__hhplms/ultimate-b2-reading-exercise-authoring?activityId=${activityId}`;
const publisherImportEndpoint = `/__hhplms/ultimate-b2-debate-club-publisher-import?activityId=${activityId}`;
const instructionOptions = [{ value: "unit1.reading.debate-club.instruction", label: "Debate Club publisher instruction" }];

export function UltimateB2DebateClubBuilder() {
  const [authoring, setAuthoring] = useState(null);
  const [section, setSection] = useState("Publisher Source");
  const [status, setStatus] = useState("Loading...");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [command, setCommand] = useState(null);
  const [editingPartIndex, setEditingPartIndex] = useState(0);
  const [importReport, setImportReport] = useState(null);

  useEffect(() => {
    let active = true;
    fetch(endpoint, { cache: "no-store" }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); return body; })
      .then((body) => { if (active) { setAuthoring(body); setStatus("Saved"); } })
      .catch((requestError) => { if (active) { setStatus("Load failed"); setError(requestError.message); } });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const listener = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [dirty]);
  const change = (updater) => { setAuthoring((current) => { const next = structuredClone(current); updater(next); return next; }); setDirty(true); setStatus("Unsaved changes"); setError(""); };
  const save = async () => {
    setStatus("Saving"); setError("");
    try {
      const normalized = normalizeUltimateB2DebateClubAuthoring(authoring);
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activityId, authoring: normalized }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Debate Club authoring could not be saved.");
      setAuthoring(body); setDirty(false); setStatus("Saved");
    } catch (requestError) { setStatus("Save failed"); setError(requestError.message); }
  };
  const send = (type) => setCommand({ type, token: `${Date.now()}-${Math.random()}` });
  const importPublisherSource = async () => {
    setStatus("Importing publisher source"); setError("");
    try {
      const response = await fetch(publisherImportEndpoint, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Debate Club publisher source could not be imported.");
      setAuthoring(body.authoring); setImportReport(body.report); setEditingPartIndex(0); setCommand(null);
      setDirty(false); setStatus("Publisher source imported and saved"); setSection("Preview");
    } catch (requestError) { setStatus("Import failed"); setError(requestError.message); }
  };
  const editingPart = authoring?.parts[editingPartIndex] || null;
  const editingRegions = useMemo(() => {
    if (!authoring || !editingPart?.responseRegion?.area) return [];
    const area = editingPart.responseRegion.area;
    return [{ id: editingPart.responseRegion.id, label: `Part ${editingPart.number} response region`, left: area.x / authoring.surface.width * 100, top: area.y / authoring.surface.height * 100, width: area.width / authoring.surface.width * 100, height: area.height / authoring.surface.height * 100 }];
  }, [authoring, editingPart]);
  const updateEditingRegions = (regions) => change((next) => {
    const region = regions.find((candidate) => candidate.id === next.parts[editingPartIndex].responseRegion.id);
    const responseRegion = next.parts[editingPartIndex].responseRegion;
    const previousArea = responseRegion.area;
    responseRegion.area = region ? {
      x: Math.round(region.left / 100 * next.surface.width), y: Math.round(region.top / 100 * next.surface.height),
      width: Math.max(1, Math.round(region.width / 100 * next.surface.width)), height: Math.max(1, Math.round(region.height / 100 * next.surface.height)),
    } : null;
    if (responseRegion.area && previousArea) {
      const heightScale = responseRegion.area.height / previousArea.height;
      const widthScale = responseRegion.area.width / previousArea.width;
      responseRegion.presentation.linePositions = responseRegion.presentation.linePositions.map((position) => Math.min(responseRegion.area.height, position * heightScale));
      responseRegion.presentation.lineWidths = responseRegion.presentation.lineWidths.map((width) => Math.min(responseRegion.area.width, width * widthScale));
      responseRegion.presentation.textWidth = Math.min(responseRegion.area.width, responseRegion.presentation.textWidth * widthScale);
      responseRegion.presentation.lineSpacing *= heightScale;
    }
  });

  if (!authoring) return <section className="listening-builder"><p className="page5-builder-loading">{error || status}</p></section>;
  const runtime = projectStudentReadingActivity(authoring);
  const teacherSolution = projectTeacherReadingSolution(authoring);
  return <section className="listening-builder reading-exercise-builder">
    <header className="listening-builder-header"><div><span>Ultimate B2 · Reading authoring</span><h1>Debate Club</h1><code>{activityId}</code></div><div className="builder-save-state" role="status" data-dirty={dirty || undefined}><strong>{status}</strong>{error && <small>{error}</small>}<button type="button" disabled={!dirty || status === "Saving"} onClick={save}><Save size={17} /> Save</button></div></header>
    <nav className="listening-builder-sections" aria-label="Debate Club editor sections">{["Publisher Source", "Response Regions", "Preview"].map((name) => <button type="button" key={name} aria-selected={section === name} onClick={() => setSection(name)}>{name}</button>)}</nav>
    {section === "Publisher Source" && <div className="page5-builder-form"><section className="publisher-source-import">
      <div><strong>Publisher XML baseline</strong><small>Reads only the fixed local <code>tmp/debateclub</code> package. Model responses remain private authoring content projected only to Teacher solutions.</small></div>
      <button type="button" onClick={importPublisherSource} disabled={status === "Importing publisher source"}><FileDown size={17} /> Import Publisher Source</button>
      {importReport && <dl>
        <div><dt>Files found</dt><dd>{importReport.sourceFilesFound.join(", ")}</dd></div>
        <div><dt>Canvas</dt><dd>{importReport.canvas.width} × {importReport.canvas.height}</dd></div>
        <div><dt>Detected</dt><dd>{importReport.partCount} parts · {importReport.imageCount} images · {importReport.promptCount} prompt · {importReport.responseRegionCount} response regions</dd></div>
        <div><dt>Lines / reveal</dt><dd>{importReport.lineCounts.join(" / ")} lines · {importReport.revealStyle.fontFamily} {importReport.revealStyle.fontSize}px · {importReport.revealStyle.color}</dd></div>
        <div><dt>Validation</dt><dd>{importReport.validation}</dd></div>
      </dl>}
    </section></div>}
    {section === "Response Regions" && <div className="open-response-region-workspace debate-response-region-workspace">
      <div className="open-response-region-canvas"><p>Choose a part, then drag its lined Response Region to move it or use the handle to resize it.</p><div className="open-response-region-editor-stage debate-response-region-stage">
        <UltimateB2DebateClubActivity key={`editor-part-${editingPartIndex}`} activity={{ stableNormalizedId: activityId }} runtime={runtime} teacherPresentation teacherSolution={teacherSolution} presentation={{ command: editingPartIndex === 1 ? { type: "next-panel", token: "show-part-2" } : null }} />
        <EditableResponseRegionLayer regions={editingRegions} selectedRegionId={editingPart?.responseRegion.id} onSelectRegion={() => undefined} onChangeRegions={updateEditingRegions} createRegion={(geometry) => ({ id: editingPart.responseRegion.id, label: `Part ${editingPart.number} response region`, ...geometry })} />
      </div></div>
      <aside className="open-response-region-properties"><h2>Response Region properties</h2><label>Part<select value={editingPartIndex} onChange={(event) => setEditingPartIndex(Number(event.target.value))}>{authoring.parts.map((part, index) => <option key={part.id} value={index}>Part {part.number}</option>)}</select></label>
        <UltimateB2ExerciseVisualCapabilitiesEditor visualCapabilities={authoring.visualCapabilities} instructionOptions={instructionOptions} showTextOptions={[]} onChange={(updater) => change((next) => updater(next.visualCapabilities))} />
        {editingPart && <div className="open-response-selected-region"><code>{editingPart.responseRegion.id}</code><label>Prompt<textarea value={editingPart.prompt} onChange={(event) => change((next) => { next.parts[editingPartIndex].prompt = event.target.value; })} /></label><label>Photo alternative text<input value={editingPart.partImageAlt} onChange={(event) => change((next) => { next.parts[editingPartIndex].partImageAlt = event.target.value; })} /></label><label>Accessibility label<input value={editingPart.responseRegion.ariaLabel} onChange={(event) => change((next) => { next.parts[editingPartIndex].responseRegion.ariaLabel = event.target.value; })} /></label><label>Reveal text<textarea className="reading-builder-model-text" value={editingPart.responseRegion.revealText} onChange={(event) => change((next) => { next.parts[editingPartIndex].responseRegion.revealText = event.target.value; })} /></label>
          <div className="response-region-layout-fields">{[["paddingX", "Horizontal padding"], ["paddingY", "Vertical padding"], ["lineSpacing", "Line spacing"], ["fontScale", "Font scale"]].map(([key, label]) => <label key={key}>{label}<input type="number" step={key === "fontScale" ? .05 : 1} value={editingPart.responseRegion.presentation[key]} onChange={(event) => change((next) => { next.parts[editingPartIndex].responseRegion.presentation[key] = Number(event.target.value); })} /></label>)}</div>
          {!editingPart.responseRegion.area && <p className="response-region-warning">Draw a replacement region before saving.</p>}<button className="builder-delete" type="button" onClick={() => updateEditingRegions([])}><Trash2 size={16} /> Delete selected region</button>
        </div>}
      </aside>
    </div>}
    {section === "Preview" && <div className="reading-builder-preview">{importReport && <section className="publisher-source-import is-report-only" aria-label="Debate Club publisher source import report"><dl>
      <div><dt>Files found</dt><dd>{importReport.sourceFilesFound.join(", ")}</dd></div><div><dt>Canvas</dt><dd>{importReport.canvas.width} × {importReport.canvas.height}</dd></div><div><dt>Detected</dt><dd>{importReport.partCount} parts · {importReport.imageCount} images · {importReport.responseRegionCount} response regions</dd></div><div><dt>Validation</dt><dd>{importReport.validation}</dd></div>
    </dl></section>}<div className="reading-builder-preview-controls"><button type="button" onClick={() => send("previous-panel")}>Previous part</button><button type="button" onClick={() => send("next-panel")}>Next part</button></div><div className="reading-builder-preview-stage"><UltimateB2DebateClubActivity activity={{ stableNormalizedId: activityId }} runtime={runtime} teacherPresentation teacherSolution={teacherSolution} presentation={{ command }} /></div></div>}
  </section>;
}
