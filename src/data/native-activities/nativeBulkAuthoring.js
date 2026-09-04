import { createNativeChildId } from "./nativeChildIdentity.js";
import { normalizeNativeActivityPublic } from "./nativeActivityPublic.js";
import { normalizeNativeActivityTeacher, validateNativeActivityDocumentPair } from "./nativeActivityTeacher.js";
import {
  assessNativeCompleteSentencesReadiness,
  NATIVE_COMPLETE_SENTENCES_BLANK_TOKEN,
  NATIVE_COMPLETE_SENTENCES_EXACT_EVALUATION_MODE,
  NATIVE_COMPLETE_SENTENCES_LIMITS,
  normalizeNativeCompleteSentencesInteraction,
  normalizeNativeCompleteSentencesSolution,
  validateNativeCompleteSentencesTopology,
} from "./nativeCompleteSentences.js";
import { removeNativeCompleteSentencesItem } from "./nativeCompleteSentencesAuthoring.js";
import {
  assessNativeSingleChoiceReadiness,
  NATIVE_SINGLE_CHOICE_LIMITS,
  normalizeNativeSingleChoiceInteraction,
  normalizeNativeSingleChoiceSolution,
  validateNativeSingleChoiceTopology,
} from "./nativeSingleChoice.js";
import { removeNativeSingleChoiceOption, removeNativeSingleChoiceQuestion } from "./nativeSingleChoiceAuthoring.js";
import {
  assessNativeOpenResponseReadiness,
  createNativeOpenResponseQuestion,
  NATIVE_OPEN_RESPONSE_LIMITS,
  normalizeNativeOpenResponseInteraction,
  normalizeNativeOpenResponseSolution,
  validateNativeOpenResponseTopology,
} from "./nativeOpenResponse.js";
import {
  assessNativeDragDropReadiness,
  nativeDragDropShortLabel,
  NATIVE_DRAG_DROP_LIMITS,
  normalizeNativeDragDropInteraction,
  normalizeNativeDragDropSolution,
  removeNativeDragDropWord,
  validateNativeDragDropTopology,
} from "./nativeDragDrop.js";
import { normalizeNativePedagogicalText, normalizeNativeSingleLineText, normalizeNativeLineEndings } from "./nativePedagogicalText.js";

export class NativeBulkParseError extends Error {
  constructor(message, { line = null, itemNumber = null, itemLabel = "Item" } = {}) {
    const location = [itemNumber === null ? "" : `${itemLabel} ${itemNumber}`, line === null ? "" : `line ${line}`].filter(Boolean).join(", ");
    super(location ? `${location}: ${message}` : message);
    this.name = "NativeBulkParseError";
    this.line = line;
    this.itemNumber = itemNumber;
  }
}

function fail(message, block = {}, itemLabel = "Item", line = block.line) {
  throw new NativeBulkParseError(message, { line, itemNumber: block.ordinal, itemLabel });
}

function normalizeAt(callback, block, itemLabel, line = block.line) {
  try { return callback(); }
  catch (error) { fail(error instanceof Error ? error.message : "parsed text is invalid.", block, itemLabel, line); }
}

function sourceLines(input) {
  const normalized = normalizeNativeLineEndings(String(input ?? ""));
  const all = normalized.split("\n").map((text, index) => ({ text, line: index + 1 }));
  let first = 0; let last = all.length;
  while (first < last && !all[first].text.trim()) first += 1;
  while (last > first && !all[last - 1].text.trim()) last -= 1;
  if (first === last) throw new NativeBulkParseError("Paste at least one numbered item.");
  return all.slice(first, last);
}

function numberedBlocks(input, itemLabel) {
  const blocks = []; const numbers = new Set();
  for (const entry of sourceLines(input)) {
    const match = entry.text.match(/^\s*(\d+)[.)]\s+(.+)$/u);
    if (match) {
      const sourceNumber = Number(match[1]);
      if (!Number.isSafeInteger(sourceNumber) || numbers.has(sourceNumber)) throw new NativeBulkParseError(`duplicate or invalid source number ${match[1]}.`, { line: entry.line, itemNumber: blocks.length + 1, itemLabel });
      numbers.add(sourceNumber);
      blocks.push({ ordinal: blocks.length + 1, sourceNumber, line: entry.line, lines: [{ text: match[2], line: entry.line }] });
      continue;
    }
    if (/^\s*\d+[.)]/u.test(entry.text)) throw new NativeBulkParseError("malformed numbered item boundary; use “1. text” or “1) text”.", { line: entry.line, itemNumber: blocks.length + 1, itemLabel });
    if (!blocks.length) throw new NativeBulkParseError("content appears before the first numbered item.", { line: entry.line, itemNumber: 1, itemLabel });
    blocks.at(-1).lines.push(entry);
  }
  return blocks;
}

