import { createNativeChildId, isNativeChildId } from "./nativeChildIdentity.js";
import { NATIVE_COMPLETE_SENTENCES_LIMITS, normalizeNativeCompleteSentencesInteraction } from "./nativeCompleteSentences.js";

export const NATIVE_COMPLETE_SENTENCES_HOTSPOT_BULK_MAX_CHARACTERS = 64 * 1024;

const SOURCE_PATTERN = /^[ \t]*SOURCE[ \t]+([0-9]+)x([0-9]+)[ \t]*$/;
const PANEL_PATTERN = /^[ \t]*PANEL[ \t]+([0-9]+)[ \t]*$/;
const HOTSPOT_PATTERN = /^[ \t]*ITEM[ \t]+([0-9]+)[ \t]+x=([0-9]+)[ \t]+y=([0-9]+)[ \t]+width=([0-9]+)[ \t]+height=([0-9]+)[ \t]*$/;

const fail = (line, message) => { throw new Error(line ? `Line ${line}: ${message}` : message); };

function integer(raw, line, label, { minimum = 1, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(line, `${label} must be a safe integer from ${minimum} to ${maximum}.`);
  return value;
}

export function parseNativeCompleteSentencesHotspotBulk(source) {
  if (typeof source !== "string" || !source.trim()) throw new Error("Paste hotspot geometry before importing.");
  if (source.length > NATIVE_COMPLETE_SENTENCES_HOTSPOT_BULK_MAX_CHARACTERS) {
    throw new Error(`Hotspot geometry must not exceed ${NATIVE_COMPLETE_SENTENCES_HOTSPOT_BULK_MAX_CHARACTERS.toLocaleString("en-US")} characters.`);
  }
  const lines = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const directives = lines.map((text, index) => ({ text, line: index + 1 })).filter(({ text }) => text.trim());
  if (!directives.length) throw new Error("Paste hotspot geometry before importing.");
  const sourceMatch = directives[0].text.match(SOURCE_PATTERN);
  if (!sourceMatch) fail(directives[0].line, "expected SOURCE <width>x<height>.");
  const sourceWidth = integer(sourceMatch[1], directives[0].line, "SOURCE width", { maximum: NATIVE_COMPLETE_SENTENCES_LIMITS.sourceDimension });
  const sourceHeight = integer(sourceMatch[2], directives[0].line, "SOURCE height", { maximum: NATIVE_COMPLETE_SENTENCES_LIMITS.sourceDimension });
  const panels = [];
  const panelOrdinals = new Set();
  const itemOrdinals = new Set();
  let panel = null;
  let hotspotCount = 0;
  for (const directive of directives.slice(1)) {
    if (SOURCE_PATTERN.test(directive.text) || directive.text.trimStart().startsWith("SOURCE")) fail(directive.line, "SOURCE may appear only once and must be the first directive.");
    const panelMatch = directive.text.match(PANEL_PATTERN);
    if (panelMatch) {
      if (panel && !panel.entries.length) fail(panel.line, `PANEL ${panel.ordinal} must contain at least one hotspot entry.`);
      const ordinal = integer(panelMatch[1], directive.line, "PANEL ordinal", { maximum: NATIVE_COMPLETE_SENTENCES_LIMITS.panels });
      if (panelOrdinals.has(ordinal)) fail(directive.line, `PANEL ${ordinal} is duplicated.`);
      panelOrdinals.add(ordinal);
      panel = { ordinal, line: directive.line, entries: [] };
      panels.push(panel);
      continue;
    }
    const hotspotMatch = directive.text.match(HOTSPOT_PATTERN);
    if (!hotspotMatch) {
      if (directive.text.trimStart().startsWith("PANEL")) fail(directive.line, "expected PANEL <panelOrdinal>.");
      fail(directive.line, "expected ITEM <item> x=<x> y=<y> width=<width> height=<height>.");
    }
    if (!panel) fail(directive.line, "add a PANEL header before ITEM entries.");
    const itemOrdinal = integer(hotspotMatch[1], directive.line, "ITEM ordinal", { maximum: NATIVE_COMPLETE_SENTENCES_LIMITS.items });
    if (itemOrdinals.has(itemOrdinal)) fail(directive.line, `ITEM ${itemOrdinal} is duplicated in this document.`);
    itemOrdinals.add(itemOrdinal);
    const x = integer(hotspotMatch[2], directive.line, "x", { minimum: 0, maximum: sourceWidth });
    const y = integer(hotspotMatch[3], directive.line, "y", { minimum: 0, maximum: sourceHeight });
    const width = integer(hotspotMatch[4], directive.line, "width", { maximum: sourceWidth });
    const height = integer(hotspotMatch[5], directive.line, "height", { maximum: sourceHeight });
    if (x + width > sourceWidth || y + height > sourceHeight) fail(directive.line, `rectangle exceeds SOURCE ${sourceWidth}x${sourceHeight}.`);
    hotspotCount += 1;
    if (hotspotCount > NATIVE_COMPLETE_SENTENCES_LIMITS.hotspots) fail(directive.line, `at most ${NATIVE_COMPLETE_SENTENCES_LIMITS.hotspots} hotspots may be imported.`);
    panel.entries.push({ itemOrdinal, area: { x, y, width, height }, line: directive.line });
  }
  if (!panels.length) throw new Error("Add at least one PANEL block.");
  if (!panel.entries.length) fail(panel.line, `PANEL ${panel.ordinal} must contain at least one hotspot entry.`);
  return { sourceWidth, sourceHeight, sourceLine: directives[0].line, panels, hotspotCount };
}

export function scaleNativeCompleteSentencesHotspotArea(area, source, target) {
  for (const [value, label, minimum] of [
    [source.width, "SOURCE width", 1], [source.height, "SOURCE height", 1],
    [target.width, "target width", 1], [target.height, "target height", 1],
    [area.x, "x", 0], [area.y, "y", 0], [area.width, "width", 1], [area.height, "height", 1],
  ]) if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`${label} must be a safe integer of at least ${minimum}.`);
  if (area.x + area.width > source.width || area.y + area.height > source.height) throw new Error(`Rectangle exceeds SOURCE ${source.width}x${source.height}.`);
  const left = Math.floor(area.x * target.width / source.width);
  const top = Math.floor(area.y * target.height / source.height);
  const right = Math.ceil((area.x + area.width) * target.width / source.width);
  const bottom = Math.ceil((area.y + area.height) * target.height / source.height);
  const scaled = { x: left, y: top, width: right - left, height: bottom - top };
  if (![scaled.x, scaled.y, scaled.width, scaled.height].every(Number.isSafeInteger)
    || scaled.x < 0 || scaled.y < 0 || scaled.width < 1 || scaled.height < 1
    || scaled.x + scaled.width > target.width || scaled.y + scaled.height > target.height) {
    throw new Error("Scaled hotspot geometry is outside the target panel.");
  }
  return scaled;
}

