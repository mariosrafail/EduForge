import { ArrowRight, BookOpen, Filter, Search, Wrench } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { projectHash } from "./bookBuilderRouter.js";
import { Badge } from "./components/StudioPrimitives.jsx";
import { StudioEmpty } from "./components/StudioStates.jsx";

function confidenceLabel(value) {
  if (value === null) return "Unknown";
  return `${Math.round(value * 100)}%`;
}

function lifecycleTone(value) {
  if (value === "review_required") return "warning";
  if (value === "scanned") return "positive";
  if (value === "source_changed") return "danger";
  return "neutral";
}

function ProjectCard({ project }) {
  const principalComponents = project.hierarchy?.principalComponents || [];
  return (
    <article className="studio-project-card">
      <div className="studio-project-card-heading">
        <div><span className="studio-eyebrow">{project.projectId}</span><h2>{project.sourceLabel}</h2></div>
        <Badge tone={lifecycleTone(project.lifecycle)}>{project.lifecycle.replaceAll("_", " ")}</Badge>
      </div>
      <dl className="studio-project-facts">
        <div><dt>Profile</dt><dd>{project.profile}</dd></div>
        <div><dt>Confidence</dt><dd>{confidenceLabel(project.confidence)}</dd></div>
        <div><dt>Revision</dt><dd>{project.revision}</dd></div>
        <div><dt>Reviews</dt><dd>{project.reviewSummary.total.toLocaleString()}</dd></div>
        <div><dt>Components</dt><dd>{project.componentCount.toLocaleString()}</dd></div>
        <div><dt>Activities</dt><dd>{project.activityCount.toLocaleString()}</dd></div>
      </dl>
      {principalComponents.length > 0 && <div className="studio-project-components" aria-label="Principal instructional components">{principalComponents.map((component) => <a key={component.componentKey} href={projectHash(project.projectId, "pages", { component: component.componentKey })}><strong>{component.displayName}</strong><span>{component.unitGroupCount} Units · {component.pageCount} pages · {component.activityCount} activities</span></a>)}</div>}
      <div className="studio-project-card-footer">
        <span>Last scan <time>{project.lastScannedAt}</time></span>
        <a className="studio-button primary" href={projectHash(project.projectId, "overview")}>Open project <ArrowRight aria-hidden="true" /></a>
      </div>
    </article>
  );
}

export function BookBuilderDashboard({ projects, diagnostics, workspaceLabel, writeEnabled }) {
  const [search, setSearch] = useState("");
  const [profile, setProfile] = useState("");
  const [lifecycle, setLifecycle] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const profiles = useMemo(() => [...new Set(projects.map((item) => item.profile))].sort(), [projects]);
  const lifecycles = useMemo(() => [...new Set(projects.map((item) => item.lifecycle))].sort(), [projects]);
  const filtered = useMemo(() => projects.filter((item) => (
    (!deferredSearch || [item.sourceLabel, item.projectId, item.profile].some((value) => value.toLowerCase().includes(deferredSearch)))
    && (!profile || item.profile === profile)
    && (!lifecycle || item.lifecycle === lifecycle)
  )), [deferredSearch, lifecycle, profile, projects]);
  return (
    <main className="studio-dashboard" id="main-content">
      <section className="studio-dashboard-intro" aria-labelledby="dashboard-title">
        <div><span className="studio-eyebrow">Publisher Book Builder</span><h1 id="dashboard-title">Book Project dashboard</h1><p>{writeEnabled ? "Review evidence and create durable decisions in this persistent local workspace." : "Inspect local authoring evidence without changing source or project state."}</p></div>
        <div className="studio-workspace-label"><BookOpen aria-hidden="true" /><span>{workspaceLabel}</span></div>
      </section>

      <section className="studio-filter-bar" aria-label="Project filters">
        <label className="studio-search"><span className="sr-only">Search projects</span><Search aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search projects" /></label>
        <label><span>Profile</span><select value={profile} onChange={(event) => setProfile(event.target.value)}><option value="">All profiles</option>{profiles.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label><span>Lifecycle</span><select value={lifecycle} onChange={(event) => setLifecycle(event.target.value)}><option value="">All lifecycle states</option>{lifecycles.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label>
        <span className="studio-filter-count"><Filter aria-hidden="true" />{filtered.length} of {projects.length}</span>
      </section>

      <section aria-labelledby="projects-title">
        <div className="studio-section-heading"><div><span className="studio-eyebrow">Local projects</span><h2 id="projects-title">Available for review</h2></div></div>
        {filtered.length ? <div className="studio-project-grid">{filtered.map((project) => <ProjectCard key={project.projectId} project={project} />)}</div> : <StudioEmpty title={projects.length ? "No projects match these filters" : "No Book Projects found"}>{projects.length ? "Clear or change the filters to see another project." : "Run a Book Builder scan from the CLI, then return to this dashboard."}</StudioEmpty>}
      </section>

      {diagnostics.length > 0 && <section className="studio-diagnostics" aria-labelledby="diagnostics-title"><h2 id="diagnostics-title">Incomplete projects</h2><p>{diagnostics.length} project director{diagnostics.length === 1 ? "y" : "ies"} could not be opened. Paths and stack details are intentionally hidden.</p><ul>{diagnostics.map((item, index) => <li key={`${item.projectId || "unknown"}-${index}`}><strong>{item.projectId || "Unavailable project"}</strong><span>{item.code.replaceAll("_", " ")}</span></li>)}</ul></section>}

      <section className="studio-legacy-tools" aria-labelledby="legacy-tools-title">
        <Wrench aria-hidden="true" />
        <div><span className="studio-eyebrow">Legacy authoring tools</span><h2 id="legacy-tools-title">Ultimate B2 hotspot authoring</h2><p>The existing title-specific tracked authoring utility for Ultimate B2 hotspots and menu-skin selection.</p></div>
        <a className="studio-button secondary" href="/ultimate-b2-builder.html">Open legacy tool <ArrowRight aria-hidden="true" /></a>
      </section>
    </main>
  );
}