function isEscaped(text, index) {
  let count = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) count += 1;
  return count % 2 === 1;
}

function unescapedIndexes(text, character) {
  const indexes = [];
  for (let index = 0; index < text.length; index += 1) if (text[index] === character && !isEscaped(text, index)) indexes.push(index);
  return indexes;
}

export function unescapeNativeBulkText(text) {
  let output = "";
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\\" && ["*", "/", "\\"].includes(text[index + 1])) { output += text[index + 1]; index += 1; }
    else output += text[index];
  }
  return output;
}

function blockText(block) {
  const lines = [...block.lines];
  while (lines.length > 1 && !lines.at(-1).text.trim()) lines.pop();
  return lines.map((entry) => entry.text).join("\n");
}

function markedSegment(block, { splitAlternatives, itemLabel }) {
  const source = blockText(block);
  const markers = unescapedIndexes(source, "*");
  if (!markers.length) fail("exactly one answer segment must be wrapped in unescaped asterisks.", block, itemLabel);
  if (markers.length !== 2) fail(markers.length % 2 ? "the answer has an unmatched asterisk." : "exactly one marked answer segment is allowed.", block, itemLabel);
  const rawAnswer = source.slice(markers[0] + 1, markers[1]);
  if (!rawAnswer.trim()) fail("the marked answer cannot be empty.", block, itemLabel);
  const rawValues = splitAlternatives ? (() => {
    const slashIndexes = unescapedIndexes(rawAnswer, "/");
    const values = []; let start = 0;
    for (const index of slashIndexes) { values.push(rawAnswer.slice(start, index)); start = index + 1; }
    values.push(rawAnswer.slice(start)); return values;
  })() : [rawAnswer];
  const values = rawValues.map((value) => unescapeNativeBulkText(value).trim());
  if (values.some((value) => !value)) fail("marked answer alternatives cannot be empty.", block, itemLabel);
  if (new Set(values).size !== values.length) fail("marked answer alternatives must be unique.", block, itemLabel);
  const prompt = unescapeNativeBulkText(`${source.slice(0, markers[0])}${NATIVE_COMPLETE_SENTENCES_BLANK_TOKEN}${source.slice(markers[1] + 1)}`);
  return { prompt, values };
}

export function parseNativeCompleteSentencesBulk(input) {
  const blocks = numberedBlocks(input, "Item");
  if (blocks.length > NATIVE_COMPLETE_SENTENCES_LIMITS.items) fail(`no more than ${NATIVE_COMPLETE_SENTENCES_LIMITS.items} items are allowed.`, blocks[NATIVE_COMPLETE_SENTENCES_LIMITS.items]);
  return blocks.map((block) => {
    const parsed = markedSegment(block, { splitAlternatives: true, itemLabel: "Item" });
    const prompt = normalizeAt(() => normalizeNativePedagogicalText(parsed.prompt, "Complete the Sentences prompt", NATIVE_COMPLETE_SENTENCES_LIMITS.promptLength, { required: true }), block, "Item");
    const acceptedTexts = parsed.values.map((value) => normalizeAt(() => normalizeNativeSingleLineText(value, "Complete the Sentences accepted answer", NATIVE_COMPLETE_SENTENCES_LIMITS.answerLength, { required: true }), block, "Item"));
    return { prompt, acceptedTexts, displayText: acceptedTexts.join("/"), sourceLine: block.line };
  });
}

export function parseNativeDragDropBulk(input) {
  const blocks = numberedBlocks(input, "Item");
  if (blocks.length > NATIVE_DRAG_DROP_LIMITS.words) fail(`no more than ${NATIVE_DRAG_DROP_LIMITS.words} word labels are allowed.`, blocks[NATIVE_DRAG_DROP_LIMITS.words]);
  return blocks.map((block) => {
    const parsed = markedSegment(block, { splitAlternatives: false, itemLabel: "Item" });
    const text = normalizeAt(() => normalizeNativePedagogicalText(parsed.values[0], "Drag & Drop word label", NATIVE_DRAG_DROP_LIMITS.wordTextLength, { required: true }), block, "Item");
    return { text, sourceLine: block.line };
  });
}

