import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Boxes, ChevronDown, ChevronLeft, ChevronRight, FileImage, ListChecks, MessageSquareText, MoveRight, Plus, Search, Trash2, Video } from "lucide-react";

import catalog from "../../../android-content-packs/ultimate-b2-students-book/catalog.json";
import { nativeActivityKindLabels } from "../../data/native-activities/nativeActivityKinds.js";
import { isUltimateB2ConfigurableOpenResponse } from "../../data/ultimate-b2/openResponseActivityRegistry.js";
import { BuilderModal } from "../book-builder/hosted/BuilderModal.jsx";
import { ComponentPagesWorkspace } from "../book-builder/hosted/ComponentPagesWorkspace.jsx";
import { createNativeActivity, deleteNativeActivity, getActivityLifecycle, getNativeActivityCatalog, moveActivity, retireCanonicalActivity } from "../book-builder/hosted/builderNativeActivityApi.js";
import { NativeActivityFoundationEditor } from "../book-builder/hosted/NativeActivityFoundationEditor.jsx";
import { getBuilderPages } from "../book-builder/hosted/builderPagesApi.js";
import { pageLibraryReviewNavigation } from "../book-builder/hosted/pageLibraryReviewModel.js";
import { activityBuilderSourcePageId, activityBuilderTypeOptions, buildActivityBuilderNavigation, filterActivityBuilderNavigation, findActivityBuilderItem } from "./activityBuilderNavigation.js";
import { HostedOpenResponseEditor } from "./HostedOpenResponseEditor.jsx";
import { HostedPublicationWorkspace } from "./HostedPublicationWorkspace.jsx";
import { HostedUltimateB2HotspotBuilder } from "./HostedUltimateB2HotspotBuilder.jsx";
import { useBuilderReview } from "../book-builder/hosted/HostedPackageReview.jsx";
import { UnitExtrasEditor } from "./UnitExtrasEditor.jsx";
import "./ultimateB2HotspotBuilder.css";
import "./hostedUltimateB2BuilderReview.css";
import "./hostedUltimateB2BuilderModern.css";
import "./studioAuthoring.css";

const kindIcons = { "open-response": MessageSquareText, image: FileImage, "single-choice": ListChecks, "complete-sentences": ListChecks, listening: MessageSquareText, "oldschool-listening": FileImage, "drag-drop": Boxes };
const kindDescriptions = {
  "open-response": "Learners write a free response for Teacher review.",
  image: "Present an authored image with optional guidance.",
  "complete-sentences": "Learners type words or phrases into visual blanks; answers stay Teacher-only.",
  listening: "Learners listen, follow a synchronized transcript, and write responses for Teacher review.",
  "oldschool-listening": "Learners listen while timed highlights and scrolling follow a managed page image.",
  "single-choice": "Learners choose one answer; the key stays Teacher-only.",
  "drag-drop": "Learners place shared word-bank items onto visual targets; mappings stay Teacher-only.",
};

function firstAvailableActivityId(lifecycle, nativeActivities, excluded = "", canonicalUnits = catalog.units || []) {
  const retired = lifecycle?.activities || {};
  const canonical = canonicalUnits.flatMap((unit) => (unit.lessons || []).flatMap((lesson) => lesson.exercises || []))
    .find((activity) => activity.stableActivityId !== excluded && retired[activity.stableActivityId]?.status !== "retired");
  return nativeActivities.find((activity) => activity.activityId !== excluded)?.activityId || canonical?.stableActivityId || "";
}

function activityComponentLabel(componentSlug) {
  if (componentSlug === "ultimate-b2-workbook") return "Workbook";
  if (componentSlug === "ultimate-b2-grammar-book") return "Grammar Book";
  return "Students Book";
}

