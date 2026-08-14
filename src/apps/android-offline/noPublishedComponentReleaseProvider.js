export function clearPublishedComponentReleaseCache() {}
export function usePublishedComponentRelease() { return { kind: "none" }; }
export function hydratePublishedActivityImport() { return null; }
export function publishedHotspotActions(_publication, identity) {
  return getUltimateB2StudentsBookHotspotActions(identity);
}
import { getUltimateB2StudentsBookHotspotActions } from "../../data/ultimate-b2/studentsBookHotspots.js";
