import repositoryHotspots from "../../../src/data/ultimate-b2/authoring/studentsBookHotspots.json" with { type: "json" };
import { nativeAudioTextAssetRequirements } from "../../../src/data/native-activities/nativeAudioTextHotspots.js";
import { createEmptyNativeActivityIndex, nativeReadableTextAssetRequirements, NATIVE_ACTIVITY_INDEX_SCHEMA_VERSION, NATIVE_ACTIVITY_SCHEMA_VERSION } from "../../../src/data/native-activities/nativeActivityPublic.js";
import { nativeSingleChoicePresentationAssetRequirements } from "../../../src/data/native-activities/nativeSingleChoice.js";
import { ultimateB2StudentsBookAuthoringActivities } from "../../../src/data/ultimate-b2/studentsBookAuthoringCatalog.js";
import {
  normalizeUltimateB2PublicReleaseV2Projection,
  normalizeUltimateB2ReleaseV2SourceSnapshot,
  normalizeUltimateB2TeacherReleaseV2Projection,
  ULTIMATE_B2_COMPONENT_RELEASE_V2_COMPILER_ID,
  ULTIMATE_B2_COMPONENT_RELEASE_V2_EXPANDED_NATIVE_KINDS,
  ULTIMATE_B2_COMPONENT_RELEASE_V2_INITIAL_NATIVE_KINDS,
  ULTIMATE_B2_COMPONENT_RELEASE_V2_SCHEMA_VERSION,
} from "../../../src/data/ultimate-b2/componentPublicationV2.js";
import { validateAndNormalizeUltimateB2HotspotManifest } from "../../../scripts/ultimate-b2/hotspot-manifest.js";
import { builderDocumentSha256, stableBuilderJson } from "./_builder-content-security.js";
import { resolveNativeActivityKind } from "./_native-activity-registry.js";
import { compileUltimateB2ComponentRelease, ultimateB2PublicationCanonicalSeeds, ultimateB2PublicationCompatibility } from "./_builder-publication-compiler.js";

const extensionByMediaType = Object.freeze({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "audio/mpeg": "mp3" });
const V2_PUBLISHABLE_NATIVE_KINDS = new Set(ULTIMATE_B2_COMPONENT_RELEASE_V2_EXPANDED_NATIVE_KINDS);
const V2_COMPATIBILITY_IDENTITIES = Object.freeze({
  initialImageOpenResponse: "ab4b8255596ce01a0e7132d37c33b62683e384f2f178eed313bfeef62091027e",
  singleChoiceExpanded: "f1fca746955e58c0c4153c97a717a2f5e024cb5d12eb9263ad8c6b2a7caf9316",
});

export const ULTIMATE_B2_PUBLICATION_V2_COMPATIBILITY_VARIANTS = Object.freeze([
  Object.freeze({
    name: "initial-image-open-response",
    compatibility: V2_COMPATIBILITY_IDENTITIES.initialImageOpenResponse,
    nativeKinds: ULTIMATE_B2_COMPONENT_RELEASE_V2_INITIAL_NATIVE_KINDS,
  }),
  Object.freeze({
    name: "single-choice-expanded",
    compatibility: V2_COMPATIBILITY_IDENTITIES.singleChoiceExpanded,
    nativeKinds: ULTIMATE_B2_COMPONENT_RELEASE_V2_EXPANDED_NATIVE_KINDS,
  }),
]);

const v2CompatibilityVariantsByIdentity = new Map(
  ULTIMATE_B2_PUBLICATION_V2_COMPATIBILITY_VARIANTS.map((variant) => [variant.compatibility, variant]),
);

export class NativePublicationError extends Error {
  constructor(code, activityId, issues = []) {
    super(code);
    this.name = "NativePublicationError";
    this.code = code;
    this.activityId = activityId || null;
    this.issues = [...issues].map((issue) => String(issue).slice(0, 200));
  }
}

