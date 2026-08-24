import { useEffect, useState } from "react";

import { normalizeComponentPublicationEnvelope } from "../../services/componentPublicationApi.js";
import { createUltimateB2HostedOpenResponseSeed } from "../../data/ultimate-b2/hostedOpenResponseDraft.js";
import { hydrateUltimateB2ReleaseImport } from "../../data/ultimate-b2/componentPublication.js";
import { findStudentsBookImplementation } from "../../data/ultimate-b2/studentsBookCatalog.js";
import { getUltimateB2StudentsBookHotspotActions, getUltimateB2StudentsBookHotspotActionsFromManifest } from "../../data/ultimate-b2/studentsBookHotspots.js";
import { HOSTED_VIEWER_RUNTIME_MODES, hostedReleasePath, resolveHostedViewerRuntimeContext } from "./hostedReleasePreview.js";

let cached = null;
let pending = null;

export function clearPublishedComponentReleaseCache() { cached = null; pending = null; }

async function loadRelease(signal) {
  const context = resolveHostedViewerRuntimeContext();
  if (context.kind !== HOSTED_VIEWER_RUNTIME_MODES.RELEASE_PREVIEW) return { kind: "none" };
  const response = await fetch(hostedReleasePath(context.releaseId, "public"), { method: "GET", credentials: "omit", cache: "no-store", signal });
  if (!response.ok) throw new Error("Prepared release is unavailable.");
  return normalizeComponentPublicationEnvelope(await response.json());
}

export function usePublishedComponentRelease() {
  const [state, setState] = useState(cached || { kind: "loading" });
  useEffect(() => {
    if (cached) { setState(cached); return undefined; }
    const controller = new AbortController();
    pending ||= loadRelease(controller.signal).then((value) => { cached = value; return value; }).finally(() => { pending = null; });
    pending.then(setState).catch((error) => setState({ kind: "error", message: error.message }));
    return () => controller.abort();
  }, []);
  return state;
}

export function hydratePublishedActivityImport(activityId, input, releaseId) {
  if (!input) return null;
  const seed = createUltimateB2HostedOpenResponseSeed(findStudentsBookImplementation(activityId));
  return hydrateUltimateB2ReleaseImport(input, activityId, seed.questions.map((question) => question.id), (asset) => hostedReleasePath(releaseId, `assets/${asset.sha256}.${asset.extension}`));
}

export function publishedHotspotActions(publication, identity) {
  if (publication.kind === "published") return getUltimateB2StudentsBookHotspotActionsFromManifest(publication.projection.hotspots, identity);
  if (publication.kind === "none") return getUltimateB2StudentsBookHotspotActions(identity);
  return [];
}

export function publishedNativeAssetUrl(publication, reference) {
  if (publication.kind !== "published" || !reference) return "";
  const asset = publication.projection.assets.find((candidate) => candidate.sha256 === reference.checksumSha256 && candidate.role === reference.role);
  return asset ? hostedReleasePath(publication.releaseId, `assets/${asset.sha256}.${asset.extension}`) : "";
}

export function publishedUnitExtraVideoUrl(publication, reference) {
  return publishedNativeAssetUrl(publication, reference);
}

export async function loadPublishedNativeTeacherDocument(publication, activityId, { signal } = {}) {
  const response = await fetch(hostedReleasePath(publication.releaseId, `native-teacher/${activityId}`), { method: "GET", credentials: "omit", cache: "no-store", signal });
  if (!response.ok) throw new Error("Prepared Teacher activity is unavailable.");
  const payload = await response.json();
  if (payload.releaseId !== publication.releaseId || payload.activityId !== activityId) throw new Error("Prepared Teacher release identity mismatch.");
  return payload.document;
}
