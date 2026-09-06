import { useEffect, useRef, useState } from "react";
import { PublishedNativeActivityRunner } from "virtual:published-native-activity-runner";
import { getPublishedBookActivity, publishedBookAssetPath, publishedTargetKey } from "../../../services/publishedBooksApi.js";
import { requestBookAssetAccess } from "../../../services/bookAssetsApi.js";
import "./publishedBooks.css";
import { PublishedBookMedia } from "./PublishedBookMedia.jsx";

function PageImage({ book, page }) {
  const [state, setState] = useState({ pageId: null, url: "", error: "" });
  useEffect(() => {
    const controller = new AbortController();
    setState({ pageId: page.id, url: "", error: "" });
    const load = async () => {
      if (!page.image.logicalKey) return publishedBookAssetPath(book, page.image);
      const result = await requestBookAssetAccess(page.image.logicalKey, { signal: controller.signal });
      if (result.asset?.checksumSha256 !== page.image.checksumSha256) throw new Error("The page image could not be verified.");
      return result.url;
    };
    load().then((url) => { if (!controller.signal.aborted) setState({ pageId: page.id, url, error: "" }); })
      .catch((error) => { if (!controller.signal.aborted) setState({ pageId: page.id, url: "", error: error.message }); });
    return () => controller.abort();
  }, [book.releaseId, page.id]);
  if (state.pageId !== page.id || !state.url) return <p role={state.error ? "alert" : "status"}>{state.error || "Loading published page…"}</p>;
  return <img src={state.url} width={page.image.width} height={page.image.height} alt={`${book.componentTitle} · ${page.unitTitle} · Page ${page.printedLabel}`} onError={() => setState({ pageId: page.id, url: "", error: "Page image is unavailable." })} />;
}

export function PublishedActivityPreview({ book, activityId, teacherMode = false, readOnly = false }) {
  const [state, setState] = useState({ target: null, error: "" });
  useEffect(() => {
    const controller = new AbortController();
    setState({ target: null, error: "" });
    getPublishedBookActivity(book, activityId, { signal: controller.signal })
      .then((target) => { if (!controller.signal.aborted) setState({ target, error: "" }); })
      .catch((error) => { if (!controller.signal.aborted) setState({ target: null, error: error.message }); });
    return () => controller.abort();
  }, [book.releaseId, activityId]);
  if (state.error) return <p role="alert">{state.error}</p>;
  if (!state.target || state.target.nativeActivityId !== activityId || state.target.releaseId !== book.releaseId) return <p role="status">Loading activity…</p>;
  return <PublishedNativeActivityRunner key={`${book.releaseId}:${activityId}`} entry={state.target.entry} publication={state.target.publication} teacherMode={teacherMode} readOnly={readOnly} />;
}