export function ultimateB2PublicationV2CompatibilityDescriptor(nativeKinds) {
  return Object.freeze({
    compilerId: ULTIMATE_B2_COMPONENT_RELEASE_V2_COMPILER_ID,
    releaseSchemaVersion: ULTIMATE_B2_COMPONENT_RELEASE_V2_SCHEMA_VERSION,
    legacyRuntimeCompatibility: ultimateB2PublicationCompatibility(),
    hotspotSchemaVersion: repositoryHotspots.schemaVersion,
    nativeActivitySchemaVersion: NATIVE_ACTIVITY_SCHEMA_VERSION,
    nativeIndexSchemaVersion: NATIVE_ACTIVITY_INDEX_SCHEMA_VERSION,
    nativeKinds: Object.freeze([...nativeKinds].sort()),
    releaseAssetDescriptorSchemaVersion: "1.0",
  });
}

export function reconstructUltimateB2PublicationV2Compatibility(nativeKinds) {
  return builderDocumentSha256(ultimateB2PublicationV2CompatibilityDescriptor(nativeKinds));
}

export function resolveUltimateB2PublicationV2CompatibilityVariant(compatibility) {
  return v2CompatibilityVariantsByIdentity.get(compatibility) || null;
}

export function ultimateB2PublicationV2Compatibility() {
  return V2_COMPATIBILITY_IDENTITIES.singleChoiceExpanded;
}

export function isUltimateB2PublicationV2NativeKind(kind) {
  return V2_PUBLISHABLE_NATIVE_KINDS.has(kind);
}

function activityCatalog(nativeActivities) {
  return [
    ...ultimateB2StudentsBookAuthoringActivities,
    ...Object.values(nativeActivities).map(({ index, public: publicSource }) => ({
      activityKey: index.activityId,
      title: publicSource?.payload?.metadata?.title || index.activityId,
      pageId: index.placement.pageId,
      kind: index.kind,
      native: true,
    })),
  ];
}

function referencedNativeIds(hotspots, nativeActivities) {
  const nativeIds = new Set(Object.keys(nativeActivities));
  return [...new Set(Object.values(hotspots.pages).flat().map((hotspot) => hotspot.activityKey).filter((activityId) => nativeIds.has(activityId)))].sort();
}

function validateAssetRows(nativeEntries, assetRows) {
  const byId = new Map(assetRows.map((row) => [String(row.id), row]));
  const sources = new Map();
  for (const [activityId, entry] of nativeEntries) {
    for (const reference of entry.publicDocument.assets) {
      const row = byId.get(reference.assetId);
      const extension = extensionByMediaType[row?.mime_type];
      if (!row || row.checksum_sha256 !== reference.checksumSha256 || row.asset_role !== reference.role
        || row.publication_status !== "draft" || row.access_level !== "internal" || row.storage_profile !== "private"
        || row.source_metadata?.native_activity_id !== activityId || row.source_metadata?.asset_slot !== reference.slot
        || !extension || !row.object_key || !Number.isSafeInteger(Number(row.byte_size)) || Number(row.byte_size) < 1
        || (row.mime_type.startsWith("image/") && (!Number.isSafeInteger(Number(row.width)) || !Number.isSafeInteger(Number(row.height))))) {
        throw new NativePublicationError("native_activity_asset_invalid", activityId, ["Managed artwork is missing, invalid, or owned by another activity."]);
      }
      const identity = `${reference.checksumSha256}.${extension}`;
      const existing = sources.get(identity);
      if (existing && existing.descriptor.mediaType !== row.mime_type) throw new NativePublicationError("native_activity_asset_invalid", activityId, ["Managed artwork content identity is inconsistent."]);
      if (!existing) sources.set(identity, {
        descriptor: { sha256: reference.checksumSha256, extension, mediaType: row.mime_type, role: "activity_artwork" },
        row,
      });
    }
    {
      const requirements = [
        ...nativeReadableTextAssetRequirements(entry.publicDocument),
        ...nativeAudioTextAssetRequirements(entry.publicDocument),
        ...(entry.publicDocument.kind === "single-choice" ? nativeSingleChoicePresentationAssetRequirements(entry.publicDocument) : []),
      ];
      for (const requirement of requirements) {
        const reference = entry.publicDocument.assets.find((asset) => asset.slot === requirement.slot);
        const row = reference ? byId.get(reference.assetId) : null;
        if (!row || (requirement.mediaType && row.mime_type !== requirement.mediaType)) {
          throw new NativePublicationError("native_activity_asset_invalid", activityId, [`${requirement.label || "Native managed asset"} media type does not match the managed asset.`]);
        }
        if ((requirement.width !== undefined || requirement.height !== undefined)
          && (Number(row.width) !== requirement.width || Number(row.height) !== requirement.height)) {
          throw new NativePublicationError("native_activity_asset_invalid", activityId, [`${requirement.label || "Managed image"} dimensions do not match the managed asset.`]);
        }
      }
    }
  }
  return [...sources.values()].sort((left, right) => `${left.descriptor.sha256}.${left.descriptor.extension}`.localeCompare(`${right.descriptor.sha256}.${right.descriptor.extension}`));
}

