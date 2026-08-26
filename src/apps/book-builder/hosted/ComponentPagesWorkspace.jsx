import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, FileImage, Pencil, Plus, RefreshCcw, RotateCcw, Trash2, Upload } from "lucide-react";

import { BuilderModal } from "./BuilderModal.jsx";
import { finalizeBuilderPage, getBuilderPages, mutateBuilderPage, prepareBuilderPage, uploadBuilderPage } from "./builderPagesApi.js";
import "./componentPagesWorkspace.css";

const mutationId = () => globalThis.crypto.randomUUID();
const fileType = (file) => file.type || (/\.png$/i.test(file.name) ? "image/png" : /\.webp$/i.test(file.name) ? "image/webp" : "image/jpeg");
const metadataFor = (page) => ({ label: page.label, printedLabel: page.printedLabel || "", sortOrder: page.sortOrder });

function PageCard({ page, selected, workbook, busy, onSelect, onReplace, onEdit, onMove, onDelete, onRestore }) {
  return <article className="component-page-card" data-page-id={page.id} data-source={page.source} data-selected={selected || undefined}>
    <button className="component-page-image" type="button" onClick={onSelect} aria-label={`Preview ${page.label}`}>
      <img src={page.image.url} alt="" loading="lazy" width={page.image.width} height={page.image.height} />
    </button>
    <div className="component-page-card-copy"><span>{page.printedLabel ? `Pages ${page.printedLabel}` : "Unnumbered"}</span><strong>{page.label}</strong><small>{page.image.width} × {page.image.height} · {(page.image.byteSize / 1024).toFixed(0)} KB</small></div>
    <div className="component-page-actions">
      {workbook ? <><button type="button" disabled={busy} onClick={() => onMove(-1)} title="Move earlier"><ArrowUp aria-hidden="true" /></button><button type="button" disabled={busy} onClick={() => onMove(1)} title="Move later"><ArrowDown aria-hidden="true" /></button><button type="button" disabled={busy} onClick={onEdit} title="Edit metadata"><Pencil aria-hidden="true" /></button></> : null}
      <label className="component-page-file-action" title="Replace page image"><Upload aria-hidden="true" /><span className="sr-only">Replace {page.label}</span><input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => { const [file] = event.target.files || []; if (file) onReplace(file); event.target.value = ""; }} /></label>
      {workbook ? <button className="is-danger" type="button" disabled={busy} onClick={onDelete} title="Delete page"><Trash2 aria-hidden="true" /></button> : page.source === "override" ? <button type="button" disabled={busy} onClick={onRestore} title="Restore canonical page"><RotateCcw aria-hidden="true" /></button> : null}
    </div>
  </article>;
}

