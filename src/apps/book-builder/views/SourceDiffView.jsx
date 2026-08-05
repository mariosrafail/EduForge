import { FileClock, GitCompareArrows } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge, Field, Metric, Pagination } from "../components/StudioPrimitives.jsx";
import { StudioEmpty, StudioError, StudioLoading } from "../components/StudioStates.jsx";
import { useStudioResource } from "../hooks/useStudioResource.js";

export function SourceDiffView({ projectId }) {
  const [filters, setFilters] = useState({ changeType: "added", page: 1, pageSize: 25 });
  const query = useMemo(() => filters, [filters]);
  const resource = useStudioResource(`/projects/${encodeURIComponent(projectId)}/diff`, query, JSON.stringify(query));
  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value, ...(key === "page" ? {} : { page: 1 }) }));
  if (resource.status === "loading" && !resource.data) return <StudioLoading label="Loading latest source-rescan diff…" />;
  if (resource.status === "error") return <StudioError error={resource.error} onRetry={resource.retry} />;
  const data = resource.data;
  if (!data.available) return <StudioEmpty title="No rescan diff has been recorded for this project.">A future CLI rescan may produce this read-only artifact.</StudioEmpty>;
  return (
    <div className="studio-view-content">
      <div className="studio-view-heading"><div><span className="studio-eyebrow">Recorded portable artifact</span><h2>Source Diff</h2><p>The Studio reports the latest rescan diff; it does not derive or alter changes in the browser.</p></div><Badge>Revision {data.summary.fromRevision} → {data.summary.toRevision}</Badge></div>
      <div className="studio-metric-grid four"><Metric label="Added facts" value={data.summary.added.toLocaleString()} /><Metric label="Changed facts" value={data.summary.changed.toLocaleString()} /><Metric label="Removed facts" value={data.summary.removed.toLocaleString()} /><Metric label="Stale decisions" value={data.summary.staleDecisions.toLocaleString()} /></div>
      <div className="studio-two-column"><section className="studio-card"><div className="studio-card-title"><GitCompareArrows aria-hidden="true" /><div><span className="studio-eyebrow">Safe fact-kind summary</span><h3>Changes by kind</h3></div></div>{Object.keys(data.byFactKind).length ? <ul className="studio-count-list">{Object.entries(data.byFactKind).map(([kind, count]) => <li key={kind}><span>{kind}</span><strong>{count.toLocaleString()}</strong></li>)}</ul> : <p className="studio-muted">No changed fact-kind summary is available.</p>}</section><section className="studio-card"><div className="studio-card-title"><FileClock aria-hidden="true" /><div><span className="studio-eyebrow">Bounded identifiers</span><h3>Fact and decision IDs</h3></div></div><Field label="Change type"><select value={filters.changeType} onChange={(event) => update("changeType", event.target.value)}><option value="added">Added</option><option value="changed">Changed</option><option value="removed">Removed</option><option value="stale">Stale decisions</option></select></Field><ul className="studio-diff-id-list">{data.items.map((item) => <li key={item.id}><code>{item.id}</code><span>{item.kind}</span></li>)}</ul><Pagination pagination={data.pagination} onPage={(page) => update("page", page)} /></section></div>
      <div className="studio-boundary-note"><GitCompareArrows aria-hidden="true" /><p>Raw fact payloads are withheld, and stale decisions are not mutated by this view.</p></div>
    </div>
  );
}
