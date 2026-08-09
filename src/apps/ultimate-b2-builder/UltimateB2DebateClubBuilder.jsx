import { Save } from "lucide-react";
import { useEffect, useState } from "react";

import { UltimateB2DebateClubActivity } from "../../components/lms/activities/ultimate-b2/UltimateB2DebateClubActivity.jsx";
import { normalizeUltimateB2DebateClubAuthoring, ULTIMATE_B2_DEBATE_CLUB_ID } from "../../data/ultimate-b2/readingExerciseAuthoringSchema.js";
import { UltimateB2ExerciseVisualCapabilitiesEditor } from "./UltimateB2ExerciseVisualCapabilitiesEditor.jsx";

const activityId = ULTIMATE_B2_DEBATE_CLUB_ID;
const endpoint = `/__hhplms/ultimate-b2-reading-exercise-authoring?activityId=${activityId}`;
const instructionOptions = [{ value: "unit1.reading.debate-club.instruction", label: "Debate Club publisher instruction" }];

export function UltimateB2DebateClubBuilder() {
  const [authoring, setAuthoring] = useState(null);
  const [section, setSection] = useState("Parts");
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

  if (!authoring) return <section className="listening-builder"><p className="page5-builder-loading">{error || status}</p></section>;
  return <section className="listening-builder reading-exercise-builder">
    <header className="listening-builder-header"><div><span>Ultimate B2 · Reading authoring</span><h1>Debate Club</h1><code>{activityId}</code></div><div className="builder-save-state" role="status" data-dirty={dirty || undefined}><strong>{status}</strong>{error && <small>{error}</small>}<button type="button" disabled={!dirty || status === "Saving"} onClick={save}><Save size={17} /> Save</button></div></header>
    <nav className="listening-builder-sections" aria-label="Debate Club editor sections">{["Parts", "Preview"].map((name) => <button type="button" key={name} aria-selected={section === name} onClick={() => setSection(name)}>{name}</button>)}</nav>
    {section === "Parts" && <div className="page5-builder-form">
      <UltimateB2ExerciseVisualCapabilitiesEditor visualCapabilities={authoring.visualCapabilities} instructionOptions={instructionOptions} showTextOptions={[]} onChange={(updater) => change((next) => updater(next.visualCapabilities))} />
      {authoring.parts.map((part, index) => <article className="reading-builder-part" key={part.id}><h2>Part {part.number}</h2><label>Prompt<textarea value={part.prompt} onChange={(event) => change((next) => { next.parts[index].prompt = event.target.value; })} /></label><label>Photo alternative text<input value={part.partImageAlt} onChange={(event) => change((next) => { next.parts[index].partImageAlt = event.target.value; })} /></label><label>Reveal button label<input value={part.hotspot.ariaLabel} onChange={(event) => change((next) => { next.parts[index].hotspot.ariaLabel = event.target.value; })} /></label><label>Reveal text<textarea className="reading-builder-model-text" value={part.hotspot.revealText} onChange={(event) => change((next) => { next.parts[index].hotspot.revealText = event.target.value; })} /></label><div className="reading-builder-geometry-fields">{["x", "y", "width", "height"].map((key) => <label key={key}>Hotspot {key}<input type="number" value={part.hotspot.area[key]} onChange={(event) => change((next) => { next.parts[index].hotspot.area[key] = Number(event.target.value); })} /></label>)}</div></article>)}
    </div>}
    {section === "Preview" && <div className="reading-builder-preview"><div className="reading-builder-preview-controls"><button type="button" onClick={() => send("previous-panel")}>Previous part</button><button type="button" onClick={() => send("next-panel")}>Next part</button></div><div className="reading-builder-preview-stage"><UltimateB2DebateClubActivity activity={{ stableNormalizedId: activityId }} authoring={authoring} presentation={{ command }} /></div></div>}
  </section>;
}
