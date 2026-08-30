import { findTimedTextCue, parseTimedTextSrt } from "../../data/timed-media/timedText.js";

export function findNativeOldschoolListeningCue(cues, milliseconds) {
  return findTimedTextCue(cues, milliseconds);
}

export function parseNativeOldschoolListeningSrt(input, { createId } = {}) {
  return parseTimedTextSrt(input, { createId, label: "SRT" }).map((cue) => ({ ...cue, highlightRegions: [], scrollY: null }));
}

export function nativeOldschoolListeningRegionStyle(region, surface) {
  return {
    left: `${region.x / surface.width * 100}%`,
    top: `${region.y / surface.height * 100}%`,
    width: `${region.width / surface.width * 100}%`,
    height: `${region.height / surface.height * 100}%`,
  };
}

export function nativeOldschoolListeningCueScrollY(cue) {
  if (!cue) return null;
  if (Number.isSafeInteger(cue.scrollY)) return cue.scrollY;
  if (!cue.highlightRegions?.length) return null;
  const top = Math.min(...cue.highlightRegions.map((region) => region.y));
  const bottom = Math.max(...cue.highlightRegions.map((region) => region.y + region.height));
  return Math.round((top + bottom) / 2);
}

export function nativeOldschoolListeningScrollTarget({ targetY, sourceHeight, renderedHeight, scrollTop, viewportHeight }) {
  if (!Number.isFinite(targetY) || !(sourceHeight > 0) || !(renderedHeight > 0) || !(viewportHeight > 0)) return scrollTop;
  const renderedTarget = targetY * renderedHeight / sourceHeight;
  const comfortableTop = scrollTop + viewportHeight * .25;
  const comfortableBottom = scrollTop + viewportHeight * .7;
  if (renderedTarget >= comfortableTop && renderedTarget <= comfortableBottom) return scrollTop;
  return Math.max(0, Math.min(renderedHeight - viewportHeight, renderedTarget - viewportHeight * .35));
}