export function parseNativeSingleChoiceBulk(input) {
  const blocks = numberedBlocks(input, "Question");
  if (blocks.length > NATIVE_SINGLE_CHOICE_LIMITS.questions) fail(`no more than ${NATIVE_SINGLE_CHOICE_LIMITS.questions} questions are allowed.`, blocks[NATIVE_SINGLE_CHOICE_LIMITS.questions], "Question");
  return blocks.map((block) => {
    const prompt = normalizeAt(() => normalizeNativePedagogicalText(unescapeNativeBulkText(block.lines[0].text), "Single Choice prompt", NATIVE_SINGLE_CHOICE_LIMITS.promptLength, { required: true }), block, "Question");
    const optionLines = block.lines.slice(1).filter((entry) => entry.text.trim());
    if (optionLines.length < NATIVE_SINGLE_CHOICE_LIMITS.optionsMinimum) fail(`at least ${NATIVE_SINGLE_CHOICE_LIMITS.optionsMinimum} options are required.`, block, "Question");
    if (optionLines.length > NATIVE_SINGLE_CHOICE_LIMITS.optionsMaximum) fail(`no more than ${NATIVE_SINGLE_CHOICE_LIMITS.optionsMaximum} options are allowed.`, block, "Question", optionLines[NATIVE_SINGLE_CHOICE_LIMITS.optionsMaximum].line);
    const options = optionLines.map((entry) => {
      const leftTrimmed = entry.text.trimStart();
      const correct = leftTrimmed.startsWith("*");
      const rawText = correct ? leftTrimmed.slice(1) : entry.text;
      const text = normalizeAt(() => normalizeNativePedagogicalText(unescapeNativeBulkText(rawText).trim(), "Single Choice option", NATIVE_SINGLE_CHOICE_LIMITS.optionTextLength, { required: true }), block, "Question", entry.line);
      return { text, correct, sourceLine: entry.line };
    });
    if (!options.some((option) => option.correct)) fail("at least one option must begin with *.", block, "Question");
    return { prompt, options, selectionMode: options.filter((option) => option.correct).length > 1 ? "multiple" : "single", sourceLine: block.line };
  });
}

function lastNonWhitespaceIndex(text) {
  for (let index = text.length - 1; index >= 0; index -= 1) if (!/\s/u.test(text[index])) return index;
  return -1;
}

function openAnswerBlock(lines, startIndex, block) {
  const first = lines[startIndex]; const leading = first.text.search(/\S/u);
  if (leading < 0 || first.text[leading] !== "*" || isEscaped(first.text, leading)) return null;
  const answerLines = []; let index = startIndex;
  for (; index < lines.length; index += 1) {
    const entry = lines[index];
    let text = index === startIndex ? entry.text.slice(leading + 1) : entry.text;
    const close = lastNonWhitespaceIndex(text);
    if (close >= 0 && text[close] === "*" && !isEscaped(text, close)) {
      if (unescapedIndexes(text, "*").some((marker) => marker !== close)) fail("model-answer delimiters are ambiguous.", block, "Question", entry.line);
      answerLines.push(text.slice(0, close));
      const answer = unescapeNativeBulkText(answerLines.join("\n")).trim();
      if (!answer) fail("model answers cannot be empty.", block, "Question", first.line);
      return { answer, nextIndex: index + 1 };
    }
    if (unescapedIndexes(text, "*").length) fail("the closing answer asterisk must end its line.", block, "Question", entry.line);
    answerLines.push(text);
  }
  fail("model answer has an unmatched opening asterisk.", block, "Question", first.line);
}

