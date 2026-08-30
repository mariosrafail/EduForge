import { nativeChildIdFromUuid } from "./nativeChildIdentity.js";

const stableId = (prefix, index) => nativeChildIdFromUuid(prefix, `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);

function scrollAt(timeline, milliseconds) {
  return timeline.find((entry) => milliseconds >= entry.startMs && milliseconds < entry.endMs)?.scrollY ?? null;
}

export function adaptLegacyListeningAuthoringToOldschoolInteraction(authoring, { audioAssetSlot, pageAssetSlot, audioDurationMs, pageAltText }) {
  const fragmentIndex = new Map(authoring.karaoke.fragments.map((fragment, index) => [fragment.id, index]));
  const fragments = new Map(authoring.karaoke.fragments.map((fragment) => [fragment.id, fragment]));
  const sourceWidth = Math.max(authoring.karaoke.content.width, ...authoring.karaoke.fragments.map((fragment) => fragment.x + fragment.width));
  const sourceHeight = Math.max(authoring.karaoke.content.height, ...authoring.karaoke.fragments.map((fragment) => fragment.y + fragment.height));
  return {
    kind: "oldschool-listening",
    audioAssetSlot,
    audioDurationMs,
    panels: [
      { id: "panel-1", kind: "questions", sourceWidth: 1024, sourceHeight: 582 },
      { id: "panel-2", kind: "synchronized-page", pageAssetSlot, sourceWidth, sourceHeight, altText: pageAltText },
    ],
    artwork: [],
    questions: [],
    cues: authoring.karaoke.cues.map((cue, cueIndex) => ({
      id: stableId("cue", cueIndex),
      startMs: cue.startMs,
      endMs: cue.endMs,
      text: cue.fragmentIds.flatMap((id) => fragments.get(id)?.runs || []).map((run) => run.text).join(" ").trim(),
      highlightRegions: cue.fragmentIds.map((id) => {
        const fragment = fragments.get(id); const index = fragmentIndex.get(id);
        return { id: stableId("region", index), x: fragment.x, y: fragment.y, width: fragment.width, height: fragment.height, text: fragment.runs.map((run) => run.text).join("").trim() };
      }),
      scrollY: scrollAt(authoring.karaoke.scrollTimeline, cue.startMs),
    })),
    snippetHotspots: [],
  };
}
