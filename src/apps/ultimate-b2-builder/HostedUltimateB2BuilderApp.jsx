import { useMemo, useState } from "react";

import catalog from "../../../android-content-packs/ultimate-b2-students-book/catalog.json";
import activitiesDocument from "../../../android-content-packs/ultimate-b2-students-book/activities.json";
import { ACTIVITY_MODES } from "../../components/lms/activities/activityModes.js";
import { NormalizedStudentsBookActivity } from "../../components/lms/activities/ultimate-b2/NormalizedStudentsBookActivity.jsx";
import { ultimateB2StudentsBookPageUnits } from "../../data/ultimate-b2/ultimateB2PageUnits.js";
import TeacherOfflineLibrary from "../android-teacher-offline/TeacherOfflineLibrary.jsx";
import { ClassroomToolsProvider } from "../android-teacher-offline/ClassroomToolsContext.jsx";
import { resolveTeacherBookMenuSkin } from "../android-teacher-offline/teacherBookMenuSkins.js";
import { hostedReviewClassroomBackground, hostedReviewToolbarItems } from "../android-teacher-offline/hostedReviewUiAssets.js";
import { HostedUltimateB2HotspotBuilder } from "./HostedUltimateB2HotspotBuilder.jsx";
import "./hostedUltimateB2BuilderReview.css";

const activityById = new Map((activitiesDocument.activities || []).map((activity) => [activity.stableActivityId, activity]));
const pageRows = ultimateB2StudentsBookPageUnits
  .filter((unit) => [1, 2].includes(Number(unit.number)))
  .flatMap((unit) => unit.pages.map((page) => ({ ...page, unitNumber: unit.number })));

function ReadOnlyBanner({ tool }) {
  return <div className="b2-hosted-review-banner" role="status"><strong>Read-only — persistence pending</strong><span>{tool} continues to use its Student-safe repository projection.</span></div>;
}

function ActivityReview() {
  const firstId = catalog.units?.[0]?.lessons?.[0]?.exercises?.[0]?.stableActivityId || "";
  const [selectedId, setSelectedId] = useState(firstId);
  const selected = activityById.get(selectedId);
  const groups = useMemo(() => (catalog.units || []).map((unit) => ({ ...unit, lessons: (unit.lessons || []).filter((lesson) => lesson.exercises?.length) })), []);
  return <main className="activity-builder-shell b2-hosted-activity-review">
    <header className="activity-builder-header"><div><span>Ultimate B2 · Activity Builder</span><h1>Student-safe activity review</h1><p>Navigate the checked-in Unit 1 and Unit 2 activity hierarchy.</p></div><ReadOnlyBanner tool="Activity Builder" /></header>
    <div className="b2-hosted-activity-layout"><aside className="activity-builder-sidebar" aria-label="Activity Builder book navigation">{groups.map((unit) => <section key={unit.id}><h2>{unit.title}</h2>{unit.lessons.map((lesson) => <div key={lesson.id}><h3>{lesson.title} · {lesson.pageLabel}</h3>{lesson.exercises.map((exercise) => <button type="button" key={exercise.stableActivityId} aria-current={selectedId === exercise.stableActivityId ? "true" : undefined} onClick={() => setSelectedId(exercise.stableActivityId)}>{exercise.title}</button>)}</div>)}</section>)}</aside><section className="b2-hosted-activity-preview" aria-label="Student-safe activity preview"><header><strong>{selected?.title}</strong><code>{selectedId}</code></header><NormalizedStudentsBookActivity key={selectedId} activityId={selectedId} mode={ACTIVITY_MODES.ANDROID_OFFLINE} /></section></div>
  </main>;
}

function UiControllerReview() {
  const menuSkin = resolveTeacherBookMenuSkin("ultimate-b2-students-book");
  const [pageId, setPageId] = useState(pageRows[0]?.id || "");
  const page = pageRows.find((candidate) => candidate.id === pageId) || pageRows[0];
  return <main className="b2-teacher-app-builder b2-hosted-ui-review">
    <header className="b2-teacher-app-header"><div><span>Ultimate B2 hosted review</span><h1>UI Controller</h1><p>Current backgrounds, book menu, navigation, toolbar, authored overrides, and page artwork.</p></div><ReadOnlyBanner tool="UI Controller" /></header>
    <div className="b2-hosted-ui-grid"><section><h2>Live B2 shell preview</h2><div className="b2-hosted-library-preview"><ClassroomToolsProvider><TeacherOfflineLibrary menuSkin={menuSkin} animationsActive={false} /></ClassroomToolsProvider></div></section><aside><h2>Page artwork</h2><label>Preview page / spread<select value={page.id} onChange={(event) => setPageId(event.target.value)}>{pageRows.map((item) => <option key={item.id} value={item.id}>Unit {item.unitNumber} · {item.label}</option>)}</select></label><img className="b2-hosted-ui-page" src={page.images[0]} alt={`Unit ${page.unitNumber}, ${page.label}`} /><h2>Toolbar assets</h2><div className="b2-hosted-toolbar-assets">{hostedReviewToolbarItems.map((item) => <figure key={item.id}><img src={item.normal} alt="" /><figcaption>{item.label}</figcaption></figure>)}</div><h2>Current background</h2><img className="b2-hosted-background-swatch" src={hostedReviewClassroomBackground} alt="Current classroom background" /></aside></div>
  </main>;
}

export function UltimateB2StudentsBookHostedWorkspace({ tool = "hotspots" }) {
  return <div className="ultimate-b2-builder-app" data-build-profile="book-builder-hosted-review" data-component-adapter="ultimate-b2-students-book">
    {tool === "hotspots" ? <HostedUltimateB2HotspotBuilder /> : null}
    {tool === "activities" ? <ActivityReview /> : null}
    {tool === "ui" ? <UiControllerReview /> : null}
  </div>;
}

export default UltimateB2StudentsBookHostedWorkspace;
