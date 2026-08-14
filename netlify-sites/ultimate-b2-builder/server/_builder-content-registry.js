import repositoryHotspots from "../../../src/data/ultimate-b2/authoring/studentsBookHotspots.json" with { type: "json" };
import {
  ULTIMATE_B2_HOTSPOT_SCHEMA_VERSION,
  validateAndNormalizeUltimateB2HotspotManifest,
} from "../../../scripts/ultimate-b2/hotspot-manifest.js";
import {
  createUltimateB2HostedOpenResponseSeed,
  normalizeUltimateB2HostedOpenResponseDraft,
  ULTIMATE_B2_HOSTED_OPEN_RESPONSE_SCHEMA_VERSION,
} from "../../../src/data/ultimate-b2/hostedOpenResponseDraft.js";
import { isUltimateB2ConfigurableOpenResponse } from "../../../src/data/ultimate-b2/openResponseActivityRegistry.js";
import { findStudentsBookImplementation, isStudentsBookActivityEnabled } from "../../../src/data/ultimate-b2/studentsBookCatalog.js";
import {
  createEmptyHostedTeacherUiDocument,
  normalizeHostedTeacherUiDocument,
  projectHostedTeacherUiPreview,
} from "../../../src/data/ultimate-b2/hostedTeacherUiDocument.js";
import { HOSTED_TEACHER_UI_SCHEMA_VERSION } from "../../../src/data/ultimate-b2/hostedTeacherUiBindingCatalog.js";

const ultimateB2HotspotResource = Object.freeze({
  bookSlug: "ultimate-b2",
  componentSlug: "ultimate-b2-students-book",
  resource: "hotspots",
  documentType: "hotspots",
  documentKey: "default",
  schemaVersion: ULTIMATE_B2_HOTSPOT_SCHEMA_VERSION,
  readable: true,
  writeAllowed: true,
  previewReadable: true,
  baseline() {
    return validateAndNormalizeUltimateB2HotspotManifest(structuredClone(repositoryHotspots));
  },
  validate(document) {
    return validateAndNormalizeUltimateB2HotspotManifest(document);
  },
  projectPreview(document) {
    return validateAndNormalizeUltimateB2HotspotManifest(structuredClone(document));
  },
});

const registry = Object.freeze({
  "ultimate-b2/ultimate-b2-students-book/hotspots": ultimateB2HotspotResource,
  "ultimate-b2/ultimate-b2-students-book/ui-controller": Object.freeze({
    bookSlug: "ultimate-b2",
    componentSlug: "ultimate-b2-students-book",
    resource: "ui-controller",
    documentType: "teacher_ui",
    documentKey: "default",
    schemaVersion: HOSTED_TEACHER_UI_SCHEMA_VERSION,
    readable: true,
    writeAllowed: false,
    previewReadable: true,
    previewRequiresStored: true,
    baseline: createEmptyHostedTeacherUiDocument,
    validate: normalizeHostedTeacherUiDocument,
    projectPreview: projectHostedTeacherUiPreview,
  }),
});

function resolveOpenResponseResource(bookSlug, componentSlug, resource, documentKey) {
  if (bookSlug !== "ultimate-b2" || componentSlug !== "ultimate-b2-students-book" || resource !== "open-response") return null;
  const activity = findStudentsBookImplementation(documentKey);
  if (!activity || !isStudentsBookActivityEnabled(activity) || !isUltimateB2ConfigurableOpenResponse(activity)) return null;
  const canonicalSeed = createUltimateB2HostedOpenResponseSeed(activity);
  return Object.freeze({
    bookSlug,
    componentSlug,
    resource,
    documentType: "open_response",
    documentKey: activity.stableNormalizedId,
    schemaVersion: ULTIMATE_B2_HOSTED_OPEN_RESPONSE_SCHEMA_VERSION,
    readable: true,
    writeAllowed: true,
    previewReadable: true,
    previewRequiresStored: true,
    baseline() {
      return structuredClone(canonicalSeed);
    },
    validate(document) {
      return normalizeUltimateB2HostedOpenResponseDraft(document, canonicalSeed);
    },
    projectPreview(document) {
      return normalizeUltimateB2HostedOpenResponseDraft(document, canonicalSeed);
    },
  });
}

export async function resolveBuilderContentResource(bookSlug, componentSlug, resource, documentKey = "") {
  const openResponse = resolveOpenResponseResource(bookSlug, componentSlug, resource, documentKey);
  if (openResponse) return openResponse;
  if (documentKey) return null;
  return registry[`${bookSlug}/${componentSlug}/${resource}`] || null;
}

export const builderContentResourceRegistry = registry;
