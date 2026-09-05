import { canonicalMarkWordsText, NATIVE_MARK_WORDS_LIMITS, segmentMarkWordsText } from "./nativeMarkWords.js";
import { createNativeChildId } from "./nativeChildIdentity.js";
import { addNativeMarkWordsPassage, removeNativeMarkWordsPassage, setNativeMarkWordsAnswers, validateMarkWordsAuthoringPair } from "./nativeMarkWordsAuthoring.js";

function fail(message, item = null, line = 1) { throw new Error(`${item ? `Passage ${item}, ` : ""}line ${line}: ${message}`); }

export function parseNativeMarkWordsBulk(source) {
  if (typeof source !== "string" || source.length > 32_000) fail("Paste at most 32,000 characters.");
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  for (const [index, text] of lines.entries()) {
    const match = text.match(/^\s*(\d+)[.)]\s+(.+)$/u);
    if (match) {
      if (Number(match[1]) !== blocks.length + 1) fail("Number passages consecutively from 1.", blocks.length + 1, index + 1);
      blocks.push({ lines: [match[2]], line: index + 1 });
    } else if (/^\s*\d+[.)]/u.test(text)) fail("Use a numbered boundary such as 1. text.", blocks.length + 1, index + 1);
    else if (blocks.length) blocks.at(-1).lines.push(text);
    else if (text.trim()) fail("Start with 1. followed by passage text.", 1, index + 1);
  }
  if (!blocks.length || blocks.length > NATIVE_MARK_WORDS_LIMITS.passages) fail("Use between 1 and 20 numbered passages.");
  let totalWords = 0; let totalText = 0;
  return blocks.map((block, index) => {
    while (block.lines.length > 1 && !block.lines.at(-1).trim()) block.lines.pop();
    const raw = block.lines.join("\n");
    let text = ""; let opening = null; let line = block.line;
    const marked = [];
    for (let cursor = 0; cursor < raw.length; cursor += 1) {
      const character = raw[cursor];
      if (character === "\n") line += 1;
      if (character === "\\") {
        if (!["*", "\\"].includes(raw[cursor + 1])) fail("Escape a literal asterisk as \\* and a backslash as \\\\.", index + 1, line);
        text += raw[++cursor];
      } else if (character === "*") {
        if (opening === null) opening = text.length;
        else {
          if (!text.slice(opening).trim()) fail("Marked sections cannot be empty.", index + 1, line);
          marked.push({ start: opening, end: text.length }); opening = null;
        }
      } else text += character;
    }
    if (opening !== null) fail("Unmatched asterisk.", index + 1, line);
    if (!marked.length) fail("Mark at least one correct word with *asterisks*.", index + 1, block.line);
    let ranges;
    try { canonicalMarkWordsText(text); ranges = segmentMarkWordsText(text); }
    catch (error) { fail(error.message, index + 1, block.line); }
    for (const section of marked) {
      if (!ranges.some((word) => word.start >= section.start && word.end <= section.end)) fail("Each marked section needs a whole lexical word.", index + 1, block.line);
      if (ranges.some((word) => word.start < section.end && word.end > section.start && (word.start < section.start || word.end > section.end))) fail("Markers must surround whole words.", index + 1, block.line);
    }
    totalWords += ranges.length; totalText += text.length;
    if (ranges.length > NATIVE_MARK_WORDS_LIMITS.wordsPerPassage || totalWords > NATIVE_MARK_WORDS_LIMITS.words || totalText > NATIVE_MARK_WORDS_LIMITS.totalText) fail("Exceeded passage/activity word or text limits.", index + 1, block.line);
    return { text, correctRanges: ranges.filter((word) => marked.some((section) => word.start >= section.start && word.end <= section.end)), sourceLine: block.line };
  });
}

export function generateNativeMarkWordsBulkCandidate({ source, publicDocument, teacherDocument, replaceExisting = false, confirmed = false, createId = createNativeChildId }) {
  const parsed = parseNativeMarkWordsBulk(source);
  if (replaceExisting && publicDocument.parts[0].interaction.items.length && !confirmed) throw new Error("Confirm replacement: existing passages, private answers and their word hotspots will be removed; backgrounds and common media remain.");
  const nextPublic = structuredClone(publicDocument); const nextTeacher = structuredClone(teacherDocument);
  if (replaceExisting) for (const item of [...nextPublic.parts[0].interaction.items]) removeNativeMarkWordsPassage(nextPublic, nextTeacher, item.id);
  for (const entry of parsed) {
    const id = addNativeMarkWordsPassage(nextPublic, nextTeacher, entry.text, createId);
    const item = nextPublic.parts[0].interaction.items.find((value) => value.id === id);
    setNativeMarkWordsAnswers(nextPublic, nextTeacher, id, item.words.filter((word) => entry.correctRanges.some((range) => word.start === range.start && word.end === range.end)).map((word) => word.id));
  }
  validateMarkWordsAuthoringPair(nextPublic, nextTeacher);
  return { publicDocument: nextPublic, teacherDocument: nextTeacher, summary: { headline: `${parsed.length} passages ${replaceExisting ? "replaced" : "appended"}`, details: ["Review Answer Key and map all words when using image presentation."] } };
}
