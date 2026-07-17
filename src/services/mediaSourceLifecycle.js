export function captureMediaPlaybackState(media, shouldPlay = !media?.paused) {
  if (!media) return null;
  return {
    currentTime: Number(media.currentTime) || 0,
    playbackRate: Number(media.playbackRate) || 1,
    volume: Number.isFinite(Number(media.volume)) ? Number(media.volume) : 1,
    muted: Boolean(media.muted),
    shouldPlay: Boolean(shouldPlay),
  };
}

export async function restoreMediaPlaybackState(media, snapshot) {
  if (!media || !snapshot) return;
  const duration = Number(media.duration);
  const upperBound = Number.isFinite(duration) && duration > 0 ? duration : snapshot.currentTime;
  media.currentTime = Math.min(Math.max(snapshot.currentTime, 0), upperBound);
  media.playbackRate = snapshot.playbackRate;
  media.volume = snapshot.volume;
  media.muted = snapshot.muted;
  if (snapshot.shouldPlay) await media.play();
}
