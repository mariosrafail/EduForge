import { builderDocumentSha256, stableBuilderJson } from "./_builder-content-security.js";
import {
  normalizeUltimateB2PublicReleaseProjection,
  normalizeUltimateB2ReleaseSourceSnapshot,
  normalizeUltimateB2TeacherReleaseProjection,
  ULTIMATE_B2_COMPONENT_RELEASE_COMPILER_ID,
  ULTIMATE_B2_COMPONENT_RELEASE_SCHEMA_VERSION,
} from "../../../src/data/ultimate-b2/componentPublication.js";
import {
  normalizeUltimateB2PublicReleaseV2Projection,
  normalizeUltimateB2ReleaseV2SourceSnapshot,
  normalizeUltimateB2TeacherReleaseV2Projection,
  ULTIMATE_B2_COMPONENT_RELEASE_V2_COMPILER_ID,
  ULTIMATE_B2_COMPONENT_RELEASE_V2_SCHEMA_VERSION,
} from "../../../src/data/ultimate-b2/componentPublicationV2.js";
import { compileUltimateB2ComponentRelease, ultimateB2PublicationCanonicalSeeds, ultimateB2PublicationCompatibility } from "./_builder-publication-compiler.js";
import {
  compileUltimateB2ComponentReleaseV2,
  resolveUltimateB2PublicationV2CompatibilityVariant,
} from "./_builder-publication-compiler-v2.js";
import { collectUltimateB2PublicationSources, collectUltimateB2PublicationV2Sources } from "./_builder-publication-store.js";
import { COMPONENT_PUBLICATION_ASSET_ROLES } from "../../../src/data/ultimate-b2/componentPublicationAssetRoles.js";

function expectedAssetManifest(publicProjection, teacherProjection) {
  return [
    ...publicProjection.assets,
    ...Object.values(teacherProjection.ui.assets).map((asset) => ({ sha256: asset.sha256, extension: asset.extension, mediaType: asset.mediaType, role: COMPONENT_PUBLICATION_ASSET_ROLES.TEACHER_UI })),
  ].sort((left, right) => `${left.sha256}.${left.extension}.${left.role}`.localeCompare(`${right.sha256}.${right.extension}.${right.role}`));
}

function verifyManifest(release, expected) {
  const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
  if (!Array.isArray(release.asset_manifest) || release.asset_manifest.some((asset) => !exact(asset, ["sha256", "extension", "mediaType", "role"]))) throw new Error("release_integrity_failed");
  const actual = [...release.asset_manifest].sort((left, right) => `${left.sha256}.${left.extension}.${left.role}`.localeCompare(`${right.sha256}.${right.extension}.${right.role}`));
  if (stableBuilderJson(actual) !== stableBuilderJson(expected)) throw new Error("release_integrity_failed");
}

export const RELEASE_INTEGRITY_CHECK_NAMES = Object.freeze([
  "compatibilityMatches",
  "sourceSnapshotMatches",
  "publicProjectionMatches",
  "teacherProjectionMatches",
  "releaseHashMatches",
]);

export class ReleaseIntegrityError extends Error {
  constructor(checks) {
    super("release_integrity_failed");
    this.name = "ReleaseIntegrityError";
    this.code = "release_integrity_failed";
    this.integrityChecks = Object.freeze(Object.fromEntries(RELEASE_INTEGRITY_CHECK_NAMES.map((name) => [name, checks[name] === true])));
    this.failedIntegrityChecks = Object.freeze(RELEASE_INTEGRITY_CHECK_NAMES.filter((name) => !this.integrityChecks[name]));
    this.storedCompatibilityReleaseHashMatches = checks.storedCompatibilityReleaseHashMatches === true;
  }
}

export class ReleaseCompatibilityVariantError extends Error {
  constructor() {
    super("release_integrity_failed");
    this.name = "ReleaseCompatibilityVariantError";
    this.code = "release_integrity_failed";
  }
}

