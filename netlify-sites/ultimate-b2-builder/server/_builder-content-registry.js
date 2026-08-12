import repositoryHotspots from "../../../src/data/ultimate-b2/authoring/studentsBookHotspots.json" with { type: "json" };

let ultimateB2HotspotResourcePromise;

function loadUltimateB2HotspotResource() {
  ultimateB2HotspotResourcePromise ||= import("../../../scripts/ultimate-b2/hotspot-manifest.mjs")
    .then(({ ULTIMATE_B2_HOTSPOT_SCHEMA_VERSION, validateAndNormalizeUltimateB2HotspotManifest }) => Object.freeze({
      bookSlug: "ultimate-b2",
      componentSlug: "ultimate-b2-students-book",
      resource: "hotspots",
      documentType: "hotspots",
      documentKey: "default",
      schemaVersion: ULTIMATE_B2_HOTSPOT_SCHEMA_VERSION,
      readable: true,
      writeAllowed: true,
      baseline() {
        return validateAndNormalizeUltimateB2HotspotManifest(structuredClone(repositoryHotspots));
      },
      validate(document) {
        return validateAndNormalizeUltimateB2HotspotManifest(document);
      },
    }));
  return ultimateB2HotspotResourcePromise;
}

const registry = Object.freeze({
  "ultimate-b2/ultimate-b2-students-book/hotspots": loadUltimateB2HotspotResource,
});

export async function resolveBuilderContentResource(bookSlug, componentSlug, resource) {
  const loadResource = registry[`${bookSlug}/${componentSlug}/${resource}`];
  return loadResource ? loadResource() : null;
}

export const builderContentResourceRegistry = registry;
