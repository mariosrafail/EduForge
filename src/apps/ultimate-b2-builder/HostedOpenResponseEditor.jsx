import { useEffect, useRef, useState } from "react";

import {
  getBuilderContent,
  newBuilderClientMutationId,
  saveBuilderContent,
} from "../book-builder/hosted/builderContentApi.js";

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
  const mutationId = useRef(null);
  const dirty = Boolean(document && savedDocument && !sameDocument(document, savedDocument));

  const load = async (signal) => {
    setState("loading");
    setError("");
    const payload = await getBuilderContent({ ...identity, documentKey: activityId }, { signal });
    setDocument(payload.document);
    setSavedDocument(payload.document);
    setRevision(payload.revision);
    setSource(payload.source);
    setMode("view");
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
    <p className="b2-hosted-open-response-boundary">Only public instruction and question prompts are editable. Teacher answers stay canonical and read-only. Uploads, media, XML, geometry, activity creation, and deletion are unavailable.</p>
    {error ? <p className="b2-hosted-open-response-error" role="alert">{error}</p> : null}
    <label>Student instruction<textarea rows={2} readOnly={mode !== "edit"} value={document.visibleInstructionText} onChange={(event) => update((current) => ({ ...current, visibleInstructionText: event.target.value }))} /></label>
    <div className="b2-hosted-open-response-questions">{document.questions.map((question, index) => <label key={question.id}><span>Question {index + 1}</span><textarea rows={3} readOnly={mode !== "edit"} value={question.prompt} onChange={(event) => update((current) => ({ ...current, questions: current.questions.map((item) => item.id === question.id ? { ...item, prompt: event.target.value } : item) }))} /></label>)}</div>
  </section>;
}

export default HostedOpenResponseEditor;
