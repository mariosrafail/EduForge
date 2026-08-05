import { ArrowLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { PROJECT_TABS, projectHash } from "./bookBuilderRouter.js";
import { useStudioResource } from "./hooks/useStudioResource.js";
import { Badge } from "./components/StudioPrimitives.jsx";
import { StudioError, StudioLoading } from "./components/StudioStates.jsx";
import { OverviewView } from "./views/OverviewView.jsx";
import { ComponentsView } from "./views/ComponentsView.jsx";
import { PagesView } from "./views/PagesView.jsx";
import { MenuView } from "./views/MenuView.jsx";
import { ActivitiesView } from "./views/ActivitiesView.jsx";
import { ManualActivitiesView } from "./views/ManualActivitiesView.jsx";
import { ReviewQueueView } from "./views/ReviewQueueView.jsx";
import { SourceDiffView } from "./views/SourceDiffView.jsx";
import { DecisionsView } from "./views/DecisionsView.jsx";

function ProjectTabs({ projectId, activeTab }) {
  const refs = useRef([]);
  const onKeyDown = (event, index) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let next = index;
    if (event.key === 'ArrowLeft') next = (index - 1 + PROJECT_TABS.length) % PROJECT_TABS.length;
    if (event.key === 'ArrowRight') next = (index + 1) % PROJECT_TABS.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = PROJECT_TABS.length - 1;
    refs.current[next]?.focus();
    window.location.hash = projectHash(projectId, PROJECT_TABS[next].id).slice(1);
  };
  return (
    <nav className="studio-tabs" role="tablist" aria-label="Project review sections">
      {PROJECT_TABS.map((tab, index) => <a key={tab.id} ref={(element) => { refs.current[index] = element; }} role="tab" aria-selected={activeTab === tab.id} tabIndex={activeTab === tab.id ? 0 : -1} href={projectHash(projectId, tab.id)} onKeyDown={(event) => onKeyDown(event, index)}>{tab.label}</a>)}
    </nav>
  );
}

function ActiveView({ route, authoring, refreshKey }) {
  if (route.tab === "overview") return <OverviewView projectId={route.projectId} />;
  if (route.tab === "components") return <ComponentsView projectId={route.projectId} routeQuery={route.query} authoring={authoring} />;
  if (route.tab === "pages") return <PagesView projectId={route.projectId} routeQuery={route.query} authoring={authoring} />;
  if (route.tab === "menu") return <MenuView projectId={route.projectId} />;
  if (route.tab === "activities") return <ActivitiesView projectId={route.projectId} routeQuery={route.query} authoring={authoring} />;
  if (route.tab === "manual") return <ManualActivitiesView projectId={route.projectId} routeQuery={route.query} authoring={authoring} />;
  if (route.tab === "reviews") return <ReviewQueueView projectId={route.projectId} routeQuery={route.query} authoring={authoring} />;
  if (route.tab === "decisions") return <DecisionsView projectId={route.projectId} refreshKey={refreshKey} />;
  return <SourceDiffView projectId={route.projectId} />;
}

export function BookProjectReview({ route, writeEnabled }) {
  const overview = useStudioResource(`/projects/${encodeURIComponent(route.projectId)}/overview`, null, route.projectId);
  const [revisionState, setRevisionState] = useState({ projectId: route.projectId, revision: null, refreshKey: 0 });
  useEffect(() => { document.querySelector(".studio-project-view")?.focus(); }, [route.projectId, route.tab]);
  if (overview.status === "loading") return <main id="main-content"><StudioLoading label="Opening Book Project…" /></main>;
  if (overview.status === "error") return <main id="main-content"><StudioError error={overview.error} onRetry={overview.retry} title="Book Project unavailable" /><p className="studio-centered-action"><a href="#/" className="studio-button secondary"><ArrowLeft aria-hidden="true" /> Return to dashboard</a></p></main>;
  const project = overview.data.project;
  const currentRevision = revisionState.projectId === route.projectId && revisionState.revision ? revisionState.revision : project.revision;
  const authoring = { writeEnabled, revision: currentRevision, onCommitted: (result) => setRevisionState((current) => ({ projectId: route.projectId, revision: result.revision, refreshKey: current.refreshKey + 1 })) };
  return (
    <main className="studio-project-view" id="main-content" tabIndex={-1}>
      <nav className="studio-breadcrumbs" aria-label="Breadcrumb"><a href="#/">Projects</a><ChevronRight aria-hidden="true" /><span aria-current="page">{project.sourceLabel}</span></nav>
      <section className="studio-project-header">
        <div><a className="studio-back-link" href="#/"><ArrowLeft aria-hidden="true" /> All projects</a><span className="studio-eyebrow">{project.projectId}</span><h1>{project.sourceLabel}</h1></div>
        <div className="studio-project-meta"><Badge>{project.profile}</Badge><Badge tone="warning">{project.lifecycle.replaceAll("_", " ")}</Badge><span>Revision <strong>{currentRevision}</strong></span><span><strong>{project.reviewSummary.total.toLocaleString()}</strong> reviews</span></div>
      </section>
      <ProjectTabs projectId={route.projectId} activeTab={route.tab} />
      <section className="studio-view-panel" role="tabpanel" aria-label={PROJECT_TABS.find((tab) => tab.id === route.tab)?.label}>
        <ActiveView key={`${route.tab}-${revisionState.refreshKey}`} route={route} authoring={authoring} refreshKey={revisionState.refreshKey} />
      </section>
    </main>
  );
}
