import { useEffect, useRef, useState } from "react";

import {
  getBuilderContent,
  newBuilderClientMutationId,
  saveBuilderContent,
} from "../book-builder/hosted/builderContentApi.js";
import {
  finalizeOpenResponseImport,
  getOpenResponseImportStatus,
  prepareOpenResponseImport,
  uploadOpenResponseImportFile,
} from "../book-builder/hosted/builderOpenResponseImportApi.js";

const identity = Object.freeze({
  bookSlug: "ultimate-b2",
  componentSlug: "ultimate-b2-students-book",
  resource: "open-response",
});

function sameDocument(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function HostedOpenResponseEditor({ activityId, onDirtyChange, onSaved }) {
  const [document, setDocument] = useState(null);
  const [savedDocument, setSavedDocument] = useState(null);
  const [revision, setRevision] = useState(0);
  const [source, setSource] = useState("repository");
  const [mode, setMode] = useState("view");
  const [state, setState] = useState("loading");
  const [error, setError] = useState("");
  const [importStatus, setImportStatus] = useState({ revision: 0, fingerprint: null, updatedAt: null });
  const [sourceFiles, setSourceFiles] = useState([]);
  const [importState, setImportState] = useState("idle");
  const [importError, setImportError] = useState("");
  const [uploadProgress, setUploadProgress] = useState({});
  const mutationId = useRef(null);
  const dirty = Boolean(document && savedDocument && !sameDocument(document, savedDocument));

  const load = async (signal) => {
    setState("loading");
    setError("");
    const [payload, currentImport] = await Promise.all([
      getBuilderContent({ ...identity, documentKey: activityId }, { signal }),
      getOpenResponseImportStatus(activityId, { signal }),
    ]);
    setDocument(payload.document);
    setSavedDocument(payload.document);
    setRevision(payload.revision);
    setSource(payload.source);
    setMode("view");
    setImportStatus(currentImport);
    mutationId.current = null;
    setState("ready");
  };

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch((loadError) => {
      if (controller.signal.aborted) return;
      setError(loadError.message || "Open Response authoring could not be loaded.");
      setState("error");
    });
    return () => controller.abort();
  }, [activityId]);

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const update = (updater) => {
    mutationId.current = null;
    setDocument((current) => updater(current));
    setState("ready");
    setError("");
  };

  const save = async () => {
    if (!dirty || state === "saving") return;
    setState("saving");
    setError("");
    mutationId.current ||= newBuilderClientMutationId();
    try {
      const payload = await saveBuilderContent({
        ...identity,
        documentKey: activityId,
        expectedRevision: revision,
        clientMutationId: mutationId.current,
        document,
      });
      setDocument(payload.document);
      setSavedDocument(payload.document);
      setRevision(payload.revision);
      setSource(payload.source);
      mutationId.current = null;
      setMode("view");
      setState("saved");
      onSaved?.(payload.revision);
    } catch (saveError) {
      if (saveError.status === 409) {
        setState("conflict");
        setError("A newer saved revision exists. Your unsaved text is still here; reload it explicitly to continue.");
      } else {
        setState("error");
        setError(saveError.message || "Open Response authoring could not be saved.");
      }
    }
  };

  const reloadLatest = async () => {
    try {
      await load();
    } catch (loadError) {
      setError(loadError.message || "The latest saved revision could not be loaded.");
      setState("error");
    }
  };

  const selectSourceFiles = (fileList) => {
    const files = [...(fileList || [])];
    setSourceFiles(files);
    setUploadProgress({});
    setImportState("selected");
    setImportError("");
    const lower = files.map((file) => file.name.toLowerCase());
    if (files.length < 2 || lower.filter((name) => name === "obj_params.xml").length !== 1 || lower.filter((name) => name === "ebook_obj_params.xml").length !== 1) {
      setImportState("invalid");
      setImportError("Select exactly one obj_params.xml, one ebook_obj_params.xml, and every referenced raster image.");
    }
  };

  const importSource = async () => {
    if (dirty) {
      setImportError("Save or deliberately reload your unsaved text edits before importing publisher source.");
      setImportState("blocked");
      return;
    }
    if (!sourceFiles.length || ["preparing", "uploading", "finalizing"].includes(importState)) return;
    const clientMutationId = newBuilderClientMutationId();
    setImportError("");
    setImportState("preparing");
    try {
      const prepared = await prepareOpenResponseImport({ activityId, expectedRevision: importStatus.revision, clientMutationId, files: sourceFiles });
      setImportState("uploading");
      const filesByName = new Map(sourceFiles.map((file) => [file.name, file]));
      for (const upload of prepared.uploads) {
        const file = filesByName.get(upload.name);
        if (!file) throw new Error(`Prepared upload no longer matches ${upload.name}.`);
        await uploadOpenResponseImportFile(file, upload, (progress) => setUploadProgress((current) => ({ ...current, [upload.name]: progress })));
      }
      setImportState("finalizing");
      const committed = await finalizeOpenResponseImport({ uploadId: prepared.uploadId, expectedRevision: importStatus.revision, clientMutationId });
      setImportStatus({ revision: committed.revision, fingerprint: committed.fingerprint, updatedAt: new Date().toISOString() });
      setSourceFiles([]);
      setUploadProgress({});
      setImportState("succeeded");
      onSaved?.({ kind: "publisher-source-import", revision: committed.revision });
    } catch (importFailure) {
      setImportState(importFailure.status === 409 ? "conflict" : "failed");
      setImportError(importFailure.status === 409
        ? "A newer publisher-source revision exists. Reload this activity before importing again."
        : importFailure.message || "Publisher source import failed; the previous saved revision is still current.");
    }
  };

  if (!document) return <section className="b2-hosted-open-response-editor" aria-label="Open Response editor"><p role="status">{state === "error" ? error : "Loading canonical Open Response authoring…"}</p></section>;

  const status = state === "saving" ? "Saving…"
    : state === "conflict" ? "Conflict — unsaved changes retained"
      : dirty ? "Unsaved changes"
        : state === "saved" ? "Saved"
          : source === "repository" ? "Canonical baseline" : "Saved draft";

  return <section className="b2-hosted-open-response-editor" aria-label="Open Response editor" data-editor-state={state}>
    <header>
      <div><span>Editable Open Response</span><h2>Public student-facing authoring</h2><small>Revision {revision} · {source === "repository" ? "canonical tracked seed" : "hosted saved draft"}</small></div>
      <div className="b2-hosted-open-response-actions">
        <strong role="status">{status}</strong>
        {mode === "view" ? <button type="button" onClick={() => setMode("edit")}>Edit public authoring</button> : null}
        {mode === "edit" ? <button type="button" disabled={!dirty || state === "saving"} onClick={save}>{state === "saving" ? "Saving…" : "Save draft"}</button> : null}
        {state === "conflict" ? <button type="button" onClick={reloadLatest}>Reload latest saved</button> : null}
      </div>
    </header>
    <p className="b2-hosted-open-response-boundary">Public text edits stay separate from publisher source. A successful deterministic import updates artwork, layout and the hosted Teacher Review answer; raw XML and Teacher data are never public.</p>
    {error ? <p className="b2-hosted-open-response-error" role="alert">{error}</p> : null}
    <label>Student instruction<textarea rows={2} readOnly={mode !== "edit"} value={document.visibleInstructionText} onChange={(event) => update((current) => ({ ...current, visibleInstructionText: event.target.value }))} /></label>
    <div className="b2-hosted-open-response-questions">{document.questions.map((question, index) => <label key={question.id}><span>Question {index + 1}</span><textarea rows={3} readOnly={mode !== "edit"} value={question.prompt} onChange={(event) => update((current) => ({ ...current, questions: current.questions.map((item) => item.id === question.id ? { ...item, prompt: event.target.value } : item) }))} /></label>)}</div>
    <section className="b2-hosted-source-import" aria-label="Publisher Source Import" data-import-state={importState}>
      <header><div><span>Publisher Source Import</span><h3>Deterministic XML + raster package</h3></div><strong>Import revision {importStatus.revision}</strong></header>
      <p>Select exactly two decoded XML parameter files and their referenced PNG, JPEG, or WebP raster files. No AI, OCR, ZIP, PDF, audio, or video is used.</p>
      {importStatus.fingerprint ? <p className="b2-hosted-import-fingerprint">Current fingerprint <code>{importStatus.fingerprint}</code></p> : <p>No hosted publisher-source import has been committed.</p>}
      <label className="b2-hosted-source-picker">Publisher source files<input type="file" multiple accept=".xml,.png,.jpg,.jpeg,.webp" disabled={["preparing", "uploading", "finalizing"].includes(importState)} onChange={(event) => selectSourceFiles(event.target.files)} /></label>
      {sourceFiles.length ? <ul className="b2-hosted-source-files">{sourceFiles.map((file) => <li key={`${file.name}:${file.size}`}><span>{file.name}</span><small>{file.size.toLocaleString()} bytes{uploadProgress[file.name] == null ? "" : ` · ${uploadProgress[file.name]}%`}</small></li>)}</ul> : null}
      {Object.keys(uploadProgress).length ? <p role="status">Uploaded {Object.values(uploadProgress).filter((value) => value === 100).length} of {sourceFiles.length} files.</p> : null}
      {importError ? <p className="b2-hosted-open-response-error" role="alert">{importError}</p> : null}
      {dirty ? <p className="b2-hosted-import-dirty-warning">Save or reload the unsaved text draft before starting an import.</p> : null}
      <button type="button" disabled={dirty || !sourceFiles.length || ["invalid", "preparing", "uploading", "finalizing"].includes(importState)} onClick={importSource}>
        {importState === "preparing" ? "Preparing secure upload…" : importState === "uploading" ? "Uploading source files…" : importState === "finalizing" ? "Validating and finalizing…" : "Upload and import publisher source"}
      </button>
      {importState === "succeeded" ? <p className="b2-hosted-import-success" role="status">Import committed. The canonical Teacher Review Viewer has refreshed.</p> : null}
    </section>
  </section>;
}

export default HostedOpenResponseEditor;
