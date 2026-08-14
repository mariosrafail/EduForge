import { useEffect, useState } from "react";

import { getBuilderContent, newBuilderClientMutationId, saveBuilderContent } from "./builderContentApi.js";
import { nativeActivityKindLabels } from "../../../data/native-activities/nativeActivityKinds.js";

export function NativeActivityFoundationEditor({ bookSlug, componentSlug, activityId, placementLabel, onDirtyChange = () => {} }) {
  const [state, setState] = useState({ kind: "loading" });
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading" }); setDraft(null); setDirty(false); onDirtyChange(false);
    getBuilderContent({ bookSlug, componentSlug, resource: "native-activity-public", documentKey: activityId }, { signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted) { setState({ kind: "ready", revision: value.revision }); setDraft(value.document); } })
      .catch((error) => { if (!controller.signal.aborted) setState({ kind: "error", message: error.message }); });
    return () => controller.abort();
  }, [activityId, bookSlug, componentSlug]);

  const updateMetadata = (key, value) => {
    setDraft((current) => ({ ...current, metadata: { ...current.metadata, [key]: value } }));
    setDirty(true); onDirtyChange(true);
  };

  const save = async () => {
    setState((current) => ({ ...current, saving: true, message: "" }));
    try {
      const value = await saveBuilderContent({ bookSlug, componentSlug, resource: "native-activity-public", documentKey: activityId, expectedRevision: state.revision, clientMutationId: newBuilderClientMutationId(), document: draft });
      setDraft(value.document); setDirty(false); onDirtyChange(false); setState({ kind: "ready", revision: value.revision, saving: false, message: "Draft saved." });
    } catch (error) {
      setState((current) => ({ ...current, saving: false, message: error.status === 409 ? "This draft changed elsewhere. Reload before saving again." : error.message }));
    }
  };

  if (state.kind === "loading") return <section className="native-activity-foundation" role="status">Loading native draft…</section>;
  if (state.kind === "error" || !draft) return <section className="native-activity-foundation" role="alert">{state.message || "Native draft is unavailable."}</section>;
  return <section className="native-activity-foundation">
    <header><div><span>Native draft · not included in publication v1</span><h2>{draft.metadata.title}</h2></div><dl><div><dt>Stable ID</dt><dd><code>{draft.activityId}</code></dd></div><div><dt>Kind</dt><dd>{nativeActivityKindLabels[draft.kind]}</dd></div><div><dt>Placement</dt><dd>{placementLabel}</dd></div><div><dt>Revision</dt><dd>{state.revision}</dd></div></dl></header>
    <div className="native-activity-foundation-fields"><label><span>Activity title</span><input value={draft.metadata.title} maxLength={300} onChange={(event) => updateMetadata("title", event.target.value)} /></label><label><span>Visible instruction</span><textarea value={draft.metadata.visibleInstructionText} maxLength={2000} rows={4} onChange={(event) => updateMetadata("visibleInstructionText", event.target.value)} /></label></div>
    <section className="native-activity-part-summary"><strong>Part 1</strong><code>{draft.parts[0].id}</code><p>{draft.kind === "open-response" ? "Native Open Response content editing arrives in Phase 3." : "Native Image content editing arrives in Phase 4."}</p></section>
    <footer><span data-dirty={dirty || undefined}>{dirty ? "Unsaved changes" : state.message || "Saved draft"}</span><button type="button" disabled={!dirty || state.saving || !draft.metadata.title.trim()} onClick={save}>{state.saving ? "Saving…" : "Save Draft"}</button></footer>
  </section>;
}