function collectNativeEntries(sources, hotspots) {
  const selected = [];
  for (const activityId of referencedNativeIds(hotspots, sources.native.activities)) {
    const source = sources.native.activities[activityId];
    if (!source?.public || !source?.teacher) throw new NativePublicationError("native_activity_not_found", activityId, ["The saved native activity pair is incomplete."]);
    if (!isUltimateB2PublicationV2NativeKind(source.index.kind)) throw new NativePublicationError("native_activity_pair_invalid", activityId, ["The native activity kind is unsupported by publication v2."]);
    const kind = resolveNativeActivityKind(source.index.kind);
    if (!kind) throw new NativePublicationError("native_activity_pair_invalid", activityId, ["The native activity kind is unsupported."]);
    let publicDocument;
    let teacherDocument;
    try {
      publicDocument = kind.normalizePublic(source.public.payload, activityId);
      teacherDocument = kind.normalizeTeacher(source.teacher.payload, activityId);
      if (publicDocument.kind !== source.index.kind || teacherDocument.kind !== source.index.kind
        || publicDocument.placement.pageId !== source.index.placement.pageId) throw new Error("Native index and document identity do not match.");
      kind.validatePair(publicDocument, teacherDocument);
    } catch {
      throw new NativePublicationError("native_activity_pair_invalid", activityId, ["Public, Teacher, and index activity identities do not match."]);
    }
    const readiness = kind.assessReadiness(publicDocument, teacherDocument);
    if (!readiness.ready) throw new NativePublicationError("native_activity_not_ready", activityId, readiness.issues);
    selected.push([activityId, { source, publicDocument, teacherDocument }]);
  }
  return selected;
}