export function parseNativeOpenResponseBulk(input) {
  const blocks = numberedBlocks(input, "Question");
  if (blocks.length > NATIVE_OPEN_RESPONSE_LIMITS.questions) fail(`no more than ${NATIVE_OPEN_RESPONSE_LIMITS.questions} questions are allowed.`, blocks[NATIVE_OPEN_RESPONSE_LIMITS.questions], "Question");
  return blocks.map((block) => {
    const promptLines = [block.lines[0].text]; const modelAnswers = []; let index = 1; let answersStarted = false;
    while (index < block.lines.length) {
      const entry = block.lines[index];
      if (!entry.text.trim()) {
        if (!answersStarted) promptLines.push(entry.text); // trailing separators are removed below
        index += 1; continue;
      }
      const answerBlock = openAnswerBlock(block.lines, index, block);
      if (answerBlock) {
        answersStarted = true;
        modelAnswers.push(normalizeAt(() => normalizeNativePedagogicalText(answerBlock.answer, "Open Response model answer", NATIVE_OPEN_RESPONSE_LIMITS.modelAnswerLength, { required: true }), block, "Question", entry.line));
        if (modelAnswers.length > 2) fail("no more than two model answers are allowed.", block, "Question", entry.line);
        index = answerBlock.nextIndex; continue;
      }
      if (answersStarted) fail("unsupported content appears after a model-answer block.", block, "Question", entry.line);
      promptLines.push(entry.text); index += 1;
    }
    while (promptLines.length > 1 && !promptLines.at(-1).trim()) promptLines.pop();
    if (!modelAnswers.length) fail("one or two model answers are required.", block, "Question");
    const prompt = normalizeAt(() => normalizeNativePedagogicalText(unescapeNativeBulkText(promptLines.join("\n")), "Open Response prompt", NATIVE_OPEN_RESPONSE_LIMITS.promptLength, { required: true }), block, "Question");
    return { prompt, modelAnswers, sourceLine: block.line };
  });
}

const parsers = Object.freeze({
  "complete-sentences": parseNativeCompleteSentencesBulk,
  "single-choice": parseNativeSingleChoiceBulk,
  "open-response": parseNativeOpenResponseBulk,
  "drag-drop": parseNativeDragDropBulk,
});

export function parseNativeBulkSource(kind, input) {
  const parser = parsers[kind];
  if (!parser) throw new NativeBulkParseError("This native activity kind does not support bulk generation.");
  return parser(input);
}

export function hasNativeBulkSemanticContent(kind, publicDocument) {
  const interaction = publicDocument?.parts?.[0]?.interaction;
  if (kind === "complete-sentences") return Boolean(interaction?.items?.length);
  if (kind === "single-choice" || kind === "open-response") return Boolean(interaction?.questions?.length);
  if (kind === "drag-drop") return Boolean(interaction?.words?.length);
  return false;
}

function requireReplace(kind, publicDocument, replaceExisting) {
  if (hasNativeBulkSemanticContent(kind, publicDocument) && !replaceExisting) throw new NativeBulkParseError("Select Replace existing content before generating into a non-empty activity.");
}

function normalizeCandidatePair(publicDocument, teacherDocument, kind, normalizeInteraction, normalizeSolution) {
  const normalizedPublic = normalizeNativeActivityPublic(publicDocument, { normalizeInteraction, expectedActivityId: publicDocument.activityId, expectedKind: kind });
  const normalizedTeacher = normalizeNativeActivityTeacher(teacherDocument, { normalizeSolution, expectedActivityId: teacherDocument.activityId, expectedKind: kind });
  validateNativeActivityDocumentPair(normalizedPublic, normalizedTeacher);
  return { publicDocument: normalizedPublic, teacherDocument: normalizedTeacher };
}

function normalizeCompleteCandidate(publicDocument, teacherDocument, parsed, createId) {
  const publicCandidate = structuredClone(publicDocument); const teacherCandidate = structuredClone(teacherDocument);
  const interaction = publicCandidate.parts[0].interaction;
  [...interaction.items].slice(parsed.length).forEach((item) => removeNativeCompleteSentencesItem(publicCandidate, teacherCandidate, item.id));
  const existing = interaction.items;
  const ids = parsed.map((_, index) => existing[index]?.id || createId("item")); const retained = new Set(ids);
  interaction.items = parsed.map((item, index) => ({ id: ids[index], prompt: item.prompt }));
  interaction.evaluationMode = NATIVE_COMPLETE_SENTENCES_EXACT_EVALUATION_MODE;
  interaction.presentation.panels.forEach((panel) => { panel.hotspots = panel.hotspots.filter((hotspot) => retained.has(hotspot.itemId)); });
  teacherCandidate.parts[0].solution.answers = parsed.map((item, index) => ({ itemId: ids[index], text: item.displayText, acceptedTexts: item.acceptedTexts }));
  const normalized = normalizeCandidatePair(publicCandidate, teacherCandidate, "complete-sentences", normalizeNativeCompleteSentencesInteraction, normalizeNativeCompleteSentencesSolution);
  validateNativeCompleteSentencesTopology(normalized.publicDocument, normalized.teacherDocument);
  const readiness = assessNativeCompleteSentencesReadiness(normalized.publicDocument, normalized.teacherDocument);
  const preservedHotspots = normalized.publicDocument.parts[0].interaction.presentation.panels.flatMap((panel) => panel.hotspots).length;
  return { ...normalized, readiness, summary: {
    headline: `${parsed.length} item${parsed.length === 1 ? "" : "s"} generated`,
    details: [`${parsed.reduce((total, item) => total + item.acceptedTexts.length, 0)} accepted answer values`, `${parsed.filter((item) => item.acceptedTexts.length > 1).length} items contain alternatives`, `${preservedHotspots} existing hotspots preserved`, `${Math.max(0, parsed.length - preservedHotspots)} items awaiting hotspot placement`],
  } };
}

