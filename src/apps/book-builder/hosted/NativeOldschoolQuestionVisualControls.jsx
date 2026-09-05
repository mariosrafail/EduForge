import { useEffect, useRef, useState } from "react";
import { createNativeChildId } from "../../../data/native-activities/nativeChildIdentity.js";
import { mergeNativeManagedAssetReference, removeNativeManagedAssetReferenceIfUnused } from "../../../data/native-activities/nativeActivityPublic.js";
import { duplicateNativeOpenResponseArtwork, initialNativeOpenResponseArtworkArea } from "../../../data/native-activities/nativeOpenResponse.js";
import { oldschoolQuestionPanel, setOldschoolQuestionMembership } from "../../../data/native-activities/nativeOldschoolQuestionSurface.js";
import { uploadNativeActivityArtwork } from "./builderNativeActivityApi.js";
import { PanelCompositionControls } from "./NativeOpenResponsePanelCompositionControls.jsx";

export function NativeOldschoolQuestionComposition({ interaction, mutatePublic, setSelection }) {
  const change = (id, membership, included) => {
    mutatePublic((next) => setOldschoolQuestionMembership(next.parts[0].interaction, id, membership, included));
    setSelection(null);
  };
  return <>
    <p>Questions share one fixed surface. Hiding a prompt keeps its question and private model answer.</p>
    <PanelCompositionControls panel={oldschoolQuestionPanel(interaction)} questions={interaction.questions} onChange={change} />
    <div>{[false, true].map((visible) => <button key={String(visible)} type="button" onClick={() => {
      mutatePublic((next) => { const current = next.parts[0].interaction; current.questions.forEach((question) => setOldschoolQuestionMembership(current, question.id, "prompt", visible)); });
      setSelection(null);
    }}>{visible ? "Restore all prompts" : "Hide all prompts"}</button>)}</div>
  </>;
}

export function NativeOldschoolQuestionArtworkControls({ publicDraft, selectedArtwork, mutatePublic, setSelection, bookSlug, componentSlug, onMessage, onPendingChange }) {
  const operation = useRef(null);
  const [pending, setPending] = useState(false);
  const pendingCallback = useRef(onPendingChange); pendingCallback.current = onPendingChange;
  useEffect(() => () => { if (operation.current) pendingCallback.current(false); operation.current = null; }, [publicDraft.activityId, bookSlug, componentSlug]);
  const upload = async (file, { background = false, replaceId = null } = {}) => {
    if (!file || operation.current) return;
    const token = {}; operation.current = token; setPending(true); onPendingChange(true);
    try {
      const uploaded = await uploadNativeActivityArtwork({ bookSlug, componentSlug, activityId: publicDraft.activityId, assetSlot: createNativeChildId("asset"), file });
      if (operation.current !== token) return;
      const imageId = replaceId || createNativeChildId("art");
      mutatePublic((next) => {
        if (next.activityId !== publicDraft.activityId) return;
        const current = next.parts[0].interaction;
        const existing = replaceId ? current.artwork.find((image) => image.id === replaceId) : null;
        if (replaceId && !existing) return;
        const oldSlot = existing?.assetSlot;
        next.assets = mergeNativeManagedAssetReference(next.assets, uploaded.reference);
        if (existing) existing.assetSlot = uploaded.reference.slot;
        else {
          const surface = { width: current.panels[0].sourceWidth, height: current.panels[0].sourceHeight };
          const image = { id: imageId, assetSlot: uploaded.reference.slot, area: background ? { x: 0, y: 0, ...surface } : initialNativeOpenResponseArtworkArea(surface, uploaded.metadata), order: current.artwork.length, altText: "", decorative: background, fit: background ? "cover" : "contain", locked: false };
          if (background) current.artwork.unshift(image); else current.artwork.push(image);
          current.artwork.forEach((entry, order) => { entry.order = order; });
        }
        if (oldSlot) removeNativeManagedAssetReferenceIfUnused(next, oldSlot);
      });
      setSelection({ type: "artwork", id: imageId }); onMessage("Image uploaded. Save Draft to retain it.");
    } catch { if (operation.current === token) onMessage("Image upload failed. Previous artwork is preserved."); }
    finally { if (operation.current === token) { operation.current = null; setPending(false); onPendingChange(false); } }
  };
  const move = (delta) => mutatePublic((next) => {
    const list = next.parts[0].interaction.artwork;
    const index = list.findIndex((image) => image.id === selectedArtwork.id);
    if (index < 0 || index + delta < 0 || index + delta >= list.length) return;
    [list[index], list[index + delta]] = [list[index + delta], list[index]];
    list.forEach((image, order) => { image.order = order; });
  });
  return <fieldset disabled={pending}>
    <legend>Question artwork</legend>
    {[["Add Background", { background: true }], ["Add Image", {}], ...(selectedArtwork ? [["Replace image", { replaceId: selectedArtwork.id }]] : [])].map(([label, options]) => <label className="studio-upload-action" key={label}>{label}<input aria-label={label} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { upload(event.target.files?.[0], options); event.target.value = ""; }} /></label>)}
    {selectedArtwork ? <>
      <button type="button" disabled={selectedArtwork.order === 0} onClick={() => move(-1)}>Send backward</button>
      <button type="button" disabled={selectedArtwork.order === publicDraft.parts[0].interaction.artwork.length - 1} onClick={() => move(1)}>Bring forward</button>
      <button type="button" onClick={() => {
        const id = createNativeChildId("art");
        mutatePublic((next) => { const current = next.parts[0].interaction; duplicateNativeOpenResponseArtwork({ ...current, surface: oldschoolQuestionPanel(current).surface }, selectedArtwork.id, id); });
        setSelection({ type: "artwork", id });
      }}>Duplicate graphic</button>
    </> : null}
    {pending ? <p role="status">Uploading image…</p> : null}
  </fieldset>;
}
