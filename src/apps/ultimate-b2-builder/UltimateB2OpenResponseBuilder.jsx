import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { UltimateB2LegacyUnitOpenerActivity } from "../../components/lms/activities/ultimate-b2/UltimateB2LegacyUnitOpenerActivity.jsx";
import { normalizeUltimateB2Page5OpenResponseAuthoring, normalizeUltimateB2Page5TeacherAnswers } from "../../data/ultimate-b2/page5AuthoringSchema.js";
import { UltimateB2ExerciseVisualCapabilitiesEditor } from "./UltimateB2ExerciseVisualCapabilitiesEditor.jsx";

const activityId = "ultimate-b2-sb-u1-p1-o1";
const endpoint = `/__hhplms/ultimate-b2-page-5-authoring?activityId=${activityId}`;
const sections = ["Content", "Teacher Answers", "Preview"];
const instructionOptions = [{ value: "unit1.page5.exercise1.instruction", label: "Page 5 Exercise 1 publisher instruction" }];

export function UltimateB2OpenResponseBuilder() {
  const [payload, setPayload] = useState(null);
  const [section, setSection] = useState("Content");
  const [status, setStatus] = useState("Loading…");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [revealedQuestionIds, setRevealedQuestionIds] = useState([]);

  useEffect(() => {
    let active = true;
    fetch(endpoint, { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Open-response authoring could not be loaded.");
      return body;
    }).then((body) => {
      if (!active) return;
      setPayload(body);
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

  const previewActivity = useMemo(() => payload ? ({
    stableNormalizedId: activityId,
    title: "Unit opener · Exercise 1",
    runtime: { questions: payload.publicAuthoring.questions },
  }) : null, [payload]);
  const previewSolutions = useMemo(() => payload ? ({
    solutionAvailability: "model-response",
    questions: Object.fromEntries(payload.teacherAuthoring.modelAnswers.map((answer) => [answer.questionId, { acceptedAnswers: [answer.text] }])),
  }) : null, [payload]);

  if (!payload) return <section className="listening-builder"><p className="page5-builder-loading">{error || status}</p></section>;
  return (
    <section className="listening-builder page5-activity-builder">
      <header className="listening-builder-header">
        <div><span>Ultimate B2 · Page 5 authoring</span><h1>Open response</h1><code>{activityId}</code></div>
        <div className="builder-save-state" role="status" data-dirty={dirty || undefined}><strong>{status}</strong>{error && <small>{error}</small>}<button type="button" disabled={!dirty || status === "Saving"} onClick={save}><Save size={17} /> Save</button></div>
      </header>
      <nav className="listening-builder-sections" aria-label="Open-response editor sections">{sections.map((name) => <button type="button" key={name} aria-selected={section === name} onClick={() => setSection(name)}>{name}</button>)}</nav>
      {section === "Content" && <div className="page5-builder-form">
        <UltimateB2ExerciseVisualCapabilitiesEditor visualCapabilities={payload.publicAuthoring.visualCapabilities} instructionOptions={instructionOptions} showTextOptions={[]} onChange={(updater) => change((next) => updater(next.publicAuthoring.visualCapabilities))} />
        <label>Instruction image alternative text<textarea value={payload.publicAuthoring.instructionImageAlt} onChange={(event) => change((next) => { next.publicAuthoring.instructionImageAlt = event.target.value; })} /></label>
        <div className="page5-builder-binding-grid">
          <label>Quote artwork<select value={payload.publicAuthoring.quoteArtworkBinding} onChange={(event) => change((next) => { next.publicAuthoring.quoteArtworkBinding = event.target.value; })}><option value="unit1.page5.exercise1.quote">Page 5 Exercise 1 quote artwork</option></select></label>
        </div>
        {payload.publicAuthoring.questions.map((question, index) => <label key={question.id}>Question {index + 1}<textarea aria-label={`Question ${index + 1} text`} value={question.prompt} onChange={(event) => change((next) => { next.publicAuthoring.questions[index].prompt = event.target.value; })} /><code>{question.id}</code></label>)}
      </div>}
      {section === "Teacher Answers" && <div className="page5-builder-form page5-builder-private-form">
        <p>Teacher-private authoring. These answers are stored outside the learner source graph.</p>
        {payload.teacherAuthoring.modelAnswers.map((answer, index) => <label key={answer.questionId}>Question {index + 1} model answer<textarea aria-label={`Question ${index + 1} model answer`} value={answer.text} onChange={(event) => change((next) => { next.teacherAuthoring.modelAnswers[index].text = event.target.value; })} /><code>{answer.questionId}</code></label>)}
      </div>}
      {section === "Preview" && <div className="page5-builder-preview">
        <p>Click an answer-line area to reveal only that question’s current Teacher model answer.</p>
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
