import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { HostedViewerPreview } from "../book-builder/hosted/HostedViewerPreview.jsx";
import { hostedBuilderReviewHash } from "../book-builder/hosted/hostedBuilderRouter.js";
import { resolveUnifiedReviewIntent } from "./builderReviewModel.js";

const BuilderReviewContext = createContext(null);

function sameContext(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function useBuilderReview() {
  const value = useContext(BuilderReviewContext);
  if (!value) throw new Error("Builder Review must be used inside UnifiedBuilderReview.");
  return value;
}

function reviewPageLabel(page) {
  return `Unit ${page.unitNumber} · ${page.pageLabel} · ${page.sectionTitle}`;
}

export function UnifiedBuilderReview({ tool, pages, selectedPageId = "", bookSlug, componentSlug, externalLauncher = false, children }) {
  const normalizedPages = useMemo(() => [...(pages || [])], [pages]);
  const [toolContexts, setToolContexts] = useState({});
  const [lastPageId, setLastPageId] = useState(normalizedPages[0]?.pageId || "");
  const [session, setSession] = useState(null);
  const launcherRef = useRef(null);
  const dialogRef = useRef(null);

  const registerToolContext = useCallback((toolId, nextContext) => {
    setToolContexts((current) => sameContext(current[toolId], nextContext)
      ? current
      : { ...current, [toolId]: nextContext });
  }, []);

  const rememberPage = useCallback((pageId) => {
    if (normalizedPages.some((page) => page.pageId === pageId)) setLastPageId(pageId);
  }, [normalizedPages]);

  useEffect(() => {
    setLastPageId((current) => {
      if (selectedPageId && normalizedPages.some((page) => page.pageId === selectedPageId)) return selectedPageId;
      return normalizedPages.some((page) => page.pageId === current) ? current : normalizedPages[0]?.pageId || "";
    });
  }, [bookSlug, componentSlug, normalizedPages, selectedPageId]);

  const lastPage = normalizedPages.find((page) => page.pageId === lastPageId) || normalizedPages[0] || null;
  const currentContext = toolContexts[tool] || { view: "page", dirty: false, refreshKey: 0, release: null };

  const openReview = () => {
    const sourceMode = tool === "publication" && currentContext.release ? "release" : "draft";
    const contextPage = normalizedPages.find((page) => page.pageId === currentContext.pageId);
    setSession({ sourceMode, toolContext: currentContext, pageId: contextPage?.pageId || lastPage?.pageId || "" });
  };

  const closeReview = useCallback(() => {
    if (dialogRef.current?.open) dialogRef.current.close();
    setSession(null);
    globalThis.requestAnimationFrame?.(() => launcherRef.current?.focus());
  }, []);

  useEffect(() => {
    if (session && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, [session]);

  const selectedPage = normalizedPages.find((page) => page.pageId === session?.pageId) || lastPage;
  const release = session?.toolContext?.release || null;
  const intent = session && (session.sourceMode === "draft" || selectedPage) ? resolveUnifiedReviewIntent({
    sourceMode: session.sourceMode,
    toolContext: session.toolContext,
    page: selectedPage,
    release,
  }) : null;
  const sourceTitle = session?.sourceMode === "release" && release
    ? `Review · Release #${release.number} · Immutable`
    : "Review · Saved Draft";
  const contextValue = useMemo(() => ({
    lastPage,
    pages: normalizedPages,
    launcherRef,
    openReview,
    registerToolContext,
    rememberPage,
  }), [lastPage, normalizedPages, openReview, registerToolContext, rememberPage]);

  return <BuilderReviewContext.Provider value={contextValue}>
    {children}
    {!externalLauncher ? <button
      className="unified-builder-review-launcher"
      data-unified-review-launcher="true"
      ref={launcherRef}
      type="button"
      onClick={openReview}
    >Review</button> : null}
    <dialog
      className="unified-builder-review-dialog"
      ref={dialogRef}
      aria-modal="true"
      aria-labelledby="unified-builder-review-title"
      onCancel={(event) => { event.preventDefault(); closeReview(); }}
      onClose={() => { if (session) setSession(null); }}
    >
      {session ? <div className="unified-builder-review-panel">
        <header>
          <div><span>Canonical deployed Viewer</span><h2 id="unified-builder-review-title">{sourceTitle}</h2></div>
          <button type="button" onClick={closeReview}>Close Review</button>
        </header>
        <div className="unified-builder-review-controls">
          <div role="group" aria-label="Review source">
            <button type="button" aria-pressed={session.sourceMode === "draft"} onClick={() => setSession((current) => ({ ...current, sourceMode: "draft" }))}>Saved Draft</button>
            <button type="button" aria-pressed={session.sourceMode === "release"} disabled={!release} onClick={() => setSession((current) => ({ ...current, sourceMode: "release" }))}>{release ? `Release #${release.number} · Immutable` : "No release prepared"}</button>
          </div>
          {session.sourceMode === "release" && intent?.view === "page" ? <label>Review page<select value={selectedPage?.pageId || ""} onChange={(event) => { const pageId = event.target.value; rememberPage(pageId); setSession((current) => ({ ...current, pageId })); }}>{normalizedPages.map((page) => <option key={page.pageId} value={page.pageId}>{reviewPageLabel(page)}</option>)}</select></label> : null}
        </div>
        <div className="unified-builder-review-messages">
          {session.toolContext.dirty && session.sourceMode === "draft" ? <p className="unified-builder-review-notice" role="status">Unsaved changes are not included in Review. Save them first.</p> : null}
          {session.sourceMode === "release" && release?.state === "stale" ? <p className="unified-builder-review-notice" role="status">Release #{release.number} is immutable and older than the current saved draft.</p> : null}
          {session.sourceMode === "release" && release?.state !== "stale" ? <p className="unified-builder-review-immutable" role="status">This is the exact immutable release projection. Later Builder saves cannot change it.</p> : null}
        </div>
        {intent ? <HostedViewerPreview
          intent={intent}
          bookSlug={bookSlug}
          componentSlug={componentSlug}
          openPlayerHref={hostedBuilderReviewHash({ bookSlug, componentSlug, intent })}
          refreshKey={`${session.toolContext.refreshKey || 0}:${session.sourceMode === "release" ? session.pageId : "product-library"}:${session.sourceMode}`}
          title={sourceTitle}
          description={session.sourceMode === "release" ? "Pinned to the exact selected release." : "Opens the Ultimate B2 launcher with the latest successfully saved Builder state."}
        /> : <p role="status">No pages are available for Review in this component.</p>}
      </div> : null}
    </dialog>
  </BuilderReviewContext.Provider>;
}

export default UnifiedBuilderReview;
