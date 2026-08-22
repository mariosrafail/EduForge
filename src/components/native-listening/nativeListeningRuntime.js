const SRT_TIME = /^(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})$/;

export function formatNativeListeningTime(milliseconds) {
  const seconds = Math.max(0, Math.floor(Number(milliseconds || 0) / 1_000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function parseNativeListeningDisplayTime(value) {
  const match = String(value || "").trim().match(/^(\d+):([0-5]\d)$/);
  if (!match) throw new Error("Use MM:SS.");
  const milliseconds = (Number(match[1]) * 60 + Number(match[2])) * 1_000;
  if (!Number.isSafeInteger(milliseconds)) throw new Error("Time is outside the supported range.");
  return milliseconds;
}

export function findNativeListeningCue(cues, milliseconds) {
  let low = 0; let high = cues.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const cue = cues[middle];
    if (milliseconds < cue.startMs) high = middle - 1;
    else if (milliseconds >= cue.endMs) low = middle + 1;
    else return cue;
  }
  return null;
}

function parseSrtTimestamp(value, label) {
  const match = value.match(SRT_TIME);
  if (!match) throw new Error(`${label} has a malformed timestamp.`);
  const [, hours, minutes, seconds, milliseconds] = match;
  if (Number(minutes) > 59 || Number(seconds) > 59) throw new Error(`${label} has a malformed timestamp.`);
  const result = (((Number(hours) * 60) + Number(minutes)) * 60 + Number(seconds)) * 1_000 + Number(milliseconds);
  if (!Number.isSafeInteger(result)) throw new Error(`${label} is outside the supported range.`);
  return result;
}

export function parseNativeListeningSrt(input, { createId } = {}) {
  const normalized = String(input ?? "").replace(/^\ufeff/, "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) throw new Error("SRT is empty.");
  if (typeof createId !== "function") throw new Error("SRT cue identity factory is required.");
  const blocks = normalized.split(/\n[ \t]*\n+/);
  const cues = blocks.map((block, blockIndex) => {
    const lines = block.split("\n");
    if (/^\d+$/.test(lines[0]?.trim() || "")) lines.shift();
    const timing = lines.shift()?.trim().match(/^(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/);
    if (!timing) throw new Error(`SRT cue ${blockIndex + 1} has a malformed timing line.`);
    const startMs = parseSrtTimestamp(timing[1], `SRT cue ${blockIndex + 1}`);
    const endMs = parseSrtTimestamp(timing[2], `SRT cue ${blockIndex + 1}`);
    if (endMs <= startMs) throw new Error(`SRT cue ${blockIndex + 1} must end after it starts.`);
    const text = lines.join("\n").trim();
    if (!text) throw new Error(`SRT cue ${blockIndex + 1} has no text.`);
    return { id: createId(), startMs, endMs, text };
  });
  cues.forEach((cue, index) => {
    if (index && cue.startMs < cues[index - 1].startMs) throw new Error(`SRT cue ${index + 1} is out of order.`);
    if (index && cue.startMs < cues[index - 1].endMs) throw new Error(`SRT cue ${index + 1} overlaps the previous cue.`);
  });
  return cues;
}

export function transcriptScrollTarget({ cueTop, cueBottom, scrollTop, viewportHeight, scrollHeight }) {
  const comfortableTop = scrollTop + Math.min(82, viewportHeight * 0.18);
  const comfortableBottom = scrollTop + viewportHeight - Math.min(82, viewportHeight * 0.18);
  if (cueTop >= comfortableTop && cueBottom <= comfortableBottom) return scrollTop;
  return Math.max(0, Math.min(scrollHeight - viewportHeight, cueTop - Math.min(82, viewportHeight * 0.18)));
}
