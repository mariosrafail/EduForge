import { Clock3, FileCheck2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge, Field, Metric } from "../components/StudioPrimitives.jsx";
import { StudioEmpty, StudioError, StudioLoading } from "../components/StudioStates.jsx";
import { useStudioResource } from "../hooks/useStudioResource.js";

function ManualHistoryCard({ items }) {
  return <section className="studio-card"><div className="studio-card-title"><Clock3 aria-hidden="true" /><div><span className="studio-eyebrow">Student-safe summaries only</span><h3>Manual activity history</h3></div></div>{items.length ? <ol className="studio-history-list">{items.map((item) => <li key={`${item.revision}-${item.mutationId}`}><div><strong>Revision {item.revision} · {item.operation}</strong><span>{item.type} · {item.activityId}</span></div><Badge>{item.statusBefore || "none"} → {item.statusAfter || "removed"}</Badge><time>{item.timestamp}</time></li>)}</ol> : <p className="studio-muted">No manual activity history entries exist yet.</p>}</section>;
}

export function DecisionsView({ projectId, refreshKey }) {
  const resource = useStudioResource(`/projects/${encodeURIComponent(projectId)}/decisions`, null, `${projectId}-${refreshKey}`);
  const manualHistory = useStudioResource(`/projects/${encodeURIComponent(projectId)}/manual-activity-history`, null, `${projectId}-manual-${refreshKey}`);
  const [stateFilter, setStateFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const filtered = useMemo(() => (resource.data?.decisions || []).filter((item) => (!stateFilter || item.approvalState === stateFilter) && (!kindFilter || item.kind === kindFilter)), [kindFilter, resource.data, stateFilter]);
  if (manualHistory.status === "loading") return <StudioLoading label="Loading manual activity history…" />;
  if (manualHistory.status === "error") return <StudioError error={manualHistory.error} onRetry={manualHistory.retry} />;
  if (resource.status === "loading") return <StudioLoading label="Loading durable decisions and local history…" />;
  if (resource.status === "error") return <StudioError error={resource.error} onRetry={resource.retry} />;
  const data = resource.data;
  const kinds = [...new Set(data.decisions.map((item) => item.kind))].sort();
  return <div className="studio-view-content">
    <div className="studio-view-heading"><div><span className="studio-eyebrow">Portable overlay and local audit</span><h2>Decisions &amp; History</h2><p>Current decisions are portable. Transaction history remains local to this workspace and is read-only here.</p></div><Badge>Revision {data.revision}</Badge></div>
    <div className="studio-metric-grid four"><Metric label="All decisions" value={data.summary.total} /><Metric label="Approved" value={data.summary.approved} /><Metric label="Draft / rejected" value={data.summary.draft + data.summary.rejected} /><Metric label="Stale" value={data.summary.stale} /></div>
    <div className="studio-filter-grid compact"><Field label="State"><select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}><option value="">All states</option><option value="draft">Draft</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></Field><Field label="Kind"><select value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}><option value="">All kinds</option>{kinds.map((kind) => <option key={kind}>{kind}</option>)}</select></Field></div>
    <section className="studio-card"><div className="studio-card-title"><FileCheck2 aria-hidden="true" /><div><span className="studio-eyebrow">Current overlay</span><h3>Decision records</h3></div></div>{filtered.length ? <div className="studio-table-scroll"><table className="studio-table"><thead><tr><th>Kind / target</th><th>Bounded value preview</th><th>State</th><th>Evidence</th><th>Updated</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td><strong>{item.kind.replaceAll("_", " ")}</strong><small>{item.targetType} · {item.targetId}</small></td><td>{item.valuePreview || (item.valuePresent ? "Value present" : "No value")}</td><td><Badge tone={item.stale ? "danger" : item.approvalState === "approved" ? "positive" : "warning"}>{item.stale ? "stale" : item.approvalState}</Badge></td><td>{item.dependencyCount} dependencies · {item.resolvesReviewCount} reviews</td><td>{item.updatedAt}</td></tr>)}</tbody></table></div> : <StudioEmpty title="No decisions match">Create a single-item decision from Components, Pages, Activities or Review Queue.</StudioEmpty>}</section>
    <section className="studio-card"><div className="studio-card-title"><Clock3 aria-hidden="true" /><div><span className="studio-eyebrow">Local-only summaries</span><h3>Revision history</h3></div></div>{data.history.length ? <ol className="studio-history-list">{data.history.map((item) => <li key={`${item.revision}-${item.mutationId}`}><div><strong>Revision {item.revision} · {item.operation}</strong><span>{item.kind} · {item.targetType}{item.valuePresent ? ` · ${item.valuePreview || "value present"}` : ""}</span></div><Badge>{item.beforeState || "none"} → {item.afterState || "removed"}</Badge><time>{item.timestamp}</time></li>)}</ol> : <p className="studio-muted">No local decision history entries exist yet.</p>}</section>
    <ManualHistoryCard items={manualHistory.data.items} />
  </div>;
}
