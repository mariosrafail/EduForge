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
import { NATIVE_ACTIVITY_SCHEMA_VERSION, createEmptyNativeActivityIndex, normalizeNativeActivityIndex } from "../../../src/data/native-activities/nativeActivityPublic.js";
import { NATIVE_ACTIVITY_KINDS, normalizeNativeActivityPublicDocument, normalizeNativeActivityTeacherDocument } from "./_native-activity-registry.js";

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
    previewAudience: "teacher",
    previewRequiresStored: true,
    baseline: createEmptyHostedTeacherUiDocument,
    validate: normalizeHostedTeacherUiDocument,
    projectPreview: projectHostedTeacherUiPreview,
  }),
});

const nativeActivityIdPattern = /^[a-z0-9][a-z0-9-]{0,127}$/;
const nativeComponent = Object.freeze({ bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book" });

function nativeIndexResource(bookSlug, componentSlug, resource, documentKey) {
  if (bookSlug !== nativeComponent.bookSlug || componentSlug !== nativeComponent.componentSlug || resource !== "native-activity-index" || documentKey) return null;
  return Object.freeze({ ...nativeComponent, resource, documentType: "native_activity_index", documentKey: "default", schemaVersion: NATIVE_ACTIVITY_SCHEMA_VERSION, audience: "public", readable: true, writeAllowed: false, previewReadable: false, baseline: createEmptyNativeActivityIndex, validate(document) { return normalizeNativeActivityIndex(document, { allowedKinds: NATIVE_ACTIVITY_KINDS }); } });
}

function nativeDocumentResource(bookSlug, componentSlug, resource, documentKey) {
  if (bookSlug !== nativeComponent.bookSlug || componentSlug !== nativeComponent.componentSlug || !nativeActivityIdPattern.test(documentKey)) return null;
  const teacher = resource === "native-activity-teacher";
  if (!teacher && resource !== "native-activity-public") return null;
  return Object.freeze({
    ...nativeComponent,
    resource,
    documentType: teacher ? "native_activity_teacher" : "native_activity_public",
    documentKey,
    schemaVersion: NATIVE_ACTIVITY_SCHEMA_VERSION,
    audience: teacher ? "teacher" : "public",
    readable: true,
    writeAllowed: false,
    previewReadable: false,
    requiresStored: true,
    baseline() { throw new Error("Native activity documents have no repository baseline."); },
    validate(document) { return teacher ? normalizeNativeActivityTeacherDocument(document, documentKey) : normalizeNativeActivityPublicDocument(document, documentKey); },
  });
}

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
  const nativeResource = nativeIndexResource(bookSlug, componentSlug, resource, documentKey) || nativeDocumentResource(bookSlug, componentSlug, resource, documentKey);
  if (nativeResource) return nativeResource;
  const openResponse = resolveOpenResponseResource(bookSlug, componentSlug, resource, documentKey);
  if (openResponse) return openResponse;
  if (documentKey) return null;
  return registry[`${bookSlug}/${componentSlug}/${resource}`] || null;
}

export const builderContentResourceRegistry = registry;
