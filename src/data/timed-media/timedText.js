import { isNativeChildId } from "../native-activities/nativeChildIdentity.js";

export const TIMED_TEXT_LIMITS = Object.freeze({
  sourceCharacters: 1_000_000,
  cues: 500,
  cueTextLength: 4_000,
  durationMs: 99 * 60 * 60 * 1_000,
});

const SRT_TIME = /^(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})$/;

function integer(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${label} is invalid.`);
  return value;
}

function captionText(value, label) {
  if (typeof value !== "string" || value.length > TIMED_TEXT_LIMITS.cueTextLength || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw new Error(`${label} is invalid.`);
  }
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function parseSrtTimestamp(value, label) {
  const match = value.match(SRT_TIME);
  if (!match) throw new Error(`${label} has a malformed timestamp.`);
  const [, hours, minutes, seconds, milliseconds] = match;
  if (Number(minutes) > 59 || Number(seconds) > 59) throw new Error(`${label} has a malformed timestamp.`);
  const result = (((Number(hours) * 60) + Number(minutes)) * 60 + Number(seconds)) * 1_000 + Number(milliseconds);
  if (!Number.isSafeInteger(result) || result > TIMED_TEXT_LIMITS.durationMs) throw new Error(`${label} is outside the supported range.`);
  return result;
}

export function normalizeTimedTextCues(input, { label = "Timed text", idPrefix = "cue" } = {}) {
  if (!Array.isArray(input) || input.length < 1 || input.length > TIMED_TEXT_LIMITS.cues) throw new Error(`${label} cue count is invalid.`);
  const ids = new Set();
  let duplicateIdentity = false;
  const cues = input.map((entry, index) => {
    const cueLabel = `${label} cues[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)
      || Object.keys(entry).sort().join("\0") !== ["endMs", "id", "startMs", "text"].sort().join("\0")) {
      throw new Error(`${cueLabel} has missing or unknown fields.`);
    }
    if (!isNativeChildId(entry.id, idPrefix)) throw new Error(`${cueLabel}.id is invalid.`);
    if (ids.has(entry.id)) duplicateIdentity = true;
    ids.add(entry.id);
    const startMs = integer(entry.startMs, `${cueLabel}.startMs`, 0, TIMED_TEXT_LIMITS.durationMs);
    const endMs = integer(entry.endMs, `${cueLabel}.endMs`, 1, TIMED_TEXT_LIMITS.durationMs);
    if (endMs <= startMs) throw new Error(`${cueLabel} must end after it starts.`);
    return { id: entry.id, startMs, endMs, text: captionText(entry.text, `${cueLabel}.text`) };
  });
  cues.forEach((cue, index) => {
    if (index && cue.startMs < cues[index - 1].startMs) throw new Error(`${label} cue ${index + 1} is out of order.`);
    if (index && cue.startMs < cues[index - 1].endMs) throw new Error(`${label} cue ${index + 1} overlaps the previous cue.`);
  });
  if (duplicateIdentity) throw new Error(`${label} cue identities must be unique.`);
  return cues;
}

export function parseTimedTextSrt(input, { createId, label = "SRT" } = {}) {
  const source = String(input ?? "");
  if (source.length > TIMED_TEXT_LIMITS.sourceCharacters) throw new Error(`${label} is too large.`);
  const normalized = source.replace(/^\ufeff/, "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) throw new Error(`${label} is empty.`);
  if (typeof createId !== "function") throw new Error(`${label} cue identity factory is required.`);
  const blocks = normalized.split(/\n[ \t]*\n+/);
  if (blocks.length > TIMED_TEXT_LIMITS.cues) throw new Error(`${label} has too many cues.`);
  const cues = blocks.map((block, blockIndex) => {
    const lines = block.split("\n");
    if (/^\d+$/.test(lines[0]?.trim() || "")) lines.shift();
    const timing = lines.shift()?.trim().match(/^(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/);
    if (!timing) throw new Error(`${label} cue ${blockIndex + 1} has a malformed timing line.`);
    const startMs = parseSrtTimestamp(timing[1], `${label} cue ${blockIndex + 1}`);
    const endMs = parseSrtTimestamp(timing[2], `${label} cue ${blockIndex + 1}`);
    if (endMs <= startMs) throw new Error(`${label} cue ${blockIndex + 1} must end after it starts.`);
    const text = lines.join("\n").trim();
    if (!text) throw new Error(`${label} cue ${blockIndex + 1} has no text.`);
    return { id: createId(), startMs, endMs, text };
  });
  return normalizeTimedTextCues(cues, { label });
}

export function findTimedTextCue(cues, milliseconds) {
  let low = 0;
  let high = cues.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const cue = cues[middle];
    if (milliseconds < cue.startMs) high = middle - 1;
    else if (milliseconds >= cue.endMs) low = middle + 1;
    else return cue;
  }
  return null;
}
