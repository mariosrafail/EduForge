import { createNativeChildId } from "./nativeChildIdentity.js";

export function addNativeOldschoolListeningCue(interaction, cue, { createId = () => createNativeChildId("cue") } = {}) {
  const created = {
    id: createId(),
    startMs: Math.round(cue.startMs),
    endMs: Math.round(cue.endMs),
    text: String(cue.text || ""),
    highlightRegions: [],
    scrollY: null,
  };
  interaction.cues.push(created);
  interaction.cues.sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs || left.id.localeCompare(right.id));
  return created;
}

export function removeNativeOldschoolListeningCue(interaction, cueId) {
  const index = interaction.cues.findIndex((entry) => entry.id === cueId);
  if (index < 0) throw new Error("Oldschool Listening cue does not exist.");
  const [removed] = interaction.cues.splice(index, 1);
  interaction.snippetHotspots?.forEach((hotspot) => { hotspot.cueIds = hotspot.cueIds.filter((id) => id !== cueId); });
  if (interaction.snippetHotspots) interaction.snippetHotspots = interaction.snippetHotspots.filter((hotspot) => hotspot.cueIds.length);
  return removed;
}

export function addNativeOldschoolListeningRegion(cue, area, { createId = () => createNativeChildId("region") } = {}) {
  const region = { id: createId(), ...Object.fromEntries(Object.entries(area).map(([key, value]) => [key, Math.round(value)])) };
  cue.highlightRegions.push(region);
  return region;
}

export function updateNativeOldschoolListeningRegion(cue, regionId, area) {
  const region = cue.highlightRegions.find((entry) => entry.id === regionId);
  if (!region) throw new Error("Oldschool Listening highlight region does not exist.");
  Object.assign(region, Object.fromEntries(Object.entries(area).map(([key, value]) => [key, Math.round(value)])));
  return region;
}

export function removeNativeOldschoolListeningRegion(cue, regionId) {
  const index = cue.highlightRegions.findIndex((entry) => entry.id === regionId);
  if (index < 0) throw new Error("Oldschool Listening highlight region does not exist.");
  return cue.highlightRegions.splice(index, 1)[0];
}

export function clearNativeOldschoolListeningMappings(interaction) {
  interaction.cues.forEach((cue) => { cue.highlightRegions = []; cue.scrollY = null; });
}