function requirePublicDraft(publicDocument) {
  const interaction = publicDocument?.parts?.[0]?.interaction;
  if (publicDocument?.kind !== "complete-sentences" || interaction?.kind !== "complete-sentences") throw new Error("Open a native Complete the Sentences draft before importing hotspots.");
  if (!Array.isArray(interaction.items) || !interaction.items.length) throw new Error("Create the Complete the Sentences items before importing hotspots.");
  if (interaction.presentation?.kind !== "image-hotspot" || !Array.isArray(interaction.presentation.panels)) throw new Error("Open the Visual tab before importing hotspots.");
  return interaction;
}

export function generateNativeCompleteSentencesHotspotImportCandidate({
  source,
  publicDocument,
  replaceExistingPanels = false,
  createId = createNativeChildId,
}) {
  const parsed = parseNativeCompleteSentencesHotspotBulk(source);
  const currentInteraction = requirePublicDraft(publicDocument);
  const candidate = structuredClone(publicDocument);
  const interaction = requirePublicDraft(candidate);
  const items = interaction.items;
  const panels = interaction.presentation.panels;
  const assets = new Map((candidate.assets || []).map((asset) => [asset.slot, asset]));
  const listedOrdinals = new Set(parsed.panels.map((entry) => entry.ordinal));
  const listedPanelIds = new Set();
  const incoming = [];

  for (const parsedPanel of parsed.panels) {
    const panel = panels[parsedPanel.ordinal - 1];
    if (!panel) fail(parsedPanel.line, `PANEL ${parsedPanel.ordinal} does not exist in the current visual presentation.`);
    const background = assets.get(panel.backgroundAssetSlot);
    if (!panel.backgroundAssetSlot || !background || background.role !== "activity_artwork") fail(parsedPanel.line, `PANEL ${parsedPanel.ordinal} needs an uploaded background before importing.`);
    if (!Number.isSafeInteger(panel.sourceWidth) || panel.sourceWidth < 1 || panel.sourceWidth > NATIVE_COMPLETE_SENTENCES_LIMITS.sourceDimension
      || !Number.isSafeInteger(panel.sourceHeight) || panel.sourceHeight < 1 || panel.sourceHeight > NATIVE_COMPLETE_SENTENCES_LIMITS.sourceDimension) {
      fail(parsedPanel.line, `PANEL ${parsedPanel.ordinal} needs valid intrinsic image dimensions.`);
    }
    listedPanelIds.add(panel.id);
    for (const entry of parsedPanel.entries) {
      const item = items[entry.itemOrdinal - 1];
      if (!item) fail(entry.line, `item ${entry.itemOrdinal} does not exist; ITEM ${entry.itemOrdinal} is unavailable.`);
      incoming.push({ ...entry, panel, panelOrdinal: parsedPanel.ordinal, item });
    }
  }

  normalizeNativeCompleteSentencesInteraction(currentInteraction, { assets: publicDocument.assets || [] });
  const existingIds = new Set();
  const existingBindings = new Map();
  const reusableBindings = new Map();
  for (const [panelIndex, panel] of panels.entries()) {
    for (const hotspot of panel.hotspots || []) {
      if (!isNativeChildId(hotspot.id, "hot") || existingIds.has(hotspot.id)) throw new Error(`Panel ${panelIndex + 1} contains a duplicate or invalid hotspot ID.`);
      existingIds.add(hotspot.id);
      if (existingBindings.has(hotspot.itemId)) throw new Error(`Panel ${panelIndex + 1} contains a duplicate ITEM binding.`);
      existingBindings.set(hotspot.itemId, { hotspot, panel, panelOrdinal: panelIndex + 1 });
      if (listedOrdinals.has(panelIndex + 1)) reusableBindings.set(hotspot.itemId, hotspot);
    }
  }
  const occupiedListedPanels = parsed.panels.filter(({ ordinal }) => (panels[ordinal - 1].hotspots || []).length);
  if (occupiedListedPanels.length && !replaceExistingPanels) {
    const ordinal = occupiedListedPanels[0].ordinal;
    throw new Error(`Panel ${ordinal} already contains hotspots. Confirm replacement before importing.`);
  }
  for (const entry of incoming) {
    const existing = existingBindings.get(entry.item.id);
    if (existing && !listedPanelIds.has(existing.panel.id)) fail(entry.line, `ITEM ${entry.itemOrdinal} already has a hotspot on non-listed panel ${existing.panelOrdinal}.`);
  }

  incoming.sort((left, right) => left.itemOrdinal - right.itemOrdinal || left.panelOrdinal - right.panelOrdinal);
  const newIds = new Set();
  let preservedIds = 0;
  let createdIds = 0;
  for (const entry of incoming) {
    const existing = reusableBindings.get(entry.item.id);
    let id = existing?.id;
    if (id) preservedIds += 1;
    else {
      id = createId("hot");
      if (!isNativeChildId(id, "hot") || existingIds.has(id) || newIds.has(id)) throw new Error("Hotspot identity generation produced a duplicate or invalid ID.");
      newIds.add(id); createdIds += 1;
    }
    entry.hotspot = {
      id,
      itemId: entry.item.id,
      area: scaleNativeCompleteSentencesHotspotArea(entry.area, { width: parsed.sourceWidth, height: parsed.sourceHeight }, { width: entry.panel.sourceWidth, height: entry.panel.sourceHeight }),
    };
  }
  const oldListedCount = parsed.panels.reduce((total, { ordinal }) => total + (panels[ordinal - 1].hotspots || []).length, 0);
  for (const parsedPanel of parsed.panels) {
    panels[parsedPanel.ordinal - 1].hotspots = incoming.filter((entry) => entry.panelOrdinal === parsedPanel.ordinal).map((entry) => entry.hotspot);
  }

  normalizeNativeCompleteSentencesInteraction(interaction, { assets: candidate.assets || [] });
  const mappedItems = new Set(panels.flatMap((panel) => (panel.hotspots || []).map((hotspot) => hotspot.itemId)));
  const missingItems = items.filter((item) => !mappedItems.has(item.id)).length;
  const warnings = parsed.panels.flatMap(({ ordinal }) => {
    const panel = panels[ordinal - 1];
    return parsed.sourceWidth * panel.sourceHeight === parsed.sourceHeight * panel.sourceWidth ? [] : [
      `Panel ${ordinal} has a different aspect ratio from SOURCE ${parsed.sourceWidth}×${parsed.sourceHeight}. Coordinates were scaled independently and may need manual adjustment.`,
    ];
  });
  const first = incoming.sort((left, right) => left.panelOrdinal - right.panelOrdinal || left.itemOrdinal - right.itemOrdinal)[0];
  return {
    publicDocument: candidate,
    selection: { panelId: first.panel.id, hotspotId: first.hotspot.id },
    summary: {
      headline: `${incoming.length} hotspot${incoming.length === 1 ? "" : "s"} imported`,
      sourceDimensions: { width: parsed.sourceWidth, height: parsed.sourceHeight },
      panelsUpdated: parsed.panels.length,
      hotspotsImported: incoming.length,
      preservedIds,
      createdIds,
      removedHotspots: Math.max(0, oldListedCount - preservedIds),
      missingItems,
      targetDimensions: parsed.panels.map(({ ordinal }) => ({ panelOrdinal: ordinal, width: panels[ordinal - 1].sourceWidth, height: panels[ordinal - 1].sourceHeight })),
      warnings,
    },
  };
}