function ActivityReview({ nativeActivities, bookSlug, componentSlug }) {
  const { registerToolContext } = useBuilderReview();
  const managed = nativeActivities?.managed === true;
  const [managedNavigation, setManagedNavigation] = useState({ units: [], placements: [] });
  const [activePageIds, setActivePageIds] = useState(null);
  const configuredPlacements = managed ? managedNavigation.placements : nativeActivities?.placements || [];
  const nativePlacements = useMemo(() => activePageIds ? configuredPlacements.filter((placement) => activePageIds.includes(placement.pageId)) : configuredPlacements, [activePageIds, configuredPlacements]);
  const canonicalUnits = managed ? managedNavigation.units : catalog.units || [];
  const nativeKinds = nativeActivities?.kinds || [];
  const nativeKindsKey = nativeKinds.join("\0");
  const firstId = managed ? "" : catalog.units?.[0]?.lessons?.[0]?.exercises?.[0]?.stableActivityId || "";
  const initialExpandedPageId = managed ? "" : nativeActivities?.placements?.[0]?.pageId || catalog.units?.[0]?.lessons?.[0]?.id || "";
  const scopeKey = `${bookSlug}:${componentSlug}`;
  const componentLabel = activityComponentLabel(componentSlug);
  const [selectedId, setSelectedId] = useState(firstId);
  const [dirty, setDirty] = useState(false);
  const [viewerRefresh, setViewerRefresh] = useState(0);
  const [nativeCatalog, setNativeCatalog] = useState([]);
  const [lifecycle, setLifecycle] = useState({ schemaVersion: "1.0", activities: {} });
  const [catalogState, setCatalogState] = useState({ status: "loading", error: "" });
  const [addOpen, setAddOpen] = useState(false);
  const [deleteState, setDeleteState] = useState({ open: false, saving: false, error: "" });
  const [moveState, setMoveState] = useState({ open: false, pageId: "", saving: false, error: "", placementRequired: false });
  const [switchTarget, setSwitchTarget] = useState("");
  const [query, setQuery] = useState("");
  const [access, setAccess] = useState("all");
  const [type, setType] = useState("all");
  const [expandedUnits, setExpandedUnits] = useState(() => new Set(managed ? [] : [catalog.units?.[0]?.id]));
  const [expandedPages, setExpandedPages] = useState(() => new Set([nativePlacements[0]?.pageId || catalog.units?.[0]?.lessons?.[0]?.id]));
  const [navigationExpanded, setNavigationExpanded] = useState(true);
  const [autoHideNavigation, setAutoHideNavigation] = useState(false);
  const [createState, setCreateState] = useState({ kind: nativeKinds[0] || "", pageId: nativePlacements[0]?.pageId || "", title: "", saving: false, error: "" });
  const [extrasUnit, setExtrasUnit] = useState(null);
  const addTriggerRef = useRef(null);
  const extrasTriggerRef = useRef(null);
  const deleteTriggerRef = useRef(null);
  const navigationShellRef = useRef(null);
  const activityWorkspaceRef = useRef(null);
  const navigationCloseTimerRef = useRef(null);
  const manualNavigationCollapseRef = useRef(false);
  const scopeGenerationRef = useRef(0);
  const model = useMemo(() => buildActivityBuilderNavigation({ units: canonicalUnits, nativeActivities: nativeCatalog, placements: nativePlacements, lifecycle, activePageIds, isEditable: managed ? () => false : isUltimateB2ConfigurableOpenResponse }), [activePageIds, canonicalUnits, lifecycle, managed, nativeCatalog, nativePlacements]);
  const filtered = useMemo(() => filterActivityBuilderNavigation(model, { query, access, type }), [access, model, query, type]);
  const selection = findActivityBuilderItem(model, selectedId);
  const filteredSelection = findActivityBuilderItem(filtered, selectedId);
  const selected = selection?.item && !selection.item.native ? selection.item : null;
  const nativeSelected = selection?.item?.native ? selection.item : null;
  const nativeSelectedPlacement = nativeSelected ? nativePlacements.find((page) => page.pageId === nativeSelected.placement?.pageId) : null;
  const supported = !managed && !nativeSelected && isUltimateB2ConfigurableOpenResponse(selectedId);
  const placementFor = (pageId) => nativePlacements.find((page) => page.pageId === pageId);

  useEffect(() => {
    registerToolContext("activities", { view: "activity", activityId: selectedId, ...(nativeSelectedPlacement ? { pageId: nativeSelectedPlacement.pageId, unitNumber: nativeSelectedPlacement.unitNumber } : {}), dirty, refreshKey: viewerRefresh, release: null });
  }, [dirty, nativeSelectedPlacement, registerToolContext, selectedId, viewerRefresh]);
  const loadCatalogs = useCallback(async (signal, generation = scopeGenerationRef.current, requestedScope = scopeKey) => {
    const [native, currentLifecycle, pageLibrary] = await Promise.all([
      getNativeActivityCatalog({ bookSlug, componentSlug }, { signal }),
      getActivityLifecycle({ bookSlug, componentSlug }, { signal }),
      getBuilderPages({ bookSlug, componentSlug }, { signal }),
    ]);
    if (signal?.aborted || generation !== scopeGenerationRef.current || requestedScope !== scopeKey) return null;
    if (pageLibrary) {
      const navigation = pageLibraryReviewNavigation(pageLibrary, { bookSlug, componentSlug });
      if (managed) setManagedNavigation(navigation);
      setActivePageIds(pageLibrary.pages.map((page) => page.id));
    }
    setNativeCatalog(native); setLifecycle(currentLifecycle.document); return { native, lifecycle: currentLifecycle.document };
  }, [bookSlug, componentSlug, managed, scopeKey]);
  useEffect(() => {
    const controller = new AbortController();
    const generation = scopeGenerationRef.current + 1;
    scopeGenerationRef.current = generation;
    setManagedNavigation({ units: [], placements: [] }); setActivePageIds(null);
    setNativeCatalog([]); setLifecycle({ schemaVersion: "1.0", activities: {} }); setSelectedId(firstId);
    setDirty(false); setViewerRefresh(0); setAddOpen(false); setDeleteState({ open: false, saving: false, error: "" });
    setMoveState({ open: false, pageId: "", saving: false, error: "", placementRequired: false }); setSwitchTarget("");
    setQuery(""); setAccess("all"); setType("all"); setExpandedUnits(new Set(managed ? [] : [catalog.units?.[0]?.id]));
    setExpandedPages(new Set(initialExpandedPageId ? [initialExpandedPageId] : [])); setCreateState({ kind: nativeKinds[0] || "", pageId: "", title: "", saving: false, error: "" });
    setExtrasUnit(null); setCatalogState({ status: "loading", error: "" });
    loadCatalogs(controller.signal, generation, scopeKey).then((result) => {
      if (result) setCatalogState({ status: "ready", error: "" });
    }).catch(() => {
      if (!controller.signal.aborted && generation === scopeGenerationRef.current) {
        setCatalogState({ status: "error", error: `${componentLabel} activities could not be loaded.` });
      }
    });
    return () => controller.abort();
  }, [componentLabel, firstId, initialExpandedPageId, loadCatalogs, managed, nativeKindsKey, scopeKey]);
  useEffect(() => {
    const query = globalThis.matchMedia?.("(hover: hover) and (pointer: fine)");
    if (!query) return undefined;
    const update = () => { setAutoHideNavigation(query.matches); if (!query.matches) setNavigationExpanded(true); };
    update(); query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  useEffect(() => () => globalThis.clearTimeout(navigationCloseTimerRef.current), []);
  useEffect(() => {
    if (catalogState.status === "ready" && !findActivityBuilderItem(model, selectedId)) setSelectedId(firstAvailableActivityId(lifecycle, nativeCatalog, "", canonicalUnits));
  }, [canonicalUnits, catalogState.status, lifecycle, model, nativeCatalog, selectedId]);
  useEffect(() => {
    if (nativePlacements.length && !nativePlacements.some((page) => page.pageId === createState.pageId)) setCreateState((current) => ({ ...current, pageId: nativePlacements[0].pageId }));
  }, [createState.pageId, nativePlacements]);
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
    const currentPageId = activityBuilderSourcePageId(selection);
    setCreateState((current) => ({ ...current, pageId: nativePlacements.some((page) => page.pageId === currentPageId) ? currentPageId : current.pageId, error: "" }));
    setAddOpen(true);
  };
  const submitNativeActivity = async (event) => {
    event.preventDefault(); setCreateState((current) => ({ ...current, saving: true, error: "" }));
    try {
      const generation = scopeGenerationRef.current;
      const created = await createNativeActivity({ bookSlug, componentSlug, kind: createState.kind, pageId: createState.pageId, title: createState.title });
      const refreshed = await loadCatalogs(undefined, generation, scopeKey);
      if (!refreshed) return;
      const createdPlacement = placementFor(createState.pageId);
      const createdUnit = canonicalUnits.find((unit) => unit.unitNumber === createdPlacement?.unitNumber);
      setExpandedPages((current) => new Set(current).add(createState.pageId));
      if (createdUnit) setExpandedUnits((current) => new Set(current).add(createdUnit.id));
      setSelectedId(created.activityId); setQuery(""); setAccess("all"); setType("all"); setAddOpen(false);
      setCreateState((current) => ({ ...current, title: "", saving: false, error: "" }));
    } catch (error) { setCreateState((current) => ({ ...current, saving: false, error: error.message })); }
  };
  const confirmDeleteActivity = async () => {
    if (!selection?.item) return;
    setDeleteState((current) => ({ ...current, saving: true, error: "" }));
    try {
      const generation = scopeGenerationRef.current;
      const identity = { bookSlug, componentSlug, activityId: selection.item.id };
      if (nativeSelected) await deleteNativeActivity(identity);
      else await retireCanonicalActivity({ ...identity, sourcePageId: activityBuilderSourcePageId(selection) });
      const remaining = await loadCatalogs(undefined, generation, scopeKey);
      if (!remaining) return;
      setDirty(false);
      setViewerRefresh((value) => value + 1);
      setSelectedId(firstAvailableActivityId(remaining.lifecycle, remaining.native, selection.item.id, canonicalUnits));
      setDeleteState({ open: false, saving: false, error: "" });
    } catch (error) {
      setDeleteState((current) => ({ ...current, saving: false, error: error.message || "Activity deletion failed." }));
    }
  };
  const confirmMoveActivity = async (event) => {
    event.preventDefault();
    if (!selection?.item) return;
    setMoveState((current) => ({ ...current, saving: true, error: "", placementRequired: false }));
    try {
      const generation = scopeGenerationRef.current;
      await moveActivity({
        bookSlug, componentSlug, activityId: selection.item.id,
        sourcePageId: activityBuilderSourcePageId(selection), destinationPageId: moveState.pageId,
      });
      const refreshed = await loadCatalogs(undefined, generation, scopeKey);
      if (!refreshed) return;
      const destinationPlacement = placementFor(moveState.pageId);
      const destinationUnit = canonicalUnits.find((unit) => unit.unitNumber === destinationPlacement?.unitNumber);
      setExpandedPages((current) => new Set(current).add(moveState.pageId));
      if (destinationUnit) setExpandedUnits((current) => new Set(current).add(destinationUnit.id));
      setDirty(false); setViewerRefresh((value) => value + 1);
      setMoveState((current) => ({ ...current, open: false, saving: false, error: "", placementRequired: true }));
    } catch (error) { setMoveState((current) => ({ ...current, saving: false, error: error.message || "Activity move failed." })); }
  };
  const toggleSet = (setter, id) => setter((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const typeOptions = activityBuilderTypeOptions(model);
  const revealNavigation = () => { manualNavigationCollapseRef.current = false; globalThis.clearTimeout(navigationCloseTimerRef.current); setNavigationExpanded(true); };
  const revealNavigationFromPointer = () => {
    if (manualNavigationCollapseRef.current) return;
    revealNavigation();
  };
  const scheduleNavigationCollapse = () => {
    globalThis.clearTimeout(navigationCloseTimerRef.current);
    if (!autoHideNavigation) return;
    navigationCloseTimerRef.current = globalThis.setTimeout(() => {
      if (!navigationShellRef.current?.contains(globalThis.document?.activeElement)) setNavigationExpanded(false);
    }, 250);
  };
  const toggleNavigation = () => {
    globalThis.clearTimeout(navigationCloseTimerRef.current);
    if (navigationExpanded) {
      manualNavigationCollapseRef.current = true;
      setNavigationExpanded(false);
      activityWorkspaceRef.current?.focus({ preventScroll: true });
    } else setNavigationExpanded(true);
  };

  return <main className="activity-builder-shell b2-hosted-activity-review">
    <header className="activity-builder-header"><div><span>Ultimate B2 · Activity Builder</span><h1>Activity authoring</h1><p>Find, edit, and preview activities in their book placement.</p></div><div className="activity-builder-header-actions"><button ref={addTriggerRef} className="hosted-builder-action" type="button" disabled={catalogState.status !== "ready" || !nativePlacements.length} onClick={openCreate}><Plus aria-hidden="true" /> Add Activity</button></div></header>

    <BuilderModal open={addOpen} title="Add activity" description={`Choose an activity type and its location in the ${managed ? componentSlug === "ultimate-b2-workbook" ? "Workbook" : "Grammar Book" : "Students Book"}.`} busy={createState.saving} onClose={() => setAddOpen(false)} returnFocusRef={addTriggerRef}><form className="native-activity-create" onSubmit={submitNativeActivity}>
      <fieldset><legend>Activity type</legend><div className="native-activity-kind-cards">{nativeKinds.map((kind) => { const Icon = kindIcons[kind] || Boxes; return <label key={kind} data-selected={createState.kind === kind || undefined}><input type="radio" name="activity-kind" value={kind} checked={createState.kind === kind} onChange={() => setCreateState((current) => ({ ...current, kind }))} /><Icon aria-hidden="true" /><strong>{nativeActivityKindLabels[kind]}</strong><span>{kindDescriptions[kind]}</span></label>; })}</div></fieldset>
      <label><span>Placement</span><select autoFocus value={createState.pageId} onChange={(event) => setCreateState((current) => ({ ...current, pageId: event.target.value }))}>{[...new Set(nativePlacements.map((page) => page.unitNumber))].map((unitNumber) => <optgroup key={unitNumber} label={`Unit ${unitNumber}`}>{nativePlacements.filter((page) => page.unitNumber === unitNumber).map((page) => <option key={page.pageId} value={page.pageId}>{`${page.pageLabel} · ${page.sectionTitle}`}</option>)}</optgroup>)}</select></label>
      <label><span>Initial title <small>Optional</small></span><input value={createState.title} maxLength={300} onChange={(event) => setCreateState((current) => ({ ...current, title: event.target.value }))} placeholder={`New ${nativeActivityKindLabels[createState.kind] || "activity"}`} /></label>
      {createState.error ? <p className="builder-inline-error" role="alert" aria-live="assertive">{createState.error}</p> : null}<footer><button type="button" disabled={createState.saving} onClick={() => setAddOpen(false)}>Cancel</button><button className="hosted-builder-action" type="submit" disabled={createState.saving || !createState.kind || !createState.pageId}>{createState.saving ? "Creating…" : "Create activity"}</button></footer>
    </form></BuilderModal>
    {!managed ? <UnitExtrasEditor open={Boolean(extrasUnit)} unit={extrasUnit} onClose={() => setExtrasUnit(null)} returnFocusRef={extrasTriggerRef} /> : null}
    <BuilderModal open={Boolean(switchTarget)} title="Discard unsaved changes?" description="Opening another activity will discard the changes in this editor." onClose={() => setSwitchTarget("")}><div className="builder-confirm-actions"><button type="button" autoFocus onClick={() => setSwitchTarget("")}>Keep editing</button><button className="builder-danger-action" type="button" onClick={() => { setDirty(false); setSelectedId(switchTarget); setSwitchTarget(""); }}>Discard changes and open activity</button></div></BuilderModal>
    <BuilderModal open={deleteState.open} title="Delete activity?" description={`This logically retires the activity and removes every ${componentLabel} page hotspot that opens it.`} busy={deleteState.saving} onClose={() => setDeleteState({ open: false, saving: false, error: "" })} returnFocusRef={deleteTriggerRef}><div className="native-activity-delete-confirm"><p><strong>{selection?.item?.title}</strong></p><code>{selection?.item?.id}</code><p>Canonical source, revision history, managed assets, and immutable historical releases will not be changed.</p>{dirty ? <p><strong>Unsaved changes in this editor will be discarded.</strong></p> : null}{deleteState.error ? <p className="builder-inline-error" role="alert">{deleteState.error}</p> : null}<div className="builder-confirm-actions"><button type="button" autoFocus disabled={deleteState.saving} onClick={() => setDeleteState({ open: false, saving: false, error: "" })}>Cancel</button><button className="builder-danger-action" type="button" disabled={deleteState.saving} onClick={confirmDeleteActivity}>{deleteState.saving ? "Deleting…" : "Delete Activity"}</button></div></div></BuilderModal>
    <BuilderModal open={moveState.open} title="Move activity" description="Choose a destination. Existing launch hotspots will be removed; place one deliberately on the destination page." busy={moveState.saving} onClose={() => setMoveState((current) => ({ ...current, open: false, error: "" }))}><form className="native-activity-create" onSubmit={confirmMoveActivity}><label><span>Destination</span><select autoFocus value={moveState.pageId} onChange={(event) => setMoveState((current) => ({ ...current, pageId: event.target.value }))}>{[...new Set(nativePlacements.map((page) => page.unitNumber))].map((unitNumber) => <optgroup key={unitNumber} label={`Unit ${unitNumber}`}>{nativePlacements.filter((page) => page.unitNumber === unitNumber && page.pageId !== activityBuilderSourcePageId(selection)).map((page) => <option key={page.pageId} value={page.pageId}>{`${page.pageLabel} · ${page.sectionTitle}`}</option>)}</optgroup>)}</select></label>{moveState.error ? <p className="builder-inline-error" role="alert">{moveState.error}</p> : null}<footer><button type="button" disabled={moveState.saving} onClick={() => setMoveState((current) => ({ ...current, open: false, error: "" }))}>Cancel</button><button className="hosted-builder-action" type="submit" disabled={moveState.saving || !moveState.pageId || moveState.pageId === activityBuilderSourcePageId(selection)}>{moveState.saving ? "Moving…" : "Move Activity"}</button></footer></form></BuilderModal>

    <div className={`b2-hosted-activity-layout ${navigationExpanded ? "is-navigation-expanded" : "is-navigation-collapsed"}`} data-navigation-expanded={navigationExpanded}>
      <div ref={navigationShellRef} className="activity-builder-navigation-shell" onPointerEnter={revealNavigationFromPointer} onPointerLeave={() => { manualNavigationCollapseRef.current = false; scheduleNavigationCollapse(); }} onFocusCapture={revealNavigation} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) scheduleNavigationCollapse(); }}>
      <aside id="activity-builder-book-navigation" className="activity-builder-sidebar" aria-label="Activity Builder book navigation">
        <div className="activity-builder-search"><label><span className="sr-only">Search activities</span><Search aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, type, or ID" /></label><div><label><span>Access</span><select value={access} onChange={(event) => setAccess(event.target.value)}><option value="all">All</option><option value="editable">Editable</option><option value="native">Native</option><option value="read-only">Read-only</option></select></label><label><span>Type</span><select value={type} onChange={(event) => setType(event.target.value)}><option value="all">All types</option>{typeOptions.map((value) => <option key={value} value={value}>{nativeActivityKindLabels[value] || value.replaceAll("-", " ")}</option>)}</select></label></div></div>
        {!filteredSelection && selection ? <p className="activity-filter-notice" role="status">The selected activity is hidden by the current filters. It remains open for editing.</p> : null}
        <ActivityTree {...{ filtered, expandedUnits, expandedPages, selectedId, selectActivity, toggleSet, setExpandedUnits, setExpandedPages }} allowExtras={!managed} onOpenExtras={(nextUnit, trigger) => { extrasTriggerRef.current = trigger; setExtrasUnit(nextUnit); }} />
      </aside>
      <button className="activity-builder-navigation-toggle" type="button" aria-controls="activity-builder-book-navigation" aria-expanded={navigationExpanded} aria-label={navigationExpanded ? "Collapse activity navigation" : "Show activity navigation"} title={navigationExpanded ? "Collapse navigation" : "Show navigation"} onFocus={revealNavigation} onClick={toggleNavigation}>{navigationExpanded ? <ChevronLeft aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}</button>
      </div>
      <div ref={activityWorkspaceRef} className="b2-hosted-activity-preview" tabIndex={-1}>
        {moveState.placementRequired ? <p className="activity-filter-notice" role="status">Activity moved. Open the destination page in Hotspots and place one deliberate launch hotspot.</p> : null}
        <div className="b2-hosted-preview-identity"><div><strong>{nativeSelected?.title || selected?.title}</strong><span>{nativeSelected ? "Native draft" : supported ? "Editable canonical activity" : "Read-only canonical activity"}</span></div><div className="native-activity-identity-actions"><details><summary>Technical details</summary><code>{selectedId}</code></details>{selection?.item?.movable ? <button type="button" disabled={dirty} title={dirty ? "Save or discard changes before moving this activity." : undefined} onClick={() => { const sourcePageId = activityBuilderSourcePageId(selection); const destination = nativePlacements.find((page) => page.pageId !== sourcePageId)?.pageId || ""; setMoveState({ open: true, pageId: destination, saving: false, error: "", placementRequired: false }); }}><MoveRight aria-hidden="true" /> Move Activity</button> : null}{selection?.item?.retirable ? <button ref={deleteTriggerRef} className="builder-danger-action" type="button" onClick={() => setDeleteState({ open: true, saving: false, error: "" })}><Trash2 aria-hidden="true" /> Delete Activity</button> : null}</div></div>
        {catalogState.status === "loading" ? <section className="b2-hosted-unsupported-activity" role="status"><strong>Loading {componentLabel} activities…</strong></section> : catalogState.status === "error" ? <section className="b2-hosted-unsupported-activity" role="alert"><strong>{catalogState.error}</strong><p>Reload this workspace to try again. No activity from another component will be shown.</p></section> : nativeSelected ? <NativeActivityFoundationEditor key={`${scopeKey}:${selectedId}:${nativeSelected.placement?.pageId}`} bookSlug={bookSlug} componentSlug={componentSlug} activityId={selectedId} kind={nativeSelected.kind} placementLabel={placementFor(nativeSelected.placement?.pageId)?.pageLabel || nativeSelected.placement?.pageId} onDirtyChange={setDirty} onSaved={() => setViewerRefresh((value) => value + 1)} /> : supported ? <HostedOpenResponseEditor key={`${scopeKey}:${selectedId}`} activityId={selectedId} onDirtyChange={setDirty} onSaved={() => setViewerRefresh((value) => value + 1)} /> : selection ? <section className="b2-hosted-unsupported-activity" role="status"><strong>Read-only canonical activity</strong><p>This activity family has no hosted mutation capability. Use Review for the deployed Viewer runtime.</p></section> : <section className="b2-hosted-unsupported-activity" role="status"><strong>No activities yet</strong><p>{nativePlacements.length ? "Add the first native activity to this component page library." : "Add and assign a page before creating an activity."}</p></section>}
      </div>
    </div>
  </main>;
}

