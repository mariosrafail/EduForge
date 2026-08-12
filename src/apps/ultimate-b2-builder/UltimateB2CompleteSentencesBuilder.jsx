import { FileDown, Save } from "lucide-react";
import { useEffect, useState } from "react";

import { UltimateB2CompleteSentencesActivity } from "../../components/lms/activities/ultimate-b2/UltimateB2CompleteSentencesActivity.jsx";
import { normalizeUltimateB2CompleteSentencesAuthoring, ULTIMATE_B2_COMPLETE_SENTENCES_ID } from "../../data/ultimate-b2/readingExerciseAuthoringSchema.js";
import { projectStudentReadingActivity, projectTeacherReadingSolution } from "../../data/ultimate-b2/readingExerciseProjections.js";
import { UltimateB2ExerciseVisualCapabilitiesEditor } from "./UltimateB2ExerciseVisualCapabilitiesEditor.jsx";

const activityId = ULTIMATE_B2_COMPLETE_SENTENCES_ID;
const endpoint = `/__hhplms/ultimate-b2-reading-exercise-authoring?activityId=${activityId}`;
const publisherImportEndpoint = `/__hhplms/ultimate-b2-complete-sentences-publisher-import?activityId=${activityId}`;
const instructionOptions = [{ value: "unit1.reading.exercise4.instruction", label: "Exercise 4 publisher instruction" }];
const showTextOptions = [{ value: "unit1.reading.exercise4.show-text", label: "The Netflix Effect publisher text" }];

