import { AlertOctagon, Layers3, ListTree } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge, Field, Metric, Pagination } from "../components/StudioPrimitives.jsx";
import { StudioEmpty, StudioError, StudioLoading } from "../components/StudioStates.jsx";
import { useStudioResource } from "../hooks/useStudioResource.js";

function ClusterBrowser({ data, onPage }) {
  return data.items.length ? <><div className="studio-cluster-grid">{data.items.map((cluster) => <article key={cluster.id}><div><span className="studio-eyebrow">Structural cluster</span><h3>{cluster.id.slice(0, 14)}…</h3></div><Badge>{cluster.candidateCount.toLocaleString()} candidates</Badge><dl><div><dt>Common dispositions</dt><dd>{Object.entries(cluster.dispositions).map(([name, count]) => `${name} (${count})`).join(", ")}</dd></div><div><dt>Common review reasons</dt><dd>{cluster.commonReviewReasons.join(", ") || "No sample reason resolved"}</dd></div></dl><details><summary>Safe source samples</summary><ul>{cluster.samples.map((sample) => <li key={sample}>{sample}</li>)}</ul></details></article>)}</div><Pagination pagination={data.pagination} onPage={onPage} /></> : <StudioEmpty title="No structural clusters match">Choose another grouping or filter.</StudioEmpty>;
}

function ReviewItems({ selectedGroup, onPage }) {
  if (!selectedGroup) return <StudioEmpty title="Select a review group">Choose a bounded group to inspect its unresolved items.</StudioEmpty>;
  return (
    <section className="studio-review-items" aria-labelledby="review-items-title"><div className="studio-section-heading"><div><span className="studio-eyebrow">Selected group</span><h3 id="review-items-title">{selectedGroup.id.replaceAll("_", " ")}</h3></div><Badge tone="warning">{selectedGroup.pagination.total.toLocaleString()} items</Badge></div>{selectedGroup.items.map((item) => <article key={item.id}><div className="studio-review-item-heading"><div><strong>{item.reasonCode.replaceAll("_", " ")}</strong><small>{item.category} · {item.severity}</small></div>{item.blocking && <Badge tone="danger">Blocking</Badge>}</div><p>{item.explanation}</p><dl><div><dt>Source</dt><dd>{item.sourceRelativeLocator}</dd></div><div><dt>Future decision</dt><dd>{item.suggestedDecisionKind.replaceAll("_", " ")}</dd></div><div><dt>Dependencies</dt><dd>{item.dependencyCount}</dd></div><div><dt>Status</dt><dd>{item.status}</dd></div></dl></article>)}<Pagination pagination={selectedGroup.pagination} onPage={onPage} /></section>
  );
}

export function ReviewQueueView({ projectId }) {
  const [filters, setFilters] = useState({ groupBy: "reason", reason: "", category: "", severity: "", component: "", unit: "", groupId: "", page: 1, pageSize: 25 });
  const query = useMemo(() => filters, [filters]);
  const resource = useStudioResource(`/projects/${encodeURIComponent(projectId)}/reviews`, query, JSON.stringify(query));
  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value, ...(key === "page" ? {} : { page: 1 }), ...(["groupBy", "reason", "category", "severity", "component", "unit"].includes(key) ? { groupId: "" } : {}) }));
  if (resource.status === "loading" && !resource.data) return <StudioLoading label="Grouping unresolved review items…" />;
  if (resource.status === "error") return <StudioError error={resource.error} onRetry={resource.retry} />;
  const data = resource.data;
  if (!data.available) return <StudioEmpty title="Review queue unavailable">No review-queue artifact has been recorded for this project.</StudioEmpty>;
  return (
    <div className="studio-view-content">
      <div className="studio-view-heading"><div><span className="studio-eyebrow">Preview-only issue exploration</span><h2>Review Queue</h2><p>Thousands of unresolved items are grouped and paginated on the local server.</p></div><Badge tone="warning">No decisions in 4A</Badge></div>
      <div className="studio-metric-grid four"><Metric label="Total reviews" value={data.summary.total.toLocaleString()} /><Metric label="Blocking" value={data.summary.blocking.toLocaleString()} /><Metric label="Non-blocking" value={data.summary.nonBlocking.toLocaleString()} /><Metric label="Categories" value={Object.keys(data.summary.byCategory).length} /></div>
      <div className="studio-filter-grid compact" aria-label="Review filters"><Field label="Group by"><select value={filters.groupBy} onChange={(event) => update("groupBy", event.target.value)}><option value="reason">Reason code</option><option value="category">Category</option><option value="component">Component</option><option value="unit">Unit / group</option><option value="cluster">Activity structural cluster</option><option value="severity">Severity</option><option value="decision">Suggested decision kind</option></select></Field><Field label="Reason"><select value={filters.reason} onChange={(event) => update("reason", event.target.value)}><option value="">All reasons</option>{Object.keys(data.summary.byReason).map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Category"><select value={filters.category} onChange={(event) => update("category", event.target.value)}><option value="">All categories</option>{Object.keys(data.summary.byCategory).map((item) => <option key={item}>{item}</option>)}</select></Field></div>
      {resource.status === "loading" && <div className="studio-inline-loading" role="status">Updating review groups…</div>}
      {data.grouping === "cluster" ? <ClusterBrowser data={data} onPage={(page) => update("page", page)} /> : <div className="studio-review-layout"><aside className="studio-review-groups" aria-label="Review groups"><div className="studio-card-title"><ListTree aria-hidden="true" /><div><span className="studio-eyebrow">Grouping</span><h3>{data.grouping.replaceAll("_", " ")}</h3></div></div>{data.groups.map((group) => <button type="button" key={group.id} aria-pressed={data.selectedGroup?.id === group.id} onClick={() => update("groupId", group.id)}><span><strong>{group.label.replaceAll("_", " ")}</strong><small>{group.blocking.toLocaleString()} blocking</small></span><b>{group.count.toLocaleString()}</b></button>)}</aside><ReviewItems selectedGroup={data.selectedGroup} onPage={(page) => update("page", page)} /></div>}
      <div className="studio-boundary-note"><AlertOctagon aria-hidden="true" /><p>Apply-to-cluster, approve, dismiss and decision editing belong to Milestone 4B and are intentionally absent.</p></div>
    </div>
  );
}
