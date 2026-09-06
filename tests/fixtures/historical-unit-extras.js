import artifact from "./historical-unit-extras-release.json" with { type: "json" };
import { builderDocumentSha256 } from "../../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { createPublicationV2FixtureSources } from "./publication-v2.js";

// Golden artifact emitted and verified by af9afe5f, before standalone MP3 support.
// See historical-unit-extras.md. Never regenerate its hashes with current code.
export const historicalUnitExtrasIdentity = Object.freeze({
  artifactSha256: "146a13dd0633c8ef1605b051d74a624a35ce562bccc58559450eab7287ba3032",
  compatibility: "117b016f2afb0a727c76246e056cb304618665422180e6fbfd650d3b5d2edee9",
  publicSha256: "8d8262f7a37ecf51cb0bd24564dabe0b82a98cf9604855e0fca57919eb37811f",
  releaseSha256: "97ca00d28444bf8f9c30eb5df49bc31c9ba5fdfedc04118339ff9079ea9a0f18",
  activityId: "ultimate-b2-sb-u1-p1-o97",
  releaseId: "10000000-0000-4000-8000-000000000071",
});

export function historicalUnitExtrasRelease() {
  return structuredClone(artifact);
}

export function currentUnitExtrasSources() {
  const sources = createPublicationV2FixtureSources();
  const keep = historicalUnitExtrasIdentity.activityId;
  sources.native.index.payload.activities = sources.native.index.payload.activities.filter((entry) => entry.activityId === keep);
  sources.native.index.sha256 = builderDocumentSha256(sources.native.index.payload);
  sources.native.activities = { [keep]: sources.native.activities[keep] };
  sources.native.assetRows = [];
  // Use the frozen fixture's hotspots, independent of local authoring edits.
  sources.documents.hotspots.payload = structuredClone(artifact.public_projection.hotspots);
  sources.documents.hotspots.sha256 = builderDocumentSha256(sources.documents.hotspots.payload);
  return sources;
}
