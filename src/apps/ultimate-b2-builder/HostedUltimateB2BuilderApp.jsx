import { useMemo, useState } from "react";

import catalog from "../../../android-content-packs/ultimate-b2-students-book/catalog.json";
import activitiesDocument from "../../../android-content-packs/ultimate-b2-students-book/activities.json";
import { ACTIVITY_MODES } from "../../components/lms/activities/activityModes.js";
import { NormalizedStudentsBookActivity } from "../../components/lms/activities/ultimate-b2/NormalizedStudentsBookActivity.jsx";
import { ultimateB2StudentsBookPageUnits } from "../../data/ultimate-b2/ultimateB2PageUnits.js";
import { getUltimateB2StudentsBookHotspots } from "virtual:ultimate-b2-runtime-hotspots";
import TeacherOfflineLibrary from "../android-teacher-offline/TeacherOfflineLibrary.jsx";
import { ClassroomToolsProvider } from "../android-teacher-offline/ClassroomToolsContext.jsx";
import { resolveTeacherBookMenuSkin } from "../android-teacher-offline/teacherBookMenuSkins.js";
import { hostedReviewClassroomBackground, hostedReviewToolbarItems } from "../android-teacher-offline/hostedReviewUiAssets.js";
import "./hostedUltimateB2BuilderReview.css";

const activityById = new Map((activitiesDocument.activities || []).map((activity) => [activity.stableActivityId, activity]));
const pageRows = ultimateB2StudentsBookPageUnits
  .filter((unit) => [1, 2].includes(Number(unit.number)))
  .flatMap((unit) => unit.pages.map((page) => ({ ...page, unitNumber: unit.number })));

function ReadOnlyBanner() {
  return <div className="b2-hosted-review-banner" role="status"><strong>Read-only review</strong><span>Repository-backed projections · authoring actions unavailable</span></div>;
}

function HotspotReview() {
  const [pageId, setPageId] = useState(pageRows[0]?.id || "");
  const [selectedId, setSelectedId] = useState("");
  const page = pageRows.find((candidate) => candidate.id === pageId) || pageRows[0];
  const hotspots = getUltimateB2StudentsBookHotspots({ pageId: page?.id, pageNumber: page?.pageNumber, unitNumber: page?.unitNumber });
  const selected = hotspots.find((hotspot) => hotspot.id === selectedId) || null;
  return <main className="hotspot-builder b2-hosted-hotspot-review">
    <header className="builder-header"><div><span>Ultimate B2 hosted review</span><h1>Students Book hotspot builder</h1></div><ReadOnlyBanner /></header>
    <section className="builder-controls" aria-label="Book and page controls">
      <label>Book<input readOnly value="Ultimate B2" /></label>
      <label>Component<input readOnly value="Students Book" /></label>
      <label>Page / Spread<select value={page.id} onChange={(event) => { setPageId(event.target.value); setSelectedId(""); }}>{pageRows.map((item) => <option key={item.id} value={item.id}>Unit {item.unitNumber} · {item.label} · {item.title}</option>)}</select></label>
    </section>
    <section className="builder-workspace">
      <div className="builder-canvas-scroll"><div className="builder-page-surface fit"><img src={page.images[0]} alt={`Unit ${page.unitNumber}, ${page.label}`} draggable="false" />{hotspots.map((hotspot) => <button key={hotspot.id} type="button" className="b2-hosted-hotspot" aria-pressed={selectedId === hotspot.id} aria-label={hotspot.label} style={{ left: `${hotspot.left}%`, top: `${hotspot.top}%`, width: `${hotspot.width}%`, height: `${hotspot.height}%` }} onClick={() => setSelectedId(hotspot.id)}><span>{hotspot.label}</span></button>)}</div></div>
      <aside className="builder-properties"><h2>Hotspot properties</h2>{selected ? <><strong>{selected.label}</strong><code>{selected.activityKey}</code><dl><div><dt>Left</dt><dd>{selected.left.toFixed(2)}%</dd></div><div><dt>Top</dt><dd>{selected.top.toFixed(2)}%</dd></div><div><dt>Width</dt><dd>{selected.width.toFixed(2)}%</dd></div><div><dt>Height</dt><dd>{selected.height.toFixed(2)}%</dd></div></dl></> : <p>Select a committed hotspot overlay to inspect it.</p>}</aside>
    </section>
  </main>;
}