export function compileUltimateB2ComponentReleaseV2(sources = {}) {
  const nativeActivities = sources.native?.activities || {};
  const hotspotSource = sources.documents?.hotspots || null;
  let hotspots;
  try {
    hotspots = validateAndNormalizeUltimateB2HotspotManifest(hotspotSource?.payload || structuredClone(repositoryHotspots), activityCatalog(nativeActivities));
  } catch (error) {
    const ambiguous = String(error?.message || "").startsWith("Ambiguous Students Book activity id:");
    throw new NativePublicationError(ambiguous ? "native_activity_pair_invalid" : "native_activity_not_found", null, [String(error?.message || "Saved hotspot target is invalid.")]);
  }
  const selectedNative = collectNativeEntries(sources, hotspots);
  const nativeAssetSources = validateAssetRows(selectedNative, sources.native?.assetRows || []);

  const legacy = compileUltimateB2ComponentRelease({
    documents: { ...sources.documents, hotspots: null },
    imports: sources.imports,
  });
  const compatibility = ultimateB2PublicationV2Compatibility();
  const seeds = ultimateB2PublicationCanonicalSeeds();
  const sourceSnapshot = normalizeUltimateB2ReleaseV2SourceSnapshot({
    schemaVersion: ULTIMATE_B2_COMPONENT_RELEASE_V2_SCHEMA_VERSION,
    hotspots: hotspotSource ? { revision: hotspotSource.revision, sha256: hotspotSource.sha256 } : { revision: 0, sha256: builderDocumentSha256(validateAndNormalizeUltimateB2HotspotManifest(structuredClone(repositoryHotspots))) },
    openResponse: legacy.sourceSnapshot.openResponse,
    teacherUi: legacy.sourceSnapshot.teacherUi,
    nativeIndex: sources.native?.index ? { revision: sources.native.index.revision, sha256: sources.native.index.sha256 } : { revision: 0, sha256: builderDocumentSha256(createEmptyNativeActivityIndex()) },
    nativeActivities: Object.fromEntries(selectedNative.map(([activityId, entry]) => [activityId, {
      kind: entry.publicDocument.kind,
      public: { revision: entry.source.public.revision, sha256: entry.source.public.sha256 },
      teacher: { revision: entry.source.teacher.revision, sha256: entry.source.teacher.sha256 },
    }])),
  }, seeds, { allowedNativeKinds: ULTIMATE_B2_COMPONENT_RELEASE_V2_EXPANDED_NATIVE_KINDS });
  const publicProjection = normalizeUltimateB2PublicReleaseV2Projection({
    schemaVersion: ULTIMATE_B2_COMPONENT_RELEASE_V2_SCHEMA_VERSION,
    bookSlug: "ultimate-b2",
    componentSlug: "ultimate-b2-students-book",
    compatibility,
    hotspots,
    activities: legacy.publicProjection.activities,
    nativeActivities: Object.fromEntries(selectedNative.map(([activityId, entry]) => [activityId, { kind: entry.publicDocument.kind, document: entry.publicDocument }])),
    assets: [...legacy.publicProjection.assets, ...nativeAssetSources.map((asset) => asset.descriptor)],
  }, seeds, {
    allowedNativeKinds: ULTIMATE_B2_COMPONENT_RELEASE_V2_EXPANDED_NATIVE_KINDS,
    expectedCompatibility: compatibility,
  });
  const teacherProjection = normalizeUltimateB2TeacherReleaseV2Projection({
    schemaVersion: ULTIMATE_B2_COMPONENT_RELEASE_V2_SCHEMA_VERSION,
    bookSlug: "ultimate-b2",
    componentSlug: "ultimate-b2-students-book",
    solutions: legacy.teacherProjection.solutions,
    ui: legacy.teacherProjection.ui,
    nativeActivities: Object.fromEntries(selectedNative.map(([activityId, entry]) => [activityId, { kind: entry.teacherDocument.kind, document: entry.teacherDocument }])),
  }, seeds, publicProjection, { allowedNativeKinds: ULTIMATE_B2_COMPONENT_RELEASE_V2_EXPANDED_NATIVE_KINDS });
  const assetManifest = [...legacy.assetManifest, ...nativeAssetSources.map((asset) => asset.descriptor)]
    .sort((left, right) => `${left.sha256}.${left.extension}.${left.role}`.localeCompare(`${right.sha256}.${right.extension}.${right.role}`));
  const hashes = {
    sourceSnapshotSha256: builderDocumentSha256(sourceSnapshot),
    publicProjectionSha256: builderDocumentSha256(publicProjection),
    teacherProjectionSha256: builderDocumentSha256(teacherProjection),
  };
  return {
    compilerId: ULTIMATE_B2_COMPONENT_RELEASE_V2_COMPILER_ID,
    releaseSchemaVersion: ULTIMATE_B2_COMPONENT_RELEASE_V2_SCHEMA_VERSION,
    compatibility,
    sourceSnapshot,
    publicProjection,
    teacherProjection,
    assetManifest,
    nativeAssetSources,
    ...hashes,
    releaseSha256: builderDocumentSha256({ compatibility, sourceSnapshot, publicProjection, teacherProjection }),
    stableJson: stableBuilderJson({ compatibility, sourceSnapshot, publicProjection, teacherProjection }),
  };
}
