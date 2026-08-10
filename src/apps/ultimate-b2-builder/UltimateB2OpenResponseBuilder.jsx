import { FileDown, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { UltimateB2LegacyUnitOpenerActivity } from "../../components/lms/activities/ultimate-b2/UltimateB2LegacyUnitOpenerActivity.jsx";
import { EditableResponseRegionLayer } from "../../components/lms/activities/ultimate-b2/ResponseRegion.jsx";
import { normalizeUltimateB2Page5OpenResponseAuthoring, normalizeUltimateB2Page5TeacherAnswers } from "../../data/ultimate-b2/page5AuthoringSchema.js";
import { UltimateB2ExerciseVisualCapabilitiesEditor } from "./UltimateB2ExerciseVisualCapabilitiesEditor.jsx";

const activityId = "ultimate-b2-sb-u1-p1-o1";
const endpoint = `/__hhplms/ultimate-b2-page-5-authoring?activityId=${activityId}`;
const publisherImportEndpoint = `/__hhplms/ultimate-b2-page-5-publisher-import?activityId=${activityId}`;
const sections = ["Content", "Response Regions", "Preview"];
const instructionOptions = [{ value: "unit1.page5.exercise1.instruction", label: "Page 5 Exercise 1 publisher instruction" }];

export function UltimateB2OpenResponseBuilder() {
  const [payload, setPayload] = useState(null);
  const [section, setSection] = useState("Content");
  const [status, setStatus] = useState("Loading…");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [revealedQuestionIds, setRevealedQuestionIds] = useState([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState(null);
  const [importReport, setImportReport] = useState(null);

  useEffect(() => {
    let active = true;
    fetch(endpoint, { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Open-response authoring could not be loaded.");
      return body;
    }).then((body) => {
      if (!active) return;
      setPayload(body);
      setSelectedQuestionId(body.publicAuthoring.questions[0].id);
      setStatus("Saved");
    }).catch((requestError) => {
      if (active) { setStatus("Load failed"); setError(requestError.message); }
    });
    return () => { active = false; };
  }, []);

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
      const normalized = {
        activityId,
        publicAuthoring: normalizeUltimateB2Page5OpenResponseAuthoring(payload.publicAuthoring),
        teacherAuthoring: normalizeUltimateB2Page5TeacherAnswers(payload.teacherAuthoring),
      };
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(normalized) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Open-response authoring could not be saved.");
      setPayload(body);
      setDirty(false);
      setStatus("Saved");
    } catch (requestError) {
      setStatus("Save failed");
      setError(requestError.message);
    }
  };

  const importPublisherSource = async () => {
    setStatus("Importing publisher source");
    setError("");
    try {
      const response = await fetch(publisherImportEndpoint, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Publisher source could not be imported.");
      setPayload({ activityId: body.activityId, publicAuthoring: body.publicAuthoring, teacherAuthoring: body.teacherAuthoring });
      setSelectedQuestionId(body.publicAuthoring.questions[0].id);
      setImportReport(body.report);
      setDirty(false);
      setStatus("Publisher source imported and saved");
      setSection("Preview");
    } catch (requestError) {
      setStatus("Import failed");
      setError(requestError.message);
    }
  };

  const previewActivity = useMemo(() => payload ? ({
    stableNormalizedId: activityId,
    title: "Unit opener · Exercise 1",
    runtime: { questions: payload.publicAuthoring.questions },
  }) : null, [payload]);
  const previewSolutions = useMemo(() => payload ? ({
    solutionAvailability: "model-response",
    questions: Object.fromEntries(payload.teacherAuthoring.modelAnswers.map((answer) => [answer.questionId, { acceptedAnswers: [answer.text] }])),
  }) : null, [payload]);
  const responseRegions = useMemo(() => payload ? payload.publicAuthoring.questions.flatMap((question, index) => {
    const area = question.responseRegion?.area;
    const surface = payload.publicAuthoring.surface;
    return area ? [{ id: question.id, label: `Question ${index + 1} response region`, left: area.x / surface.width * 100, top: area.y / surface.height * 100, width: area.width / surface.width * 100, height: area.height / surface.height * 100 }] : [];
  }) : [], [payload]);

  const updateResponseRegions = (areas) => change((next) => {
    next.publicAuthoring.questions.forEach((question) => {
      const latest = [...areas].reverse().find((area) => area.id === question.id);
      if (latest) {
        const surface = next.publicAuthoring.surface;
        const previousHeight = question.responseRegion.area?.height || 1;
        const updatedArea = { x: latest.left / 100 * surface.width, y: latest.top / 100 * surface.height, width: latest.width / 100 * surface.width, height: latest.height / 100 * surface.height };
        const heightScale = updatedArea.height / previousHeight;
        question.responseRegion.area = updatedArea;
        question.responseRegion.presentation.linePositions = question.responseRegion.presentation.linePositions.map((position) => Math.min(updatedArea.height, position * heightScale));
        question.responseRegion.presentation.lineSpacing *= heightScale;
        question.responseRegion.presentation.lineWidth = updatedArea.width;
      }
      else if (question.id === selectedQuestionId) question.responseRegion.area = null;
    });
  });

  if (!payload) return <section className="listening-builder"><p className="page5-builder-loading">{error || status}</p></section>;
  return (
    <section className="listening-builder page5-activity-builder">
      <header className="listening-builder-header">
        <div><span>Ultimate B2 · Page 5 authoring</span><h1>Open Response</h1><code>{activityId}</code></div>
        <div className="builder-save-state" role="status" data-dirty={dirty || undefined}><strong>{status}</strong>{error && <small>{error}</small>}<button type="button" disabled={!dirty || status === "Saving"} onClick={save}><Save size={17} /> Save</button></div>
      </header>
      <nav className="listening-builder-sections" aria-label="Open-response editor sections">{sections.map((name) => <button type="button" key={name} aria-selected={section === name} onClick={() => setSection(name)}>{name}</button>)}</nav>
      {section === "Content" && <div className="page5-builder-form">
        <section className="publisher-source-import">
          <div><strong>Publisher XML baseline</strong><small>Reads only the fixed local Page 5 forensic package and keeps model responses Teacher-private.</small></div>
          <button type="button" onClick={importPublisherSource} disabled={status === "Importing publisher source"}><FileDown size={17} /> Import Publisher Source</button>
          {importReport && <dl>
            <div><dt>Files found</dt><dd>{importReport.sourceFilesFound.join(", ")}</dd></div>
            <div><dt>Canvas</dt><dd>{importReport.canvas.width} × {importReport.canvas.height}</dd></div>
            <div><dt>Detected</dt><dd>{importReport.questionCount} questions · {importReport.responseRegionCount} response regions · {importReport.imageCount} images</dd></div>
            <div><dt>Validation</dt><dd>{importReport.validation}</dd></div>
          </dl>}
        </section>
        <UltimateB2ExerciseVisualCapabilitiesEditor visualCapabilities={payload.publicAuthoring.visualCapabilities} instructionOptions={instructionOptions} showTextOptions={[]} onChange={(updater) => change((next) => updater(next.publicAuthoring.visualCapabilities))} />
        <label>Instruction image alternative text<textarea value={payload.publicAuthoring.instructionImageAlt} onChange={(event) => change((next) => { next.publicAuthoring.instructionImageAlt = event.target.value; })} /></label>
        <div className="page5-builder-binding-grid">
          <label>Quote artwork<select value={payload.publicAuthoring.quoteArtworkBinding} onChange={(event) => change((next) => { next.publicAuthoring.quoteArtworkBinding = event.target.value; })}><option value="unit1.page5.exercise1.quote">Page 5 Exercise 1 quote artwork</option></select></label>
        </div>
        {payload.publicAuthoring.questions.map((question, index) => <label key={question.id}>Question {index + 1}<textarea aria-label={`Question ${index + 1} text`} value={question.prompt} onChange={(event) => change((next) => { next.publicAuthoring.questions[index].prompt = event.target.value; })} /><code>{question.id}</code></label>)}
      </div>}
      {section === "Response Regions" && <div className="open-response-region-workspace">
        <div className="open-response-region-canvas">
          <p>Select a question, then drag to create its lined Response Region. Drag an existing region to move it or use its handle to resize it.</p>
          <div className="open-response-region-editor-stage">
            <UltimateB2LegacyUnitOpenerActivity activity={previewActivity} authoring={payload.publicAuthoring} capabilities={{ canEditAnswers: false, isPresentation: false, canRevealSolutions: false }} answers={{}} frozen updateAnswer={() => undefined} revealedQuestionIds={[]} solutions={null} solutionsLoading={false} revealQuestion={() => undefined} actions={null} />
            <EditableResponseRegionLayer
              regions={responseRegions}
              selectedRegionId={selectedQuestionId}
              onSelectRegion={(id) => { if (id) setSelectedQuestionId(id); }}
              onChangeRegions={updateResponseRegions}
              createRegion={(geometry) => ({ id: selectedQuestionId || payload.publicAuthoring.questions[0].id, label: "Response region", ...geometry })}
            />
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
            {question.responseRegion.area && payload.teacherAuthoring.modelAnswers[index].text.length > question.responseRegion.presentation.lineCount * Math.max(20, question.responseRegion.area.width / (question.responseRegion.presentation.fontSize * .55)) && <p className="response-region-warning">The current text may need more region height or a smaller font scale to remain comfortably readable.</p>}
            <button className="builder-delete" type="button" onClick={() => updateResponseRegions(responseRegions.filter((region) => region.id !== question.id))}><Trash2 size={16} /> Delete selected region</button>
            <small>The reveal text remains Teacher-private and is not written into learner authoring.</small>
          </div>)}
        </aside>
      </div>}
      {section === "Preview" && <div className="page5-builder-preview">
        {importReport && <section className="publisher-source-import is-report-only" aria-label="Publisher source import report"><dl>
          <div><dt>Files found</dt><dd>{importReport.sourceFilesFound.join(", ")}</dd></div>
          <div><dt>Canvas</dt><dd>{importReport.canvas.width} × {importReport.canvas.height}</dd></div>
          <div><dt>Detected</dt><dd>{importReport.questionCount} questions · {importReport.responseRegionCount} response regions · {importReport.imageCount} images</dd></div>
          <div><dt>Validation</dt><dd>{importReport.validation}</dd></div>
        </dl></section>}
        <p>Click a lined Response Region to reveal only that question’s current Teacher model answer inside the same region.</p>
        <UltimateB2LegacyUnitOpenerActivity
          activity={previewActivity}
          authoring={payload.publicAuthoring}
          capabilities={{ canEditAnswers: false, isPresentation: true, canRevealSolutions: true }}
          answers={{}}
          frozen
          updateAnswer={() => undefined}
          revealedQuestionIds={revealedQuestionIds}
          solutions={previewSolutions}
          solutionsLoading={false}
          revealQuestion={(questionId) => setRevealedQuestionIds((current) => current.includes(questionId) ? current : [...current, questionId])}
          actions={null}
        />
      </div>}
    </section>
  );
}