function normalizeChoiceCandidate(publicDocument, teacherDocument, parsed, createId) {
  const publicCandidate = structuredClone(publicDocument); const teacherCandidate = structuredClone(teacherDocument);
  const interaction = publicCandidate.parts[0].interaction;
  [...interaction.questions].slice(parsed.length).forEach((question) => removeNativeSingleChoiceQuestion(publicCandidate, teacherCandidate, question.id));
  interaction.questions.forEach((question, questionIndex) => [...question.options].slice(parsed[questionIndex]?.options.length || 0).forEach((option) => removeNativeSingleChoiceOption(publicCandidate, teacherCandidate, question.id, option.id)));
  const existing = interaction.questions;
  interaction.questions = parsed.map((question, questionIndex) => {
    const old = existing[questionIndex]; const id = old?.id || createId("q");
    const options = question.options.map((option, optionIndex) => ({ id: old?.options?.[optionIndex]?.id || createId("opt"), text: option.text }));
    return { id, selectionMode: question.selectionMode, prompt: question.prompt, options };
  });
  const validBindings = new Set(interaction.questions.flatMap((question) => question.options.map((option) => `${question.id}\0${option.id}`)));
  if (interaction.presentation) interaction.presentation.panels.forEach((panel) => { panel.hotspots = panel.hotspots.filter((hotspot) => validBindings.has(`${hotspot.questionId}\0${hotspot.optionId}`)); });
  teacherCandidate.parts[0].solution.correctAnswers = interaction.questions.map((question, questionIndex) => ({ questionId: question.id, correctOptionIds: question.options.filter((_, optionIndex) => parsed[questionIndex].options[optionIndex].correct).map((option) => option.id) }));
  const normalized = normalizeCandidatePair(publicCandidate, teacherCandidate, "single-choice", normalizeNativeSingleChoiceInteraction, normalizeNativeSingleChoiceSolution);
  const readiness = assessNativeSingleChoiceReadiness(normalized.publicDocument, normalized.teacherDocument);
  const preservedHotspots = normalized.publicDocument.parts[0].interaction.presentation?.panels.flatMap((panel) => panel.hotspots).length || 0;
  const optionCount = parsed.reduce((total, question) => total + question.options.length, 0);
  if (!interaction.presentation || readiness.ready) validateNativeSingleChoiceTopology(normalized.publicDocument, normalized.teacherDocument);
  return { ...normalized, readiness, summary: {
    headline: `${parsed.length} question${parsed.length === 1 ? "" : "s"} generated`,
    details: [`${optionCount} options generated`, `${parsed.filter((question) => question.selectionMode === "multiple").length} questions use multiple selection`, `${preservedHotspots} existing hotspots preserved`, `${Math.max(0, optionCount - preservedHotspots)} options awaiting visual mapping`],
  } };
}

