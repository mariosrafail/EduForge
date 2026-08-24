import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, FileUp, Plus, Save, Trash2, Upload, Video } from "lucide-react";

import { createNativeChildId } from "../../data/native-activities/nativeChildIdentity.js";
import { parseTimedTextSrt } from "../../data/timed-media/timedText.js";
import { ultimateB2StudentsBookAuthoringPages } from "../../data/ultimate-b2/studentsBookAuthoringCatalog.js";
import { createEmptyUltimateB2UnitExtras, normalizeUltimateB2UnitExtrasDocument } from "../../data/ultimate-b2/unitExtras.js";
import { BuilderModal } from "../book-builder/hosted/BuilderModal.jsx";
import { getBuilderContent } from "../book-builder/hosted/builderContentApi.js";
import { saveUnitExtrasDocument, uploadUnitExtraVideo } from "../book-builder/hosted/builderUnitExtrasApi.js";

const identity = Object.freeze({ bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", resource: "unit-extras" });

function bytes(value) { return Number.isFinite(value) ? `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 1 : 2)} MiB` : "No MP4"; }
function duration(value) { const seconds = Math.round(Number(value || 0) / 1_000); return value ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "--:--"; }

function withUnit(document, unitNumber) {
  const next = structuredClone(document);
  const unitId = `unit-${unitNumber}`;
  if (!next.units.some((unit) => unit.unitId === unitId)) next.units.push({ unitId, unitNumber, categories: { videos: [] } });
  next.units.sort((left, right) => left.unitNumber - right.unitNumber);
  return next;
}

function mutateUnit(document, unitNumber, mutation) {
  const next = withUnit(document, unitNumber);
  mutation(next.units.find((unit) => unit.unitNumber === unitNumber), next);
  return next;
}

export function UnitExtrasEditor({ open, unit, onClose, returnFocusRef }) {
  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState(createEmptyUltimateB2UnitExtras);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [uploadingId, setUploadingId] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const unitNumber = Number(unit?.unitNumber || 0);
  const unitId = `unit-${unitNumber}`;
  const unitDraft = draft.units.find((entry) => entry.unitNumber === unitNumber);
  const videos = unitDraft?.categories.videos || [];
  const pages = useMemo(() => ultimateB2StudentsBookAuthoringPages.filter((page) => page.unitNumber === unitNumber), [unitNumber]);

  useEffect(() => {
    if (!open || !unitNumber) return undefined;
    const controller = new AbortController();
    setLoading(true); setMessage("");
    getBuilderContent(identity, { signal: controller.signal }).then((result) => {
      setRevision(result.revision || 0); setDraft(withUnit(result.document || createEmptyUltimateB2UnitExtras(), unitNumber)); setDirty(false);
    }).catch((error) => { if (error.name !== "AbortError") setMessage(error.message || "Unit Extras could not be loaded."); }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [open, unitNumber]);

  const change = (mutation) => { setDraft((current) => mutateUnit(current, unitNumber, mutation)); setDirty(true); setMessage(""); };
  const persist = async (candidate = draft) => {
    const result = await saveUnitExtrasDocument({ ...identity, expectedRevision: revision, document: normalizeUltimateB2UnitExtrasDocument(candidate) });
    setRevision(result.revision); setDraft(result.document); setDirty(false); return result;
  };
  const save = async () => {
    setSaving(true); setMessage("");
    try { await persist(); setMessage("Unit Extras saved."); } catch (error) { setMessage(error.message || "Unit Extras could not be saved."); }
    finally { setSaving(false); }
  };
  const addVideo = () => change((target) => { const id = createNativeChildId("video"); target.categories.videos.push({ id, title: "Extra Video", assetSlot: id, asset: null, fileName: "", byteSize: null, durationMs: null, cues: [] }); });

  const uploadMp4 = async (videoId, file) => {
    if (!file) return;
    setUploadingId(videoId); setUploadProgress(0); setMessage("Saving the Unit Extra placeholder…");
    try {
      let candidate = structuredClone(draft);
      candidate = mutateUnit(candidate, unitNumber, (target) => { const video = target.categories.videos.find((entry) => entry.id === videoId); video.assetSlot = video.id; });
      const saved = await persist(candidate);
      setMessage("Uploading and validating MP4…");
      const result = await uploadUnitExtraVideo({ ...identity, unitSlug: unitId, itemId: videoId, expectedRevision: saved.revision, file, onProgress: setUploadProgress });
      setDraft((current) => mutateUnit(current, unitNumber, (target) => {
        const video = target.categories.videos.find((entry) => entry.id === videoId);
        video.assetSlot = video.id; video.asset = result.reference; video.fileName = file.name;
        video.byteSize = result.metadata.byteSize; video.durationMs = result.metadata.durationMs;
        if (video.cues.some((cue) => cue.endMs > video.durationMs)) video.cues = [];
      }));
      setDirty(true); setMessage("MP4 validated. Save Unit Extras to attach it.");
    } catch (error) { setMessage(error.message || "MP4 upload failed."); }
    finally { setUploadingId(""); setUploadProgress(0); }
  };

  const importSrt = async (videoId, file) => {
    if (!file) return;
    try {
      const cues = parseTimedTextSrt(await file.text(), { createId: () => createNativeChildId("cue"), label: "Unit Extra Video SRT" });
      const video = videos.find((entry) => entry.id === videoId);
      if (video?.durationMs && cues.some((cue) => cue.endMs > video.durationMs)) throw new Error("Unit Extra Video SRT contains a cue beyond the MP4 duration.");
      change((target) => { target.categories.videos.find((entry) => entry.id === videoId).cues = cues; });
      setMessage(`${cues.length} subtitle cue${cues.length === 1 ? "" : "s"} imported.`);
    } catch (error) { setMessage(error.message || "SRT import failed."); }
  };

  const togglePage = (pageId, checked) => change((_target, next) => {
    const existing = next.pages.find((page) => page.pageId === pageId);
    if (existing) existing.extrasVisibility.videos = checked;
    else next.pages.push({ pageId, unitId, extrasVisibility: { videos: checked } });
    next.pages.sort((left, right) => ultimateB2StudentsBookAuthoringPages.findIndex((page) => page.id === left.pageId) - ultimateB2StudentsBookAuthoringPages.findIndex((page) => page.id === right.pageId));
  });

  return <BuilderModal open={open} title={`${unit?.title || `Unit ${unitNumber}`} Extras`} description="Manage Unit-owned Extras and choose which Pages expose them." busy={saving || Boolean(uploadingId)} onClose={onClose} returnFocusRef={returnFocusRef}>
    <div className="unit-extras-editor">
      <header><div><span>Unit Extras</span><h3><Video aria-hidden="true" /> Videos</h3><p>MP4 is required. SRT subtitles are optional.</p></div><button className="hosted-builder-action" type="button" onClick={addVideo} disabled={loading || Boolean(uploadingId)}><Plus aria-hidden="true" /> Add Video</button></header>
      {loading ? <p role="status">Loading Unit Extras…</p> : null}
      {!loading && !videos.length ? <p className="unit-extras-empty">No Extra Videos in this Unit.</p> : null}
      <div className="unit-extra-video-list">{videos.map((video, index) => <section key={video.id} className="unit-extra-video-card">
        <div className="unit-extra-video-order"><button type="button" aria-label={`Move ${video.title} up`} disabled={index === 0 || Boolean(uploadingId)} onClick={() => change((target) => { const list = target.categories.videos; [list[index - 1], list[index]] = [list[index], list[index - 1]]; })}><ArrowUp /></button><button type="button" aria-label={`Move ${video.title} down`} disabled={index === videos.length - 1 || Boolean(uploadingId)} onClick={() => change((target) => { const list = target.categories.videos; [list[index], list[index + 1]] = [list[index + 1], list[index]]; })}><ArrowDown /></button></div>
        <label><span>Title</span><input value={video.title} maxLength="160" disabled={Boolean(uploadingId)} onChange={(event) => change((target) => { target.categories.videos[index].title = event.target.value; })} /></label>
        <dl><div><dt>MP4</dt><dd>{video.asset ? video.fileName : "Required"}</dd></div><div><dt>Duration</dt><dd>{duration(video.durationMs)}</dd></div><div><dt>Size</dt><dd>{bytes(video.byteSize)}</dd></div><div><dt>Subtitles</dt><dd>{video.cues.length ? `${video.cues.length} subtitle cues` : "No subtitles"}</dd></div></dl>
        <div className="unit-extra-video-actions"><label className="studio-upload-action"><Upload aria-hidden="true" /><span><strong>{uploadingId === video.id ? `Uploading ${uploadProgress}%` : video.asset ? "Replace MP4" : "Upload MP4"}</strong><small>MP4 · maximum 100 MiB</small></span><input type="file" accept="video/mp4,.mp4" disabled={Boolean(uploadingId)} onChange={(event) => { uploadMp4(video.id, event.target.files?.[0]); event.target.value = ""; }} /></label><label className="studio-upload-action"><FileUp aria-hidden="true" /><span><strong>{video.cues.length ? "Replace SRT" : "Upload SRT"}</strong><small>Optional timed subtitles</small></span><input type="file" accept=".srt,application/x-subrip,text/plain" disabled={Boolean(uploadingId)} onChange={(event) => { importSrt(video.id, event.target.files?.[0]); event.target.value = ""; }} /></label>{video.cues.length ? <button type="button" onClick={() => change((target) => { target.categories.videos[index].cues = []; })}>Remove SRT</button> : null}<button className="builder-danger-action" type="button" disabled={Boolean(uploadingId)} onClick={() => change((target) => { target.categories.videos.splice(index, 1); })}><Trash2 aria-hidden="true" /> Delete Video</button></div>
      </section>)}</div>
      <section className="unit-extra-page-visibility"><h3>Page visibility</h3><p>Show Extra Videos only on selected bare Pages.</p><div>{pages.map((page) => <label key={page.id}><input type="checkbox" checked={draft.pages.find((entry) => entry.pageId === page.id)?.extrasVisibility.videos || false} disabled={Boolean(uploadingId)} onChange={(event) => togglePage(page.id, event.target.checked)} /><span><strong>{page.sectionTitle}</strong><small>{page.pageNumbers}</small></span><em>Show Extra Videos</em></label>)}</div></section>
      {message ? <p className="builder-inline-status" role="status">{message}</p> : null}
      <footer><button type="button" disabled={saving || Boolean(uploadingId)} onClick={onClose}>Close</button><button className="hosted-builder-action" type="button" disabled={!dirty || saving || Boolean(uploadingId)} onClick={save}><Save aria-hidden="true" /> {saving ? "Saving…" : "Save Unit Extras"}</button></footer>
    </div>
  </BuilderModal>;
}
