import { Eye, EyeOff, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge, Field, Pagination } from "../components/StudioPrimitives.jsx";
import { SecurePreview } from "../components/SecurePreview.jsx";
import { StudioEmpty, StudioError, StudioLoading } from "../components/StudioStates.jsx";
import { useStudioResource } from "../hooks/useStudioResource.js";
import { DecisionDrawer } from "../components/DecisionDrawer.jsx";

function keepFocusedHotspotVisible(event) {
  const item = event.currentTarget;
  const list = item.closest(".studio-hotspot-list");
  if (!list) return;
  const itemRect = item.getBoundingClientRect();
  const listRect = list.getBoundingClientRect();
  if (itemRect.top < listRect.top) list.scrollTop -= listRect.top - itemRect.top;
  else if (itemRect.bottom > listRect.bottom) list.scrollTop += itemRect.bottom - listRect.bottom;
}

function PageInspector({ projectId, page, writeEnabled, onDecide }) {
  const [overlay, setOverlay] = useState(true);
  const [zoom, setZoom] = useState(1);
  const variant = page.variants.find((item) => item.quality === page.canonicalQuality) || page.variants[0];
  return (
    <section className="studio-page-inspector" aria-labelledby="page-inspector-title">
      <div className="studio-inspector-toolbar"><div><span className="studio-eyebrow">Selected page</span><h3 id="page-inspector-title">{page.component} · Unit {page.unit} · Part {page.part}</h3></div><div className="studio-toolbar-actions">{writeEnabled && <button type="button" className="studio-button primary" onClick={() => onDecide({ type: "page", item: page })}>Decide page</button>}<button type="button" className="studio-button secondary" onClick={() => setOverlay((value) => !value)}>{overlay ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}{overlay ? "Hide hotspots" : "Show hotspots"}</button><button type="button" className="studio-icon-button" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.6, value - 0.2))}><ZoomOut aria-hidden="true" /></button><button type="button" className="studio-icon-button" aria-label="Fit preview" onClick={() => setZoom(1)}><Maximize2 aria-hidden="true" /></button><button type="button" className="studio-icon-button" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(2, value + 0.2))}><ZoomIn aria-hidden="true" /></button></div></div>
      <div className="studio-page-layout">
        <div className="studio-page-preview-frame"><div className="studio-page-preview" style={{ "--preview-zoom": zoom }}>{variant ? <SecurePreview projectId={projectId} previewId={variant.previewId} alt={`Preview of ${page.component} Unit ${page.unit} Part ${page.part}`} className="studio-page-image" /> : <div className="studio-preview-state"><span>No approved raster preview is available.</span></div>}{overlay && variant && <div className="studio-hotspot-overlay" aria-hidden="true">{page.hotspots.filter((item) => item.geometry).map((item, index) => <span key={item.candidateId} style={{ left: `${item.geometry.x * 100}%`, top: `${item.geometry.y * 100}%`, width: `${item.geometry.width * 100}%`, height: `${item.geometry.height * 100}%` }}>{index + 1}</span>)}</div>}</div></div>
        <aside className="studio-page-details"><div className="studio-inline-badges"><Badge tone={page.exactCardinality ? "positive" : "warning"}>{page.exactCardinality ? "Exact cardinality" : "Mismatch"}</Badge><Badge>{page.hotspotCount} hotspots</Badge></div><dl className="studio-definition-list"><div><dt>Identity</dt><dd>{page.sourceRelativeIdentity}</dd></div><div><dt>Detected / effective variant</dt><dd>{page.canonicalQuality || "Unresolved"} / {page.effectiveCanonicalQuality || "Unresolved"}</dd></div><div><dt>Dimensions</dt><dd>{variant ? `${variant.width} × ${variant.height}` : "Unavailable"}</dd></div><div><dt>Detected / effective printed page</dt><dd>{page.printedPage.value ?? "Unresolved"} / {page.effectivePrintedPage ?? "Unresolved"}</dd></div><div><dt>Unresolved regions</dt><dd>{page.unresolvedHotspotCount}</dd></div></dl><h4>Accessible hotspot candidates</h4>{page.hotspots.length ? <ol className="studio-hotspot-list">{page.hotspots.map((item, index) => <li key={item.candidateId} tabIndex={0} onFocus={keepFocusedHotspotVisible}><span>{index + 1}</span><div><strong>Object {item.targetObject ?? "unresolved"}</strong><small>{item.geometry ? "Normalized geometry available" : "Geometry unavailable"} · {item.stale ? "stale" : item.decisionState}</small></div>{writeEnabled && <button type="button" className="studio-icon-link" onClick={() => onDecide({ type: "hotspot", item, page })}>Decide</button>}</li>)}</ol> : <p className="studio-muted">No hotspot candidates were detected for this page.</p>}</aside>
      </div>
    </section>
  );
}

