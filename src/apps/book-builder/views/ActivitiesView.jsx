import { AlertTriangle, FileText, Link2, ListFilter, Music, Pencil, Shapes } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { ContentOverrideDrawer } from "../components/ContentOverrideDrawer.jsx";
import { DecisionDrawer } from "../components/DecisionDrawer.jsx";
import { Badge, Field, Pagination } from "../components/StudioPrimitives.jsx";
import { StudioEmpty, StudioError, StudioLoading } from "../components/StudioStates.jsx";
import { useStudioResource } from "../hooks/useStudioResource.js";

const ACTIVITY_DISPOSITIONS = ["structured-activity-candidate", "structured-activity-with-raster-gaps", "media-only", "teacher-reveal-only", "display-or-print-content", "unsupported-publisher-interaction", "non-exercise", "malformed-or-unresolved"];

function ContentField({ label, field, writeEnabled, onEdit }) {
  return <div className="studio-content-field" data-origin={field.valueOrigin}>
    <div><span>{label}</span><div className="studio-inline-badges"><Badge tone={field.stale ? "danger" : field.valueOrigin === "manual_override" ? "positive" : field.valueOrigin === "missing" ? "warning" : "neutral"}>{field.stale ? "stale manual" : field.valueOrigin.replaceAll("_", " ")}</Badge>{writeEnabled && <button type="button" className="studio-icon-link" onClick={onEdit}><Pencil aria-hidden="true" /> Edit field</button>}</div></div>
    <p>{field.effectiveValue || <em>Text unavailable · {field.availability}</em>}</p>
    {field.manualValue && field.valueOrigin !== "manual_override" && <small>Saved manual value is not effective ({field.approvalState}{field.stale ? ", stale" : ""}).</small>}
  </div>;
}

function ContentDetails({ activity, writeEnabled, onEdit }) {
  const content = activity.content;
  const edit = (label, field) => onEdit({ label, field, targetId: field.targetId, sourceRelativeLocator: activity.sourceRelativeLocator });
  const nestedCount = content.questions.length + content.draggables.length + content.targets.length + content.responseFields.length;
  return <section className="studio-activity-content" aria-labelledby="activity-content-title">
    <div className="studio-section-heading"><div><span className="studio-eyebrow">Effective Student-safe content</span><h4 id="activity-content-title">Manual field overrides</h4></div><Badge tone={content.counts.staleOverrides ? "danger" : content.counts.missingFields ? "warning" : "positive"}>{content.completeness.replaceAll("_", " ")}</Badge></div>
    <div className="studio-content-summary"><span>{content.counts.missingPrompts} missing prompts</span><span>{content.counts.missingOptions} missing options</span><span>{content.counts.missingLabels} missing labels</span><span>{content.counts.approvedOverrides} approved overrides</span></div>
    <ContentField label="Activity display title" field={content.title} writeEnabled={writeEnabled} onEdit={() => edit("Activity display title", content.title)} />
    <ContentField label="Activity instructions" field={content.instructions} writeEnabled={writeEnabled} onEdit={() => edit("Activity instructions", content.instructions)} />
    {!nestedCount && <p className="studio-empty-structure">No existing Student-safe structure is available for manual field overrides.</p>}
    {content.questions.length > 0 && <section aria-labelledby="questions-title"><h4 id="questions-title"><FileText aria-hidden="true" /> Prompts and options</h4><div className="studio-question-list">{content.questions.map((question, index) => <article key={question.id}><span>Question {index + 1}</span><ContentField label={`Question ${index + 1} prompt`} field={question.promptField} writeEnabled={writeEnabled} onEdit={() => edit(`Question ${index + 1} prompt`, question.promptField)} />{question.options.length ? <ol>{question.options.map((option) => <li key={option.id}><ContentField label={`Option ${option.order}`} field={option.textField} writeEnabled={writeEnabled} onEdit={() => edit(`Question ${index + 1} · option ${option.order}`, option.textField)} /></li>)}</ol> : <small>No existing structured options.</small>}</article>)}</div></section>}
    {(content.draggables.length > 0 || content.targets.length > 0) && <section aria-labelledby="labels-title"><h4 id="labels-title"><Shapes aria-hidden="true" /> Unmapped drag and target labels</h4><div className="studio-label-columns"><div><strong>Draggables</strong>{content.draggables.map((item, index) => <ContentField key={item.id} label={`Draggable ${index + 1}`} field={item.labelField} writeEnabled={writeEnabled} onEdit={() => edit(`Draggable ${index + 1} label`, item.labelField)} />)}</div><div><strong>Targets</strong>{content.targets.map((item, index) => <ContentField key={item.id} label={`Target ${index + 1}`} field={item.labelField} writeEnabled={writeEnabled} onEdit={() => edit(`Target ${index + 1} label`, item.labelField)} />)}</div></div><small className="studio-muted">Labels remain independent. Correct drag/drop mappings are never available here.</small></section>}
    {content.responseFields.length > 0 && <section aria-labelledby="responses-title"><h4 id="responses-title"><FileText aria-hidden="true" /> Response-field prompts</h4>{content.responseFields.map((item, index) => <ContentField key={item.id} label={`Response field ${index + 1}`} field={item.promptField} writeEnabled={writeEnabled} onEdit={() => edit(`Response field ${index + 1} prompt`, item.promptField)} />)}</section>}
  </section>;
}