export function PublishedBookSurface({ book, mode = "practice", initialLocator = null, externalPageId = null, assignedTarget = null, renderAssignedActivity, selected = [], onToggle, onPageChange, onLegacyActivity, teacherMode = false }) {
  const initialPageId = initialLocator?.pageId || book.pages[0]?.id || "";
  const [pageId, setPageId] = useState(initialPageId);
  const [zoom, setZoom] = useState(1);
  const [focusedHotspot, setFocusedHotspot] = useState(null);
  const [openActivity, setOpenActivity] = useState(assignedTarget?.nativeActivityId || null);
  const [preview, setPreview] = useState(null);
  const dialog = useRef(null);
  const activityClose = useRef(null);
  const returnFocus = useRef(null);
  const surface = useRef(null);
  const [launchError, setLaunchError] = useState("");
  const page = book.pages.find((item) => item.id === pageId);
  const pageIndex = book.pages.indexOf(page);
  const selectedKeys = new Set(selected.map((item) => publishedTargetKey(item.target || item)));
  const isAssignedHotspot = (hotspot) => mode === "assigned" && hotspot.target?.nativeActivityId === assignedTarget?.nativeActivityId && hotspot.id === initialLocator?.hotspotId && hotspot.pageId === initialLocator?.pageId;
  useEffect(() => { if (externalPageId) { setPageId(externalPageId); setFocusedHotspot(null); } }, [externalPageId]);
  useEffect(() => {
    if (preview) dialog.current?.showModal();
    else dialog.current?.close();
  }, [preview]);
  useEffect(() => { if (openActivity) activityClose.current?.focus(); }, [openActivity]);
  const closeActivity = () => { setOpenActivity(null); returnFocus.current?.focus(); };
  const changePage = (id) => {
    const next = book.pages.find((item) => item.id === id);
    if (!next) return;
    setPageId(id); setFocusedHotspot(null);
    setLaunchError("");
    if (mode !== "assigned") setOpenActivity(null);
    onPageChange?.(next);
  };
  const activate = (hotspot, event) => {
    setFocusedHotspot(hotspot);
    setLaunchError("");
    if (mode === "picker") return;
    if (!hotspot.target) {
      if (mode !== "practice" || !onLegacyActivity?.(hotspot.activityId)) setLaunchError("This activity is unavailable in this view.");
      return;
    }
    if (mode === "assigned" && !isAssignedHotspot(hotspot)) {
      setPreview(hotspot);
      return;
    }
    returnFocus.current = event.currentTarget;
    setOpenActivity(hotspot.target.nativeActivityId);
  };
  if (!book.pages.length) return <p>No pages are published for this book.</p>;
  if (!page) return <p role="alert">This published page is unavailable.</p>;
  return <section ref={surface} className="published-book-surface" data-release-id={book.releaseId} data-book-mode={mode}>
    <nav className="published-book-controls" aria-label="Published book pages">
      <label>Unit <select value={page.unitId} onChange={(event) => changePage(book.pages.find((item) => item.unitId === event.target.value).id)}>{book.pages.filter((item, index, all) => all.findIndex((entry) => entry.unitId === item.unitId) === index).map((item) => <option key={item.unitId} value={item.unitId}>{item.unitTitle}</option>)}</select></label>
      <button type="button" disabled={pageIndex < 1} onClick={() => changePage(book.pages[pageIndex - 1].id)}>Previous page</button>
      <label>Page <select value={pageId} onChange={(event) => changePage(event.target.value)}>{book.pages.map((item) => <option key={item.id} value={item.id}>{item.unitTitle} · {item.printedLabel} · {item.title}</option>)}</select></label>
      <button type="button" disabled={pageIndex >= book.pages.length - 1} onClick={() => changePage(book.pages[pageIndex + 1].id)}>Next page</button>
      <label>Zoom <input type="range" min="1" max="3" step="0.1" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
      <output>{Math.round(zoom * 100)}%</output>
      <button type="button" onClick={() => { const action = document.fullscreenElement ? document.exitFullscreen() : surface.current?.requestFullscreen?.(); action?.catch(() => setLaunchError("Fullscreen is unavailable in this browser.")); }}>Fullscreen</button>
    </nav>
    {mode === "assigned" ? <p>Only the assigned exercise can be answered here. Use Assignments to open another Homework item.</p> : null}
    <div className="published-page-scroll">
      <div className="published-page" style={{ width: `${zoom * 100}%`, aspectRatio: `${page.image.width} / ${page.image.height}` }}>
        <PageImage key={`${book.releaseId}:${page.id}`} book={book} page={page} />
        <div className="published-page-hotspots" aria-label="Page activities">{page.hotspots.map((hotspot) => {
          const isSelected = selectedKeys.has(publishedTargetKey(hotspot.target));
          const isAssigned = isAssignedHotspot(hotspot);
          const locked = mode === "assigned" && !isAssigned && hotspot.submittable;
          return <button key={hotspot.id} type="button" className={`${isSelected ? "selected" : ""} ${isAssigned ? "assigned" : ""}`} style={{ left: `${hotspot.left}%`, top: `${hotspot.top}%`, width: `${hotspot.width}%`, height: `${hotspot.height}%` }} aria-label={`${hotspot.title}${isSelected ? " · selected" : ""}${isAssigned ? " · assigned" : ""}${locked ? " · read-only preview" : ""}`} aria-pressed={mode === "picker" ? isSelected : undefined} onClick={(event) => activate(hotspot, event)}><span>{isSelected ? "✓ " : isAssigned ? "Assigned · " : ""}{hotspot.title}</span></button>;
        })}</div>
      </div>
    </div>
    <details><summary>Activities on this page</summary><ul className="published-picker-list">{page.hotspots.map((hotspot) => <li key={hotspot.id}><button type="button" onClick={(event) => activate(hotspot, event)}>{hotspot.title}{isAssignedHotspot(hotspot) ? " · assigned" : ""}</button></li>)}</ul></details>
    <PublishedBookMedia key={`${book.releaseId}:${page.id}`} book={book} page={page} />
    {launchError ? <p role="alert">{launchError}</p> : null}
    {focusedHotspot ? <div className="published-hotspot-details" aria-live="polite"><strong>{focusedHotspot.title}</strong><span>{book.componentTitle} · {page.unitTitle} · Page {page.printedLabel} · {focusedHotspot.type}</span>
      {mode === "picker" && focusedHotspot.assignable ? <button type="button" onClick={() => onToggle?.(focusedHotspot, book, page)}>{selectedKeys.has(publishedTargetKey(focusedHotspot.target)) ? "Remove selection" : "Add exercise"}</button> : null}
      {mode === "picker" && focusedHotspot.target ? <button type="button" onClick={() => setPreview(focusedHotspot)}>Preview exercise</button> : null}
      {!focusedHotspot.assignable ? <small>This material is available for viewing and cannot be assigned from this hotspot.</small> : null}
      {mode === "assigned" && focusedHotspot.submittable && focusedHotspot.target?.nativeActivityId !== assignedTarget?.nativeActivityId ? <small>This preview is read-only. Open its authorized assignment to answer this exercise.</small> : null}
    </div> : null}
    {mode === "assigned" ? <button type="button" onClick={() => { if (initialLocator?.pageId) changePage(initialLocator.pageId); setOpenActivity(assignedTarget.nativeActivityId); }}>Return to assigned exercise</button> : null}
    <section className="published-book-activity" hidden={!openActivity} aria-label="Interactive exercise" onKeyDown={(event) => { if (event.key === "Escape") closeActivity(); }}>
      <button ref={activityClose} type="button" onClick={closeActivity}>Close exercise · Return to page</button>
      {mode === "assigned" ? renderAssignedActivity?.() : openActivity ? <PublishedActivityPreview key={openActivity} book={book} activityId={openActivity} teacherMode={teacherMode} /> : null}
    </section>
    <dialog ref={dialog} className="published-preview-dialog" onCancel={() => setPreview(null)} onClose={() => setPreview(null)}>
      <button type="button" autoFocus onClick={() => setPreview(null)}>Close preview</button>
      {preview ? <PublishedActivityPreview book={book} activityId={preview.target.nativeActivityId} readOnly={mode === "assigned"} /> : null}
    </dialog>
  </section>;
}
