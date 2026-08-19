import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Layers3, RefreshCw, Save, Scan, Trash2, ZoomIn, ZoomOut } from "lucide-react";

import catalog from "../../../android-content-packs/ultimate-b2-students-book/catalog.json";
import { EditableHotspotLayer } from "../../components/lms/books/BookPageImagePanel.jsx";
import { ultimateB2StudentsBookPageUnits } from "../../data/ultimate-b2/ultimateB2PageUnits.js";
import {
  BuilderContentApiError,
  getBuilderContent,
  newBuilderClientMutationId,
  saveBuilderContent,
} from "../book-builder/hosted/builderContentApi.js";
import { getNativeActivityCatalog } from "../book-builder/hosted/builderNativeActivityApi.js";
import { useBuilderReview } from "./UnifiedBuilderReview.jsx";

const contentIdentity = Object.freeze({
  bookSlug: "ultimate-b2",
  componentSlug: "ultimate-b2-students-book",
  resource: "hotspots",
});

const pageRows = ultimateB2StudentsBookPageUnits
  .filter((unit) => [1, 2].includes(Number(unit.number)))
  .flatMap((unit) => unit.pages.map((page) => ({ ...page, unitNumber: Number(unit.number) })));

const legacyActivities = (catalog.units || []).flatMap((unit) => (unit.lessons || []).flatMap((lesson) => (
  (lesson.exercises || []).map((activity) => ({
    activityKey: activity.stableActivityId,
    title: activity.title,
    unitNumber: Number(activity.unitNumber),
    pageSpread: String(activity.pageSpread || activity.pageNumber),
    pageLabel: activity.pageLabel,
  }))
)));

function pageLabel(page) {
  return `${page.pageNumbers?.length > 1 ? "Pages" : "Page"} ${page.spreadNumber} — ${page.title}`;
}

function newHotspotId() {
  if (!globalThis.crypto?.randomUUID) throw new Error("Secure hotspot identity is unavailable in this browser.");
  return `hotspot-${globalThis.crypto.randomUUID()}`;
}

function isTextEditingTarget(target) {
  return target instanceof HTMLElement && (
    target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)
  );
}