function ActivityTree({ filtered, expandedUnits, expandedPages, selectedId, selectActivity, toggleSet, setExpandedUnits, setExpandedPages, allowExtras = true, onOpenExtras }) {
  const itemButton = (activity) => <button type="button" key={activity.id} aria-current={selectedId === activity.id ? "true" : undefined} title={activity.id} onClick={() => selectActivity(activity.id)}><strong>{activity.title}</strong><small>{activity.native ? "Native" : activity.editable ? "Editable" : "Read-only"} · {nativeActivityKindLabels[activity.kind] || activity.kind.replaceAll("-", " ")}</small><code>{activity.id}</code></button>;
  return <div className="activity-navigation-tree">{filtered.units.map((unit) => { const unitOpen = expandedUnits.has(unit.id); return <section key={unit.id}><div className="activity-tree-unit-row"><button className="activity-tree-toggle" type="button" aria-expanded={unitOpen} onClick={() => toggleSet(setExpandedUnits, unit.id)}>{unitOpen ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}<strong>{unit.title}</strong><span>{unit.pages.reduce((count, page) => count + page.activities.length, 0)}</span></button>{allowExtras ? <details className="activity-tree-extras"><summary aria-label={`Add extras to ${unit.title}`} title={`Add extras to ${unit.title}`}><Plus aria-hidden="true" /></summary><div><strong>Add Extras</strong><button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); onOpenExtras(unit, event.currentTarget); }}><Video aria-hidden="true" /> Videos</button></div></details> : null}</div>{unitOpen ? unit.pages.map((page) => { const pageOpen = expandedPages.has(page.id); return <div className="activity-tree-page" key={page.id}><button className="activity-tree-toggle" type="button" aria-expanded={pageOpen} onClick={() => toggleSet(setExpandedPages, page.id)}>{pageOpen ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}<span><strong>{page.title}</strong><small>{page.pageLabel}</small></span><span>{page.activities.length}</span></button>{pageOpen ? <div className="activity-tree-items">{page.activities.map(itemButton)}</div> : null}</div>; }) : null}</section>; })}{filtered.unassigned?.length ? <section><h2>Unassigned</h2><p className="activity-filter-notice">These activities are preserved but cannot launch until moved to an active page.</p>{filtered.unassigned.map(itemButton)}</section> : null}</div>;
}

