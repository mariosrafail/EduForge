class PublicationServiceError extends Error {
  constructor(message, code) { super(message); this.name = "PublicationServiceError"; this.code = code; }
}

export async function getActiveComponentPublication({ bookSlug = "ultimate-b2", componentSlug = "ultimate-b2-students-book", signal } = {}) {
  const response = await fetch(`/.netlify/functions/book-content?action=active-component-release&bookSlug=${encodeURIComponent(bookSlug)}&componentSlug=${encodeURIComponent(componentSlug)}`, { method: "GET", credentials: "same-origin", cache: "no-store", signal });
  if (response.status === 404) {
    const payload = await response.json().catch(() => null);
    if (payload?.error === "no_publication") return { kind: "none" };
  }
  if (!response.ok) throw new PublicationServiceError("Published content could not be verified. Refresh and try again.", "publication_unavailable");
  try {
    const payload = await response.json();
    const keys = Object.keys(payload || {}).sort();
    if (keys.join("\0") !== ["compatibility", "projection", "releaseId", "releaseNumber", "releaseSha256"].sort().join("\0")
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.releaseId)
      || !Number.isSafeInteger(payload.releaseNumber) || payload.releaseNumber < 1
      || !/^[a-f0-9]{64}$/.test(payload.releaseSha256) || !/^[a-f0-9]{64}$/.test(payload.compatibility)) throw new Error("invalid_publication_envelope");
    const seeds = Object.fromEntries(ULTIMATE_B2_OPEN_RESPONSE_ACTIVITY_IDS.map((activityId) => [activityId, createUltimateB2HostedOpenResponseSeed(findStudentsBookImplementation(activityId))]));
    const projection = normalizeUltimateB2PublicReleaseProjection(payload.projection, seeds);
    if (projection.compatibility !== payload.compatibility) throw new Error("publication_compatibility_mismatch");
    return { kind: "published", ...payload, projection };
  } catch {
    throw new PublicationServiceError("Published content could not be verified. Refresh and try again.", "publication_unavailable");
  }
}
import { createUltimateB2HostedOpenResponseSeed } from "../data/ultimate-b2/hostedOpenResponseDraft.js";
import { ULTIMATE_B2_OPEN_RESPONSE_ACTIVITY_IDS } from "../data/ultimate-b2/openResponseActivityRegistry.js";
import { normalizeUltimateB2PublicReleaseProjection } from "../data/ultimate-b2/componentPublication.js";
import { findStudentsBookImplementation } from "../data/ultimate-b2/studentsBookCatalog.js";