export function HostedUltimateB2HotspotBuilder() {
  const { registerToolContext, rememberPage } = useBuilderReview();
  const [manifest, setManifest] = useState(null);
  const [revision, setRevision] = useState(0);
  const [source, setSource] = useState("repository");
  const [unitNumber, setUnitNumber] = useState(1);
  const unitPages = useMemo(() => pageRows.filter((page) => page.unitNumber === unitNumber), [unitNumber]);
  const [pageId, setPageId] = useState(pageRows[0]?.id || "");
  const [selectedHotspotId, setSelectedHotspotId] = useState(null);
  const [creatingHotspot, setCreatingHotspot] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("Loading");
  const [error, setError] = useState("");
  const [conflictRevision, setConflictRevision] = useState(null);
  const [fitToScreen, setFitToScreen] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [customLabels, setCustomLabels] = useState(() => new Set());
  const [viewerRefreshKey, setViewerRefreshKey] = useState(0);
  const [nativeActivities, setNativeActivities] = useState([]);
  const mutationId = useRef(null);
  const page = pageRows.find((candidate) => candidate.id === pageId) || unitPages[0];
  useEffect(() => {
    if (!page) return;
    rememberPage(page.id);
    registerToolContext("hotspots", {
      view: "page",
      pageId: page.id,
      unitNumber: page.unitNumber,
      dirty,
      refreshKey: viewerRefreshKey,
      release: null,
    });
  }, [dirty, page, registerToolContext, rememberPage, viewerRefreshKey]);
  const activities = useMemo(() => [...legacyActivities, ...nativeActivities.map((activity) => {
    const activityPage = pageRows.find((row) => row.id === activity.placement.pageId);
    return {
      activityKey: activity.activityId,
      title: activity.title,
      unitNumber: activityPage?.unitNumber || 0,
      pageSpread: String(activityPage?.spreadNumber || ""),
      pageLabel: activityPage ? pageLabel(activityPage) : activity.placement.pageId,
      native: true,
      kind: activity.kind,
      ready: activity.ready,
      issues: activity.issues,
    };
  })], [nativeActivities]);
  const hotspots = manifest?.pages?.[page?.id] || [];
  const selectedHotspot = hotspots.find((hotspot) => hotspot.id === selectedHotspotId) || null;
  const currentPageActivities = activities.filter((activity) => (
    activity.unitNumber === page?.unitNumber && activity.pageSpread === String(page?.spreadNumber)
  ));
  const otherActivities = activities.filter((activity) => !currentPageActivities.includes(activity));

  async function loadLatest({ signal } = {}) {
    setStatus("Loading");
    setError("");
    const payload = await getBuilderContent(contentIdentity, { signal });
    setManifest(payload.document);
    setRevision(payload.revision);
    setSource(payload.source);
    setDirty(false);
    setConflictRevision(null);
    setSelectedHotspotId(null);
    mutationId.current = null;
    setStatus("Ready");
  }

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      loadLatest({ signal: controller.signal }),
      getNativeActivityCatalog(contentIdentity, { signal: controller.signal }).then(setNativeActivities),
    ]).catch((requestError) => {
      if (requestError.name === "AbortError") return;
      setError(requestError.message);
      setStatus("Load failed");
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const beforeUnload = (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  useEffect(() => {
    const deleteWithKeyboard = (event) => {
      if (event.key === "Escape" && !isTextEditingTarget(event.target)) {
        setCreatingHotspot(false); setSelectedHotspotId(null); return;
      }
      if (!selectedHotspotId || isTextEditingTarget(event.target)) return;
      if (!["Delete", "Backspace"].includes(event.key)) return;
      event.preventDefault();
      updatePageHotspots(hotspots.filter((hotspot) => hotspot.id !== selectedHotspotId));
      setSelectedHotspotId(null);
    };
    window.addEventListener("keydown", deleteWithKeyboard);
    return () => window.removeEventListener("keydown", deleteWithKeyboard);
  }, [hotspots, selectedHotspotId]);

  useEffect(() => {
    if (page && page.unitNumber !== unitNumber) setPageId(unitPages[0]?.id || "");
    setSelectedHotspotId(null);
    setNaturalSize({ width: 0, height: 0 });
  }, [pageId, unitNumber]);

  function markDirty() {
    mutationId.current = null;
    setDirty(true);
    setConflictRevision(null);
    setStatus("Unsaved changes");
    setError("");
  }

  function updatePageHotspots(nextHotspots) {
    setManifest((current) => ({ ...current, pages: { ...current.pages, [page.id]: nextHotspots } }));
    markDirty();
  }

  function updateSelectedHotspot(patch) {
    updatePageHotspots(hotspots.map((hotspot) => hotspot.id === selectedHotspotId ? { ...hotspot, ...patch } : hotspot));
  }

  function updateSelectedGeometry(key, rawValue) {
    if (!selectedHotspot) return;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;
    const next = { ...selectedHotspot };
    next[key] = key === "left" ? Math.min(Math.max(value, 0), 100 - next.width)
      : key === "top" ? Math.min(Math.max(value, 0), 100 - next.height)
        : key === "width" ? Math.min(Math.max(value, 3), 100 - next.left)
          : Math.min(Math.max(value, 3), 100 - next.top);
    updateSelectedHotspot({ [key]: Math.round(next[key] * 1000) / 1000 });
  }

  function deleteSelectedHotspot() {
    if (!selectedHotspotId) return;
    updatePageHotspots(hotspots.filter((hotspot) => hotspot.id !== selectedHotspotId));
    setSelectedHotspotId(null);
  }

  function selectActivity(activityKey) {
    const activity = activities.find((candidate) => candidate.activityKey === activityKey);
    const previous = activities.find((candidate) => candidate.activityKey === selectedHotspot.activityKey);
    const shouldFillLabel = !customLabels.has(selectedHotspot.id)
      && (!selectedHotspot.label || selectedHotspot.label === "Clickable area" || selectedHotspot.label === previous?.title);
    updateSelectedHotspot({
      activityKey,
      actionType: "normalized_activity",
      ...(shouldFillLabel && activity ? { label: activity.title } : {}),
    });
  }

  async function save() {
    if (!dirty || status === "Saving") return;
    setStatus("Saving");
    setError("");
    mutationId.current ||= newBuilderClientMutationId();
    try {
      const payload = await saveBuilderContent({
        ...contentIdentity,
        expectedRevision: revision,
        clientMutationId: mutationId.current,
        document: manifest,
      });
      if (payload.currentRevision > payload.revision) {
        setConflictRevision(payload.currentRevision);
        setStatus("Conflict");
        return;
      }
      setManifest(payload.document);
      setRevision(payload.revision);
      setSource(payload.source);
      setDirty(false);
      mutationId.current = null;
      setStatus("Saved");
      setViewerRefreshKey((value) => value + 1);
    } catch (requestError) {
      if (requestError instanceof BuilderContentApiError && requestError.status === 409 && requestError.payload.error === "revision_conflict") {
        setConflictRevision(requestError.payload.currentRevision);
        setStatus("Conflict");
        setError("Another developer saved a newer revision. Your unsaved changes are still here.");
      } else {
        setStatus("Save failed");
        setError(requestError.message);
      }
    }
  }

  if (!page || !manifest) return <main className="hotspot-builder b2-hosted-hotspot-editor"><header className="builder-header"><div><span>Ultimate B2 · Hotspot Builder</span><h1>Students Book hotspot builder</h1></div><div className="builder-save-state" role="status"><strong>{status}</strong>{error ? <small>{error}</small> : null}</div></header></main>;

  return <main className="hotspot-builder b2-hosted-hotspot-editor">
    <header className="builder-header">
      <div><span>Ultimate B2 · Hotspot Builder · Editable</span><h1>Students Book hotspot builder</h1><small>Revision {revision} · {source === "repository" ? "repository baseline" : "hosted authoring state"}</small></div>
      <div className="builder-save-state" role="status" data-dirty={dirty || undefined} data-conflict={status === "Conflict" || undefined}>
        <strong>{status}</strong>
        {error ? <small>{error}</small> : null}
        {status === "Conflict" ? <button type="button" onClick={() => loadLatest().catch((requestError) => { setError(requestError.message); setStatus("Load failed"); })}><RefreshCw size={17} /> Reload latest{conflictRevision !== null ? ` (r${conflictRevision})` : ""}</button> : null}
        <button type="button" onClick={save} disabled={!dirty || status === "Saving"}><Save size={17} /> Save</button>
      </div>
    </header>

    <section className="builder-controls" aria-label="Book and page controls">
      <label>Book<input readOnly value="Ultimate B2" /></label>
      <label>Component<input readOnly value="Students Book" /></label>
      <label>Unit<select value={unitNumber} onChange={(event) => { const next = Number(event.target.value); setUnitNumber(next); setPageId(pageRows.find((candidate) => candidate.unitNumber === next)?.id || ""); }}><option value="1">Unit 1</option><option value="2">Unit 2</option></select></label>
      <label>Page / Spread<select value={page.id} onChange={(event) => setPageId(event.target.value)}>{unitPages.map((candidate) => <option key={candidate.id} value={candidate.id}>{pageLabel(candidate)}</option>)}</select></label>
      <div className="builder-zoom" aria-label="Page zoom controls">
        <button type="button" onClick={() => { setFitToScreen(false); setZoom((value) => Math.max(.6, value - .2)); }} aria-label="Zoom out"><ZoomOut size={18} /></button>
        <button type="button" className={fitToScreen ? "selected" : ""} onClick={() => { setFitToScreen(true); setZoom(1); }}><Scan size={18} /> Fit</button>
        <button type="button" onClick={() => { setFitToScreen(false); setZoom((value) => Math.min(2.4, value + .2)); }} aria-label="Zoom in"><ZoomIn size={18} /></button>
        <output>{Math.round(zoom * 100)}%</output>
      </div>
    </section>

    <section className="builder-workspace studio-hotspot-workspace">
      <aside className="builder-object-navigator" aria-label="Hotspots on this page">
        <header><div><Layers3 aria-hidden="true" /><div><h2>Hotspots</h2><p>{hotspots.length} on this page</p></div></div></header>
        <button className="builder-add-hotspot" type="button" aria-pressed={creatingHotspot} onClick={() => { setCreatingHotspot(true); setSelectedHotspotId(null); }}><Crosshair aria-hidden="true" />Add hotspot</button>
        <div className="builder-hotspot-list">{hotspots.map((hotspot, index) => <button type="button" key={hotspot.id} aria-current={selectedHotspotId === hotspot.id ? "true" : undefined} onClick={() => { setCreatingHotspot(false); setSelectedHotspotId(hotspot.id); }}><span>{index + 1}</span><span><strong>{hotspot.label || `Hotspot ${index + 1}`}</strong><small>{hotspot.activityKey ? "Activity assigned" : "Needs an action"}</small></span></button>)}</div>
        {!hotspots.length ? <div className="builder-hotspot-empty"><Crosshair aria-hidden="true" /><strong>No hotspots yet</strong><p>Add a hotspot, then drag its rectangle on the page.</p></div> : null}
        <p className="builder-keyboard-help">Arrow keys nudge · Shift moves farther · Delete removes · Escape clears</p>
      </aside>
      <div className="builder-canvas-scroll"><div className={`builder-page-surface ${fitToScreen ? "fit" : "zoomed"}`} style={{ width: naturalSize.width ? `${naturalSize.width * (fitToScreen ? 1 : zoom)}px` : "100%", maxWidth: fitToScreen ? "100%" : "none" }}>
        <img src={page.images[0]} alt={`${pageLabel(page)} Students Book page`} draggable="false" onLoad={(event) => setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} />
        <EditableHotspotLayer pageId={page.id} areas={hotspots} editing creating={creatingHotspot} selectedAreaId={selectedHotspotId} onSelectArea={(id) => { setSelectedHotspotId(id); if (id) setCreatingHotspot(false); }} onChangeAreas={updatePageHotspots} createArea={(geometry) => ({ id: newHotspotId(), unitNumber: page.unitNumber, pageId: page.id, pageNumber: page.pageNumber, ...geometry, label: "Clickable area", actionType: "normalized_activity", activityKey: "" })} />
      </div></div>
      <aside className="builder-properties">
        <h2>Hotspot properties</h2>
        {!selectedHotspot ? <div className="builder-inspector-empty"><Crosshair aria-hidden="true" /><strong>{creatingHotspot ? "Draw on the page" : "Select a hotspot"}</strong><p>{creatingHotspot ? "Drag on the page to create a hotspot. Escape cancels create mode." : "Choose a hotspot in the navigator or on the page to edit its action and geometry."}</p></div> : <>
          <label>Activity<select value={selectedHotspot.activityKey || ""} onChange={(event) => selectActivity(event.target.value)}><option value="">Choose an implemented activity…</option>{currentPageActivities.length ? <optgroup label={`Current ${pageLabel(page)}`}>{currentPageActivities.map((activity) => <option key={activity.activityKey} value={activity.activityKey}>{activity.native ? `${activity.ready ? "Ready" : "Incomplete"} · ${activity.kind} · ` : ""}{activity.title}</option>)}</optgroup> : null}{[1, 2].map((unit) => <optgroup key={unit} label={`Unit ${unit}`}>{otherActivities.filter((activity) => activity.unitNumber === unit).map((activity) => <option key={activity.activityKey} value={activity.activityKey}>{activity.pageLabel} — {activity.native ? `${activity.ready ? "Ready" : "Incomplete"} · ${activity.kind} · ` : ""}{activity.title}</option>)}</optgroup>)}</select></label>
          <label>Label<input maxLength="200" value={selectedHotspot.label || ""} onChange={(event) => { setCustomLabels((current) => new Set(current).add(selectedHotspot.id)); updateSelectedHotspot({ label: event.target.value }); }} /></label>
          <div className="builder-stable-id"><span>Stable normalized activity id</span><code>{selectedHotspot.activityKey || "Not assigned"}</code></div>
          {activities.find((activity) => activity.activityKey === selectedHotspot.activityKey)?.native ? <p role="status">Native {activities.find((activity) => activity.activityKey === selectedHotspot.activityKey).kind} · {activities.find((activity) => activity.activityKey === selectedHotspot.activityKey).ready ? "Ready to publish" : "Incomplete draft — Prepare Preview will explain what is missing"}</p> : null}
          <section className="builder-transform-fields"><h3>Transform</h3><div>{["left", "top", "width", "height"].map((key) => <label key={key}><span>{key[0].toUpperCase() + key.slice(1)} (%)</span><input type="number" min={["width", "height"].includes(key) ? 3 : 0} max="100" step="0.1" value={Number(selectedHotspot[key].toFixed(3))} onChange={(event) => updateSelectedGeometry(key, event.target.value)} /></label>)}</div><p>Resize from any corner. Geometry remains in percentages at every zoom level.</p></section>
          <button className="builder-delete" type="button" onClick={deleteSelectedHotspot}><Trash2 size={17} /> Delete hotspot</button><small>Delete and Backspace also remove the selected hotspot when you are not typing.</small>
        </>}
      </aside>
    </section>
  </main>;
}

export default HostedUltimateB2HotspotBuilder;