export function ComponentPagesWorkspace({ bookSlug, componentSlug }) {
  const identity = useMemo(() => ({ bookSlug, componentSlug }), [bookSlug, componentSlug]);
  const workbook = componentSlug === "ultimate-b2-workbook";
  const [state, setState] = useState({ loading: true, revision: 0, pages: [], error: "" });
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [editor, setEditor] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const addInput = useRef(null);

  const apply = (result) => {
    setState({ loading: false, revision: result.revision, pages: result.pages, error: "" });
    setSelectedId((current) => result.pages.some((page) => page.id === current) ? current : result.pages[0]?.id || "");
  };
  const reload = async (signal) => {
    try { apply(await getBuilderPages(identity, { signal })); }
    catch (error) { if (error.name !== "AbortError") setState((current) => ({ ...current, loading: false, error: error.message || "Could not load pages." })); }
  };
  useEffect(() => { const controller = new AbortController(); reload(controller.signal); return () => controller.abort(); }, [identity]);

  const uploadOne = async ({ file, mode, pageId = "", metadata, expectedRevision }) => {
    const normalizedFile = file.type ? file : new File([file], file.name, { type: fileType(file) });
    const clientMutationId = mutationId();
    const prepared = await prepareBuilderPage(identity, { mode, pageId, expectedRevision, clientMutationId, metadata, file: normalizedFile });
    await uploadBuilderPage(normalizedFile, prepared.authorization, setProgress);
    return finalizeBuilderPage(identity, { uploadId: prepared.uploadId, expectedRevision, clientMutationId });
  };
  const run = async (operation) => {
    setBusy(true); setProgress(0); setState((current) => ({ ...current, error: "" }));
    try { const result = await operation(); if (result?.pages) apply(result); }
    catch (error) {
      setState((current) => ({ ...current, error: error?.payload?.error || error.message || "Page operation failed." }));
      if (error?.status === 409) await reload();
    } finally { setBusy(false); setProgress(0); }
  };
  const replace = (page, file) => run(() => uploadOne({ file, mode: "replace", pageId: page.id, metadata: metadataFor(page), expectedRevision: state.revision }));
  const add = (files) => run(async () => {
    let result = { ...state };
    for (const [index, file] of [...files].entries()) {
      result = await uploadOne({ file, mode: "create", metadata: { label: file.name.replace(/\.[^.]+$/, ""), printedLabel: "", sortOrder: (result.pages.at(-1)?.sortOrder || 0) + 10 + index }, expectedRevision: result.revision });
      setProgress(Math.round(((index + 1) / files.length) * 100));
    }
    return result;
  });
  const mutate = (page, action, metadata = {}) => run(() => mutateBuilderPage(identity, page.id, action, { expectedRevision: state.revision, clientMutationId: mutationId(), metadata }));
  const move = (page, direction) => {
    const ordered = [...state.pages].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = ordered.findIndex((item) => item.id === page.id);
    const other = ordered[index + direction];
    if (!other) return;
    mutate(page, "reorder", { ...metadataFor(page), sortOrder: other.sortOrder + (direction < 0 ? -1 : 1) });
  };
  const selected = state.pages.find((page) => page.id === selectedId) || state.pages[0];
  const groups = workbook ? [{ title: "Workbook pages", pages: state.pages }] : [...new Set(state.pages.map((page) => page.unitNumber))].map((unitNumber) => ({ title: `Unit ${unitNumber}`, pages: state.pages.filter((page) => page.unitNumber === unitNumber) }));

  return <main className="component-pages-workspace" data-component-pages={componentSlug}>
    <header className="component-pages-header"><div><span>{workbook ? "Workbook" : "Students Book"} · Pages</span><h1>Page library</h1><p>{workbook ? "Upload, label, order, replace, and remove Workbook pages." : "Review every canonical Students Book page, replace its raster safely, or restore the baseline."}</p></div><div>{workbook ? <button className="hosted-builder-action" type="button" disabled={busy} onClick={() => addInput.current?.click()}><Plus aria-hidden="true" /> Add pages</button> : null}<button type="button" disabled={busy} onClick={() => reload()}><RefreshCcw aria-hidden="true" /> Refresh</button><input ref={addInput} hidden multiple type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { if (event.target.files?.length) add(event.target.files); event.target.value = ""; }} /></div></header>
    {busy ? <div className="component-pages-progress" role="status"><span style={{ width: `${progress}%` }} /> Processing page assets… {progress ? `${progress}%` : ""}</div> : null}
    {state.error ? <p className="builder-inline-error component-pages-error" role="alert">{state.error}</p> : null}
    {state.loading ? <p className="component-pages-empty" role="status">Loading page library…</p> : !state.pages.length ? <section className="component-pages-empty"><FileImage aria-hidden="true" /><h2>No pages added yet.</h2><p>Add raster pages to begin the Workbook library.</p>{workbook ? <button className="hosted-builder-action" type="button" onClick={() => addInput.current?.click()}>Add pages</button> : null}</section> : <div className="component-pages-layout">
      <div className="component-pages-groups">{groups.map((group) => <section key={group.title}><h2>{group.title}<span>{group.pages.length}</span></h2><div className="component-page-grid">{group.pages.map((page) => <PageCard key={page.id} page={page} selected={page.id === selected?.id} workbook={workbook} busy={busy} onSelect={() => setSelectedId(page.id)} onReplace={(file) => replace(page, file)} onEdit={() => setEditor({ page, ...metadataFor(page) })} onMove={(direction) => move(page, direction)} onDelete={() => setConfirmDelete(page)} onRestore={() => mutate(page, "restore")} />)}</div></section>)}</div>
      {selected ? <aside className="component-page-inspector"><span>Selected page</span><h2>{selected.label}</h2><div className="component-page-preview"><img src={selected.image.url} alt={`${selected.label} preview`} width={selected.image.width} height={selected.image.height} /></div><dl><div><dt>Page ID</dt><dd><code>{selected.id}</code></dd></div><div><dt>Printed pages</dt><dd>{selected.printedLabel || "Not set"}</dd></div><div><dt>Source</dt><dd>{selected.source === "repository-baseline" ? "Canonical baseline" : selected.source === "override" ? "Managed replacement" : "Managed upload"}</dd></div><div><dt>Dimensions</dt><dd>{selected.image.width} × {selected.image.height}</dd></div><div><dt>SHA-256</dt><dd><code>{selected.image.checksumSha256.slice(0, 16)}…</code></dd></div></dl></aside> : null}
    </div>}
    <BuilderModal open={Boolean(editor)} title="Edit page metadata" description="Update the editorial label and printed-page reference." onClose={() => setEditor(null)}><form className="component-page-editor" onSubmit={(event) => { event.preventDefault(); const page = editor.page; const metadata = { label: editor.label.trim(), printedLabel: editor.printedLabel.trim(), sortOrder: editor.sortOrder }; setEditor(null); mutate(page, "metadata", metadata); }}><label><span>Label</span><input autoFocus required maxLength={160} value={editor?.label || ""} onChange={(event) => setEditor((current) => ({ ...current, label: event.target.value }))} /></label><label><span>Printed page or spread</span><input maxLength={40} value={editor?.printedLabel || ""} onChange={(event) => setEditor((current) => ({ ...current, printedLabel: event.target.value }))} /></label><footer><button type="button" onClick={() => setEditor(null)}>Cancel</button><button className="hosted-builder-action" type="submit">Save metadata</button></footer></form></BuilderModal>
    <BuilderModal open={Boolean(confirmDelete)} title="Delete Workbook page?" description="The page will be removed from the active library. Referenced pages are protected." onClose={() => setConfirmDelete(null)}><div className="component-page-delete"><p><strong>{confirmDelete?.label}</strong></p><div><button type="button" onClick={() => setConfirmDelete(null)}>Cancel</button><button className="builder-danger-action" type="button" onClick={() => { const page = confirmDelete; setConfirmDelete(null); mutate(page, "delete"); }}>Delete page</button></div></div></BuilderModal>
  </main>;
}

export default ComponentPagesWorkspace;
