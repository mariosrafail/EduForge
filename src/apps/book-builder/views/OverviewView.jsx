import { AlertCircle, CheckCircle2, Database, FileSearch, Layers3 } from "lucide-react";

import { projectHash } from "../bookBuilderRouter.js";
import { Badge, DefinitionList, Metric } from "../components/StudioPrimitives.jsx";
import { StudioError, StudioLoading } from "../components/StudioStates.jsx";
import { useStudioResource } from "../hooks/useStudioResource.js";

export function OverviewView({ projectId }) {
  const resource = useStudioResource(`/projects/${encodeURIComponent(projectId)}/overview`, null, projectId);
  if (resource.status === "loading") return <StudioLoading label="Loading project overview…" />;
  if (resource.status === "error") return <StudioError error={resource.error} onRetry={resource.retry} />;
  const data = resource.data;
  const validation = data.project.diagnostics;
  return (
    <div className="studio-view-content">
      <div className="studio-view-heading"><div><span className="studio-eyebrow">Book Project status</span><h2>Overview</h2><p>Portable project metadata and safe scan summaries from the latest local revision.</p></div><Badge tone={validation.authoringValid ? "positive" : "danger"}>{validation.authoringValid ? "Authoring valid" : "Authoring issues"}</Badge></div>
      <div className="studio-metric-grid">
        <Metric label="Detected facts" value={data.scan.factCount.toLocaleString()} hint="Current portable facts" />
        <Metric label="Approved decisions" value={data.scan.approvedDecisionCount.toLocaleString()} hint="Existing project decisions" />
        <Metric label="Components" value={data.project.componentCount.toLocaleString()} />
        <Metric label="Pages" value={data.project.pageCount.toLocaleString()} />
        <Metric label="Student activities" value={data.project.activityCount.toLocaleString()} />
        <Metric label="Open reviews" value={data.project.reviewSummary.total.toLocaleString()} hint={`${data.project.reviewSummary.blocking.toLocaleString()} blocking`} />
      </div>
      {data.hierarchy.available && <section aria-labelledby="hierarchy-title"><div className="studio-section-heading"><div><span className="studio-eyebrow">Normalized source hierarchy</span><h3 id="hierarchy-title">Principal instructional components</h3></div><Badge>{data.hierarchy.summary.sourceBookRootCount} source root{data.hierarchy.summary.sourceBookRootCount === 1 ? "" : "s"}</Badge></div><div className="studio-component-summary-grid">{data.hierarchy.principalComponents.map((component) => <article key={component.componentKey}><div><strong>{component.displayName}</strong><span>{component.unitGroupCount} Units</span></div><dl><div><dt>Pages</dt><dd>{component.pageCount}</dd></div><div><dt>Activities</dt><dd>{component.activityCount}</dd></div><div><dt>Reviews</dt><dd>{component.reviewCount}</dd></div></dl><div className="studio-row-actions"><a className="studio-icon-link" href={projectHash(projectId, "pages", { component: component.componentKey })}>Pages</a><a className="studio-icon-link" href={projectHash(projectId, "activities", { component: component.componentKey })}>Activities</a><a className="studio-icon-link" href={projectHash(projectId, "reviews", { component: component.componentKey })}>Reviews</a></div></article>)}</div>{data.hierarchy.warnings.length > 0 && <p className="studio-muted">{data.hierarchy.warnings.length} hierarchy diagnostic{data.hierarchy.warnings.length === 1 ? "" : "s"} recorded without changing source evidence.</p>}</section>}
      <div className="studio-two-column">
        <section className="studio-card" aria-labelledby="application-title"><div className="studio-card-title"><Database aria-hidden="true" /><div><span className="studio-eyebrow">Application identity</span><h3 id="application-title">Detected source application</h3></div></div><DefinitionList items={[["Application", data.application.name], ["Application ID", data.application.id], ["Version", data.application.version], ["Relative location", data.application.canonicalRelativeLocation], ["Source label", data.project.sourceLabel]]} /></section>
        <section className="studio-card" aria-labelledby="profile-title"><div className="studio-card-title"><Layers3 aria-hidden="true" /><div><span className="studio-eyebrow">Selected profile</span><h3 id="profile-title">{data.profile.id}</h3></div></div><DefinitionList items={[["Confidence", data.profile.confidence === null ? "Unavailable" : `${Math.round(data.profile.confidence * 100)}%`], ["Revision", data.project.revision], ["Lifecycle", data.project.lifecycle.replaceAll("_", " ")], ["Last scanned", data.project.lastScannedAt]]} /></section>
      </div>
      <div className="studio-two-column">
        <section className="studio-card" aria-labelledby="review-summary-title"><div className="studio-card-title"><FileSearch aria-hidden="true" /><div><span className="studio-eyebrow">Unresolved evidence</span><h3 id="review-summary-title">Reviews by category</h3></div></div>{Object.keys(data.project.reviewSummary.byCategory).length ? <ul className="studio-count-list">{Object.entries(data.project.reviewSummary.byCategory).map(([label, count]) => <li key={label}><span>{label.replaceAll("_", " ")}</span><strong>{count.toLocaleString()}</strong></li>)}</ul> : <p className="studio-muted">No categorized review summary is available.</p>}</section>
        <section className="studio-card" aria-labelledby="validation-title"><div className="studio-card-title">{validation.publicationValid ? <CheckCircle2 aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}<div><span className="studio-eyebrow">Publication validation</span><h3 id="validation-title">{validation.publicationValid ? "Valid" : "Incomplete draft"}</h3></div></div><p>{data.limitations.publicationMessage}</p><ul className="studio-plain-list"><li>{validation.publicationErrorCount} publication validation issue{validation.publicationErrorCount === 1 ? "" : "s"}</li><li>{validation.warningCount} scan warning{validation.warningCount === 1 ? "" : "s"}</li><li>No content package has been generated</li></ul></section>
      </div>
      {data.project.latestDiff && <section className="studio-card studio-diff-summary"><div><span className="studio-eyebrow">Latest source diff</span><h3>Revision {data.project.latestDiff.fromRevision} → {data.project.latestDiff.toRevision}</h3></div><div className="studio-inline-metrics"><span><strong>{data.project.latestDiff.added}</strong> added</span><span><strong>{data.project.latestDiff.changed}</strong> changed</span><span><strong>{data.project.latestDiff.removed}</strong> removed</span><span><strong>{data.project.latestDiff.staleDecisions}</strong> stale decisions</span></div></section>}
    </div>
  );
}
