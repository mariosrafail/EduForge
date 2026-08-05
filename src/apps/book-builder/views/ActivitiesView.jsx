import { AlertTriangle, FileText, Link2, ListFilter, Music, Shapes } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { Badge, Field, Pagination } from "../components/StudioPrimitives.jsx";
import { StudioEmpty, StudioError, StudioLoading } from "../components/StudioStates.jsx";
import { useStudioResource } from "../hooks/useStudioResource.js";
import { DecisionDrawer } from "../components/DecisionDrawer.jsx";

const ACTIVITY_DISPOSITIONS = ["structured-activity-candidate", "structured-activity-with-raster-gaps", "media-only", "teacher-reveal-only", "display-or-print-content", "unsupported-publisher-interaction", "non-exercise", "malformed-or-unresolved"];

function ActivityDetails({ activity, notice, writeEnabled, onDecide }) {
  if (!activity) return <StudioEmpty title="Select an activity candidate">Choose a bounded list row to inspect its Student-safe projection.</StudioEmpty>;
  return (
    <aside className="studio-activity-details" aria-labelledby="activity-detail-title">
      <div className="studio-view-heading compact"><div><span className="studio-eyebrow">Student-safe projection</span><h3 id="activity-detail-title">{activity.activityId}</h3><p>{activity.sourceRelativeLocator}</p></div><div className="studio-inline-badges"><Badge tone={activity.rasterGap ? "warning" : "positive"}>{activity.contentCompleteness}</Badge>{writeEnabled && <button type="button" className="studio-button primary" onClick={() => onDecide(activity)}>Decide activity</button>}</div></div>
      <div className="studio-inline-badges"><Badge>{activity.normalizedType}</Badge><Badge>{activity.runtimeSupport}</Badge><Badge tone={activity.reviewCount ? "warning" : "positive"}>{activity.reviewCount} reviews</Badge></div>
      <div className="studio-activity-detail-metrics"><span><strong>{activity.questionCount}</strong> questions</span><span><strong>{activity.optionCount}</strong> options</span><span><strong>{activity.draggableCount}</strong> draggables</span><span><strong>{activity.targetCount}</strong> targets</span></div>
      {activity.rasterGap && <div className="studio-inline-notice"><AlertTriangle aria-hidden="true" /><span>Structured content has raster-only or missing text gaps.</span></div>}
      <section aria-labelledby="questions-title"><h4 id="questions-title"><FileText aria-hidden="true" /> Prompts and options</h4>{activity.questions.length ? <div className="studio-question-list">{activity.questions.map((question, index) => <article key={question.id}><span>Question {index + 1}</span><p>{question.prompt || <em>Prompt unavailable · {question.promptAvailability}</em>}</p>{question.options.length ? <ol>{question.options.map((option) => <li key={`${question.id}-${option.order}`}>{option.text || <em>Option text unavailable · {option.textAvailability}</em>}</li>)}</ol> : <small>No structured options.</small>}</article>)}</div> : <p className="studio-muted">No structured question content is available.</p>}</section>
      {(activity.draggableLabels.length > 0 || activity.targetLabels.length > 0) && <section aria-labelledby="labels-title"><h4 id="labels-title"><Shapes aria-hidden="true" /> Unmapped drag and target labels</h4><div className="studio-label-columns"><div><strong>Draggables</strong><ul>{activity.draggableLabels.map((label, index) => <li key={`drag-${index}`}>{label}</li>)}</ul></div><div><strong>Targets</strong><ul>{activity.targetLabels.map((label, index) => <li key={`target-${index}`}>{label}</li>)}</ul></div></div><small className="studio-muted">Labels are listed independently. Correct drag/drop mappings are not available.</small></section>}
      <section className="studio-reference-grid"><div><h4><Music aria-hidden="true" /> Media references</h4><strong>{activity.mediaCount}</strong><small>{activity.mediaReferences.slice(0, 3).join(" · ") || "None"}</small></div><div><h4><Link2 aria-hidden="true" /> Page / hotspot binding</h4><strong>{activity.pageReference}</strong><small>{activity.hotspotCount} hotspot reference{activity.hotspotCount === 1 ? "" : "s"}</small></div></section>
      <details className="studio-evidence-details"><summary>Safe source evidence digests ({activity.sourceEvidenceDigests.length})</summary><ul>{activity.sourceEvidenceDigests.map((evidence, index) => <li key={`${evidence.sha256}-${index}`}><span>{evidence.sourceRelativeLocator}</span><code>{evidence.sha256 || "Digest unavailable"}</code></li>)}</ul></details>
      <div className="studio-student-boundary" role="note">{notice}</div>
    </aside>
  );
}