function ActivityDetails({ activity, notice, writeEnabled, onClassify, onEditContent }) {
  if (!activity) return <StudioEmpty title="Select an activity candidate">Choose a bounded list row to inspect its Student-safe projection.</StudioEmpty>;
  return <aside className="studio-activity-details" aria-labelledby="activity-detail-title">
    <div className="studio-view-heading compact"><div><span className="studio-eyebrow">Student-safe projection</span><h3 id="activity-detail-title">{activity.activityId}</h3><p>{activity.sourceRelativeLocator}</p></div><div className="studio-inline-badges"><Badge tone={activity.contentCounts?.staleOverrides ? "danger" : activity.contentCounts?.missingFields ? "warning" : "positive"}>{activity.effectiveContentCompleteness}</Badge>{writeEnabled && <button type="button" className="studio-button secondary" onClick={() => onClassify(activity)}>Classify activity</button>}</div></div>
    <div className="studio-inline-badges"><Badge>{activity.normalizedType}</Badge><Badge>{activity.runtimeSupport}</Badge><Badge tone={activity.reviewCount ? "warning" : "positive"}>{activity.reviewCount} reviews</Badge></div>
    <div className="studio-activity-detail-metrics"><span><strong>{activity.questionCount}</strong> questions</span><span><strong>{activity.optionCount}</strong> options</span><span><strong>{activity.draggableCount}</strong> draggables</span><span><strong>{activity.targetCount}</strong> targets</span></div>
    {(activity.rasterGap || activity.contentCounts?.missingFields) && <div className="studio-inline-notice"><AlertTriangle aria-hidden="true" /><span>Structured content has raster-only or missing text gaps.</span></div>}
    <ContentDetails activity={activity} writeEnabled={writeEnabled} onEdit={onEditContent} />
    <section className="studio-reference-grid"><div><h4><Music aria-hidden="true" /> Media references</h4><strong>{activity.mediaCount}</strong><small>{activity.mediaReferences.slice(0, 3).join(" · ") || "None"}</small></div><div><h4><Link2 aria-hidden="true" /> Page / hotspot binding</h4><strong>{activity.pageReference}</strong><small>{activity.hotspotCount} hotspot reference{activity.hotspotCount === 1 ? "" : "s"}</small></div></section>
    <details className="studio-evidence-details"><summary>Safe source evidence digests ({activity.sourceEvidenceDigests.length})</summary><ul>{activity.sourceEvidenceDigests.map((evidence, index) => <li key={`${evidence.sha256}-${index}`}><span>{evidence.sourceRelativeLocator}</span><code>{evidence.sha256 || "Digest unavailable"}</code></li>)}</ul></details>
    <div className="studio-student-boundary" role="note">{notice}</div>
  </aside>;
}

function ActivityFilters({ filters, data, update }) {
  return <details className="studio-filter-drawer" open><summary><ListFilter aria-hidden="true" /> Activity filters</summary><div className="studio-filter-grid">
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
  </div></details>;
}