function normalizeOpenCandidate(publicDocument, teacherDocument, parsed, createId) {
  const publicCandidate = structuredClone(publicDocument); const teacherCandidate = structuredClone(teacherDocument);
  const interaction = publicCandidate.parts[0].interaction; const existing = interaction.questions;
  interaction.questions = parsed.map((question, index) => {
    const current = existing[index] ? structuredClone(existing[index]) : createNativeOpenResponseQuestion(createId("q"), index);
    current.prompt = question.prompt; return current;
  });
  const ids = interaction.questions.map((question) => question.id); const retained = new Set(ids);
  const panels = interaction.presentation?.panels || [];
  panels.forEach((panel) => {
    if (Object.hasOwn(panel, "questionIds")) panel.questionIds = panel.questionIds.filter((id) => retained.has(id));
    else {
      panel.promptQuestionIds = panel.promptQuestionIds.filter((id) => retained.has(id));
      panel.responseQuestionIds = panel.responseQuestionIds.filter((id) => retained.has(id));
    }
  });
  const oldIds = new Set(existing.map((question) => question.id)); const firstPanel = panels[0];
  if (firstPanel) for (const id of ids.filter((questionId) => !oldIds.has(questionId))) {
    if (Object.hasOwn(firstPanel, "questionIds")) firstPanel.questionIds.push(id);
    else { firstPanel.promptQuestionIds.push(id); firstPanel.responseQuestionIds.push(id); }
  }
  teacherCandidate.parts[0].solution.modelAnswers = parsed.map((question, index) => question.modelAnswers.length === 1
    ? { questionId: ids[index], text: question.modelAnswers[0] }
    : { questionId: ids[index], modelAnswerTexts: question.modelAnswers });
  const normalized = normalizeCandidatePair(publicCandidate, teacherCandidate, "open-response", normalizeNativeOpenResponseInteraction, normalizeNativeOpenResponseSolution);
  validateNativeOpenResponseTopology(normalized.publicDocument, normalized.teacherDocument);
  const readiness = assessNativeOpenResponseReadiness(normalized.publicDocument, normalized.teacherDocument);
  return { ...normalized, readiness, summary: {
    headline: `${parsed.length} question${parsed.length === 1 ? "" : "s"} generated`,
    details: [`${parsed.reduce((total, question) => total + question.modelAnswers.length, 0)} private model-answer variants`, `${Math.min(existing.length, parsed.length)} existing response regions preserved`],
  } };
}

function normalizeDragDropCandidate(publicDocument, teacherDocument, parsed, createId) {
  const publicCandidate = structuredClone(publicDocument); const teacherCandidate = structuredClone(teacherDocument);
  const interaction = publicCandidate.parts[0].interaction;
  [...interaction.words].slice(parsed.length).forEach((word) => removeNativeDragDropWord(publicCandidate, teacherCandidate, word.id));
  const existing = interaction.words;
  interaction.words = parsed.map((word, index) => ({
    id: existing[index]?.id || createId("word"),
    text: word.text,
    reusable: interaction.layoutMode === "text" ? false : existing[index]?.reusable || false,
    shortLabel: existing[index]?.shortLabel || nativeDragDropShortLabel(index),
  }));
  const targets = interaction.panels.flatMap((panel) => panel.dropTargets);
  teacherCandidate.parts[0].solution.mappings = targets.slice(0, interaction.words.length).map((target, index) => {
    target.capacity = 1;
    return { targetId: target.id, wordIds: [interaction.words[index].id] };
  });
  const normalized = normalizeCandidatePair(publicCandidate, teacherCandidate, "drag-drop", normalizeNativeDragDropInteraction, normalizeNativeDragDropSolution);
  if (targets.length === normalized.teacherDocument.parts[0].solution.mappings.length) validateNativeDragDropTopology(normalized.publicDocument, normalized.teacherDocument);
  const baseReadiness = assessNativeDragDropReadiness(normalized.publicDocument, normalized.teacherDocument);
  const mismatch = targets.length === interaction.words.length ? [] : [`Word/target count mismatch: ${interaction.words.length} words and ${targets.length} targets.`];
  const readiness = { ready: baseReadiness.ready && !mismatch.length, issues: [...baseReadiness.issues, ...mismatch] };
  return { ...normalized, readiness, summary: {
    headline: `${parsed.length} word label${parsed.length === 1 ? "" : "s"} generated`,
    details: [`${Math.min(targets.length, parsed.length)} existing targets mapped`, `${Math.max(0, parsed.length - targets.length)} words awaiting targets`, `${Math.max(0, targets.length - parsed.length)} targets awaiting words`],
  } };
}

const candidateNormalizers = Object.freeze({
  "complete-sentences": normalizeCompleteCandidate,
  "single-choice": normalizeChoiceCandidate,
  "open-response": normalizeOpenCandidate,
  "drag-drop": normalizeDragDropCandidate,
});

export function generateNativeBulkCandidate({ kind, source, publicDocument, teacherDocument, replaceExisting = false, createId = createNativeChildId }) {
  if (!publicDocument || !teacherDocument || publicDocument.kind !== kind || teacherDocument.kind !== kind) throw new NativeBulkParseError("The current native draft pair is unavailable or mismatched.");
  requireReplace(kind, publicDocument, replaceExisting);
  const parsed = parseNativeBulkSource(kind, source);
  try { return candidateNormalizers[kind](publicDocument, teacherDocument, parsed, createId); }
  catch (error) {
    if (error instanceof NativeBulkParseError) throw error;
    throw new NativeBulkParseError(`Generated content is invalid: ${error.message}`);
  }
}