export function ActivitiesView({ projectId, routeQuery, authoring }) {
  const [filters, setFilters] = useState(() => ({
    search: routeQuery.get("search") || "", component: routeQuery.get("component") || "", unit: routeQuery.get("unit") || "", part: routeQuery.get("part") || "",
    type: "", publisherType: "", disposition: "", support: "", completeness: "", hasPrompt: "", hasOptions: "", hasMedia: "", hasHotspot: "", reviewRequired: "",
    sort: "locator", direction: "asc", page: 1, pageSize: 25, activityId: routeQuery.get("activityId") || "",
  }));
  const deferredSearch = useDeferredValue(filters.search);
  const query = useMemo(() => ({ ...filters, search: deferredSearch }), [filters, deferredSearch]);
  const resource = useStudioResource(`/projects/${encodeURIComponent(projectId)}/activities`, query, JSON.stringify(query));
  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value, ...(key === "page" || key === "activityId" ? {} : { page: 1, activityId: "" }) }));
  const [editing, setEditing] = useState(null);
  if (resource.status === "loading" && !resource.data) return <StudioLoading label="Loading Student-safe activity candidates…" />;
  if (resource.status === "error") return <StudioError error={resource.error} onRetry={resource.retry} />;
  const data = resource.data;
  if (!data.available) return <StudioEmpty title="Activity candidates unavailable">This profile has not produced a Student-safe activity artifact.</StudioEmpty>;
  return (
    <div className="studio-view-content">
      <div className="studio-view-heading"><div><span className="studio-eyebrow">Bounded content inspection</span><h2>Activities</h2><p>Server-side filters and pagination keep large candidate sets responsive.</p></div><Badge tone="positive">Student-safe only</Badge></div>
      <details className="studio-filter-drawer" open><summary><ListFilter aria-hidden="true" /> Activity filters</summary><div className="studio-filter-grid">
        <Field label="Search"><input value={filters.search} onChange={(event) => update("search", event.target.value)} placeholder="ID, type or locator" /></Field>
        <Field label="Component"><select value={filters.component} onChange={(event) => update("component", event.target.value)}><option value="">All components</option>{data.filters.components.map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Unit / group"><input inputMode="numeric" value={filters.unit} onChange={(event) => update("unit", event.target.value.replace(/\D/g, ""))} placeholder="Any" /></Field>
        <Field label="Part"><input inputMode="numeric" value={filters.part} onChange={(event) => update("part", event.target.value.replace(/\D/g, ""))} placeholder="Any" /></Field>
        <Field label="Normalized type"><select value={filters.type} onChange={(event) => update("type", event.target.value)}><option value="">All types</option>{data.filters.types.map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Disposition"><select value={filters.disposition} onChange={(event) => update("disposition", event.target.value)}><option value="">All dispositions</option>{data.filters.dispositions.map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Completeness"><select value={filters.completeness} onChange={(event) => update("completeness", event.target.value)}><option value="">Any</option><option value="structured">Structured</option><option value="raster-gaps">Raster gaps</option></select></Field>
        <Field label="Prompt"><select value={filters.hasPrompt} onChange={(event) => update("hasPrompt", event.target.value)}><option value="">Any</option><option value="true">Structured prompt</option><option value="false">No structured prompt</option></select></Field>
        <Field label="Options"><select value={filters.hasOptions} onChange={(event) => update("hasOptions", event.target.value)}><option value="">Any</option><option value="true">Structured options</option><option value="false">No structured options</option></select></Field>
        <Field label="Media"><select value={filters.hasMedia} onChange={(event) => update("hasMedia", event.target.value)}><option value="">Any</option><option value="true">Has media</option><option value="false">No media</option></select></Field>
        <Field label="Hotspot"><select value={filters.hasHotspot} onChange={(event) => update("hasHotspot", event.target.value)}><option value="">Any</option><option value="true">Has binding</option><option value="false">No binding</option></select></Field>
        <Field label="Review"><select value={filters.reviewRequired} onChange={(event) => update("reviewRequired", event.target.value)}><option value="">Any</option><option value="true">Review required</option><option value="false">No reviews</option></select></Field>
      </div></details>
      {resource.status === "loading" && <div className="studio-inline-loading" role="status">Updating activity results…</div>}
      <div className="studio-master-detail">
        <section aria-label="Activity candidate list"><div className="studio-table-scroll"><table className="studio-table studio-selectable-table"><thead><tr><th>Detected / effective type</th><th>Detected / effective disposition</th><th>Content</th><th>Questions</th><th>Options</th><th>Media</th><th>Reviews</th></tr></thead><tbody>{data.items.map((item) => <tr key={item.activityId} data-selected={data.selected?.activityId === item.activityId}><td><button type="button" onClick={() => update("activityId", item.activityId)}><strong>{item.detectedType}</strong><small>Effective: {item.effectiveType} · {item.sourceRelativeLocator}</small></button></td><td>{item.detectedDisposition}<small>Effective: {item.effectiveDisposition}</small></td><td><Badge tone={item.rasterGap ? "warning" : "positive"}>{item.rasterGap ? "Raster gaps" : item.contentCompleteness}</Badge></td><td>{item.questionCount}</td><td>{item.optionCount}</td><td>{item.mediaCount}</td><td>{item.reviewCount}</td></tr>)}</tbody></table></div><Pagination pagination={data.pagination} onPage={(page) => update("page", page)} /></section>
        <ActivityDetails activity={data.selected} notice={data.notice} writeEnabled={authoring.writeEnabled} onDecide={setEditing} />
      </div>
      {editing && <DecisionDrawer projectId={projectId} expectedRevision={authoring.revision} target={{ targetId: editing.activityId, label: editing.activityId, sourceRelativeLocator: editing.sourceRelativeLocator }} kinds={[{ kind: "activity_type", label: "Normalized activity type", values: data.filters.types, initialValue: editing.effectiveType, detectedValue: editing.detectedType, currentDecision: editing.decisions.type.decision }, { kind: "activity_disposition", label: "Activity disposition", values: ACTIVITY_DISPOSITIONS, initialValue: editing.effectiveDisposition, detectedValue: editing.detectedDisposition, currentDecision: editing.decisions.disposition.decision }, { kind: "activity_audience_policy", label: "Audience policy", values: ["student_and_teacher", "teacher_only", "disabled"], initialValue: editing.audiencePolicy, detectedValue: "student_and_teacher", currentDecision: editing.decisions.audience.decision }]} onCommitted={authoring.onCommitted} onClose={() => setEditing(null)} />}
    </div>
  );
}
