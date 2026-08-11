import { FileDown, Save, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { UltimateB2LegacyUnitOpenerActivity } from "../../components/lms/activities/ultimate-b2/UltimateB2LegacyUnitOpenerActivity.jsx";
import { EditableResponseRegionLayer } from "../../components/lms/activities/ultimate-b2/ResponseRegion.jsx";
import {
  normalizeUltimateB2OpenResponseAuthoring,
  normalizeUltimateB2OpenResponseTeacherAnswers,
} from "../../data/ultimate-b2/openResponseAuthoringSchema.js";
import { ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID } from "../../data/ultimate-b2/page5AuthoringSchema.js";
import { UltimateB2ExerciseVisualCapabilitiesEditor } from "./UltimateB2ExerciseVisualCapabilitiesEditor.jsx";

const defaultActivityId = ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID;
const sections = ["Content", "Response Regions", "Preview"];
const acceptedSourceFiles = ".xml,.iwb,.png,.jpg,.jpeg,.webp";
const instructionOptions = [{ value: "unit1.page5.exercise1.instruction", label: "Page 5 Exercise 1 publisher instruction" }];

function endpoint(pathname, activityId) {
  return `${pathname}?activityId=${encodeURIComponent(activityId)}`;
}

function fileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`${file.name} could not be read.`));
    reader.onload = () => resolve(String(reader.result || "").split(",", 2)[1] || "");
    reader.readAsDataURL(file);
  });
}

function ImportReport({ report }) {
  if (!report) return null;
  return <dl>
    <div><dt>Files found</dt><dd>{[...report.parameterFiles, ...report.imagesImported].join(", ")}</dd></div>
    <div><dt>Parameter files</dt><dd>{report.parameterFiles.join(", ")}</dd></div>
    <div><dt>Canvas</dt><dd>{report.canvas.width} × {report.canvas.height}</dd></div>
    <div><dt>Images</dt><dd>{report.imagesImported.length} imported / {report.imagesSupplied.length} supplied</dd></div>
    <div><dt>Detected</dt><dd>{report.questionCount} questions · {report.responseRegionCount} response regions · {report.imageCount} images</dd></div>
    {report.unreferencedImages.length > 0 && <div><dt>Not rendered</dt><dd>{report.unreferencedImages.join(", ")}</dd></div>}
    {report.warnings.length > 0 && <div><dt>Warnings</dt><dd>{report.warnings.join(" ")}</dd></div>}
    <div><dt>Validation</dt><dd>{report.validation}</dd></div>
  </dl>;
}