export function PagesView({ projectId, routeQuery, authoring }) {
  const [filters, setFilters] = useState(() => ({ component: routeQuery.get("component") || "", unit: routeQuery.get("unit") || "", part: "", page: 1, pageSize: 25, pageId: routeQuery.get("pageId") || "" }));
  const query = useMemo(() => filters, [filters]);
  const resource = useStudioResource(`/projects/${encodeURIComponent(projectId)}/pages`, query, JSON.stringify(query));
  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value, ...(key === "page" || key === "pageId" ? {} : { page: 1, pageId: "" }) }));
  const [editing, setEditing] = useState(null);
  if (resource.status === "loading" && !resource.data) return <StudioLoading label="Loading page and hotspot candidates…" />;
  if (resource.status === "error") return <StudioError error={resource.error} onRetry={resource.retry} />;
  const data = resource.data;
  if (!data.available) return <StudioEmpty title="Page candidates unavailable">This project profile has not produced a safe page-candidate artifact.</StudioEmpty>;
  return (
    <div className="studio-view-content">
      <div className="studio-view-heading"><div><span className="studio-eyebrow">Raster evidence</span><h2>Pages &amp; Hotspots</h2><p>Allowed page images and normalized geometry only. Coordinates are never guessed or editable here.</p></div><Badge tone="warning">Overlay read-only</Badge></div>
      <div className="studio-filter-grid compact" aria-label="Page filters"><Field label="Component"><select value={filters.component} onChange={(event) => update("component", event.target.value)}><option value="">All components</option>{data.filters.components.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Unit / group"><select value={filters.unit} onChange={(event) => update("unit", event.target.value)}><option value="">All units</option>{data.filters.units.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field><Field label="Part"><input inputMode="numeric" value={filters.part} onChange={(event) => update("part", event.target.value.replace(/\D/g, ""))} placeholder="Any part" /></Field></div>
      {data.items.length ? <><div className="studio-page-candidate-strip" aria-label="Page candidates">{data.items.map((item) => <button type="button" key={item.candidateId} aria-pressed={data.selected?.candidateId === item.candidateId} onClick={() => update("pageId", item.candidateId)}><strong>Unit {item.unit} · Part {item.part}</strong><span>{item.component}</span><small>{item.variants.length ? item.variants.map((variant) => variant.quality).join(" + ") : "No preview"} · {item.hotspotCount} hotspots</small></button>)}</div><Pagination pagination={data.pagination} onPage={(page) => update("page", page)} />{data.selected && <PageInspector projectId={projectId} page={data.selected} writeEnabled={authoring.writeEnabled} onDecide={setEditing} />}</> : <StudioEmpty title="No pages match these filters">Choose another component, Unit or part.</StudioEmpty>}
      {editing?.type === "page" && <DecisionDrawer projectId={projectId} expectedRevision={authoring.revision} target={{ targetId: editing.item.candidateId, label: `${editing.item.component} · Unit ${editing.item.unit} · Part ${editing.item.part}`, sourceRelativeLocator: editing.item.sourceRelativeIdentity }} kinds={[{ kind: "printed_page_number", label: "Printed page number", values: [], initialValue: editing.item.effectivePrintedPage || 1, detectedValue: editing.item.printedPage.value, currentDecision: editing.item.printedPageDecision.decision }, { kind: "canonical_page_variant", label: "Canonical page variant", values: editing.item.variants.map((item) => item.quality), initialValue: editing.item.effectiveCanonicalQuality || editing.item.variants[0]?.quality, detectedValue: editing.item.canonicalQuality, currentDecision: editing.item.canonicalVariantDecision.decision }]} onCommitted={authoring.onCommitted} onClose={() => setEditing(null)} />}
      {editing?.type === "hotspot" && <DecisionDrawer projectId={projectId} expectedRevision={authoring.revision} target={{ targetId: editing.item.candidateId, label: `Hotspot ${editing.item.candidateId}`, sourceRelativeLocator: editing.page.sourceRelativeIdentity }} kinds={[{ kind: "hotspot_candidate_disposition", label: "Hotspot candidate disposition", values: ["accepted_candidate", "rejected_candidate", "deferred"], initialValue: editing.item.decision?.value || "deferred", detectedValue: editing.item.reviewState, currentDecision: editing.item.decision }]} onCommitted={authoring.onCommitted} onClose={() => setEditing(null)} />}
    </div>
  );
}
