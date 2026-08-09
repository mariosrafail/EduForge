import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { UltimateB2PublisherImageDisplayActivity } from "../../components/lms/activities/ultimate-b2/UltimateB2PublisherImageDisplayActivity.jsx";
import { resolveUltimateB2Page5Artwork } from "../../data/ultimate-b2/page5AuthoringData.js";
import fallbackHeadingArtwork from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-1/obj2/image_2.png";
import { normalizeUltimateB2Page5PublisherDisplayAuthoring, ultimateB2Page5AuthoringLimits } from "../../data/ultimate-b2/page5AuthoringSchema.js";

const activityId = "ultimate-b2-sb-u1-p1-o2";
const endpoint = `/__hhplms/ultimate-b2-page-5-authoring?activityId=${activityId}`;
const sections = ["Content", "Preview"];

export function UltimateB2PublisherDisplayBuilder() {
  const [payload, setPayload] = useState(null);
  const [section, setSection] = useState("Content");
  const [status, setStatus] = useState("Loading…");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(endpoint, { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Publisher-display authoring could not be loaded.");
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
    setDirty(true);
    setStatus("Unsaved changes");
    setError("");
  };
  const move = (index, delta) => change((next) => {
    const other = index + delta;
    [next.publicAuthoring.bullets[index], next.publicAuthoring.bullets[other]] = [next.publicAuthoring.bullets[other], next.publicAuthoring.bullets[index]];
  });
  const addBullet = () => change((next) => {
    const nextNumber = Math.max(0, ...next.publicAuthoring.bullets.map((bullet) => Number(bullet.id.split("-").at(-1)) || 0)) + 1;
    next.publicAuthoring.bullets.push({ id: `bullet-${nextNumber}`, text: "New discussion point" });
  });
  const save = async () => {
    setStatus("Saving"); setError("");
    try {
      const normalized = { activityId, publicAuthoring: normalizeUltimateB2Page5PublisherDisplayAuthoring(payload.publicAuthoring) };
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(normalized) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Publisher-display authoring could not be saved.");
      setPayload(body); setDirty(false); setStatus("Saved");
    } catch (requestError) { setStatus("Save failed"); setError(requestError.message); }
  };

  const previewDisplay = useMemo(() => payload ? ({
    ...payload.publicAuthoring,
    image: resolveUltimateB2Page5Artwork(payload.publicAuthoring.headingArtworkBinding) || fallbackHeadingArtwork,
  }) : null, [payload]);
  const previewActivity = useMemo(() => ({ stableNormalizedId: activityId, title: "Unit opener · Exercise 2" }), []);

  if (!payload) return <section className="listening-builder"><p className="page5-builder-loading">{error || status}</p></section>;
  return (
    <section className="listening-builder page5-activity-builder">
      <header className="listening-builder-header">
        <div><span>Ultimate B2 · Page 5 authoring</span><h1>Publisher display</h1><code>{activityId}</code></div>
        <div className="builder-save-state" role="status" data-dirty={dirty || undefined}><strong>{status}</strong>{error && <small>{error}</small>}<button type="button" disabled={!dirty || status === "Saving"} onClick={save}><Save size={17} /> Save</button></div>
      </header>
      <nav className="listening-builder-sections" aria-label="Publisher-display editor sections">{sections.map((name) => <button type="button" key={name} aria-selected={section === name} onClick={() => setSection(name)}>{name}</button>)}</nav>
      {section === "Content" && <div className="page5-builder-form">
        <label>Heading / instruction image<select value={payload.publicAuthoring.headingArtworkBinding} onChange={(event) => change((next) => { next.publicAuthoring.headingArtworkBinding = event.target.value; })}><option value="unit1.page5.exercise2.heading">Page 5 Exercise 2 publisher heading</option></select></label>
        <label>Image alternative text<textarea value={payload.publicAuthoring.imageAlt} onChange={(event) => change((next) => { next.publicAuthoring.imageAlt = event.target.value; })} /></label>
        <div className="page5-builder-bullets"><header><h2>Bullet order</h2><button type="button" disabled={payload.publicAuthoring.bullets.length >= ultimateB2Page5AuthoringLimits.bulletCount} onClick={addBullet}><Plus /> Add bullet</button></header>
          {payload.publicAuthoring.bullets.map((bullet, index) => <article key={bullet.id}>
            <label>Bullet {index + 1}<textarea aria-label={`Bullet ${index + 1} text`} value={bullet.text} onChange={(event) => change((next) => { next.publicAuthoring.bullets[index].text = event.target.value; })} /></label>
            <div><button type="button" aria-label={`Move bullet ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp /></button><button type="button" aria-label={`Move bullet ${index + 1} down`} disabled={index === payload.publicAuthoring.bullets.length - 1} onClick={() => move(index, 1)}><ArrowDown /></button><button type="button" aria-label={`Delete bullet ${index + 1}`} disabled={payload.publicAuthoring.bullets.length === 1} onClick={() => change((next) => { next.publicAuthoring.bullets.splice(index, 1); })}><Trash2 /></button></div>
          </article>)}
        </div>
      </div>}
      {section === "Preview" && <div className="page5-builder-preview publisher-display-preview"><UltimateB2PublisherImageDisplayActivity activity={previewActivity} display={previewDisplay} /></div>}
    </section>
  );
}
