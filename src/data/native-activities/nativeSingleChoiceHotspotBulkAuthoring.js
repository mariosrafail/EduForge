import { createNativeChildId, isNativeChildId } from "./nativeChildIdentity.js";
import { NATIVE_SINGLE_CHOICE_LIMITS, normalizeNativeSingleChoiceInteraction } from "./nativeSingleChoice.js";

export const NATIVE_SINGLE_CHOICE_HOTSPOT_BULK_MAX_CHARACTERS = 64 * 1024;

const SOURCE_PATTERN = /^[ \t]*SOURCE[ \t]+([0-9]+)x([0-9]+)[ \t]*$/;
const PANEL_PATTERN = /^[ \t]*PANEL[ \t]+([0-9]+)[ \t]*$/;
const HOTSPOT_PATTERN = /^[ \t]*([0-9]+)\.([0-9]+)[ \t]+x=([0-9]+)[ \t]+y=([0-9]+)[ \t]+width=([0-9]+)[ \t]+height=([0-9]+)[ \t]*$/;

const fail = (line, message) => { throw new Error(line ? `Line ${line}: ${message}` : message); };

function integer(raw, line, label, { minimum = 1, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(line, `${label} must be a safe integer from ${minimum} to ${maximum}.`);
  return value;
}

export function parseNativeSingleChoiceHotspotBulk(source) {
  if (typeof source !== "string" || !source.trim()) throw new Error("Paste hotspot geometry before importing.");
  if (source.length > NATIVE_SINGLE_CHOICE_HOTSPOT_BULK_MAX_CHARACTERS) {
    throw new Error(`Hotspot geometry must not exceed ${NATIVE_SINGLE_CHOICE_HOTSPOT_BULK_MAX_CHARACTERS.toLocaleString("en-US")} characters.`);
  }
  const lines = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const directives = lines.map((text, index) => ({ text, line: index + 1 })).filter(({ text }) => text.trim());
  if (!directives.length) throw new Error("Paste hotspot geometry before importing.");
  const sourceMatch = directives[0].text.match(SOURCE_PATTERN);
  if (!sourceMatch) fail(directives[0].line, "expected SOURCE <width>x<height>.");
  const sourceWidth = integer(sourceMatch[1], directives[0].line, "SOURCE width", { maximum: NATIVE_SINGLE_CHOICE_LIMITS.sourceDimension });
  const sourceHeight = integer(sourceMatch[2], directives[0].line, "SOURCE height", { maximum: NATIVE_SINGLE_CHOICE_LIMITS.sourceDimension });
  const panels = [];
  const panelOrdinals = new Set();
  const bindings = new Set();
  let panel = null;
  let hotspotCount = 0;
  for (const directive of directives.slice(1)) {
    if (SOURCE_PATTERN.test(directive.text) || directive.text.trimStart().startsWith("SOURCE")) fail(directive.line, "SOURCE may appear only once and must be the first directive.");
    const panelMatch = directive.text.match(PANEL_PATTERN);
    if (panelMatch) {
      if (panel && !panel.entries.length) fail(panel.line, `PANEL ${panel.ordinal} must contain at least one hotspot entry.`);
      const ordinal = integer(panelMatch[1], directive.line, "PANEL ordinal", { maximum: NATIVE_SINGLE_CHOICE_LIMITS.panels });
      if (panelOrdinals.has(ordinal)) fail(directive.line, `PANEL ${ordinal} is duplicated.`);
      panelOrdinals.add(ordinal);
      panel = { ordinal, line: directive.line, entries: [] };
      panels.push(panel);
      continue;
    }
    const hotspotMatch = directive.text.match(HOTSPOT_PATTERN);
    if (!hotspotMatch) {
      if (directive.text.trimStart().startsWith("PANEL")) fail(directive.line, "expected PANEL <panelOrdinal>.");
      fail(directive.line, "expected <question>.<option> x=<x> y=<y> width=<width> height=<height>.");
    }
    if (!panel) fail(directive.line, "add a PANEL header before hotspot entries.");
    const questionOrdinal = integer(hotspotMatch[1], directive.line, "question ordinal", { maximum: NATIVE_SINGLE_CHOICE_LIMITS.questions });
    const optionOrdinal = integer(hotspotMatch[2], directive.line, "option ordinal", { maximum: NATIVE_SINGLE_CHOICE_LIMITS.optionsMaximum });
    const binding = `${questionOrdinal}.${optionOrdinal}`;
    if (bindings.has(binding)) fail(directive.line, `${binding} is duplicated in this document.`);
    bindings.add(binding);
    const x = integer(hotspotMatch[3], directive.line, "x", { minimum: 0, maximum: sourceWidth });
    const y = integer(hotspotMatch[4], directive.line, "y", { minimum: 0, maximum: sourceHeight });
    const width = integer(hotspotMatch[5], directive.line, "width", { maximum: sourceWidth });
    const height = integer(hotspotMatch[6], directive.line, "height", { maximum: sourceHeight });
    if (x + width > sourceWidth || y + height > sourceHeight) fail(directive.line, `rectangle exceeds SOURCE ${sourceWidth}x${sourceHeight}.`);
    hotspotCount += 1;
    if (hotspotCount > NATIVE_SINGLE_CHOICE_LIMITS.hotspots) fail(directive.line, `at most ${NATIVE_SINGLE_CHOICE_LIMITS.hotspots} hotspots may be imported.`);
    panel.entries.push({ questionOrdinal, optionOrdinal, area: { x, y, width, height }, line: directive.line });
  }
  if (!panels.length) throw new Error("Add at least one PANEL block.");
  if (!panel.entries.length) fail(panel.line, `PANEL ${panel.ordinal} must contain at least one hotspot entry.`);
  return { sourceWidth, sourceHeight, sourceLine: directives[0].line, panels, hotspotCount };
}

export function scaleNativeSingleChoiceHotspotArea(area, source, target) {
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

const bindingKey = (questionId, optionId) => `${questionId}\0${optionId}`;

function requirePublicDraft(publicDocument) {
  const interaction = publicDocument?.parts?.[0]?.interaction;
  if (publicDocument?.kind !== "single-choice" || interaction?.kind !== "single-choice") throw new Error("Open a native Multiple Choice draft before importing hotspots.");
  if (!Array.isArray(interaction.questions) || !interaction.questions.length || !interaction.questions.some((question) => Array.isArray(question.options) && question.options.length)) {
    throw new Error("Create the Multiple Choice questions and options before importing hotspots.");
  }
  if (interaction.presentation?.kind !== "image-hotspot" || !Array.isArray(interaction.presentation.panels)) throw new Error("Enable Visual mode before importing hotspots.");
  return interaction;
}

export function generateNativeSingleChoiceHotspotImportCandidate({
  source,
  publicDocument,
  replaceExistingPanels = false,
  createId = createNativeChildId,
}) {
  const parsed = parseNativeSingleChoiceHotspotBulk(source);
  requirePublicDraft(publicDocument);
  const candidate = structuredClone(publicDocument);
  const interaction = requirePublicDraft(candidate);
  const questions = interaction.questions;
  const panels = interaction.presentation.panels;
  const assets = new Map((candidate.assets || []).map((asset) => [asset.slot, asset]));
  const listedOrdinals = new Set(parsed.panels.map((entry) => entry.ordinal));
  const listedPanelIds = new Set();
  const incoming = [];
  const incomingQuestionPanels = new Map();

  for (const parsedPanel of parsed.panels) {
    const panel = panels[parsedPanel.ordinal - 1];
    if (!panel) fail(parsedPanel.line, `PANEL ${parsedPanel.ordinal} does not exist in the current visual presentation.`);
    const background = assets.get(panel.backgroundAssetSlot);
    if (!panel.backgroundAssetSlot || !background || background.role !== "activity_artwork") fail(parsedPanel.line, `PANEL ${parsedPanel.ordinal} needs an uploaded background before importing.`);
    if (!Number.isSafeInteger(panel.sourceWidth) || panel.sourceWidth < 1 || panel.sourceWidth > NATIVE_SINGLE_CHOICE_LIMITS.sourceDimension
      || !Number.isSafeInteger(panel.sourceHeight) || panel.sourceHeight < 1 || panel.sourceHeight > NATIVE_SINGLE_CHOICE_LIMITS.sourceDimension) {
      fail(parsedPanel.line, `PANEL ${parsedPanel.ordinal} needs valid intrinsic image dimensions.`);
    }
    listedPanelIds.add(panel.id);
    for (const entry of parsedPanel.entries) {
      const question = questions[entry.questionOrdinal - 1];
      if (!question) fail(entry.line, `question ${entry.questionOrdinal} does not exist; ${entry.questionOrdinal}.${entry.optionOrdinal} is unavailable.`);
      const option = question.options?.[entry.optionOrdinal - 1];
      if (!option) fail(entry.line, `question ${entry.questionOrdinal} has only ${question.options?.length || 0} options; ${entry.questionOrdinal}.${entry.optionOrdinal} is unavailable.`);
      const previousPanel = incomingQuestionPanels.get(question.id);
      if (previousPanel && previousPanel !== parsedPanel.ordinal) throw new Error(`Question ${entry.questionOrdinal} cannot span panels ${previousPanel} and ${parsedPanel.ordinal}.`);
      incomingQuestionPanels.set(question.id, parsedPanel.ordinal);
      incoming.push({ ...entry, panel, panelOrdinal: parsedPanel.ordinal, question, option, key: bindingKey(question.id, option.id) });
    }
  }

  const existingIds = new Set();
  const existingBindings = new Map();
  const reusableBindings = new Map();
  for (const [panelIndex, panel] of panels.entries()) {
    for (const hotspot of panel.hotspots || []) {
      if (!isNativeChildId(hotspot.id, "hot") || existingIds.has(hotspot.id)) throw new Error(`Panel ${panelIndex + 1} contains a duplicate or invalid hotspot ID.`);
      existingIds.add(hotspot.id);
      const key = bindingKey(hotspot.questionId, hotspot.optionId);
      if (existingBindings.has(key)) throw new Error(`Panel ${panelIndex + 1} contains a duplicate question and option binding.`);
      existingBindings.set(key, { hotspot, panel, panelOrdinal: panelIndex + 1 });
      if (listedOrdinals.has(panelIndex + 1)) reusableBindings.set(key, hotspot);
    }
  }
  const occupiedListedPanels = parsed.panels.filter(({ ordinal }) => (panels[ordinal - 1].hotspots || []).length);
  if (occupiedListedPanels.length && !replaceExistingPanels) {
    const ordinal = occupiedListedPanels[0].ordinal;
    throw new Error(`Panel ${ordinal} already contains hotspots. Confirm replacement before importing.`);
  }
  for (const entry of incoming) {
    const existing = existingBindings.get(entry.key);
    if (existing && !listedPanelIds.has(existing.panel.id)) fail(entry.line, `${entry.questionOrdinal}.${entry.optionOrdinal} already has a hotspot on non-listed panel ${existing.panelOrdinal}.`);
    for (const [otherKey, other] of existingBindings) {
      if (listedPanelIds.has(other.panel.id) || other.hotspot.questionId !== entry.question.id || otherKey === entry.key) continue;
      throw new Error(`Question ${entry.questionOrdinal} cannot span panels ${other.panelOrdinal} and ${entry.panelOrdinal}.`);
    }
  }

  incoming.sort((left, right) => left.questionOrdinal - right.questionOrdinal || left.optionOrdinal - right.optionOrdinal || left.panelOrdinal - right.panelOrdinal);
  const newIds = new Set();
  let preservedIds = 0;
  let createdIds = 0;
  for (const entry of incoming) {
    const existing = reusableBindings.get(entry.key);
    let id = existing?.id;
    if (id) preservedIds += 1;
    else {
      id = createId("hot");
      if (!isNativeChildId(id, "hot") || existingIds.has(id) || newIds.has(id)) throw new Error("Hotspot identity generation produced a duplicate or invalid ID.");
      newIds.add(id); createdIds += 1;
    }
    entry.hotspot = {
      id,
      questionId: entry.question.id,
      optionId: entry.option.id,
      area: scaleNativeSingleChoiceHotspotArea(entry.area, { width: parsed.sourceWidth, height: parsed.sourceHeight }, { width: entry.panel.sourceWidth, height: entry.panel.sourceHeight }),
    };
  }
  const oldListedCount = parsed.panels.reduce((total, { ordinal }) => total + (panels[ordinal - 1].hotspots || []).length, 0);
  for (const parsedPanel of parsed.panels) {
    panels[parsedPanel.ordinal - 1].hotspots = incoming.filter((entry) => entry.panelOrdinal === parsedPanel.ordinal).map((entry) => entry.hotspot);
  }

  const probe = {
    kind: "single-choice",
    questions: structuredClone(questions),
    presentation: { kind: "image-hotspot", panels: parsed.panels.map(({ ordinal }) => structuredClone(panels[ordinal - 1])) },
  };
  normalizeNativeSingleChoiceInteraction(probe, { assets: candidate.assets || [] });
  const allBindings = new Set(panels.flatMap((panel) => (panel.hotspots || []).map((hotspot) => bindingKey(hotspot.questionId, hotspot.optionId))));
  const missingOptions = questions.reduce((total, question) => total + question.options.filter((option) => !allBindings.has(bindingKey(question.id, option.id))).length, 0);
  const warnings = parsed.panels.flatMap(({ ordinal }) => {
    const panel = panels[ordinal - 1];
    return parsed.sourceWidth * panel.sourceHeight === parsed.sourceHeight * panel.sourceWidth ? [] : [
      `Panel ${ordinal} has a different aspect ratio from SOURCE ${parsed.sourceWidth}×${parsed.sourceHeight}. Coordinates were scaled independently and may need manual adjustment.`,
    ];
  });
  const first = incoming.sort((left, right) => left.panelOrdinal - right.panelOrdinal || left.questionOrdinal - right.questionOrdinal || left.optionOrdinal - right.optionOrdinal)[0];
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
      missingOptions,
      targetDimensions: parsed.panels.map(({ ordinal }) => ({ panelOrdinal: ordinal, width: panels[ordinal - 1].sourceWidth, height: panels[ordinal - 1].sourceHeight })),
      warnings,
    },
  };
}
