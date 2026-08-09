import { Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { TeacherLegacyMultipleChoiceActivity } from "../../components/lms/activities/ultimate-b2/TeacherLegacyMultipleChoiceActivity.jsx";
import { EditableHotspotLayer } from "../../components/lms/books/BookPageImagePanel.jsx";
import { ultimateB2Unit1Part2LegacyImages } from "../../data/ultimate-b2/unit1Part2LegacyPilotAssets.js";
import { ultimateB2Unit1Part2LegacyAudio } from "../../data/ultimate-b2/unit1Part2LegacyPilotAudio.offline.js";
import { normalizeMultipleChoiceAuthoring } from "../../data/ultimate-b2/multipleChoiceAuthoringSchema.js";

const endpoint = "/__hhplms/ultimate-b2-multiple-choice-authoring";
const activityId = "ultimate-b2-sb-u1-p2-o3";
const images = ultimateB2Unit1Part2LegacyImages[activityId];
const sections = ["Overview", "Panels / Parts", "Questions & Answers", "Highlight Audio / Text Links", "Preview"];

const toAreas = (items, surface) => items.filter((item) => item.area).map((item) => ({
  id: item.id,
  label: item.label,
  left: item.area.x / surface.width * 100,
  top: item.area.y / surface.height * 100,
  width: item.area.width / surface.width * 100,
  height: item.area.height / surface.height * 100,
}));

const fromArea = (item, surface) => ({
  x: Math.round(item.left / 100 * surface.width),
  y: Math.round(item.top / 100 * surface.height),
  width: Math.max(1, Math.round(item.width / 100 * surface.width)),
  height: Math.max(1, Math.round(item.height / 100 * surface.height)),
});

function AreaEditor({ surface, items, selectedId, onSelect, onChange, createId, children, text = false }) {
  return (
    <div className={`multiple-choice-area-editor ${text ? "text-surface" : ""}`} style={{ aspectRatio: `${surface.width} / ${surface.height}` }}>
      {children}
      <EditableHotspotLayer
        pageId="multiple-choice-structured-areas"
        areas={toAreas(items, surface)}
        editing
        selectedAreaId={selectedId}
        onSelectArea={onSelect}
        onChangeAreas={(areas) => onChange(areas.map((area) => ({ id: area.id, area: fromArea(area, surface) })))}
        createArea={(geometry) => ({ id: createId(), label: "Structured area", ...geometry })}
      />
    </div>
  );
}

function PanelImages({ authoring, panel }) {
  const source = panel.imageAsset === "image_1.png" ? images.questionPanels[0] : images.questionPanels[1];
  const percent = (value, total) => `${value / total * 100}%`;
  const style = (area) => ({ left: percent(area.x, authoring.surface.width), top: percent(area.y, authoring.surface.height), width: percent(area.width, authoring.surface.width), height: percent(area.height, authoring.surface.height) });
  return <>
    {panel.instructionArea && <img src={images.instruction} alt="Instruction layer" style={style(panel.instructionArea)} />}
    <img src={source} alt={`Publisher panel ${panel.number}`} style={style(panel.imageArea)} />
  </>;
}

function Sidebar({ items, selectedIndex, onSelect, render }) {
  return <aside>{items.map((item, index) => <button type="button" key={item.id} className={index === selectedIndex ? "selected" : ""} onClick={() => onSelect(index)}>{render(item, index)}</button>)}</aside>;
}

export function UltimateB2MultipleChoiceBuilder() {
  const [authoring, setAuthoring] = useState(null);
  const [section, setSection] = useState(sections[0]);
  const [status, setStatus] = useState("Loading…");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [panelIndex, setPanelIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState(null);
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [previewState, setPreviewState] = useState({ view: "questions", panelIndex: 0, panelCount: 2 });
  const [previewCommand, setPreviewCommand] = useState(null);

  useEffect(() => {
    let active = true;
    fetch(endpoint, { cache: "no-store" }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Multiple-choice authoring could not be loaded.");
      return payload;
    }).then((payload) => {
      if (!active) return;
      setAuthoring(payload);
      setSelectedOptionId(payload.questions[0].options[0].id);
      setSelectedRegionId(payload.questions[0].highlightRegions[0].id);
      setStatus("Saved");
    }).catch((requestError) => { if (active) { setStatus("Load failed"); setError(requestError.message); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const beforeUnload = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  const change = (updater) => {
    setAuthoring((current) => { const next = structuredClone(current); updater(next); return next; });
    setDirty(true);
    setStatus("Unsaved changes");
    setError("");
  };

  const save = async () => {
    setStatus("Saving");
    setError("");
    try {
      const normalized = normalizeMultipleChoiceAuthoring(authoring);
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(normalized) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Multiple-choice authoring could not be saved.");
      setAuthoring(payload);
      setDirty(false);
      setStatus("Saved");
    } catch (requestError) { setStatus("Save failed"); setError(requestError.message); }
  };

  if (!authoring) return <section className="listening-builder"><p>{error || status}</p></section>;
  const panel = authoring.panels[panelIndex];
  const question = authoring.questions[questionIndex];
  const questionPanel = authoring.panels.find((item) => item.id === question.panelId);
  const optionItems = question.options.map((option) => ({ ...option, label: `Q${question.number} / ${option.label}` }));
  const regionItems = question.highlightRegions.map((region) => ({ id: region.id, label: `Q${question.number} / ${region.id}`, area: region }));
  const audioKeys = Array.from({ length: 6 }, (_, index) => `ultimate-b2.legacy-pilot.unit-1.part-2.obj3.highlight-${index + 1}`);
  const sendPreview = (type) => setPreviewCommand((current) => ({ type, token: (current?.token || 0) + 1 }));

  const updateOptionAreas = (areas) => change((next) => {
    const byId = new Map(areas.map((item) => [item.id, item.area]));
    next.questions[questionIndex].options.forEach((option) => { if (byId.has(option.id)) option.area = byId.get(option.id); });
  });
  const updateRegionAreas = (areas) => change((next) => {
    const byId = new Map(areas.map((item) => [item.id, item.area]));
    next.questions[questionIndex].highlightRegions.forEach((region) => { if (byId.has(region.id)) Object.assign(region, byId.get(region.id)); });
  });
  const selectQuestion = (index) => {
    setQuestionIndex(index);
    setSelectedOptionId(authoring.questions[index].options[0].id);
    setSelectedRegionId(authoring.questions[index].highlightRegions[0]?.id || null);
  };

  return (
    <section className="listening-builder multiple-choice-builder">
      <header className="listening-builder-header">
        <div><span>Ultimate B2 · Activity Builder</span><h1>Multiple Choice · Reading Exercise 3</h1><code>{activityId}</code></div>
        <div className="builder-save-state" role="status" data-dirty={dirty || undefined}><strong>{status}</strong>{error && <small>{error}</small>}<button type="button" disabled={!dirty || status === "Saving"} onClick={save}><Save size={17} /> Save</button></div>
      </header>
      <nav className="listening-builder-sections" aria-label="Multiple Choice editor sections">{sections.map((name) => <button type="button" key={name} aria-selected={section === name} onClick={() => setSection(name)}>{name}</button>)}</nav>

      {section === "Overview" && <div className="listening-builder-overview"><h2>Recovered source bindings</h2><dl>
        <div><dt>Activity id</dt><dd>{authoring.activityId}</dd></div><div><dt>Source object</dt><dd>{authoring.source.path}</dd></div>
        <div><dt>Panels / questions</dt><dd>{authoring.panels.length} / {authoring.questions.length}</dd></div><div><dt>Highlight audio</dt><dd>{authoring.questions.length} mapped segments</dd></div>
        <div><dt>Instruction</dt><dd>{authoring.assets.instructionImage}</dd></div><div><dt>Show Text</dt><dd>{authoring.assets.textImage}</dd></div>
      </dl><p><code>{authoring.source.teacherVariant}</code> · {authoring.source.files.length} hashed source files · source paths are read-only.</p></div>}

      {section === "Panels / Parts" && <div className="multiple-choice-editor-grid">
        <Sidebar items={authoring.panels} selectedIndex={panelIndex} onSelect={setPanelIndex} render={(item) => <><strong>Part {item.number}</strong><small>{item.questionIds.length} questions · {item.imageAsset}</small></>} />
        <main className="multiple-choice-properties"><header><h2>Part {panel.number}</h2><div><button type="button" disabled={panelIndex === 0} onClick={() => change((next) => { [next.panels[panelIndex - 1], next.panels[panelIndex]] = [next.panels[panelIndex], next.panels[panelIndex - 1]]; next.panels.forEach((item, index) => { item.number = index + 1; }); setPanelIndex(panelIndex - 1); })}>Move earlier</button><button type="button" disabled={panelIndex === authoring.panels.length - 1} onClick={() => change((next) => { [next.panels[panelIndex + 1], next.panels[panelIndex]] = [next.panels[panelIndex], next.panels[panelIndex + 1]]; next.panels.forEach((item, index) => { item.number = index + 1; }); setPanelIndex(panelIndex + 1); })}>Move later</button></div></header>
          <label>Base image<select value={panel.imageAsset} onChange={(event) => change((next) => { next.panels[panelIndex].imageAsset = event.target.value; })}><option>image_1.png</option><option>image_3.png</option></select></label>
          <label><input type="checkbox" checked={Boolean(panel.instructionArea)} onChange={(event) => change((next) => { next.panels[panelIndex].instructionArea = event.target.checked ? { x: 45, y: 18, width: 949, height: 64 } : null; })} /> Instruction overlay ({authoring.assets.instructionImage})</label>
          <h3>Question membership</h3><ul>{authoring.questions.filter((item) => item.panelId === panel.id).map((item) => <li key={item.id}>Question {item.number}: {item.prompt}</li>)}</ul>
          <div className="multiple-choice-panel-preview"><PanelImages authoring={authoring} panel={panel} /></div>
        </main>
      </div>}

      {section === "Questions & Answers" && <div className="multiple-choice-editor-grid">
        <Sidebar items={authoring.questions} selectedIndex={questionIndex} onSelect={selectQuestion} render={(item) => <><strong>Question {item.number}</strong><small>{item.panelId} · correct {item.options.find((option) => option.id === item.correctOptionId)?.label}</small></>} />
        <main className="multiple-choice-properties"><header><div><h2>Question {question.number}</h2><p>{question.prompt}</p></div><button type="button" disabled={!selectedOptionId} onClick={() => change((next) => { next.questions[questionIndex].options.find((item) => item.id === selectedOptionId).area = null; })}><Trash2 /> Delete area</button></header>
          <div className="multiple-choice-form-row"><label>Panel<select value={question.panelId} onChange={(event) => change((next) => { const current = next.questions[questionIndex]; next.panels.forEach((item) => { item.questionIds = item.questionIds.filter((id) => id !== current.id); }); current.panelId = event.target.value; next.panels.find((item) => item.id === current.panelId).questionIds.push(current.id); })}>{authoring.panels.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}</select></label><label>Correct option<select value={question.correctOptionId} onChange={(event) => change((next) => { next.questions[questionIndex].correctOptionId = event.target.value; })}>{question.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label><label><input type="checkbox" checked={question.persistSolved} onChange={(event) => change((next) => { next.questions[questionIndex].persistSolved = event.target.checked; })} /> Persist solved state</label></div>
          <div className="multiple-choice-option-fields">{question.options.map((option) => <label key={option.id} className={selectedOptionId === option.id ? "selected" : ""}><button type="button" onClick={() => setSelectedOptionId(option.id)}>{option.label}</button><input aria-label={`Option ${option.label} text`} value={option.text} onChange={(event) => change((next) => { next.questions[questionIndex].options.find((item) => item.id === option.id).text = event.target.value; })} /></label>)}</div>
          <AreaEditor surface={authoring.surface} items={optionItems} selectedId={selectedOptionId} onSelect={setSelectedOptionId} onChange={updateOptionAreas} createId={() => selectedOptionId || question.options[0].id}><PanelImages authoring={authoring} panel={questionPanel} /></AreaEditor>
          <fieldset className="multiple-choice-reference-fields"><legend>Text-reference button area</legend>{["x", "y", "width", "height"].map((field) => <label key={field}>{field}<input type="number" value={question.referenceArea[field]} onChange={(event) => change((next) => { next.questions[questionIndex].referenceArea[field] = Number(event.target.value); })} /></label>)}</fieldset>
        </main>
      </div>}

      {section === "Highlight Audio / Text Links" && <div className="multiple-choice-editor-grid">
        <Sidebar items={authoring.questions} selectedIndex={questionIndex} onSelect={selectQuestion} render={(item) => <><strong>Question {item.number}</strong><small>{item.highlightRegions.length} text regions</small></>} />
        <main className="multiple-choice-properties"><header><div><h2>Question {question.number} text link</h2><code>{question.audioLogicalKey}</code></div><button type="button" disabled={!selectedRegionId} onClick={() => { change((next) => { next.questions[questionIndex].highlightRegions = next.questions[questionIndex].highlightRegions.filter((item) => item.id !== selectedRegionId); }); setSelectedRegionId(null); }}><Trash2 /> Delete region</button></header>
          <label>Audio mapping<select value={question.audioLogicalKey} onChange={(event) => change((next) => { next.questions[questionIndex].audioLogicalKey = event.target.value; })}>{audioKeys.map((key) => <option key={key}>{key}</option>)}</select></label><audio controls src={ultimateB2Unit1Part2LegacyAudio[question.audioLogicalKey]?.localUrl} />
          <AreaEditor text surface={authoring.textSurface} items={regionItems} selectedId={selectedRegionId} onSelect={setSelectedRegionId} onChange={updateRegionAreas} createId={() => { const id = `region-${Date.now()}`; change((next) => { next.questions[questionIndex].highlightRegions.push({ id, x: 0, y: 0, width: 20, height: 20 }); }); setSelectedRegionId(id); return id; }}><img src={images.readingText} alt="Show Text surface" /></AreaEditor>
        </main>
      </div>}

      {section === "Preview" && <div className="multiple-choice-builder-preview"><header><div><h2>Runtime preview</h2><p>Uses the Teacher panel, feedback, lockout, Show Text and reference-audio state machine.</p></div><div><button type="button" onClick={() => sendPreview("previous-panel")} disabled={previewState.panelIndex <= 0 || previewState.view !== "questions"}>Previous part</button><button type="button" onClick={() => sendPreview("next-panel")} disabled={previewState.panelIndex >= previewState.panelCount - 1 || previewState.view !== "questions"}>Next part</button><button type="button" onClick={() => sendPreview("toggle-text")}>{previewState.view === "questions" ? "Show Text" : "Return to questions"}</button></div></header><div className="multiple-choice-runtime-preview"><TeacherLegacyMultipleChoiceActivity authoring={authoring} images={images} presentation={{ command: previewCommand, onStateChange: setPreviewState }} /></div></div>}
    </section>
  );
}