export function ActivitiesView({ projectId, routeQuery, authoring }) {
  const [filters, setFilters] = useState(() => ({ search: routeQuery.get("search") || "", component: routeQuery.get("component") || "", unit: routeQuery.get("unit") || "", part: routeQuery.get("part") || "", type: "", publisherType: "", disposition: "", support: "", completeness: "", hasPrompt: "", hasOptions: "", hasMedia: "", hasHotspot: "", reviewRequired: "", sort: "locator", direction: "asc", page: 1, pageSize: 25, activityId: routeQuery.get("activityId") || "" }));
  const deferredSearch = useDeferredValue(filters.search);
  const query = useMemo(() => ({ ...filters, search: deferredSearch }), [filters, deferredSearch]);
  const resource = useStudioResource(`/projects/${encodeURIComponent(projectId)}/activities`, query, JSON.stringify(query));
  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value, ...(key === "page" || key === "activityId" ? {} : { page: 1, activityId: "" }) }));
  const [classification, setClassification] = useState(null);
  const [contentEditing, setContentEditing] = useState(null);
  if (resource.status === "loading" && !resource.data) return <StudioLoading label="Loading Student-safe activity candidates…" />;
  if (resource.status === "error") return <StudioError error={resource.error} onRetry={resource.retry} />;
  const data = resource.data;
  if (!data.available) return <StudioEmpty title="Activity candidates unavailable">This profile has not produced a Student-safe activity artifact.</StudioEmpty>;
  return <div className="studio-view-content">
    <div className="studio-view-heading"><div><span className="studio-eyebrow">Bounded content inspection</span><h2>Activities</h2><p>Detected content remains immutable; approved manual strings form a durable local overlay.</p></div><Badge tone="positive">Student-safe only</Badge></div>
    <ActivityFilters filters={filters} data={data} update={update} />
    {resource.status === "loading" && <div className="studio-inline-loading" role="status">Updating activity results…</div>}
    <div className="studio-master-detail"><section aria-label="Activity candidate list"><div className="studio-table-scroll"><table className="studio-table studio-selectable-table"><thead><tr><th>Detected / effective type</th><th>Detected / effective disposition</th><th>Content</th><th>Questions</th><th>Options</th><th>Media</th><th>Reviews</th></tr></thead><tbody>{data.items.map((item) => <tr key={item.activityId} data-selected={data.selected?.activityId === item.activityId}><td><button type="button" onClick={() => update("activityId", item.activityId)}><strong>{item.detectedType}</strong><small>Effective: {item.effectiveType} · {item.sourceRelativeLocator}</small></button></td><td>{item.detectedDisposition}<small>Effective: {item.effectiveDisposition}</small></td><td><Badge tone={item.contentCounts?.staleOverrides ? "danger" : item.contentCounts?.missingFields ? "warning" : "positive"}>{item.effectiveContentCompleteness}</Badge></td><td>{item.questionCount}</td><td>{item.optionCount}</td><td>{item.mediaCount}</td><td>{item.reviewCount}</td></tr>)}</tbody></table></div><Pagination pagination={data.pagination} onPage={(page) => update("page", page)} /></section><ActivityDetails activity={data.selected} notice={data.notice} writeEnabled={authoring.writeEnabled} onClassify={setClassification} onEditContent={setContentEditing} /></div>
    {classification && <DecisionDrawer projectId={projectId} expectedRevision={authoring.revision} target={{ targetId: classification.activityId, label: classification.activityId, sourceRelativeLocator: classification.sourceRelativeLocator }} kinds={[{ kind: "activity_type", label: "Normalized activity type", values: data.filters.types, initialValue: classification.effectiveType, detectedValue: classification.detectedType, currentDecision: classification.decisions.type.decision }, { kind: "activity_disposition", label: "Activity disposition", values: ACTIVITY_DISPOSITIONS, initialValue: classification.effectiveDisposition, detectedValue: classification.detectedDisposition, currentDecision: classification.decisions.disposition.decision }, { kind: "activity_audience_policy", label: "Audience policy", values: ["student_and_teacher", "teacher_only", "disabled"], initialValue: classification.audiencePolicy, detectedValue: "student_and_teacher", currentDecision: classification.decisions.audience.decision }]} onCommitted={authoring.onCommitted} onClose={() => setClassification(null)} />}
    {contentEditing && <ContentOverrideDrawer projectId={projectId} expectedRevision={authoring.revision} target={contentEditing} field={contentEditing.field} onCommitted={authoring.onCommitted} onClose={() => setContentEditing(null)} />}
  </div>;
}
