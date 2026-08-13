import { useMemo, useState } from "react";

import catalog from "../../../android-content-packs/ultimate-b2-students-book/catalog.json";
import { HostedViewerPreview } from "../book-builder/hosted/HostedViewerPreview.jsx";
import { HostedUltimateB2HotspotBuilder } from "./HostedUltimateB2HotspotBuilder.jsx";
import "./ultimateB2HotspotBuilder.css";
import "./hostedUltimateB2BuilderReview.css";

function ReadOnlyBanner({ tool }) {
  return <div className="b2-hosted-review-banner" role="status"><strong>Read-only — persistence pending</strong><span>{tool} uses the canonical hosted Viewer for interactive preview.</span></div>;
}

function ActivityReview() {
  const firstId = catalog.units?.[0]?.lessons?.[0]?.exercises?.[0]?.stableActivityId || "";
  const [selectedId, setSelectedId] = useState(firstId);
  const groups = useMemo(() => (catalog.units || []).map((unit) => ({
    ...unit,
    lessons: (unit.lessons || []).filter((lesson) => lesson.exercises?.length),
  })), []);
  const selected = groups
    .flatMap((unit) => unit.lessons)
    .flatMap((lesson) => lesson.exercises)
    .find((exercise) => exercise.stableActivityId === selectedId);

  return <main className="activity-builder-shell b2-hosted-activity-review">
    <header className="activity-builder-header"><div><span>Ultimate B2 - Activity Builder</span><h1>Canonical activity review</h1><p>Navigate the checked-in Unit 1 and Unit 2 activity hierarchy.</p></div><ReadOnlyBanner tool="Activity Builder" /></header>
    <div className="b2-hosted-activity-layout">
      <aside className="activity-builder-sidebar" aria-label="Activity Builder book navigation">{groups.map((unit) => <section key={unit.id}><h2>{unit.title}</h2>{unit.lessons.map((lesson) => <div key={lesson.id}><h3>{lesson.title} - {lesson.pageLabel}</h3>{lesson.exercises.map((exercise) => <button type="button" key={exercise.stableActivityId} aria-current={selectedId === exercise.stableActivityId ? "true" : undefined} onClick={() => setSelectedId(exercise.stableActivityId)}>{exercise.title}</button>)}</div>)}</section>)}</aside>
      <div className="b2-hosted-activity-preview">
        <div className="b2-hosted-preview-identity"><strong>{selected?.title}</strong><code>{selectedId}</code></div>
        <HostedViewerPreview
          intent={{ view: "activity", activityId: selectedId }}
          title={`Canonical Viewer activity preview: ${selected?.title || selectedId}`}
          description="This frame is the deployed Viewer runtime and opens the selected stable activity id."
        />
      </div>
    </div>
  </main>;
}

function UiControllerReview() {
  return <main className="b2-teacher-app-builder b2-hosted-ui-review">
    <header className="b2-teacher-app-header"><div><span>Ultimate B2 hosted review</span><h1>UI Controller</h1><p>Review the real Viewer library, shell, navigation, toolbar and current interface assets.</p></div><ReadOnlyBanner tool="UI Controller" /></header>
    <div className="b2-hosted-ui-preview">
      <HostedViewerPreview
        intent={{ view: "library" }}
        title="Canonical Viewer library and shell preview"
        description="Interact with the deployed Viewer directly; UI configuration remains read-only in this milestone."
      />
    </div>
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
