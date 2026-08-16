import { useEffect, useMemo, useRef, useState } from "react";
import { Boxes, ChevronDown, ChevronRight, FileImage, ListChecks, MessageSquareText, Plus, Search } from "lucide-react";

import catalog from "../../../android-content-packs/ultimate-b2-students-book/catalog.json";
import { nativeActivityKindLabels } from "../../data/native-activities/nativeActivityKinds.js";
import { isUltimateB2ConfigurableOpenResponse } from "../../data/ultimate-b2/openResponseActivityRegistry.js";
import { BuilderModal } from "../book-builder/hosted/BuilderModal.jsx";
import { createNativeActivity, getNativeActivityCatalog } from "../book-builder/hosted/builderNativeActivityApi.js";
import { NativeActivityFoundationEditor } from "../book-builder/hosted/NativeActivityFoundationEditor.jsx";
import { activityBuilderTypeOptions, buildActivityBuilderNavigation, filterActivityBuilderNavigation, findActivityBuilderItem } from "./activityBuilderNavigation.js";
import { HostedOpenResponseEditor } from "./HostedOpenResponseEditor.jsx";
import { HostedPublicationWorkspace } from "./HostedPublicationWorkspace.jsx";
import { HostedTeacherUiController } from "./HostedTeacherUiController.jsx";
import { HostedUltimateB2HotspotBuilder } from "./HostedUltimateB2HotspotBuilder.jsx";
import { UnifiedBuilderReview, useBuilderReview } from "./UnifiedBuilderReview.jsx";
import "./ultimateB2HotspotBuilder.css";
import "./hostedUltimateB2BuilderReview.css";
import "./hostedUltimateB2BuilderModern.css";

const kindIcons = { "open-response": MessageSquareText, image: FileImage, "single-choice": ListChecks };