export function UltimateB2StudentsBookHostedWorkspace({ tool = "hotspots", nativeActivities = null, bookSlug = "ultimate-b2", componentSlug = "ultimate-b2-students-book" }) {
  return <div className="ultimate-b2-builder-app" data-build-profile="book-builder-hosted-review" data-component-adapter={componentSlug}>{tool === "hotspots" ? <HostedUltimateB2HotspotBuilder bookSlug={bookSlug} componentSlug={componentSlug} /> : null}{tool === "activities" ? <ActivityReview nativeActivities={nativeActivities} bookSlug={bookSlug} componentSlug={componentSlug} /> : null}{tool === "publication" ? <HostedPublicationWorkspace /> : null}</div>;
}

export function UltimateB2ManagedComponentHostedWorkspace({ tool = "hotspots", nativeActivities = null, bookSlug = "ultimate-b2", componentSlug }) {
  return <div className="ultimate-b2-builder-app" data-build-profile="book-builder-hosted-review" data-component-adapter={componentSlug}>{tool === "hotspots" ? <HostedUltimateB2HotspotBuilder bookSlug={bookSlug} componentSlug={componentSlug} /> : null}{tool === "activities" ? <ActivityReview nativeActivities={nativeActivities} bookSlug={bookSlug} componentSlug={componentSlug} /> : null}{tool === "publication" ? <HostedPublicationWorkspace /> : null}</div>;
}

export function UltimateB2PagesHostedWorkspace({ bookSlug = "ultimate-b2", componentSlug }) {
  return <div className="ultimate-b2-builder-app" data-build-profile="book-builder-hosted-review" data-component-adapter={componentSlug}><ComponentPagesWorkspace bookSlug={bookSlug} componentSlug={componentSlug} /></div>;
}

export default UltimateB2StudentsBookHostedWorkspace;
