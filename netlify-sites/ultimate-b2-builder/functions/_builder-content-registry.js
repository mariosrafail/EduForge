import repositoryHotspots from "../../../src/data/ultimate-b2/authoring/studentsBookHotspots.json" with { type: "json" };
import {
  ULTIMATE_B2_HOTSPOT_SCHEMA_VERSION,
  validateAndNormalizeUltimateB2HotspotManifest,
} from "../../../scripts/ultimate-b2/hotspot-manifest.mjs";

const registry = Object.freeze({
  "ultimate-b2/ultimate-b2-students-book/hotspots": Object.freeze({
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
  }),
});

export function resolveBuilderContentResource(bookSlug, componentSlug, resource) {
  return registry[`${bookSlug}/${componentSlug}/${resource}`] || null;
}

export const builderContentResourceRegistry = registry;
