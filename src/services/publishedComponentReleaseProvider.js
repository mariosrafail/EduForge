import { useEffect, useState } from "react";
import { getActiveComponentPublication, getPublishedNativeTeacherDocument } from "./componentPublicationApi.js";
import { createUltimateB2HostedOpenResponseSeed } from "../data/ultimate-b2/hostedOpenResponseDraft.js";
import { hydrateUltimateB2ReleaseImport, publishedReleaseAssetPath } from "../data/ultimate-b2/componentPublication.js";
import { findStudentsBookImplementation } from "../data/ultimate-b2/studentsBookCatalog.js";
import { getUltimateB2StudentsBookHotspotActions, getUltimateB2StudentsBookHotspotActionsFromManifest } from "../data/ultimate-b2/studentsBookHotspots.js";

let cached = null;
let pending = null;

export function clearPublishedComponentReleaseCache() { cached = null; pending = null; }

export function usePublishedComponentRelease() {
  const [state, setState] = useState(cached || { kind: "loading" });
  useEffect(() => {
    if (cached) { setState(cached); return undefined; }
    let active = true;
    pending ||= getActiveComponentPublication().then((value) => { cached = value; return value; }).finally(() => { pending = null; });
    pending.then((value) => { if (active) setState(value); }).catch((error) => { if (active) setState({ kind: "error", message: error.message }); });
    return () => { active = false; };
  }, []);
  return state;
}

export function hydratePublishedActivityImport(activityId, input, releaseId) {
  if (!input) return null;
  const seed = createUltimateB2HostedOpenResponseSeed(findStudentsBookImplementation(activityId));
  return hydrateUltimateB2ReleaseImport(input, activityId, seed.questions.map((question) => question.id), (asset) => publishedReleaseAssetPath(asset, releaseId));
}

export function publishedHotspotActions(publication, identity) {
  if (publication.kind === "published") return getUltimateB2StudentsBookHotspotActionsFromManifest(publication.projection.hotspots, identity);
  if (publication.kind === "none") return getUltimateB2StudentsBookHotspotActions(identity);
  return [];
}

export function publishedNativeAssetUrl(publication, reference) {
  if (publication.kind !== "published" || !reference) return "";
  const asset = publication.projection.assets.find((candidate) => candidate.sha256 === reference.checksumSha256 && candidate.role === reference.role);
  return asset ? publishedReleaseAssetPath(asset, publication.releaseId) : "";
}

export async function loadPublishedNativeTeacherDocument(publication, activityId, { signal } = {}) {
  if (publication.kind !== "published") throw new Error("Published release is unavailable.");
  const payload = await getPublishedNativeTeacherDocument({ releaseId: publication.releaseId, activityId, signal });
  if (payload.releaseId !== publication.releaseId || payload.activityId !== activityId) throw new Error("Teacher release identity mismatch.");
  return payload.document;
}