function ActivityReview({ nativeActivities }) {
  const { registerToolContext } = useBuilderReview();
  const nativePlacements = nativeActivities?.placements || [];
  const nativeKinds = nativeActivities?.kinds || [];
  const firstId = catalog.units?.[0]?.lessons?.[0]?.exercises?.[0]?.stableActivityId || "";
  const [selectedId, setSelectedId] = useState(firstId);
  const [dirty, setDirty] = useState(false);
  const [viewerRefresh, setViewerRefresh] = useState(0);
  const [nativeCatalog, setNativeCatalog] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [switchTarget, setSwitchTarget] = useState("");
  const [query, setQuery] = useState("");
  const [access, setAccess] = useState("all");
  const [type, setType] = useState("all");
  const [expandedUnits, setExpandedUnits] = useState(() => new Set([catalog.units?.[0]?.id]));
  const [expandedPages, setExpandedPages] = useState(() => new Set([nativePlacements[0]?.pageId || catalog.units?.[0]?.lessons?.[0]?.id]));
  const [createState, setCreateState] = useState({ kind: nativeKinds[0] || "", pageId: nativePlacements[0]?.pageId || "", title: "", saving: false, error: "" });
  const addTriggerRef = useRef(null);
  const model = useMemo(() => buildActivityBuilderNavigation({ units: catalog.units || [], nativeActivities: nativeCatalog, placements: nativePlacements, isEditable: isUltimateB2ConfigurableOpenResponse }), [nativeCatalog, nativePlacements]);
  const filtered = useMemo(() => filterActivityBuilderNavigation(model, { query, access, type }), [access, model, query, type]);
  const selection = findActivityBuilderItem(model, selectedId);
  const filteredSelection = findActivityBuilderItem(filtered, selectedId);
  const selected = selection?.item && !selection.item.native ? selection.item : null;
  const nativeSelected = selection?.item?.native ? selection.item : null;
  const nativeSelectedPlacement = nativeSelected ? nativePlacements.find((page) => page.pageId === nativeSelected.placement?.pageId) : null;
  const supported = !nativeSelected && isUltimateB2ConfigurableOpenResponse(selectedId);
  const placementFor = (pageId) => nativePlacements.find((page) => page.pageId === pageId);

  useEffect(() => {
    registerToolContext("activities", { view: "activity", activityId: selectedId, ...(nativeSelectedPlacement ? { pageId: nativeSelectedPlacement.pageId, unitNumber: nativeSelectedPlacement.unitNumber } : {}), dirty, refreshKey: viewerRefresh, release: null });
  }, [dirty, nativeSelectedPlacement, registerToolContext, selectedId, viewerRefresh]);
  const loadNativeCatalog = async (signal) => {
    const value = await getNativeActivityCatalog({ bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book" }, { signal });
    setNativeCatalog(value); return value;
  };
  useEffect(() => { const controller = new AbortController(); loadNativeCatalog(controller.signal).catch(() => {}); return () => controller.abort(); }, []);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    globalThis.addEventListener("beforeunload", warn);
    return () => globalThis.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const selectActivity = (nextId) => {
    if (nextId === selectedId) return;
    if (dirty) { setSwitchTarget(nextId); return; }
    setDirty(false); setSelectedId(nextId);
  };
  const openCreate = () => {
    const currentPageId = selection?.page?.id;
    setCreateState((current) => ({ ...current, pageId: nativePlacements.some((page) => page.pageId === currentPageId) ? currentPageId : current.pageId, error: "" }));
    setAddOpen(true);
  };
  const submitNativeActivity = async (event) => {
    event.preventDefault(); setCreateState((current) => ({ ...current, saving: true, error: "" }));
    try {
      const created = await createNativeActivity({ bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", kind: createState.kind, pageId: createState.pageId, title: createState.title });
      await loadNativeCatalog();
      const createdPlacement = placementFor(createState.pageId);
      const createdUnit = (catalog.units || []).find((unit) => unit.unitNumber === createdPlacement?.unitNumber);
      setExpandedPages((current) => new Set(current).add(createState.pageId));
      if (createdUnit) setExpandedUnits((current) => new Set(current).add(createdUnit.id));
      setSelectedId(created.activityId); setQuery(""); setAccess("all"); setType("all"); setAddOpen(false);
      setCreateState((current) => ({ ...current, title: "", saving: false, error: "" }));
    } catch (error) { setCreateState((current) => ({ ...current, saving: false, error: error.message })); }
  };
  const toggleSet = (setter, id) => setter((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const typeOptions = activityBuilderTypeOptions(model);

  return <main className="activity-builder-shell b2-hosted-activity-review">
    <header className="activity-builder-header"><div><span>Ultimate B2 · Activity Builder</span><h1>Activity authoring</h1><p>Find, edit, and preview activities in their book placement.</p></div><div><button ref={addTriggerRef} className="hosted-builder-action" type="button" onClick={openCreate}><Plus aria-hidden="true" /> Add Activity</button><div className="b2-hosted-review-banner" role="status"><strong>{nativeSelected ? `${nativeActivityKindLabels[nativeSelected.kind]} · Native draft` : supported ? "Open Response · Editable" : "Canonical activity · Read-only"}</strong><span>{nativeSelected ? nativeSelected.ready ? "Content complete" : "Content incomplete" : "Teacher answer content remains separately protected."}</span></div></div></header>

    <BuilderModal open={addOpen} title="Add activity" description="Choose an activity type and its location in the Students Book." busy={createState.saving} onClose={() => setAddOpen(false)} returnFocusRef={addTriggerRef}><form className="native-activity-create" onSubmit={submitNativeActivity}>
      <fieldset><legend>Activity type</legend><div className="native-activity-kind-cards">{nativeKinds.map((kind) => { const Icon = kindIcons[kind] || Boxes; return <label key={kind} data-selected={createState.kind === kind || undefined}><input type="radio" name="activity-kind" value={kind} checked={createState.kind === kind} onChange={() => setCreateState((current) => ({ ...current, kind }))} /><Icon aria-hidden="true" /><strong>{nativeActivityKindLabels[kind]}</strong><span>{kind === "open-response" ? "Learners write a free response for Teacher review." : kind === "image" ? "Present an authored image with optional guidance." : "Learners choose one answer; the key stays Teacher-only."}</span></label>; })}</div></fieldset>
      <label><span>Placement</span><select autoFocus value={createState.pageId} onChange={(event) => setCreateState((current) => ({ ...current, pageId: event.target.value }))}>{[...new Set(nativePlacements.map((page) => page.unitNumber))].map((unitNumber) => <optgroup key={unitNumber} label={`Unit ${unitNumber}`}>{nativePlacements.filter((page) => page.unitNumber === unitNumber).map((page) => <option key={page.pageId} value={page.pageId}>{`${page.pageLabel} · ${page.sectionTitle}`}</option>)}</optgroup>)}</select></label>
      <label><span>Initial title <small>Optional</small></span><input value={createState.title} maxLength={300} onChange={(event) => setCreateState((current) => ({ ...current, title: event.target.value }))} placeholder={`New ${nativeActivityKindLabels[createState.kind] || "activity"}`} /></label>
      {createState.error ? <p className="builder-inline-error" role="alert" aria-live="assertive">{createState.error}</p> : null}<footer><button type="button" disabled={createState.saving} onClick={() => setAddOpen(false)}>Cancel</button><button className="hosted-builder-action" type="submit" disabled={createState.saving || !createState.kind || !createState.pageId}>{createState.saving ? "Creating…" : "Create activity"}</button></footer>
    </form></BuilderModal>
    <BuilderModal open={Boolean(switchTarget)} title="Discard unsaved changes?" description="Opening another activity will discard the changes in this editor." onClose={() => setSwitchTarget("")}><div className="builder-confirm-actions"><button type="button" autoFocus onClick={() => setSwitchTarget("")}>Keep editing</button><button className="builder-danger-action" type="button" onClick={() => { setDirty(false); setSelectedId(switchTarget); setSwitchTarget(""); }}>Discard changes and open activity</button></div></BuilderModal>

    <div className="b2-hosted-activity-layout">
      <aside className="activity-builder-sidebar" aria-label="Activity Builder book navigation">
        <div className="activity-builder-search"><label><span className="sr-only">Search activities</span><Search aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, type, or ID" /></label><div><label><span>Access</span><select value={access} onChange={(event) => setAccess(event.target.value)}><option value="all">All</option><option value="editable">Editable</option><option value="native">Native</option><option value="read-only">Read-only</option></select></label><label><span>Type</span><select value={type} onChange={(event) => setType(event.target.value)}><option value="all">All types</option>{typeOptions.map((value) => <option key={value} value={value}>{nativeActivityKindLabels[value] || value.replaceAll("-", " ")}</option>)}</select></label></div></div>
        {!filteredSelection && selection ? <p className="activity-filter-notice" role="status">The selected activity is hidden by the current filters. It remains open for editing.</p> : null}
        <ActivityTree {...{ filtered, expandedUnits, expandedPages, selectedId, selectActivity, toggleSet, setExpandedUnits, setExpandedPages }} />
      </aside>
      <div className="b2-hosted-activity-preview">
        <div className="b2-hosted-preview-identity"><div><strong>{nativeSelected?.title || selected?.title}</strong><span>{nativeSelected ? "Native draft" : supported ? "Editable canonical activity" : "Read-only canonical activity"}</span></div><details><summary>Technical details</summary><code>{selectedId}</code></details></div>
        {nativeSelected ? <NativeActivityFoundationEditor key={selectedId} bookSlug="ultimate-b2" componentSlug="ultimate-b2-students-book" activityId={selectedId} kind={nativeSelected.kind} placementLabel={placementFor(nativeSelected.placement?.pageId)?.pageLabel || nativeSelected.placement?.pageId} onDirtyChange={setDirty} onSaved={() => setViewerRefresh((value) => value + 1)} /> : supported ? <HostedOpenResponseEditor key={selectedId} activityId={selectedId} onDirtyChange={setDirty} onSaved={() => setViewerRefresh((value) => value + 1)} /> : <section className="b2-hosted-unsupported-activity" role="status"><strong>Read-only canonical activity</strong><p>This activity family has no hosted mutation capability. Use Review for the deployed Viewer runtime.</p></section>}
      </div>
    </div>
  </main>;
}

function ActivityTree({ filtered, expandedUnits, expandedPages, selectedId, selectActivity, toggleSet, setExpandedUnits, setExpandedPages }) {
  const itemButton = (activity) => <button type="button" key={activity.id} aria-current={selectedId === activity.id ? "true" : undefined} title={activity.id} onClick={() => selectActivity(activity.id)}><strong>{activity.title}</strong><small>{activity.native ? "Native" : activity.editable ? "Editable" : "Read-only"} · {nativeActivityKindLabels[activity.kind] || activity.kind.replaceAll("-", " ")}</small><code>{activity.id}</code></button>;
  return <div className="activity-navigation-tree">{filtered.units.map((unit) => { const unitOpen = expandedUnits.has(unit.id); return <section key={unit.id}><button className="activity-tree-toggle" type="button" aria-expanded={unitOpen} onClick={() => toggleSet(setExpandedUnits, unit.id)}>{unitOpen ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}<strong>{unit.title}</strong><span>{unit.pages.reduce((count, page) => count + page.activities.length, 0)}</span></button>{unitOpen ? unit.pages.map((page) => { const pageOpen = expandedPages.has(page.id); return <div className="activity-tree-page" key={page.id}><button className="activity-tree-toggle" type="button" aria-expanded={pageOpen} onClick={() => toggleSet(setExpandedPages, page.id)}>{pageOpen ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}<span><strong>{page.title}</strong><small>{page.pageLabel}</small></span><span>{page.activities.length}</span></button>{pageOpen ? <div className="activity-tree-items">{page.activities.map(itemButton)}</div> : null}</div>; }) : null}</section>; })}{filtered.unplaced.length ? <section><h2>Unplaced native drafts</h2>{filtered.unplaced.map(itemButton)}</section> : null}</div>;
}

export function UltimateB2StudentsBookHostedWorkspace({ tool = "hotspots", nativeActivities = null, bookSlug = "ultimate-b2", componentSlug = "ultimate-b2-students-book" }) {
  return <div className="ultimate-b2-builder-app" data-build-profile="book-builder-hosted-review" data-component-adapter="ultimate-b2-students-book"><UnifiedBuilderReview tool={tool} pages={nativeActivities?.placements || []} bookSlug={bookSlug} componentSlug={componentSlug}>{tool === "hotspots" ? <HostedUltimateB2HotspotBuilder /> : null}{tool === "activities" ? <ActivityReview nativeActivities={nativeActivities} /> : null}{tool === "ui" ? <HostedTeacherUiController /> : null}{tool === "publication" ? <HostedPublicationWorkspace /> : null}</UnifiedBuilderReview></div>;
}

export default UltimateB2StudentsBookHostedWorkspace;
