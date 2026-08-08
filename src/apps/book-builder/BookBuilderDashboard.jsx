import { ArrowRight, BookOpen, Copy, Filter, Plus, Search, TabletSmartphone, Wrench, X } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { createTeacherProject, duplicateTeacherProject } from "./bookBuilderApi.js";
import { projectHash, teacherProjectHash } from "./bookBuilderRouter.js";
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

export function BookBuilderDashboard({ projects, diagnostics, teacherProjects, workspaceLabel, writeEnabled }) {
  const [search, setSearch] = useState("");
  const [profile, setProfile] = useState("");
  const [lifecycle, setLifecycle] = useState("");
  const [newTeacherProject, setNewTeacherProject] = useState({ displayName: "", projectId: "" });
  const [createState, setCreateState] = useState({ pending: false, error: "" });
  const [duplicate, setDuplicate] = useState(null);
  const [duplicateState, setDuplicateState] = useState({ pending: false, error: "" });
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const profiles = useMemo(() => [...new Set(projects.map((item) => item.profile))].sort(), [projects]);
  const lifecycles = useMemo(() => [...new Set(projects.map((item) => item.lifecycle))].sort(), [projects]);
  const filtered = useMemo(() => projects.filter((item) => (
    (!deferredSearch || [item.sourceLabel, item.projectId, item.profile].some((value) => value.toLowerCase().includes(deferredSearch)))
    && (!profile || item.profile === profile)
    && (!lifecycle || item.lifecycle === lifecycle)
  )), [deferredSearch, lifecycle, profile, projects]);
  const createProject = async (event) => {
    event.preventDefault();
    setCreateState({ pending: true, error: "" });
    try {
      const result = await createTeacherProject(newTeacherProject);
      window.location.hash = teacherProjectHash(result.project.projectId).slice(1);
    } catch (error) {
      setCreateState({ pending: false, error: error.message });
    }
  };
  const duplicateProject = async (event) => {
    event.preventDefault();
    setDuplicateState({ pending: true, error: "" });
    try {
      const result = await duplicateTeacherProject(duplicate.sourceProjectId, { projectId: duplicate.projectId, displayName: duplicate.displayName });
      window.location.hash = teacherProjectHash(result.project.projectId).slice(1);
    } catch (error) { setDuplicateState({ pending: false, error: error.message }); }
  };
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

      <section className="studio-teacher-projects" aria-labelledby="teacher-projects-title">
        <div className="studio-section-heading"><div><span className="studio-eyebrow">Teacher authoring</span><h2 id="teacher-projects-title">Teacher APK Projects</h2><p>Reusable shell projects for deterministic Teacher debug APKs.</p></div></div>
        {writeEnabled && (
          <form className="studio-teacher-project-create" onSubmit={createProject}>
            <div><Plus aria-hidden="true" /><strong>New Teacher APK Project</strong></div>
            <label><span>Project name</span><input required maxLength="120" value={newTeacherProject.displayName} onChange={(event) => setNewTeacherProject((current) => ({ ...current, displayName: event.target.value }))} placeholder="Ultimate B3" /></label>
            <label><span>Project slug / ID</span><input required maxLength="64" pattern="[a-z0-9][a-z0-9-]{0,63}" value={newTeacherProject.projectId} onChange={(event) => setNewTeacherProject((current) => ({ ...current, projectId: event.target.value.toLowerCase() }))} placeholder="ultimate-b3" /></label>
            <button className="studio-button primary" type="submit" disabled={createState.pending}>{createState.pending ? "Creating…" : "Create project"}</button>
            {createState.error && <p className="studio-validation-errors" role="alert">{createState.error}</p>}
          </form>
        )}
        {duplicate && <form className="studio-teacher-project-duplicate" onSubmit={duplicateProject} aria-label={`Duplicate ${duplicate.sourceName}`}><div><Copy aria-hidden="true" /><span><strong>Duplicate {duplicate.sourceName}</strong><small>Assets and shell settings are copied into an independent project.</small></span></div><label><span>New project name</span><input required maxLength="120" value={duplicate.displayName} onChange={(event) => setDuplicate((current) => ({ ...current, displayName: event.target.value }))} /></label><label><span>New project slug / ID</span><input required maxLength="64" pattern="[a-z0-9][a-z0-9-]{0,63}" value={duplicate.projectId} onChange={(event) => setDuplicate((current) => ({ ...current, projectId: event.target.value.toLowerCase() }))} /></label><button className="studio-button primary" type="submit" disabled={duplicateState.pending}>{duplicateState.pending ? "Duplicating…" : "Create duplicate"}</button><button className="studio-icon-button" type="button" aria-label="Cancel duplication" onClick={() => setDuplicate(null)}><X aria-hidden="true" /></button>{duplicateState.error && <p className="studio-validation-errors" role="alert">{duplicateState.error}</p>}</form>}
        {teacherProjects.projects.length ? <div className="studio-project-grid">{teacherProjects.projects.map((project) => (
          <article className="studio-project-card" key={project.projectId}>
            <div className="studio-project-card-heading"><div><span className="studio-eyebrow">{project.projectId}</span><h2>{project.displayName}</h2></div><TabletSmartphone aria-hidden="true" /></div>
            <dl className="studio-project-facts"><div><dt>Revision</dt><dd>{project.revision}</dd></div><div><dt>Assets</dt><dd>{project.assetCount}</dd></div><div><dt>Progress</dt><dd>{project.completeness.configuredCount} / {project.completeness.requiredCount}</dd></div><div><dt>Status</dt><dd>{project.completeness.complete ? "Complete shell" : `${project.completeness.missingCount} missing`}</dd></div></dl><progress className="studio-teacher-project-progress" value={project.completeness.configuredCount} max={project.completeness.requiredCount} aria-label={`${project.displayName} completion`} />
            <div className="studio-project-card-footer"><span>Last saved <time>{project.savedAt}</time></span><div className="studio-teacher-project-card-actions">{writeEnabled && <button type="button" className="studio-button secondary" onClick={() => { setDuplicateState({ pending: false, error: "" }); setDuplicate({ sourceProjectId: project.projectId, sourceName: project.displayName, displayName: `${project.displayName} Copy`, projectId: `${project.projectId}-copy`.slice(0, 64) }); }}><Copy aria-hidden="true" />Duplicate</button>}<a className="studio-button primary" href={teacherProjectHash(project.projectId)}>Open <ArrowRight aria-hidden="true" /></a></div></div>
          </article>
        ))}</div> : <StudioEmpty title="No Teacher APK Projects yet">{writeEnabled ? "Create the first reusable Teacher shell project above." : "Start local editing mode to create a Teacher APK Project."}</StudioEmpty>}
        {teacherProjects.diagnostics.length > 0 && <p className="studio-validation-errors" role="status">{teacherProjects.diagnostics.length} Teacher Project director{teacherProjects.diagnostics.length === 1 ? "y is" : "ies are"} unavailable.</p>}
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
