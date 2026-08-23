import { findTimedTextCue, parseTimedTextSrt } from "../../data/timed-media/timedText.js";

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
  return findTimedTextCue(cues, milliseconds);
}

export function parseNativeListeningSrt(input, { createId } = {}) {
  return parseTimedTextSrt(input, { createId, label: "SRT" });
}

export function transcriptScrollTarget({ cueTop, cueBottom, scrollTop, viewportHeight, scrollHeight }) {
  const comfortableTop = scrollTop + Math.min(82, viewportHeight * 0.18);
  const comfortableBottom = scrollTop + viewportHeight - Math.min(82, viewportHeight * 0.18);
  if (cueTop >= comfortableTop && cueBottom <= comfortableBottom) return scrollTop;
  return Math.max(0, Math.min(scrollHeight - viewportHeight, cueTop - Math.min(82, viewportHeight * 0.18)));
}
