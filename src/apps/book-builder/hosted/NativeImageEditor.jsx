import { useEffect, useMemo, useState } from "react";

import { NativeImageSurface } from "../../../components/native-image/NativeImageSurface.jsx";
import { createNativeChildId } from "../../../data/native-activities/nativeChildIdentity.js";
import { assessNativeImageReadiness } from "../../../data/native-activities/nativeImage.js";
import { getBuilderContent } from "./builderContentApi.js";
import { saveNativeActivityPair, uploadNativeActivityAsset } from "./builderNativeActivityApi.js";

const clone = (value) => structuredClone(value);
const previewRoot = (bookSlug, componentSlug, activityId, assetId) => `/builder/api/native-activities/books/${encodeURIComponent(bookSlug)}/components/${encodeURIComponent(componentSlug)}/activities/${encodeURIComponent(activityId)}/assets/${encodeURIComponent(assetId)}/preview`;

export function NativeImageEditor({ bookSlug, componentSlug, activityId, placementLabel, onDirtyChange = () => {} }) {
  const [state, setState] = useState({ kind: "loading", message: "" });
  const [publicDraft, setPublicDraft] = useState(null);
  const [teacherDraft, setTeacherDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState("content");

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading", message: "" }); setPublicDraft(null); setTeacherDraft(null); setDirty(false); onDirtyChange(false);
    Promise.all([
      getBuilderContent({ bookSlug, componentSlug, resource: "native-activity-public", documentKey: activityId }, { signal: controller.signal }),
      getBuilderContent({ bookSlug, componentSlug, resource: "native-activity-teacher", documentKey: activityId }, { signal: controller.signal }),
    ]).then(([publicValue, teacherValue]) => {
      if (controller.signal.aborted) return;
      setPublicDraft(publicValue.document); setTeacherDraft(teacherValue.document);
      setState({ kind: "ready", publicRevision: publicValue.revision, teacherRevision: teacherValue.revision, message: "Saved draft" });
    }).catch((error) => { if (!controller.signal.aborted) setState({ kind: "error", message: error.message }); });
    return () => controller.abort();
  }, [activityId, bookSlug, componentSlug]);

  const interaction = publicDraft?.parts[0].interaction;
  const readiness = useMemo(() => publicDraft ? assessNativeImageReadiness(publicDraft) : null, [publicDraft]);
  const mutate = (mutator) => { setPublicDraft((current) => { const next = clone(current); mutator(next); return next; }); setDirty(true); onDirtyChange(true); };
  const upload = async (file) => {
    if (!file) return;
    setUploading(true); setState((current) => ({ ...current, message: "Uploading image…" }));
    try {
      const slot = createNativeChildId("asset");
      const uploaded = await uploadNativeActivityAsset({ bookSlug, componentSlug, activityId, assetSlot: slot, file });
      mutate((next) => {
        const current = next.parts[0].interaction;
        next.assets = [uploaded.reference];
        current.image = { assetSlot: slot, fit: current.image?.fit || "contain", decorative: current.image?.decorative || false };
      });
      setState((current) => ({ ...current, message: "Image uploaded; save the draft to attach it." }));
    } catch (error) { setState((current) => ({ ...current, message: error.message })); }
    finally { setUploading(false); }
  };
  const remove = () => {
    if (!globalThis.confirm("Remove this image from the draft? The uploaded asset remains retained for lifecycle cleanup.")) return;
    mutate((next) => { next.assets = []; next.parts[0].interaction.image = null; next.parts[0].interaction.altText = ""; });
  };
  const save = async () => {
    setState((current) => ({ ...current, saving: true, message: "Saving…" }));
    try {
      const value = await saveNativeActivityPair({ bookSlug, componentSlug, activityId, expectedPublicRevision: state.publicRevision, expectedTeacherRevision: state.teacherRevision, publicDocument: publicDraft, teacherDocument: teacherDraft });
      setPublicDraft(value.publicDocument); setTeacherDraft(value.teacherDocument); setDirty(false); onDirtyChange(false);
      setState({ kind: "ready", publicRevision: value.publicRevision, teacherRevision: value.teacherRevision, saving: false, message: "Draft saved." });
    } catch (error) { setState((current) => ({ ...current, saving: false, message: error.status === 409 ? "This draft changed elsewhere. Reload before saving; your unsaved edits are preserved." : error.message })); }
  };

  if (state.kind === "loading") return <section className="native-activity-foundation" role="status">Loading native Image…</section>;
  if (state.kind === "error" || !publicDraft || !teacherDraft) return <section className="native-activity-foundation" role="alert">{state.message || "Native draft is unavailable."}</section>;
  const assetUrl = (assetId) => previewRoot(bookSlug, componentSlug, activityId, assetId);
  return <section className="native-activity-foundation native-image-editor">
    <header><div><span>Native draft · not included in publication v1</span><h2>{publicDraft.metadata.title}</h2></div><dl><div><dt>Stable ID</dt><dd><code>{activityId}</code></dd></div><div><dt>Kind</dt><dd>Image</dd></div><div><dt>Placement</dt><dd>{placementLabel}</dd></div><div><dt>Revisions</dt><dd>Public {state.publicRevision} · Teacher {state.teacherRevision}</dd></div></dl></header>
    <nav className="native-or-tabs" aria-label="Image authoring"><button type="button" aria-current={tab === "content" ? "page" : undefined} onClick={() => setTab("content")}>Content</button><button type="button" aria-current={tab === "preview" ? "page" : undefined} onClick={() => setTab("preview")}>Preview</button></nav>
    {tab === "content" ? <div className="native-image-workspace"><div className="native-activity-foundation-fields"><label><span>Activity title</span><input value={publicDraft.metadata.title} maxLength={300} onChange={(event) => mutate((next) => { next.metadata.title = event.target.value; })} /></label><label><span>Visible instruction</span><textarea value={publicDraft.metadata.visibleInstructionText} maxLength={2000} rows={3} onChange={(event) => mutate((next) => { next.metadata.visibleInstructionText = event.target.value; })} /></label></div><NativeImageSurface document={publicDraft} assetUrl={assetUrl} /><div className="native-image-controls"><label className="native-or-upload"><span>{uploading ? "Uploading…" : interaction.image ? "Replace image" : "Upload image"}</span><input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => { upload(event.target.files?.[0]); event.target.value = ""; }} /></label>{interaction.image ? <><label><span>Alt text</span><textarea value={interaction.altText} maxLength={2000} disabled={interaction.image.decorative} onChange={(event) => mutate((next) => { next.parts[0].interaction.altText = event.target.value; })} /></label><label><input type="checkbox" checked={interaction.image.decorative} onChange={(event) => mutate((next) => { next.parts[0].interaction.image.decorative = event.target.checked; })} /> Decorative image</label><label><span>Fit</span><select value={interaction.image.fit} onChange={(event) => mutate((next) => { next.parts[0].interaction.image.fit = event.target.value; })}><option value="contain">Contain</option><option value="cover">Cover</option></select></label><button type="button" onClick={remove}>Remove image</button></> : null}</div></div> : null}
    {tab === "preview" ? <div className="native-or-preview"><h3>{publicDraft.metadata.title}</h3>{publicDraft.metadata.visibleInstructionText ? <p>{publicDraft.metadata.visibleInstructionText}</p> : null}<NativeImageSurface document={publicDraft} assetUrl={assetUrl} /></div> : null}
    <aside className="native-or-readiness" role="status"><strong>{readiness.ready ? "Draft is future-publish ready" : "Incomplete draft"}</strong>{readiness.issues.length ? <ul>{readiness.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : null}</aside>
    <footer><span data-dirty={dirty || undefined} role="status">{dirty ? "Unsaved changes" : state.message}</span><button type="button" disabled={!dirty || state.saving || !publicDraft.metadata.title.trim()} onClick={save}>{state.saving ? "Saving…" : "Save Draft"}</button></footer>
  </section>;
}