export function UltimateB2CompleteSentencesBuilder() {
  const [authoring, setAuthoring] = useState(null);
  const [section, setSection] = useState("Content");
  const [status, setStatus] = useState("Loading...");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [command, setCommand] = useState(null);
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

  const change = (updater) => {
    setAuthoring((current) => { const next = structuredClone(current); updater(next); return next; });
    setDirty(true); setStatus("Unsaved changes"); setError("");
  };
  const save = async () => {
    setStatus("Saving"); setError("");
    try {
      const normalized = normalizeUltimateB2CompleteSentencesAuthoring(authoring);
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activityId, authoring: normalized }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Complete the Sentences authoring could not be saved.");
      setAuthoring(body); setDirty(false); setStatus("Saved");
    } catch (requestError) { setStatus("Save failed"); setError(requestError.message); }
  };
  const send = (type) => setCommand({ type, token: `${Date.now()}-${Math.random()}` });
  const importPublisherSource = async () => {
    setStatus("Importing publisher source"); setError("");
    try {
      const response = await fetch(publisherImportEndpoint, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Publisher source could not be imported.");
      setAuthoring(body.authoring); setImportReport(body.report); setDirty(false); setStatus("Publisher source imported and saved"); setSection("Preview");
    } catch (requestError) { setStatus("Import failed"); setError(requestError.message); }
  };

  if (!authoring) return <section className="listening-builder"><p className="page5-builder-loading">{error || status}</p></section>;
  const runtime = projectStudentReadingActivity(authoring);
  const teacherSolution = projectTeacherReadingSolution(authoring);
  return <section className="listening-builder reading-exercise-builder">
    <header className="listening-builder-header"><div><span>Ultimate B2 · Reading authoring</span><h1>Complete the Sentences</h1><code>{activityId}</code></div><div className="builder-save-state" role="status" data-dirty={dirty || undefined}><strong>{status}</strong>{error && <small>{error}</small>}<button type="button" disabled={!dirty || status === "Saving"} onClick={save}><Save size={17} /> Save</button></div></header>
    <nav className="listening-builder-sections" aria-label="Complete the Sentences editor sections">{["Publisher Source", "Content", "Blanks", "Preview"].map((name) => <button type="button" key={name} aria-selected={section === name} onClick={() => setSection(name)}>{name}</button>)}</nav>
    {section === "Publisher Source" && <div className="page5-builder-form">
      <section className="publisher-import-card"><div><h2>Publisher-source baseline</h2><p>Imports the fixed, verified <code>tmp/complete-sentences/obj_params.xml</code> source and reuses the tracked instruction and Show Text assets.</p></div><button type="button" onClick={importPublisherSource} disabled={status === "Importing publisher source"}><FileDown size={17} /> Import Publisher Source</button></section>
      {importReport && <section className="publisher-import-report" role="region" aria-label="Complete the Sentences publisher source import report">
        <dl><div><dt>XML</dt><dd>{importReport.sourceFile}</dd></div><div><dt>SHA-256</dt><dd><code>{importReport.sourceSha256}</code></dd></div><div><dt>Canvas</dt><dd>{importReport.canvas.width} × {importReport.canvas.height}</dd></div><div><dt>Structure</dt><dd>{importReport.exampleDetected ? "1 example" : "No example"} · {importReport.interactiveSentenceCount} sentences · {importReport.revealAnswerCount} reveal answers</dd></div><div><dt>Assets</dt><dd>Instruction {importReport.instructionAssetMatched ? "matched" : "missing"} · Show Text auxiliary {importReport.showTextAuxiliaryAssetMatched ? "matched" : "missing"}</dd></div><div><dt>Validation</dt><dd>{importReport.validation}</dd></div></dl>
      </section>}
    </div>}
    {section === "Content" && <div className="page5-builder-form">
      <UltimateB2ExerciseVisualCapabilitiesEditor visualCapabilities={authoring.visualCapabilities} instructionOptions={instructionOptions} showTextOptions={showTextOptions} onChange={(updater) => change((next) => updater(next.visualCapabilities))} />
      <label>Publisher example text<input value={authoring.example.exampleText} onChange={(event) => change((next) => { next.example.exampleText = event.target.value; })} /></label>
      {authoring.sentences.map((sentence, index) => <article className="reading-builder-sentence" key={sentence.id}><strong>Sentence {sentence.number}</strong><label>Before blank<textarea value={sentence.before} onChange={(event) => change((next) => { next.sentences[index].before = event.target.value; })} /></label><label>After blank<textarea value={sentence.after} onChange={(event) => change((next) => { next.sentences[index].after = event.target.value; })} /></label></article>)}
    </div>}
    {section === "Blanks" && <div className="page5-builder-form">{authoring.blanks.map((blank, index) => <article className="reading-builder-geometry" key={blank.id}><strong>{blank.label}</strong><label>Revealed word<input value={blank.revealedWord} onChange={(event) => change((next) => { next.blanks[index].revealedWord = event.target.value; })} /></label>{["x", "y", "width", "height"].map((key) => <label key={key}>{key}<input type="number" value={blank.area[key]} onChange={(event) => change((next) => { next.blanks[index].area[key] = Number(event.target.value); })} /></label>)}</article>)}</div>}
    {section === "Preview" && <div className="reading-builder-preview">{importReport && <section className="publisher-source-import is-report-only" aria-label="Complete the Sentences publisher source import report"><dl><div><dt>XML</dt><dd>{importReport.sourceFile}</dd></div><div><dt>SHA-256</dt><dd><code>{importReport.sourceSha256}</code></dd></div><div><dt>Canvas</dt><dd>{importReport.canvas.width} × {importReport.canvas.height}</dd></div><div><dt>Structure</dt><dd>{importReport.exampleDetected ? "1 example" : "No example"} · {importReport.interactiveSentenceCount} sentences · {importReport.revealAnswerCount} reveal answers</dd></div><div><dt>Assets</dt><dd>Instruction {importReport.instructionAssetMatched ? "matched" : "missing"} · Show Text auxiliary {importReport.showTextAuxiliaryAssetMatched ? "matched" : "missing"}</dd></div><div><dt>Validation</dt><dd>{importReport.validation}</dd></div></dl></section>}<div className="reading-builder-preview-controls"><button type="button" onClick={() => send("toggle-text")}>Show Text / Questions</button></div><div className="reading-builder-preview-stage"><UltimateB2CompleteSentencesActivity activity={{ stableNormalizedId: activityId }} runtime={runtime} teacherSolution={teacherSolution} presentation={{ command }} /></div></div>}
  </section>;
}
