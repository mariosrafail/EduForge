import { ArrowRight, Boxes } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { projectHash } from "../bookBuilderRouter.js";
import { Badge, Field, Pagination } from "../components/StudioPrimitives.jsx";
import { StudioEmpty, StudioError, StudioLoading } from "../components/StudioStates.jsx";
import { useStudioResource } from "../hooks/useStudioResource.js";
import { DecisionDrawer } from "../components/DecisionDrawer.jsx";

const COMPONENT_ROLES = ["students_book", "workbook", "grammar_book", "tests", "practice", "workbook_practice", "review", "reference", "companion", "video", "extra_video", "games", "tasks", "speaking_bank", "writing_bank", "worksheets"];

export function ComponentsView({ projectId, routeQuery, authoring }) {
  const [filters, setFilters] = useState(() => ({ search: routeQuery.get("search") || "", role: routeQuery.get("role") || "", confidence: "", review: "", hasPages: "", hasActivities: "", page: 1, pageSize: 25 }));
  const deferredSearch = useDeferredValue(filters.search);
  const query = useMemo(() => ({ ...filters, search: deferredSearch }), [filters, deferredSearch]);
  const dependencyKey = JSON.stringify(query);
  const resource = useStudioResource(`/projects/${encodeURIComponent(projectId)}/components`, query, dependencyKey);
  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value, page: key === "page" ? value : 1 }));
  const [editing, setEditing] = useState(null);
  if (resource.status === "loading" && !resource.data) return <StudioLoading label="Loading component candidates…" />;
  if (resource.status === "error") return <StudioError error={resource.error} onRetry={resource.retry} />;
  const data = resource.data;
  if (!data.available) return <StudioEmpty title="Component candidates unavailable">This project profile has not produced component review artifacts.</StudioEmpty>;
  return (
    <div className="studio-view-content">
      <div className="studio-view-heading"><div><span className="studio-eyebrow">Structural candidates</span><h2>Components</h2><p>Compare detected and effective roles, then inspect supporting page or activity evidence.</p></div><Badge tone={authoring.writeEnabled ? "positive" : "warning"}>{authoring.writeEnabled ? "Single-item decisions" : "Review only"}</Badge></div>
      <div className="studio-filter-grid" aria-label="Component filters">
        <Field label="Search"><input value={filters.search} onChange={(event) => update("search", event.target.value)} placeholder="Name or relative locator" /></Field>
        <Field label="Role proposal"><select value={filters.role} onChange={(event) => update("role", event.target.value)}><option value="">All roles</option>{data.filters.roles.map((role) => <option key={role}>{role}</option>)}</select></Field>
        <Field label="Confidence"><select value={filters.confidence} onChange={(event) => update("confidence", event.target.value)}><option value="">All bands</option><option value="high">High (80%+)</option><option value="medium">Medium (50–79%)</option><option value="low">Low</option><option value="unknown">Unknown</option></select></Field>
        <Field label="Review"><select value={filters.review} onChange={(event) => update("review", event.target.value)}><option value="">Any state</option><option value="required">Review required</option><option value="approved">Approved in project</option></select></Field>
        <Field label="Pages"><select value={filters.hasPages} onChange={(event) => update("hasPages", event.target.value)}><option value="">Any</option><option value="true">Has pages</option><option value="false">No pages</option></select></Field>
        <Field label="Activities"><select value={filters.hasActivities} onChange={(event) => update("hasActivities", event.target.value)}><option value="">Any</option><option value="true">Has activity objects</option><option value="false">No activity objects</option></select></Field>
      </div>
      {resource.status === "loading" && <div className="studio-inline-loading" role="status">Updating candidates…</div>}
      {data.items.length ? <div className="studio-table-scroll"><table className="studio-table"><caption className="sr-only">Component candidates</caption><thead><tr><th>Source component</th><th>Detected / effective role</th><th>Confidence</th><th>Units</th><th>Parts</th><th>Objects</th><th>Page spreads</th><th>Decision state</th><th>Related evidence</th></tr></thead><tbody>{data.items.map((item) => <tr key={item.candidateId}><td><strong>{item.name}</strong><small>{item.sourceRelativeLocator}</small></td><td>{item.detectedRole}<small>Effective: {item.effectiveRole}</small></td><td>{item.confidence === null ? "—" : `${Math.round(item.confidence * 100)}%`}</td><td>{item.unitCount}</td><td>{item.partCount}</td><td>{item.objectCount}</td><td>{item.pageSpreadCount}</td><td><Badge tone={item.stale ? "danger" : item.decisionState === "approved" ? "positive" : "warning"}>{item.stale ? "stale" : item.decisionState}</Badge></td><td><div className="studio-row-actions">{authoring.writeEnabled && <button className="studio-icon-link" type="button" onClick={() => setEditing(item)}>Decide</button>}<a className="studio-icon-link" href={projectHash(projectId, "pages", { component: item.name })} aria-label={`Review pages for ${item.name}`}>Pages <ArrowRight aria-hidden="true" /></a><a className="studio-icon-link" href={projectHash(projectId, "activities", { component: `component:${item.name}` })} aria-label={`Review activities for ${item.name}`}>Activities <ArrowRight aria-hidden="true" /></a></div></td></tr>)}</tbody></table></div> : <StudioEmpty title="No component candidates match">Adjust the filters to see another candidate group.</StudioEmpty>}
      <Pagination pagination={data.pagination} onPage={(page) => update("page", page)} />
      <div className="studio-boundary-note"><Boxes aria-hidden="true" /><p>Decisions remain an overlay; source component names and generated evidence are never changed.</p></div>
      {editing && <DecisionDrawer projectId={projectId} expectedRevision={authoring.revision} target={{ targetId: editing.candidateId, label: editing.name, sourceRelativeLocator: editing.sourceRelativeLocator }} kinds={[{ kind: "component_role", label: "Component role", values: COMPONENT_ROLES, initialValue: COMPONENT_ROLES.includes(editing.effectiveRole) ? editing.effectiveRole : "students_book", detectedValue: editing.detectedRole, currentDecision: editing.decision }]} onCommitted={authoring.onCommitted} onClose={() => setEditing(null)} />}
    </div>
  );
}
