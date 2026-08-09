import { Save } from "lucide-react";
import { useEffect, useState } from "react";

import { UltimateB2CompleteSentencesActivity } from "../../components/lms/activities/ultimate-b2/UltimateB2CompleteSentencesActivity.jsx";
import { normalizeUltimateB2CompleteSentencesAuthoring, ULTIMATE_B2_COMPLETE_SENTENCES_ID } from "../../data/ultimate-b2/readingExerciseAuthoringSchema.js";
import { UltimateB2ExerciseVisualCapabilitiesEditor } from "./UltimateB2ExerciseVisualCapabilitiesEditor.jsx";

const activityId = ULTIMATE_B2_COMPLETE_SENTENCES_ID;
const endpoint = `/__hhplms/ultimate-b2-reading-exercise-authoring?activityId=${activityId}`;
const instructionOptions = [{ value: "unit1.reading.exercise4.instruction", label: "Exercise 4 publisher instruction" }];
const showTextOptions = [{ value: "unit1.reading.exercise4.show-text", label: "The Netflix Effect publisher text" }];

export function UltimateB2CompleteSentencesBuilder() {
  const [authoring, setAuthoring] = useState(null);
  const [section, setSection] = useState("Content");
  const [status, setStatus] = useState("Loading...");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [command, setCommand] = useState(null);

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

  if (!authoring) return <section className="listening-builder"><p className="page5-builder-loading">{error || status}</p></section>;
  return <section className="listening-builder reading-exercise-builder">
    <header className="listening-builder-header"><div><span>Ultimate B2 · Reading authoring</span><h1>Complete the Sentences</h1><code>{activityId}</code></div><div className="builder-save-state" role="status" data-dirty={dirty || undefined}><strong>{status}</strong>{error && <small>{error}</small>}<button type="button" disabled={!dirty || status === "Saving"} onClick={save}><Save size={17} /> Save</button></div></header>
    <nav className="listening-builder-sections" aria-label="Complete the Sentences editor sections">{["Content", "Blanks", "Preview"].map((name) => <button type="button" key={name} aria-selected={section === name} onClick={() => setSection(name)}>{name}</button>)}</nav>
    {section === "Content" && <div className="page5-builder-form">
      <UltimateB2ExerciseVisualCapabilitiesEditor visualCapabilities={authoring.visualCapabilities} instructionOptions={instructionOptions} showTextOptions={showTextOptions} onChange={(updater) => change((next) => updater(next.visualCapabilities))} />
      <label>Publisher example answer<input value={authoring.example.answer} onChange={(event) => change((next) => { next.example.answer = event.target.value; })} /></label>
      {authoring.sentences.map((sentence, index) => <article className="reading-builder-sentence" key={sentence.id}><strong>Sentence {sentence.number}</strong><label>Before blank<textarea value={sentence.before} onChange={(event) => change((next) => { next.sentences[index].before = event.target.value; })} /></label><label>After blank<textarea value={sentence.after} onChange={(event) => change((next) => { next.sentences[index].after = event.target.value; })} /></label></article>)}
    </div>}
    {section === "Blanks" && <div className="page5-builder-form">{authoring.blanks.map((blank, index) => <article className="reading-builder-geometry" key={blank.id}><strong>{blank.label}</strong><label>Revealed word<input value={blank.revealedWord} onChange={(event) => change((next) => { next.blanks[index].revealedWord = event.target.value; })} /></label>{["x", "y", "width", "height"].map((key) => <label key={key}>{key}<input type="number" value={blank.area[key]} onChange={(event) => change((next) => { next.blanks[index].area[key] = Number(event.target.value); })} /></label>)}</article>)}</div>}
    {section === "Preview" && <div className="reading-builder-preview"><div className="reading-builder-preview-controls"><button type="button" onClick={() => send("toggle-text")}>Show Text / Questions</button></div><div className="reading-builder-preview-stage"><UltimateB2CompleteSentencesActivity activity={{ stableNormalizedId: activityId }} authoring={authoring} presentation={{ command }} /></div></div>}
  </section>;
}
