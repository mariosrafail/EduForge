import artifact from "./historical-combined-release.json" with { type: "json" };
import historicalSources from "./historical-combined-sources.json" with { type: "json" };
import { ultimateB2PublicationCanonicalSeeds } from "../../netlify-sites/ultimate-b2-builder/server/_builder-publication-compiler.js";
import { normalizeUltimateB2HostedOpenResponseDraft } from "../../src/data/ultimate-b2/hostedOpenResponseDraft.js";
import { builderDocumentSha256 } from "../../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";

export const historicalCombinedIdentity = Object.freeze({
  artifactSha256: "dfbcea16a1f5ae9d9f3998518253f4fe43482b665c6ead95026c1853b23beec1",
  compatibility: "6edc258bc2baf610290d4ae03a88c60c63e18006f31f67e1b02cb6ddc4ab7ffe",
  activityId: "ultimate-b2-sb-u1-p1-o97",
  pageId: "ub2-sb-unit-1-part-1",
});

export const historicalCombinedRelease = () => structuredClone(artifact);

// Current explicit authoring inputs are derived from frozen synthetic sources;
// neither golden artifact nor historical hashes are refreshed here.
export function currentCombinedSources() {
  const sources = structuredClone(historicalSources);
  const seeds = ultimateB2PublicationCanonicalSeeds();
  for (const [id, document] of Object.entries(sources.documents.openResponse)) {
    document.resource = { validate: (value) => normalizeUltimateB2HostedOpenResponseDraft(value, seeds[id]) };
  }
  const choice = sources.native.activities[historicalCombinedIdentity.activityId].public;
  choice.payload.audioTextHotspots.hotspots.forEach((hotspot, index) => { hotspot.focusLayout = index ? "natural-width" : "fixed-aspect"; });
  choice.sha256 = builderDocumentSha256(choice.payload);
  return sources;
}
