import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { UltimateB2ImageActivity } from "../../components/lms/activities/ultimate-b2/UltimateB2ImageActivity.jsx";
import { resolveUltimateB2Page5Artwork } from "../../data/ultimate-b2/page5AuthoringData.js";
import { normalizeUltimateB2Page5ImageAuthoring } from "../../data/ultimate-b2/page5AuthoringSchema.js";
import { UltimateB2ExerciseVisualCapabilitiesEditor } from "./UltimateB2ExerciseVisualCapabilitiesEditor.jsx";

const activityId = "ultimate-b2-sb-u1-p1-o2";
const endpoint = `/__hhplms/ultimate-b2-page-5-authoring?activityId=${activityId}`;
const sections = ["Content", "Preview"];
const instructionOptions = [{ value: "unit1.page5.exercise2.instruction", label: "Page 5 Exercise 2 publisher instruction" }];

export function UltimateB2ImageBuilder() {
  const [payload, setPayload] = useState(null);
  const [section, setSection] = useState("Content");
  const [status, setStatus] = useState("Loading...");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(endpoint, { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Image activity authoring could not be loaded.");
      return body;
    }).then((body) => { if (active) { setPayload(body); setStatus("Saved"); } }).catch((requestError) => { if (active) { setStatus("Load failed"); setError(requestError.message); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const beforeUnload = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  const change = (updater) => {
    setPayload((current) => { const next = structuredClone(current); updater(next); return next; });
    setDirty(true); setStatus("Unsaved changes"); setError("");
  };
  const save = async () => {
    setStatus("Saving"); setError("");
    try {
      const normalized = { activityId, publicAuthoring: normalizeUltimateB2Page5ImageAuthoring(payload.publicAuthoring) };
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(normalized) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Image activity authoring could not be saved.");
      setPayload(body); setDirty(false); setStatus("Saved");
    } catch (requestError) { setStatus("Save failed"); setError(requestError.message); }
  };
  const previewDisplay = useMemo(() => payload ? ({
    ...payload.publicAuthoring,
    instructionImage: resolveUltimateB2Page5Artwork(payload.publicAuthoring.visualCapabilities.instructionImage),
    image: resolveUltimateB2Page5Artwork(payload.publicAuthoring.mainImage),
  }) : null, [payload]);
  const previewActivity = useMemo(() => ({ stableNormalizedId: activityId, title: "Unit opener Â· Exercise 2" }), []);

  if (!payload) return <section className="listening-builder"><p className="page5-builder-loading">{error || status}</p></section>;
  return (
    <section className="listening-builder page5-activity-builder">
      <header className="listening-builder-header"><div><span>Ultimate B2 Â· Page 5 authoring</span><h1>Image activity</h1><code>{activityId}</code></div><div className="builder-save-state" role="status" data-dirty={dirty || undefined}><strong>{status}</strong>{error && <small>{error}</small>}<button type="button" disabled={!dirty || status === "Saving"} onClick={save}><Save size={17} /> Save</button></div></header>
      <nav className="listening-builder-sections" aria-label="Image activity editor sections">{sections.map((name) => <button type="button" key={name} aria-selected={section === name} onClick={() => setSection(name)}>{name}</button>)}</nav>
      {section === "Content" && <div className="page5-builder-form">
        <UltimateB2ExerciseVisualCapabilitiesEditor visualCapabilities={payload.publicAuthoring.visualCapabilities} instructionOptions={instructionOptions} showTextOptions={[]} onChange={(updater) => change((next) => updater(next.publicAuthoring.visualCapabilities))} />
        <label>Instruction image alternative text<textarea value={payload.publicAuthoring.instructionImageAlt} onChange={(event) => change((next) => { next.publicAuthoring.instructionImageAlt = event.target.value; })} /></label>
        <label>Main horizontal image<select value={payload.publicAuthoring.mainImage} onChange={(event) => change((next) => { next.publicAuthoring.mainImage = event.target.value; })}><option value="unit1.page5.exercise2.main-content">Page 5 discussion prompts</option></select><small>Prefer a horizontal / landscape image so it fills the activity window cleanly.</small></label>
        <label>Main image alternative text<textarea value={payload.publicAuthoring.mainImageAlt} onChange={(event) => change((next) => { next.publicAuthoring.mainImageAlt = event.target.value; })} /></label>
      </div>}
      {section === "Preview" && <div className="page5-builder-preview image-activity-preview"><UltimateB2ImageActivity activity={previewActivity} display={previewDisplay} /></div>}
    </section>
  );
}
