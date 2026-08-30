import { BookOpenText, Eye, FileText, Film, KeyRound, LayoutPanelTop, Music } from "lucide-react";

import { addNativeOldschoolListeningRegion, clearNativeOldschoolListeningMappings, removeNativeOldschoolListeningRegion, updateNativeOldschoolListeningRegion } from "../../../data/native-activities/nativeOldschoolListeningAuthoring.js";
import { parseNativeOldschoolListeningJson, serializeNativeOldschoolListeningJson } from "../../../data/native-activities/nativeOldschoolListeningJson.js";
import { mergeNativeManagedAssetReference, removeNativeManagedAssetReferenceIfUnused } from "../../../data/native-activities/nativeActivityPublic.js";

export const nativeListeningEditorTabs = [
  { id: "content", label: "Content", icon: FileText },
  { id: "audio-transcript", label: "Audio & Transcript", icon: Music },
  { id: "visual", label: "Visual", icon: LayoutPanelTop },
  { id: "answer-key", label: "Answer Key", icon: KeyRound },
  { id: "readable-text", label: "Readable Text", icon: BookOpenText },
  { id: "video", label: "Video", icon: Film },
  { id: "preview", label: "Local Preview", icon: Eye },
];

export const nativeOldschoolListeningEditorTabs = [
  { id: "content", label: "Content", icon: FileText },
  { id: "visual", label: "Visual", icon: LayoutPanelTop },
  { id: "audio-timeline", label: "Audio & Timeline", icon: Music },
  { id: "page-mapping", label: "Page Mapping", icon: LayoutPanelTop },
  { id: "answer-key", label: "Answer Key", icon: KeyRound },
  { id: "readable-text", label: "Readable Text", icon: BookOpenText },
  { id: "video", label: "Video", icon: Film },
  { id: "preview", label: "Local Preview", icon: Eye },
];

export const nativeListeningPreviewRoot = (bookSlug, componentSlug, activityId, assetId) => `/builder/api/native-activities/books/${encodeURIComponent(bookSlug)}/components/${encodeURIComponent(componentSlug)}/activities/${encodeURIComponent(activityId)}/assets/${encodeURIComponent(assetId)}/preview`;

export function replaceNativeListeningAsset(next, uploaded, previousSlot) {
  next.assets = mergeNativeManagedAssetReference(next.assets, uploaded.reference);
  if (previousSlot && previousSlot !== uploaded.reference.slot) removeNativeManagedAssetReferenceIfUnused(next, previousSlot);
}

export function nativeListeningMediaDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file); const audio = new Audio();
    const done = () => { URL.revokeObjectURL(url); audio.removeAttribute("src"); };
    audio.onloadedmetadata = () => { const duration = Math.round(audio.duration * 1_000); done(); Number.isSafeInteger(duration) && duration > 0 ? resolve(duration) : reject(new Error("Audio duration is unavailable.")); };
    audio.onerror = () => { done(); reject(new Error("Audio duration is unavailable.")); };
    audio.preload = "metadata";
    audio.src = url;
  });
}

export function createOldschoolJsonActions({ activityId, interaction, assets, cues, mutatePublic, setSelectedCueId, setSelectedRegionId, setMessage }) {
  const context = () => ({ assets, commonAssetSlots: new Set(assets.map((asset) => asset.slot)) });
  return {
    exportJson() {
      try {
        const blob = new Blob([serializeNativeOldschoolListeningJson(interaction, context())], { type: "application/json" });
        const url = URL.createObjectURL(blob); const link = document.createElement("a");
        link.href = url; link.download = `${activityId}.oldschool-listening.json`; link.click(); URL.revokeObjectURL(url);
        setMessage("Canonical Oldschool Listening mapping JSON exported.");
      } catch (error) { setMessage(error.message); }
    },
    async importJson(file) {
      if (!file || (cues.length && !globalThis.confirm("Importing mapping JSON replaces all cue timing, text, regions, and scroll targets. Continue?"))) return;
      try {
        const imported = parseNativeOldschoolListeningJson(await file.text(), context()); const currentPanel = interaction.panels[1]; const importedPanel = imported.panels[1];
        if (imported.audioAssetSlot !== interaction.audioAssetSlot || importedPanel.pageAssetSlot !== currentPanel.pageAssetSlot || importedPanel.sourceWidth !== currentPanel.sourceWidth || importedPanel.sourceHeight !== currentPanel.sourceHeight) throw new Error("Mapping JSON must target the currently uploaded MP3 and page image at identical intrinsic dimensions.");
        mutatePublic((next) => { next.parts[0].interaction.cues = imported.cues; });
        setSelectedCueId(imported.cues[0]?.id || null); setSelectedRegionId(null); setMessage(`${imported.cues.length} canonical JSON cues imported.`);
      } catch (error) { setMessage(error.message || "Mapping JSON import failed."); }
    },
  };
}

export function createOldschoolMappingActions({ selectedCue, selectedRegionId, mutatePublic, setSelectedRegionId }) {
  const findCue = (next) => next.parts[0].interaction.cues.find((entry) => entry.id === selectedCue.id);
  return {
    addRegion(geometry) {
      if (!selectedCue) return;
      let regionId = null;
      mutatePublic((next) => { regionId = addNativeOldschoolListeningRegion(findCue(next), geometry).id; });
      setSelectedRegionId(regionId);
    },
    updateRegion(geometry) {
      if (selectedCue && selectedRegionId) mutatePublic((next) => updateNativeOldschoolListeningRegion(findCue(next), selectedRegionId, geometry));
    },
    removeRegion() {
      if (!selectedCue || !selectedRegionId) return;
      mutatePublic((next) => removeNativeOldschoolListeningRegion(findCue(next), selectedRegionId)); setSelectedRegionId(null);
    },
    clearMappings() {
      if (!globalThis.confirm("Clear every cue highlight region and authored scroll target? This cannot be undone after saving.")) return;
      mutatePublic((next) => clearNativeOldschoolListeningMappings(next.parts[0].interaction)); setSelectedRegionId(null);
    },
    clearCueMappings() {
      if (!selectedCue || !globalThis.confirm("Clear every highlight region and the scroll target for this cue?")) return;
      mutatePublic((next) => { const cue = findCue(next); cue.highlightRegions = []; cue.scrollY = null; }); setSelectedRegionId(null);
    },
  };
}
