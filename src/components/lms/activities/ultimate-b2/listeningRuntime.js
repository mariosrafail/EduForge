export function findListeningCue(cues, timeMs) {
  let low = 0;
  let high = cues.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const cue = cues[middle];
    if (timeMs < cue.startMs) high = middle - 1;
    else if (timeMs >= cue.endMs) low = middle + 1;
    else return cue;
  }
  return null;
}

export function findListeningScrollEntry(entries, timeMs) {
  let match = entries[0] || null;
  for (const entry of entries) {
    if (timeMs < entry.startMs) break;
    if (timeMs < entry.endMs) return entry;
    match = entry;
  }
  return match;
}

export function formatListeningTime(timeMs) {
  const safe = Math.max(0, Number.isFinite(timeMs) ? Math.round(timeMs) : 0);
  const minutes = Math.floor(safe / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1_000);
  const milliseconds = safe % 1_000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}
