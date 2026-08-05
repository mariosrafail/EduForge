import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { bootstrapReviewStudio, requestReviewStudio } from "./bookBuilderApi.js";
import { useBookBuilderRoute } from "./bookBuilderRouter.js";
import { BookBuilderDashboard } from "./BookBuilderDashboard.jsx";
import { BookProjectReview } from "./BookProjectReview.jsx";
import { StudioError, StudioLoading } from "./components/StudioStates.jsx";

export function BookBuilderApp() {
  const route = useBookBuilderRoute();
  const [state, setState] = useState({ status: "loading", bootstrap: null, projects: null, error: null });
  const load = useCallback(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, status: "loading", error: null }));
    bootstrapReviewStudio({ signal: controller.signal, refresh: true })
      .then(async (bootstrap) => ({ bootstrap, projects: await requestReviewStudio("/projects", { signal: controller.signal }) }))
      .then((data) => setState({ status: "ready", ...data, error: null }))
      .catch((error) => { if (error.name !== "AbortError") setState({ status: "error", bootstrap: null, projects: null, error }); });
    return () => controller.abort();
  }, []);
  useEffect(() => load(), [load]);
  return (
    <div className="book-builder-studio">
      <a className="studio-skip-link" href="#main-content">Skip to main content</a>
      <header className="studio-topbar">
        <a className="studio-brand" href="#/" aria-label="Hamilton House Publisher Review Studio home"><span aria-hidden="true">HH</span><div><strong>Hamilton House</strong><small>Publisher Review Studio</small></div></a>
        <div className={`studio-readonly-chip ${state.bootstrap?.writeEnabled ? "editing" : ""}`}>{state.bootstrap?.writeEnabled ? <ShieldAlert aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}<span>{state.bootstrap?.writeEnabled ? "Local editing" : "Read-only review"}</span></div>
      </header>
      <div className={`studio-readonly-banner ${state.bootstrap?.writeEnabled ? "editing" : ""}`} role="status">{state.bootstrap?.writeEnabled ? "Local editing enabled — durable decisions change only this persistent Book Project copy." : "Read-only review — start the explicit local authoring command to create decisions."}</div>
      {state.status === "loading" && <main id="main-content"><StudioLoading label="Connecting to the local Book Builder workspace…" /></main>}
      {state.status === "error" && <main id="main-content"><StudioError error={state.error} onRetry={load} title="Publisher Review Studio could not connect" /></main>}
      {state.status === "ready" && route.kind === "dashboard" && <BookBuilderDashboard projects={state.projects.projects} diagnostics={state.projects.diagnostics} workspaceLabel={state.bootstrap.workspaceLabel} writeEnabled={state.bootstrap.writeEnabled} />}
      {state.status === "ready" && route.kind === "project" && <BookProjectReview route={route} writeEnabled={state.bootstrap.writeEnabled} />}
      {state.status === "ready" && route.kind === "invalid" && <main id="main-content"><StudioLoading label="Returning to the project dashboard…" /></main>}
    </div>
  );
}