function ActivityReview() {
  const firstId = catalog.units?.[0]?.lessons?.[0]?.exercises?.[0]?.stableActivityId || "";
  const [selectedId, setSelectedId] = useState(firstId);
  const selected = activityById.get(selectedId);
  const groups = useMemo(() => (catalog.units || []).map((unit) => ({ ...unit, lessons: (unit.lessons || []).filter((lesson) => lesson.exercises?.length) })), []);
  return <main className="activity-builder-shell b2-hosted-activity-review">
    <header className="activity-builder-header"><div><span>Ultimate B2 · Activity Builder</span><h1>Student-safe activity review</h1><p>Navigate the checked-in Unit 1 and Unit 2 activity hierarchy.</p></div><ReadOnlyBanner /></header>
    <div className="b2-hosted-activity-layout"><aside className="activity-builder-sidebar" aria-label="Activity Builder book navigation">{groups.map((unit) => <section key={unit.id}><h2>{unit.title}</h2>{unit.lessons.map((lesson) => <div key={lesson.id}><h3>{lesson.title} · {lesson.pageLabel}</h3>{lesson.exercises.map((exercise) => <button type="button" key={exercise.stableActivityId} aria-current={selectedId === exercise.stableActivityId ? "true" : undefined} onClick={() => setSelectedId(exercise.stableActivityId)}>{exercise.title}</button>)}</div>)}</section>)}</aside><section className="b2-hosted-activity-preview" aria-label="Student-safe activity preview"><header><strong>{selected?.title}</strong><code>{selectedId}</code></header><NormalizedStudentsBookActivity key={selectedId} activityId={selectedId} mode={ACTIVITY_MODES.ANDROID_OFFLINE} /></section></div>
  </main>;
}

function UiControllerReview() {
  const menuSkin = resolveTeacherBookMenuSkin("ultimate-b2-students-book");
  const [pageId, setPageId] = useState(pageRows[0]?.id || "");
  const page = pageRows.find((candidate) => candidate.id === pageId) || pageRows[0];
  return <main className="b2-teacher-app-builder b2-hosted-ui-review">
    <header className="b2-teacher-app-header"><div><span>Ultimate B2 hosted review</span><h1>UI Controller</h1><p>Current backgrounds, book menu, navigation, toolbar, authored overrides, and page artwork.</p></div><ReadOnlyBanner /></header>
    <div className="b2-hosted-ui-grid"><section><h2>Live B2 shell preview</h2><div className="b2-hosted-library-preview"><ClassroomToolsProvider><TeacherOfflineLibrary menuSkin={menuSkin} animationsActive={false} /></ClassroomToolsProvider></div></section><aside><h2>Page artwork</h2><label>Preview page / spread<select value={page.id} onChange={(event) => setPageId(event.target.value)}>{pageRows.map((item) => <option key={item.id} value={item.id}>Unit {item.unitNumber} · {item.label}</option>)}</select></label><img className="b2-hosted-ui-page" src={page.images[0]} alt={`Unit ${page.unitNumber}, ${page.label}`} /><h2>Toolbar assets</h2><div className="b2-hosted-toolbar-assets">{hostedReviewToolbarItems.map((item) => <figure key={item.id}><img src={item.normal} alt="" /><figcaption>{item.label}</figcaption></figure>)}</div><h2>Current background</h2><img className="b2-hosted-background-swatch" src={hostedReviewClassroomBackground} alt="Current classroom background" /></aside></div>
  </main>;
}

export function UltimateB2BuilderApp() {
  const [tab, setTab] = useState(() => window.location.hash === "#teacher-app" ? "teacher-app" : window.location.hash === "#activity-builder" ? "activities" : "hotspots");
  const selectTab = (next) => { setTab(next); window.history.replaceState(null, "", next === "teacher-app" ? "#teacher-app" : next === "activities" ? "#activity-builder" : "#hotspot-builder"); };
  return <div className="ultimate-b2-builder-app" data-build-profile="ultimate-b2-builder-hosted-review">
    <nav className="ultimate-b2-builder-tabs" aria-label="Ultimate B2 review tools">
      <button type="button" aria-selected={tab === "hotspots"} onClick={() => selectTab("hotspots")}>Hotspot Builder</button>
      <button type="button" aria-selected={tab === "activities"} onClick={() => selectTab("activities")}>Activity Builder</button>
      <button type="button" aria-selected={tab === "teacher-app"} onClick={() => selectTab("teacher-app")}>UI Controller</button>
    </nav>
    <div hidden={tab !== "hotspots"}><HotspotReview /></div>
    <div hidden={tab !== "activities"}><ActivityReview /></div>
    <div hidden={tab !== "teacher-app"}><UiControllerReview /></div>
  </div>;
}
