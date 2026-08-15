import { useEffect, useMemo, useState } from "react";

import catalog from "../../../android-content-packs/ultimate-b2-students-book/catalog.json";
import { nativeActivityKindLabels } from "../../data/native-activities/nativeActivityKinds.js";
import { isUltimateB2ConfigurableOpenResponse } from "../../data/ultimate-b2/openResponseActivityRegistry.js";
import { getBuilderContent } from "../book-builder/hosted/builderContentApi.js";
import { createNativeActivity } from "../book-builder/hosted/builderNativeActivityApi.js";
import { NativeActivityFoundationEditor } from "../book-builder/hosted/NativeActivityFoundationEditor.jsx";
import { HostedOpenResponseEditor } from "./HostedOpenResponseEditor.jsx";
import { HostedPublicationWorkspace } from "./HostedPublicationWorkspace.jsx";
import { HostedTeacherUiController } from "./HostedTeacherUiController.jsx";
import { HostedUltimateB2HotspotBuilder } from "./HostedUltimateB2HotspotBuilder.jsx";
import { UnifiedBuilderReview, useBuilderReview } from "./UnifiedBuilderReview.jsx";
import "./ultimateB2HotspotBuilder.css";
import "./hostedUltimateB2BuilderReview.css";

function ActivityReview({ nativeActivities }) {
  const { registerToolContext } = useBuilderReview();
  const nativePlacements = nativeActivities?.placements || [];
  const nativeKinds = nativeActivities?.kinds || [];
  const firstId = catalog.units?.[0]?.lessons?.[0]?.exercises?.[0]?.stableActivityId || "";
  const [selectedId, setSelectedId] = useState(firstId);
  const [dirty, setDirty] = useState(false);
  const [viewerRefresh, setViewerRefresh] = useState(0);
  const [nativeIndex, setNativeIndex] = useState({ activities: [] });
  const [addOpen, setAddOpen] = useState(false);
  const [createState, setCreateState] = useState({ kind: nativeKinds[0] || "", pageId: nativePlacements[0]?.pageId || "", title: "", saving: false, error: "" });
  const groups = useMemo(() => (catalog.units || []).map((unit) => ({ ...unit, lessons: (unit.lessons || []).filter((lesson) => lesson.exercises?.length) })), []);
  const selected = groups.flatMap((unit) => unit.lessons).flatMap((lesson) => lesson.exercises).find((exercise) => exercise.stableActivityId === selectedId);
  const nativeSelected = nativeIndex.activities.find((activity) => activity.activityId === selectedId) || null;
  const nativeSelectedPlacement = nativeSelected ? nativePlacements.find((page) => page.pageId === nativeSelected.placement.pageId) : null;
  const supported = !nativeSelected && isUltimateB2ConfigurableOpenResponse(selectedId);
  const placementFor = (pageId) => nativePlacements.find((page) => page.pageId === pageId);
  useEffect(() => {
    registerToolContext("activities", {
      view: "activity",
      activityId: selectedId,
      ...(nativeSelectedPlacement ? { pageId: nativeSelectedPlacement.pageId, unitNumber: nativeSelectedPlacement.unitNumber } : {}),
      dirty,
      refreshKey: viewerRefresh,
      release: null,
    });
  }, [dirty, nativeSelectedPlacement, registerToolContext, selectedId, viewerRefresh]);
  const loadNativeIndex = async (signal) => {
    const value = await getBuilderContent({ bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", resource: "native-activity-index", documentKey: "" }, { signal });
    setNativeIndex(value.document);
    return value.document;
  };
  useEffect(() => { const controller = new AbortController(); loadNativeIndex(controller.signal).catch(() => {}); return () => controller.abort(); }, []);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    globalThis.addEventListener("beforeunload", warn);
    return () => globalThis.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const selectActivity = (nextId) => {
    if (nextId === selectedId) return;
    if (dirty && !globalThis.confirm("Discard unsaved activity changes and open another activity?")) return;
    setDirty(false); setSelectedId(nextId);
  };
  const submitNativeActivity = async (event) => {
    event.preventDefault(); setCreateState((current) => ({ ...current, saving: true, error: "" }));
    try {
      const created = await createNativeActivity({ bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", kind: createState.kind, pageId: createState.pageId, title: createState.title });
      await loadNativeIndex(); setSelectedId(created.activityId); setAddOpen(false); setCreateState((current) => ({ ...current, title: "", saving: false, error: "" }));
    } catch (error) { setCreateState((current) => ({ ...current, saving: false, error: error.message })); }
  };

  return <main className="activity-builder-shell b2-hosted-activity-review">
    <header className="activity-builder-header"><div><span>Ultimate B2 - Activity Builder</span><h1>Hosted activity authoring</h1><p>Edit existing supported content or create database-backed native drafts.</p></div><div><button className="hosted-builder-action" type="button" onClick={() => setAddOpen(true)}>Add Activity</button><div className="b2-hosted-review-banner" role="status"><strong>{nativeSelected ? `${nativeActivityKindLabels[nativeSelected.kind]} · Native draft` : supported ? "Open Response · Editable" : "Unsupported type · Read-only"}</strong><span>{nativeSelected ? "Referenced, publish-ready native drafts are included in Publication v2." : "Teacher answer content remains separately protected."}</span></div></div></header>
    {addOpen ? <form className="native-activity-create" onSubmit={submitNativeActivity}><header><strong>Add native activity</strong><button type="button" onClick={() => setAddOpen(false)}>Cancel</button></header><label><span>Activity kind</span><select value={createState.kind} onChange={(event) => setCreateState((current) => ({ ...current, kind: event.target.value }))}>{nativeKinds.map((kind) => <option key={kind} value={kind}>{nativeActivityKindLabels[kind]}</option>)}</select></label><label><span>Placement</span><select value={createState.pageId} onChange={(event) => setCreateState((current) => ({ ...current, pageId: event.target.value }))}>{nativePlacements.map((page) => <option key={page.pageId} value={page.pageId}>{`Unit ${page.unitNumber} · ${page.pageLabel} · ${page.sectionTitle}`}</option>)}</select></label><label><span>Initial title (optional)</span><input value={createState.title} maxLength={300} onChange={(event) => setCreateState((current) => ({ ...current, title: event.target.value }))} placeholder={`New ${nativeActivityKindLabels[createState.kind] || "activity"}`} /></label>{createState.error ? <p role="alert">{createState.error}</p> : null}<button type="submit" disabled={createState.saving || !createState.kind || !createState.pageId}>{createState.saving ? "Creating…" : "Create native draft"}</button></form> : null}
    <div className="b2-hosted-activity-layout">
      <aside className="activity-builder-sidebar" aria-label="Activity Builder book navigation">{nativeIndex.activities.length ? <section className="native-activity-navigation"><h2>Native drafts</h2>{nativeIndex.activities.map((activity) => { const placement = placementFor(activity.placement.pageId); return <button type="button" key={activity.activityId} aria-current={selectedId === activity.activityId ? "true" : undefined} onClick={() => selectActivity(activity.activityId)}>{activity.activityId}<small>{nativeActivityKindLabels[activity.kind]} · {placement?.pageLabel || activity.placement.pageId}</small></button>; })}</section> : null}{groups.map((unit) => <section key={unit.id}><h2>{unit.title}</h2>{unit.lessons.map((lesson) => <div key={lesson.id}><h3>{lesson.title} - {lesson.pageLabel}</h3>{lesson.exercises.map((exercise) => <button type="button" key={exercise.stableActivityId} aria-current={selectedId === exercise.stableActivityId ? "true" : undefined} onClick={() => selectActivity(exercise.stableActivityId)}>{exercise.title}<small>{isUltimateB2ConfigurableOpenResponse(exercise.stableActivityId) ? "Open Response · Editable" : "Read-only"}</small></button>)}</div>)}</section>)}</aside>
      <div className="b2-hosted-activity-preview">
        <div className="b2-hosted-preview-identity"><strong>{nativeSelected ? nativeActivityKindLabels[nativeSelected.kind] : selected?.title}</strong><code>{selectedId}</code></div>
        {nativeSelected ? <NativeActivityFoundationEditor key={selectedId} bookSlug="ultimate-b2" componentSlug="ultimate-b2-students-book" activityId={selectedId} kind={nativeSelected.kind} placementLabel={placementFor(nativeSelected.placement.pageId)?.pageLabel || nativeSelected.placement.pageId} onDirtyChange={setDirty} onSaved={() => setViewerRefresh((value) => value + 1)} /> : supported ? <HostedOpenResponseEditor key={selectedId} activityId={selectedId} onDirtyChange={setDirty} onSaved={() => setViewerRefresh((value) => value + 1)} /> : <section className="b2-hosted-unsupported-activity" role="status"><strong>Read-only canonical activity</strong><p>This activity family has no hosted mutation capability. Use Review for the deployed Viewer runtime.</p></section>}
      </div>
    </div>
  </main>;
}

export function UltimateB2StudentsBookHostedWorkspace({ tool = "hotspots", nativeActivities = null }) {
  return <div className="ultimate-b2-builder-app" data-build-profile="book-builder-hosted-review" data-component-adapter="ultimate-b2-students-book">
    <UnifiedBuilderReview tool={tool} pages={nativeActivities?.placements || []}>
      {tool === "hotspots" ? <HostedUltimateB2HotspotBuilder /> : null}
      {tool === "activities" ? <ActivityReview nativeActivities={nativeActivities} /> : null}
      {tool === "ui" ? <HostedTeacherUiController /> : null}
      {tool === "publication" ? <HostedPublicationWorkspace /> : null}
    </UnifiedBuilderReview>
  </div>;
}

export default UltimateB2StudentsBookHostedWorkspace;
