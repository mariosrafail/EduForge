import { ArrowRight, Boxes } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { projectHash } from "../bookBuilderRouter.js";
import { Badge, Field, Pagination } from "../components/StudioPrimitives.jsx";
import { StudioEmpty, StudioError, StudioLoading } from "../components/StudioStates.jsx";
import { useStudioResource } from "../hooks/useStudioResource.js";

export function ComponentsView({ projectId, routeQuery }) {
  const [filters, setFilters] = useState(() => ({ search: routeQuery.get("search") || "", role: routeQuery.get("role") || "", confidence: "", review: "", hasPages: "", hasActivities: "", page: 1, pageSize: 25 }));
  const deferredSearch = useDeferredValue(filters.search);
  const query = useMemo(() => ({ ...filters, search: deferredSearch }), [filters, deferredSearch]);
  const dependencyKey = JSON.stringify(query);
  const resource = useStudioResource(`/projects/${encodeURIComponent(projectId)}/components`, query, dependencyKey);
  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value, page: key === "page" ? value : 1 }));
  if (resource.status === "loading" && !resource.data) return <StudioLoading label="Loading component candidates…" />;
  if (resource.status === "error") return <StudioError error={resource.error} onRetry={resource.retry} />;
  const data = resource.data;
  if (!data.available) return <StudioEmpty title="Component candidates unavailable">This project profile has not produced component review artifacts.</StudioEmpty>;
  return (
    <div className="studio-view-content">
      <div className="studio-view-heading"><div><span className="studio-eyebrow">Structural candidates</span><h2>Components</h2><p>Proposed roles remain unapproved. Select a related page view to inspect supporting evidence.</p></div><Badge tone="warning">Review only</Badge></div>
      <div className="studio-filter-grid" aria-label="Component filters">
        <Field label="Search"><input value={filters.search} onChange={(event) => update("search", event.target.value)} placeholder="Name or relative locator" /></Field>
        <Field label="Role proposal"><select value={filters.role} onChange={(event) => update("role", event.target.value)}><option value="">All roles</option>{data.filters.roles.map((role) => <option key={role}>{role}</option>)}</select></Field>
        <Field label="Confidence"><select value={filters.confidence} onChange={(event) => update("confidence", event.target.value)}><option value="">All bands</option><option value="high">High (80%+)</option><option value="medium">Medium (50–79%)</option><option value="low">Low</option><option value="unknown">Unknown</option></select></Field>
        <Field label="Review"><select value={filters.review} onChange={(event) => update("review", event.target.value)}><option value="">Any state</option><option value="required">Review required</option><option value="approved">Approved in project</option></select></Field>
        <Field label="Pages"><select value={filters.hasPages} onChange={(event) => update("hasPages", event.target.value)}><option value="">Any</option><option value="true">Has pages</option><option value="false">No pages</option></select></Field>
        <Field label="Activities"><select value={filters.hasActivities} onChange={(event) => update("hasActivities", event.target.value)}><option value="">Any</option><option value="true">Has activity objects</option><option value="false">No activity objects</option></select></Field>
      </div>
      {resource.status === "loading" && <div className="studio-inline-loading" role="status">Updating candidates…</div>}
      {data.items.length ? <div className="studio-table-scroll"><table className="studio-table"><caption className="sr-only">Component candidates</caption><thead><tr><th>Source component</th><th>Role proposal</th><th>Confidence</th><th>Units</th><th>Parts</th><th>Objects</th><th>Page spreads</th><th>Review state</th><th><span className="sr-only">Related evidence</span></th></tr></thead><tbody>{data.items.map((item) => <tr key={item.candidateId}><td><strong>{item.name}</strong><small>{item.sourceRelativeLocator}</small></td><td>{item.proposedSemanticRole}</td><td>{item.confidence === null ? "—" : `${Math.round(item.confidence * 100)}%`}</td><td>{item.unitCount}</td><td>{item.partCount}</td><td>{item.objectCount}</td><td>{item.pageSpreadCount}</td><td><Badge tone={item.reviewState === "approved" ? "positive" : "warning"}>{item.reviewState}</Badge></td><td><a className="studio-icon-link" href={projectHash(projectId, "pages", { component: item.name })} aria-label={`Review pages for ${item.name}`}><ArrowRight aria-hidden="true" /></a></td></tr>)}</tbody></table></div> : <StudioEmpty title="No component candidates match">Adjust the filters to see another candidate group.</StudioEmpty>}
      <Pagination pagination={data.pagination} onPage={(page) => update("page", page)} />
      <div className="studio-boundary-note"><Boxes aria-hidden="true" /><p>Role proposals are evidence only. This Studio does not create approvals or decisions.</p></div>
    </div>
  );
}