export function UltimateB2OpenResponseBuilder({ activityId = defaultActivityId, activity = null, onPublisherActivityCreated = () => undefined }) {
  const authoringEndpoint = endpoint("/__hhplms/ultimate-b2-open-response-authoring", activityId);
  const publisherImportEndpoint = endpoint("/__hhplms/ultimate-b2-open-response-publisher-import", activityId);
  const [payload, setPayload] = useState(null);
  const [section, setSection] = useState("Content");
  const [status, setStatus] = useState("Loading…");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [revealedQuestionIds, setRevealedQuestionIds] = useState([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState(null);
  const [importReport, setImportReport] = useState(null);
  const [sourceFiles, setSourceFiles] = useState([]);
  const [title, setTitle] = useState(activity?.title || "Open Response");

  useEffect(() => {
    setTitle(activity?.title || "Open Response");
    if (activity?.publisherDraft) {
      setPayload({ activityId, configured: false, publicAuthoring: null, teacherAuthoring: null, runtimeFallback: { title: activity.title, questions: [] } });
      setSelectedQuestionId(null);
      setStatus("Source bundle required");
      setError("");
      return undefined;
    }
    let active = true;
    fetch(authoringEndpoint, { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Open Response authoring could not be loaded.");
      return body;
    }).then((body) => {
      if (!active) return;
      setPayload(body);
      setSelectedQuestionId(body.publicAuthoring?.questions?.[0]?.id || null);
      setStatus(body.configured ? "Saved" : "Source bundle required");
    }).catch((requestError) => {
      if (active) { setStatus("Load failed"); setError(requestError.message); }
    });
    return () => { active = false; };
  }, [activity?.publisherDraft, activity?.title, activityId, authoringEndpoint]);

  useEffect(() => {
    const beforeUnload = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  const change = (updater) => {
    setPayload((current) => { const next = structuredClone(current); updater(next); return next; });
    setDirty(true);
    setStatus("Unsaved changes");
    setError("");
  };

  const save = async () => {
    setStatus("Saving");
    setError("");
    try {
      const publicAuthoring = normalizeUltimateB2OpenResponseAuthoring(payload.publicAuthoring, activityId);
      const teacherAuthoring = normalizeUltimateB2OpenResponseTeacherAnswers(payload.teacherAuthoring, activityId, publicAuthoring.questions.map((question) => question.id));
      const requestBody = { activityId, publicAuthoring, teacherAuthoring };
      if (activity?.publisherCreated) requestBody.title = title;
      const response = await fetch(authoringEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Open Response authoring could not be saved.");
      setPayload(body);
      setDirty(false);
      setStatus(body.warning ? "Saved with database synchronization pending" : "Saved");
      setError(body.warning || "");
      if (body.record) onPublisherActivityCreated(body.record);
    } catch (requestError) {
      setStatus("Save failed");
      setError(requestError.message);
    }
  };

  const selectSourceFiles = (files) => {
    const next = [...files];
    setSourceFiles(next);
    setImportReport(null);
    setError("");
  };

  const importPublisherSource = async () => {
    if (!sourceFiles.length) { setError("Choose the two parameter documents and all referenced raster images first."); return; }
    setStatus("Validating publisher source");
    setError("");
    try {
      const files = await Promise.all(sourceFiles.map(async (file) => ({ name: file.name, type: file.type || "", base64: await fileAsBase64(file) })));
      const draftCreation = Boolean(activity?.publisherDraft);
      const requestUrl = draftCreation ? "/__hhplms/ultimate-b2-publisher-activities/create" : publisherImportEndpoint;
      const requestPayload = draftCreation
        ? { draft: { pageId: activity.pageId, authoringKind: "open-response", title, clientMutationId: activity.clientMutationId, predictedActivityId: activityId }, source: { files } }
        : { activityId, files, ...(activity?.publisherCreated ? { title } : {}) };
      const response = await fetch(requestUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestPayload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Publisher source could not be imported.");
      const nextPayload = draftCreation ? { activityId: body.record.activityId, configured: true, publicAuthoring: body.publicAuthoring, teacherAuthoring: body.teacherAuthoring, runtimeFallback: { title: body.record.title, questions: [] }, report: body.report } : body;
      setPayload(nextPayload);
      setSelectedQuestionId(body.publicAuthoring.questions[0].id);
      setImportReport(body.report);
      setDirty(false);
      if (body.record) onPublisherActivityCreated(body.record);
      setStatus(body.warning ? "Imported with database synchronization pending" : "Publisher source imported and saved");
      setError(body.warning || "");
      setSection("Preview");
    } catch (requestError) {
      setStatus("Import failed");
      setError(requestError.message);
    }
  };

  const previewActivity = useMemo(() => payload?.publicAuthoring ? ({
    stableNormalizedId: activityId,
    title: activity?.title || payload.runtimeFallback?.title || "Open Response",
    visibleInstructionText: activity?.visibleInstructionText || "",
    runtime: { questions: payload.publicAuthoring.questions },
  }) : null, [activity?.title, activity?.visibleInstructionText, activityId, payload]);
  const previewSolutions = useMemo(() => payload?.teacherAuthoring ? ({
    solutionAvailability: "model-response",
    questions: Object.fromEntries(payload.teacherAuthoring.modelAnswers.map((answer) => [answer.questionId, { acceptedAnswers: [answer.text] }])),
  }) : null, [payload]);
  const responseRegions = useMemo(() => payload?.publicAuthoring ? payload.publicAuthoring.questions.flatMap((question, index) => {
    const regionArea = question.responseRegion?.area;
    const surface = payload.publicAuthoring.surface;
    return regionArea ? [{ id: question.id, label: `Question ${index + 1} response region`, left: regionArea.x / surface.width * 100, top: regionArea.y / surface.height * 100, width: regionArea.width / surface.width * 100, height: regionArea.height / surface.height * 100 }] : [];
  }) : [], [payload]);

  const updateResponseRegions = (areas) => change((next) => {
    next.publicAuthoring.questions.forEach((question) => {
      const latest = [...areas].reverse().find((region) => region.id === question.id);
      if (latest) {
        const surface = next.publicAuthoring.surface;
        const previousHeight = question.responseRegion.area?.height || 1;
        const updatedArea = { x: latest.left / 100 * surface.width, y: latest.top / 100 * surface.height, width: latest.width / 100 * surface.width, height: latest.height / 100 * surface.height };
        const heightScale = updatedArea.height / previousHeight;
        question.responseRegion.area = updatedArea;
        question.responseRegion.presentation.linePositions = question.responseRegion.presentation.linePositions.map((position) => Math.min(updatedArea.height, position * heightScale));
        question.responseRegion.presentation.lineSpacing *= heightScale;
        question.responseRegion.presentation.lineWidth = updatedArea.width;
      } else if (question.id === selectedQuestionId) question.responseRegion.area = null;
    });
  });

  if (!payload) return <section className="listening-builder"><p className="page5-builder-loading">{error || status}</p></section>;
  const configured = Boolean(payload.configured && payload.publicAuthoring && payload.teacherAuthoring);
  const legacyPage5 = payload.publicAuthoring?.schemaVersion === 2;
  return (
    <section className="listening-builder page5-activity-builder" data-open-response-activity={activityId}>
      <header className="listening-builder-header">
        <div><span>Ultimate B2 · {activity?.pageLabel || "Open Response authoring"}</span><h1>Open Response</h1><code>{activityId}</code></div>
        <div className="builder-save-state" role="status" data-dirty={dirty || undefined}><strong>{status}</strong>{error && <small>{error}</small>}<button type="button" disabled={!configured || !dirty || status === "Saving"} onClick={save}><Save size={17} /> Save</button></div>
      </header>
      <nav className="listening-builder-sections" aria-label="Open Response editor sections">{sections.map((name) => <button type="button" key={name} aria-selected={section === name} disabled={!configured && name !== "Content"} onClick={() => setSection(name)}>{name}</button>)}</nav>
      {section === "Content" && <div className="page5-builder-form">
        {activity?.publisherCreated && <label>Activity title<input value={title} maxLength={300} onChange={(event) => { setTitle(event.target.value); if (!activity.publisherDraft) { setDirty(true); setStatus("Unsaved changes"); } }} /></label>}
        <section className="publisher-source-import">
          <div><strong>Publisher source bundle</strong><small>Select or drop `obj_params.xml`, `ebook_obj_params.xml`, and every raster referenced by the XML. Import is deterministic, local-only, and contains no AI/OCR.</small></div>
          <label className="open-response-source-drop" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); selectSourceFiles(event.dataTransfer.files); }}>
            <Upload size={20} />
            <span>{sourceFiles.length ? `${sourceFiles.length} source files selected` : "Choose or drop parameter XML and raster files"}</span>
            <input aria-label="Open Response publisher source files" type="file" multiple accept={acceptedSourceFiles} onChange={(event) => selectSourceFiles(event.target.files)} />
          </label>
          {sourceFiles.length > 0 && <small>{sourceFiles.map((file) => file.name).join(", ")}</small>}
          <button type="button" onClick={importPublisherSource} disabled={!sourceFiles.length || status === "Validating publisher source"}><FileDown size={17} /> Validate and Import Publisher Source</button>
          <ImportReport report={importReport} />
        </section>
        {!configured && <div className="inline-status warning">This activity is registered and configurable, but it has no persisted visual authoring yet. Import a valid source bundle to create it atomically; the LMS continues to use its normalized fallback until then.</div>}
        {configured && legacyPage5 && <>
          <UltimateB2ExerciseVisualCapabilitiesEditor visualCapabilities={payload.publicAuthoring.visualCapabilities} instructionOptions={instructionOptions} showTextOptions={[]} onChange={(updater) => change((next) => updater(next.publicAuthoring.visualCapabilities))} />
          <label>Instruction image alternative text<textarea value={payload.publicAuthoring.instructionImageAlt} onChange={(event) => change((next) => { next.publicAuthoring.instructionImageAlt = event.target.value; })} /></label>
        </>}
        {configured && !legacyPage5 && <section className="open-response-artwork-list"><h2>Publisher artwork layers</h2>{payload.publicAuthoring.artworkLayers.map((layer, index) => <label key={layer.id}>Layer {index + 1} · {layer.sourceFile}<textarea aria-label={`Artwork layer ${index + 1} alternative text`} placeholder="Accessibility review required; leave empty only for decorative artwork." value={layer.altText} onChange={(event) => change((next) => { next.publicAuthoring.artworkLayers[index].altText = event.target.value; next.publicAuthoring.artworkLayers[index].accessibilityStatus = event.target.value.trim() ? "reviewed" : "review-required"; })} /><code>{layer.binding}</code></label>)}</section>}
        {configured && payload.publicAuthoring.questions.map((question, index) => <label key={question.id}>Question {index + 1}<textarea aria-label={`Question ${index + 1} text`} value={question.prompt} onChange={(event) => change((next) => { next.publicAuthoring.questions[index].prompt = event.target.value; })} /><code>{question.id}</code></label>)}
      </div>}
      {configured && section === "Response Regions" && <div className="open-response-region-workspace">
        <div className="open-response-region-canvas">
          <p>Select a question, then drag to create its lined Response Region. Drag an existing region to move it or use its handle to resize it.</p>
          <div className="open-response-region-editor-stage">
            <UltimateB2LegacyUnitOpenerActivity activity={previewActivity} authoring={payload.publicAuthoring} capabilities={{ canEditAnswers: false, isPresentation: false, canRevealSolutions: false }} answers={{}} frozen updateAnswer={() => undefined} revealedQuestionIds={[]} solutions={null} solutionsLoading={false} revealQuestion={() => undefined} actions={null} />
            <EditableResponseRegionLayer regions={responseRegions} selectedRegionId={selectedQuestionId} onSelectRegion={(id) => { if (id) setSelectedQuestionId(id); }} onChangeRegions={updateResponseRegions} createRegion={(geometry) => ({ id: selectedQuestionId || payload.publicAuthoring.questions[0].id, label: "Response region", ...geometry })} />
          </div>
        </div>
        <aside className="open-response-region-properties">
          <h2>Response Region properties</h2>
          <label>Question<select value={selectedQuestionId || ""} onChange={(event) => setSelectedQuestionId(event.target.value)}>{payload.publicAuthoring.questions.map((question, index) => <option value={question.id} key={question.id}>Question {index + 1}</option>)}</select></label>
          {payload.publicAuthoring.questions.map((question, index) => question.id === selectedQuestionId && <div className="open-response-selected-region" key={question.id}>
            <code>{question.responseRegion.id}</code>
            <label>Accessibility label<input value={question.responseRegion.ariaLabel} onChange={(event) => change((next) => { next.publicAuthoring.questions[index].responseRegion.ariaLabel = event.target.value; })} /></label>
            <label>Text shown after click<textarea aria-label={`Question ${index + 1} reveal text`} value={payload.teacherAuthoring.modelAnswers[index].text} onChange={(event) => change((next) => { next.teacherAuthoring.modelAnswers[index].text = event.target.value; })} /></label>
            {question.responseRegion.area ? <dl><div><dt>X</dt><dd>{question.responseRegion.area.x.toFixed(1)} px</dd></div><div><dt>Y</dt><dd>{question.responseRegion.area.y.toFixed(1)} px</dd></div><div><dt>Width</dt><dd>{question.responseRegion.area.width.toFixed(1)} px</dd></div><div><dt>Height</dt><dd>{question.responseRegion.area.height.toFixed(1)} px</dd></div></dl> : <p className="response-region-warning">Draw a replacement region before saving.</p>}
            <div className="response-region-layout-fields">{[["paddingX", "Horizontal padding"], ["paddingY", "Vertical padding"], ["lineSpacing", "Line spacing"], ["fontScale", "Font scale"]].map(([key, label]) => <label key={key}>{label}<input type="number" step={key === "fontScale" ? .05 : 1} value={question.responseRegion.presentation[key]} onChange={(event) => change((next) => { next.publicAuthoring.questions[index].responseRegion.presentation[key] = Number(event.target.value); })} /></label>)}</div>
            <button className="builder-delete" type="button" onClick={() => updateResponseRegions(responseRegions.filter((region) => region.id !== question.id))}><Trash2 size={16} /> Delete selected region</button>
            <small>The reveal text remains Teacher-private and is never written into learner authoring or the import report.</small>
          </div>)}
        </aside>
      </div>}
      {configured && section === "Preview" && <div className="page5-builder-preview">
        {importReport && <section className="publisher-source-import is-report-only" aria-label="Publisher source import report"><ImportReport report={importReport} /></section>}
        <p>Click a lined Response Region to reveal only that question’s current Teacher model answer inside the same region.</p>
        <UltimateB2LegacyUnitOpenerActivity activity={previewActivity} authoring={payload.publicAuthoring} capabilities={{ canEditAnswers: false, isPresentation: true, canRevealSolutions: true }} answers={{}} frozen updateAnswer={() => undefined} revealedQuestionIds={revealedQuestionIds} solutions={previewSolutions} solutionsLoading={false} revealQuestion={(questionId) => setRevealedQuestionIds((current) => current.includes(questionId) ? current : [...current, questionId])} actions={null} />
      </div>}
    </section>
  );
}
