import { isNativeChildId } from "./nativeChildIdentity.js";
import { nativeOpenResponsePanels } from "./nativeOpenResponse.js";

export const NATIVE_AUDIO_TEXT_HOTSPOT_LIMITS = Object.freeze({
  hotspots: 16,
  labelLength: 160,
  minimumSize: 16,
  maximumSize: 192,
});

export const NATIVE_AUDIO_TEXT_HIGHLIGHT_COLORS = Object.freeze(["yellow", "green", "cyan", "pink"]);
export const NATIVE_AUDIO_TEXT_DEFAULT_HIGHLIGHT_COLOR = "yellow";

export function nativeAudioTextHighlightColor(value) {
  return NATIVE_AUDIO_TEXT_HIGHLIGHT_COLORS.includes(value) ? value : NATIVE_AUDIO_TEXT_DEFAULT_HIGHLIGHT_COLOR;
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function exactKeys(value, keys, label) {
  const actual = Object.keys(object(value, label)).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} has missing or unknown fields.`);
}

function coordinate(value, label, minimum, maximum) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${label} is invalid.`);
  return Math.round(value * 1_000) / 1_000;
}

function area(input, label, bounds, { circular = false } = {}) {
  exactKeys(input, ["x", "y", "width", "height"], label);
  const normalized = {
    x: coordinate(input.x, `${label}.x`, 0, bounds.width),
    y: coordinate(input.y, `${label}.y`, 0, bounds.height),
    width: coordinate(input.width, `${label}.width`, 1, bounds.width),
    height: coordinate(input.height, `${label}.height`, 1, bounds.height),
  };
  if (normalized.x + normalized.width > bounds.width || normalized.y + normalized.height > bounds.height) throw new Error(`${label} must stay inside its source image.`);
  if (circular && (normalized.width !== normalized.height
    || normalized.width < NATIVE_AUDIO_TEXT_HOTSPOT_LIMITS.minimumSize
    || normalized.width > NATIVE_AUDIO_TEXT_HOTSPOT_LIMITS.maximumSize)) {
    throw new Error(`${label} must be a small circular hotspot.`);
  }
  return normalized;
}

export function nativeAudioTextHotspotTargets(publicDocument) {
  const interaction = publicDocument?.parts?.[0]?.interaction;
  if (publicDocument?.kind === "open-response" && interaction?.presentation?.kind === "panels") {
    return nativeOpenResponsePanels(interaction).map((panel) => ({ panelId: panel.id, width: panel.surface.width, height: panel.surface.height }));
  }
  if (["image", "open-response"].includes(publicDocument?.kind) && interaction?.surface) {
    return [{ panelId: null, width: interaction.surface.width, height: interaction.surface.height }];
  }
  if (publicDocument?.kind === "single-choice" && interaction?.presentation?.kind === "image-hotspot") {
    return interaction.presentation.panels.map((panel) => ({ panelId: panel.id, width: panel.sourceWidth, height: panel.sourceHeight }));
  }
  if (publicDocument?.kind === "complete-sentences" && interaction?.presentation?.kind === "image-hotspot") {
    return [{ panelId: null, width: interaction.presentation.sourceWidth, height: interaction.presentation.sourceHeight }];
  }
  return [];
}

export function candidateNativeAudioTextAssetSlots(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || !Array.isArray(input.hotspots)) return [];
  return input.hotspots.map((hotspot) => hotspot?.audioAssetSlot).filter((slot) => typeof slot === "string");
}

export function normalizeNativeAudioTextHotspots(input, publicDocument) {
  const value = structuredClone(object(input, "Native audio/text hotspots"));
  exactKeys(value, ["hotspots"], "Native audio/text hotspots");
  if (!publicDocument.readableText) throw new Error("Native audio/text hotspots require Readable Text.");
  if (!Array.isArray(value.hotspots) || value.hotspots.length < 1 || value.hotspots.length > NATIVE_AUDIO_TEXT_HOTSPOT_LIMITS.hotspots) {
    throw new Error("Native audio/text hotspot count is invalid.");
  }
  const targets = nativeAudioTextHotspotTargets(publicDocument);
  if (!targets.length) throw new Error("Native audio/text hotspots require a visual activity surface.");
  const targetByPanel = new Map(targets.map((target) => [target.panelId, target]));
  const assetsBySlot = new Map(publicDocument.assets.map((asset) => [asset.slot, asset]));
  const ids = new Set();
  return {
    hotspots: value.hotspots.map((entry, index) => {
      const label = `Native audio/text hotspots[${index}]`;
      const hasHighlightColor = Object.hasOwn(entry, "highlightColor");
      exactKeys(entry, ["id", "panelId", "activityArea", "readableFocusArea", "audioAssetSlot", "label", ...(hasHighlightColor ? ["highlightColor"] : [])], label);
      if (!isNativeChildId(entry.id, "aud") || ids.has(entry.id)) throw new Error(`${label}.id is invalid or duplicate.`);
      ids.add(entry.id);
      if (entry.panelId !== null && typeof entry.panelId !== "string") throw new Error(`${label}.panelId is invalid.`);
      const target = targetByPanel.get(entry.panelId);
      if (!target) throw new Error(`${label}.panelId does not reference a visual activity surface.`);
      const audio = assetsBySlot.get(entry.audioAssetSlot);
      if (!audio || audio.role !== "activity_artwork" || audio.slot === publicDocument.readableText.assetSlot) {
        throw new Error(`${label}.audioAssetSlot does not reference managed native audio.`);
      }
      if (typeof entry.label !== "string" || !entry.label.trim() || entry.label.length > NATIVE_AUDIO_TEXT_HOTSPOT_LIMITS.labelLength
        || /[<>\u0000-\u001f\u007f]/.test(entry.label)) throw new Error(`${label}.label is invalid.`);
      if (hasHighlightColor && !NATIVE_AUDIO_TEXT_HIGHLIGHT_COLORS.includes(entry.highlightColor)) throw new Error(`${label}.highlightColor is invalid.`);
      const normalized = {
        id: entry.id,
        panelId: entry.panelId,
        activityArea: area(entry.activityArea, `${label}.activityArea`, target, { circular: true }),
        readableFocusArea: area(entry.readableFocusArea, `${label}.readableFocusArea`, {
          width: publicDocument.readableText.sourceWidth,
          height: publicDocument.readableText.sourceHeight,
        }),
        audioAssetSlot: audio.slot,
        label: entry.label.trim(),
      };
      if (hasHighlightColor) normalized.highlightColor = entry.highlightColor;
      return normalized;
    }),
  };
}

export function nativeAudioTextAssetRequirements(publicDocument) {
  const seen = new Set();
  return (publicDocument?.audioTextHotspots?.hotspots || []).flatMap((hotspot, index) => {
    if (seen.has(hotspot.audioAssetSlot)) return [];
    seen.add(hotspot.audioAssetSlot);
    return [{ slot: hotspot.audioAssetSlot, mediaType: "audio/mpeg", label: `Audio hotspot ${index + 1}` }];
  });
}