function verifyHashes(release, compatibility, sourceSnapshot, publicProjection, teacherProjection) {
  const checks = {
    compatibilityMatches: release.runtime_compatibility_sha256 === compatibility,
    sourceSnapshotMatches: builderDocumentSha256(sourceSnapshot) === release.source_snapshot_sha256,
    publicProjectionMatches: builderDocumentSha256(publicProjection) === release.public_projection_sha256,
    teacherProjectionMatches: builderDocumentSha256(teacherProjection) === release.teacher_projection_sha256,
    releaseHashMatches: builderDocumentSha256({ compatibility, sourceSnapshot, publicProjection, teacherProjection }) === release.release_sha256,
    storedCompatibilityReleaseHashMatches: builderDocumentSha256({
      compatibility: release.runtime_compatibility_sha256,
      sourceSnapshot,
      publicProjection,
      teacherProjection,
    }) === release.release_sha256,
  };
  if (RELEASE_INTEGRITY_CHECK_NAMES.some((name) => !checks[name])) throw new ReleaseIntegrityError(checks);
}

const v1 = Object.freeze({
  compilerId: ULTIMATE_B2_COMPONENT_RELEASE_COMPILER_ID,
  releaseSchemaVersion: ULTIMATE_B2_COMPONENT_RELEASE_SCHEMA_VERSION,
  collect: collectUltimateB2PublicationSources,
  compile: compileUltimateB2ComponentRelease,
  verifyRelease(release) {
    const seeds = ultimateB2PublicationCanonicalSeeds();
    const compatibility = ultimateB2PublicationCompatibility();
    const sourceSnapshot = normalizeUltimateB2ReleaseSourceSnapshot(release.source_snapshot, seeds);
    const publicProjection = normalizeUltimateB2PublicReleaseProjection(release.public_projection, seeds);
    const teacherProjection = normalizeUltimateB2TeacherReleaseProjection(release.teacher_projection, seeds);
    verifyManifest(release, expectedAssetManifest(publicProjection, teacherProjection));
    verifyHashes(release, compatibility, sourceSnapshot, publicProjection, teacherProjection);
    return { compatibility, sourceSnapshot, publicProjection, teacherProjection };
  },
});

const v2 = Object.freeze({
  compilerId: ULTIMATE_B2_COMPONENT_RELEASE_V2_COMPILER_ID,
  releaseSchemaVersion: ULTIMATE_B2_COMPONENT_RELEASE_V2_SCHEMA_VERSION,
  collect: collectUltimateB2PublicationV2Sources,
  compile: compileUltimateB2ComponentReleaseV2,
  verifyRelease(release) {
    const variant = resolveUltimateB2PublicationV2CompatibilityVariant(release.runtime_compatibility_sha256);
    if (!variant) throw new ReleaseCompatibilityVariantError();
    const seeds = ultimateB2PublicationCanonicalSeeds();
    const compatibility = variant.compatibility;
    const normalizationOptions = { allowedNativeKinds: variant.nativeKinds, includeUnitExtras: variant.unitExtras === true };
    const sourceSnapshot = normalizeUltimateB2ReleaseV2SourceSnapshot(release.source_snapshot, seeds, normalizationOptions);
    const publicProjection = normalizeUltimateB2PublicReleaseV2Projection(release.public_projection, seeds, {
      ...normalizationOptions,
      expectedCompatibility: compatibility,
    });
    const teacherProjection = normalizeUltimateB2TeacherReleaseV2Projection(release.teacher_projection, seeds, publicProjection, normalizationOptions);
    verifyManifest(release, expectedAssetManifest(publicProjection, teacherProjection));
    verifyHashes(release, compatibility, sourceSnapshot, publicProjection, teacherProjection);
    return { compatibility, sourceSnapshot, publicProjection, teacherProjection };
  },
});

const registry = Object.freeze({ [v1.compilerId]: v1, [v2.compilerId]: v2 });

export function resolvePublicationCompiler(compilerId, releaseSchemaVersion = null) {
  const compiler = registry[compilerId] || null;
  if (!compiler || (releaseSchemaVersion && compiler.releaseSchemaVersion !== releaseSchemaVersion)) return null;
  return compiler;
}

export function verifyImmutableComponentRelease(release) {
  const compiler = resolvePublicationCompiler(release?.compiler_id, release?.release_schema_version);
  if (!compiler) throw new Error("publication_compiler_mismatch");
  return { compiler, ...compiler.verifyRelease(release) };
}

export { registry as publicationCompilerRegistry };
