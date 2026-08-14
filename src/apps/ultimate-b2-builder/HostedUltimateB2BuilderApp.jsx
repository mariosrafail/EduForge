import { useEffect, useMemo, useState } from "react";

import catalog from "../../../android-content-packs/ultimate-b2-students-book/catalog.json";
import { isUltimateB2ConfigurableOpenResponse } from "../../data/ultimate-b2/openResponseActivityRegistry.js";
import { HostedViewerPreview } from "../book-builder/hosted/HostedViewerPreview.jsx";
import { HostedOpenResponseEditor } from "./HostedOpenResponseEditor.jsx";
import { HostedUltimateB2HotspotBuilder } from "./HostedUltimateB2HotspotBuilder.jsx";
import { HostedTeacherUiController } from "./HostedTeacherUiController.jsx";
import "./ultimateB2HotspotBuilder.css";
import "./hostedUltimateB2BuilderReview.css";

function ActivityReview() {
  const firstId = catalog.units?.[0]?.lessons?.[0]?.exercises?.[0]?.stableActivityId || "";
  const [selectedId, setSelectedId] = useState(firstId);
  const [dirty, setDirty] = useState(false);
  const [viewerRefresh, setViewerRefresh] = useState(0);
  const groups = useMemo(() => (catalog.units || []).map((unit) => ({
    ...unit,
    lessons: (unit.lessons || []).filter((lesson) => lesson.exercises?.length),
  })), []);
  const selected = groups
    .flatMap((unit) => unit.lessons)
    .flatMap((lesson) => lesson.exercises)
    .find((exercise) => exercise.stableActivityId === selectedId);
  const supported = isUltimateB2ConfigurableOpenResponse(selectedId);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    globalThis.addEventListener("beforeunload", warn);
    return () => globalThis.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const selectActivity = (nextId) => {
    if (nextId === selectedId) return;
    if (dirty && !globalThis.confirm("Discard unsaved Open Response changes and open another activity?")) return;
    setDirty(false);
    setSelectedId(nextId);
  };

  return <main className="activity-builder-shell b2-hosted-activity-review">
    <header className="activity-builder-header"><div><span>Ultimate B2 - Activity Builder</span><h1>Hosted activity authoring</h1><p>Edit supported Open Response public fields and review every activity in the canonical Viewer.</p></div><div className="b2-hosted-review-banner" role="status"><strong>{supported ? "Open Response · Editable" : "Unsupported type · Read-only"}</strong><span>Teacher answer content is always canonical and read-only.</span></div></header>
    <div className="b2-hosted-activity-layout">
      <aside className="activity-builder-sidebar" aria-label="Activity Builder book navigation">{groups.map((unit) => <section key={unit.id}><h2>{unit.title}</h2>{unit.lessons.map((lesson) => <div key={lesson.id}><h3>{lesson.title} - {lesson.pageLabel}</h3>{lesson.exercises.map((exercise) => <button type="button" key={exercise.stableActivityId} aria-current={selectedId === exercise.stableActivityId ? "true" : undefined} onClick={() => selectActivity(exercise.stableActivityId)}>{exercise.title}<small>{isUltimateB2ConfigurableOpenResponse(exercise.stableActivityId) ? "Open Response · Editable" : "Read-only"}</small></button>)}</div>)}</section>)}</aside>
      <div className="b2-hosted-activity-preview">
        <div className="b2-hosted-preview-identity"><strong>{selected?.title}</strong><code>{selectedId}</code></div>
        {supported
          ? <HostedOpenResponseEditor key={selectedId} activityId={selectedId} onDirtyChange={setDirty} onSaved={() => setViewerRefresh((value) => value + 1)} />
          : <section className="b2-hosted-unsupported-activity" role="status"><strong>Read-only canonical activity</strong><p>This activity family has no hosted mutation capability. It remains available for Viewer review only.</p></section>}
        <HostedViewerPreview
          intent={{ view: "activity", activityId: selectedId }}
          refreshKey={viewerRefresh}
          title={`Canonical Viewer activity preview: ${selected?.title || selectedId}`}
          description="This frame is the deployed Viewer runtime and opens the selected stable activity id."
        />
      </div>
    </div>
  </main>;
}

export function UltimateB2StudentsBookHostedWorkspace({ tool = "hotspots" }) {
  return <div className="ultimate-b2-builder-app" data-build-profile="book-builder-hosted-review" data-component-adapter="ultimate-b2-students-book">
    {tool === "hotspots" ? <HostedUltimateB2HotspotBuilder /> : null}
    {tool === "activities" ? <ActivityReview /> : null}
    {tool === "ui" ? <HostedTeacherUiController /> : null}
  </div>;
}

export default UltimateB2StudentsBookHostedWorkspace;
