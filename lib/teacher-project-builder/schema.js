import path from "node:path";

import { stableHash } from "../book-builder/stable-json.js";
import {
  TEACHER_CHROME_SLOTS,
  TEACHER_EDITION_SLOTS,
  TEACHER_PROJECT_KIND,
  TEACHER_PROJECT_LIMITS,
  TEACHER_PROJECT_SCHEMA_VERSION,
  TEACHER_TOOLBAR_SLOTS,
  TEACHER_UNIT_SLOTS,
} from "./constants.js";
import { TeacherProjectError } from "./errors.js";

const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SAFE_ASSET_ID = /^asset-[a-f0-9]{32}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const AUDIO_TYPES = new Set(["audio/mpeg", "audio/wav"]);
const ASSET_TYPES = new Set([...IMAGE_TYPES, ...AUDIO_TYPES, "application/x-gaf"]);

function fail(code, details = null) {
  throw new TeacherProjectError(code, 400, details);
}

function exactObject(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(code);
  return value;
}

function text(value, { code, minimum = 1, maximum = 120 } = {}) {
  if (typeof value !== "string") fail(code);
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (normalized.length < minimum || normalized.length > maximum) fail(code);
  return normalized;
}

export function assertTeacherProjectId(value) {
  if (!SAFE_ID.test(String(value || ""))) fail("invalid_teacher_project_id");
  return String(value);
}

export function assertTeacherAssetId(value, { nullable = true } = {}) {
  if (nullable && value === null) return null;
  if (!SAFE_ASSET_ID.test(String(value || ""))) fail("invalid_teacher_asset_reference");
  return String(value);
}

function portableAssetPath(value) {
  if (typeof value !== "string" || !value.startsWith("assets/")) fail("invalid_teacher_asset_path");
  const normalized = value.replaceAll("\\", "/");
  if (path.posix.isAbsolute(normalized) || /^[a-z]:\//i.test(normalized)) fail("invalid_teacher_asset_path");
  if (normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")) fail("invalid_teacher_asset_path");
  if (normalized !== value || normalized.length > 260) fail("invalid_teacher_asset_path");
  return normalized;
}

function validateAssetMetadata(assetId, value) {
  assertTeacherAssetId(assetId, { nullable: false });
  exactObject(value, ["assetId", "relativePath", "originalFilename", "mediaType", "sizeBytes", "sha256", "width", "height", "importedAt"], "invalid_teacher_asset_metadata");
  if (value.assetId !== assetId) fail("invalid_teacher_asset_metadata");
  portableAssetPath(value.relativePath);
  text(value.originalFilename, { code: "invalid_teacher_asset_metadata", maximum: 180 });
  if (!ASSET_TYPES.has(value.mediaType)) fail("invalid_teacher_asset_metadata");
  if (!Number.isSafeInteger(value.sizeBytes) || value.sizeBytes <= 0 || value.sizeBytes > TEACHER_PROJECT_LIMITS.totalAssetBytes) fail("invalid_teacher_asset_metadata");
  if (!SHA256.test(value.sha256)) fail("invalid_teacher_asset_metadata");
  if ((value.width === null) !== (value.height === null)) fail("invalid_teacher_asset_metadata");
  if (value.width !== null && (![value.width, value.height].every((item) => Number.isSafeInteger(item) && item > 0 && item <= TEACHER_PROJECT_LIMITS.rasterDimension) || !IMAGE_TYPES.has(value.mediaType))) fail("invalid_teacher_asset_metadata");
  if (!ISO_TIMESTAMP.test(value.importedAt)) fail("invalid_teacher_asset_metadata");
  return value;
}

function validateVisualSlot(slot, definition, code) {
  exactObject(slot, ["id", "label", "normal", "active", "sound"], code);
  if (slot.id !== definition.id || slot.label !== definition.label) fail(code);
  assertTeacherAssetId(slot.normal);
  assertTeacherAssetId(slot.active);
  assertTeacherAssetId(slot.sound);
  return slot;
}

function validateOrderedSlots(slots, definitions, code) {
  if (!Array.isArray(slots) || slots.length !== definitions.length) fail(code);
  return slots.map((slot, index) => validateVisualSlot(slot, definitions[index], code));
}

function validateShell(shell) {
  exactObject(shell, ["background", "titleAnimation", "chrome", "units", "editions", "toolbar"], "invalid_teacher_project_shell");
  assertTeacherAssetId(shell.background);
  exactObject(shell.titleAnimation, ["gaf", "sdAtlases", "hdAtlases"], "invalid_teacher_title_animation");
  assertTeacherAssetId(shell.titleAnimation.gaf);
  for (const density of ["sdAtlases", "hdAtlases"]) {
    const atlases = shell.titleAnimation[density];
    if (!Array.isArray(atlases) || atlases.length > TEACHER_PROJECT_LIMITS.atlasCountPerDensity) fail("invalid_teacher_title_animation");
    atlases.forEach((assetId) => assertTeacherAssetId(assetId, { nullable: false }));
    if (new Set(atlases).size !== atlases.length) fail("invalid_teacher_title_animation");
  }
  exactObject(shell.chrome, TEACHER_CHROME_SLOTS.map(({ id }) => id), "invalid_teacher_chrome");
  for (const definition of TEACHER_CHROME_SLOTS) {
    const item = shell.chrome[definition.id];
    exactObject(item, ["image", "sound"], "invalid_teacher_chrome");
    assertTeacherAssetId(item.image);
    assertTeacherAssetId(item.sound);
  }
  validateOrderedSlots(shell.units, TEACHER_UNIT_SLOTS, "invalid_teacher_units");
  validateOrderedSlots(shell.editions, TEACHER_EDITION_SLOTS, "invalid_teacher_editions");
  if (!Array.isArray(shell.toolbar) || shell.toolbar.length < 1 || shell.toolbar.length > 32) fail("invalid_teacher_toolbar");
  const toolbarIds = new Set();
  for (const item of shell.toolbar) {
    exactObject(item, ["id", "label", "normal", "active", "sound"], "invalid_teacher_toolbar");
    assertTeacherProjectId(item.id);
    text(item.label, { code: "invalid_teacher_toolbar", maximum: 80 });
    if (toolbarIds.has(item.id)) fail("invalid_teacher_toolbar");
    toolbarIds.add(item.id);
    assertTeacherAssetId(item.normal);
    assertTeacherAssetId(item.active);
    assertTeacherAssetId(item.sound);
  }
  return shell;
}

function referencedAssetIds(shell) {
  return [
    shell.background,
    shell.titleAnimation.gaf,
    ...shell.titleAnimation.sdAtlases,
    ...shell.titleAnimation.hdAtlases,
    ...TEACHER_CHROME_SLOTS.flatMap(({ id }) => [shell.chrome[id].image, shell.chrome[id].sound]),
    ...shell.units.flatMap((item) => [item.normal, item.active, item.sound]),
    ...shell.editions.flatMap((item) => [item.normal, item.active, item.sound]),
    ...shell.toolbar.flatMap((item) => [item.normal, item.active, item.sound]),
  ].filter(Boolean);
}

function assertAssetReferenceTypes(project) {
  const assets = project.assets;
  const expectType = (assetId, allowed, code) => {
    if (!assetId) return;
    const asset = assets[assetId];
    if (!asset || !allowed.has(asset.mediaType)) fail(code, { assetId });
  };
  expectType(project.shell.background, IMAGE_TYPES, "invalid_teacher_image_reference");
  expectType(project.shell.titleAnimation.gaf, new Set(["application/x-gaf"]), "invalid_teacher_gaf_reference");
  [...project.shell.titleAnimation.sdAtlases, ...project.shell.titleAnimation.hdAtlases].forEach((id) => expectType(id, new Set(["image/png"]), "invalid_teacher_atlas_reference"));
  TEACHER_CHROME_SLOTS.forEach(({ id }) => {
    expectType(project.shell.chrome[id].image, IMAGE_TYPES, "invalid_teacher_image_reference");
    expectType(project.shell.chrome[id].sound, AUDIO_TYPES, "invalid_teacher_audio_reference");
  });
  [...project.shell.units, ...project.shell.editions, ...project.shell.toolbar].forEach((item) => {
    expectType(item.normal, IMAGE_TYPES, "invalid_teacher_image_reference");
    expectType(item.active, IMAGE_TYPES, "invalid_teacher_image_reference");
    expectType(item.sound, AUDIO_TYPES, "invalid_teacher_audio_reference");
  });
}

export function validateTeacherProject(candidate) {
  exactObject(candidate, ["schemaVersion", "kind", "projectId", "displayName", "revision", "savedAt", "shell", "assets", "build"], "invalid_teacher_project");
  if (candidate.schemaVersion !== TEACHER_PROJECT_SCHEMA_VERSION || candidate.kind !== TEACHER_PROJECT_KIND) fail("unsupported_teacher_project_schema");
  assertTeacherProjectId(candidate.projectId);
  candidate.displayName = text(candidate.displayName, { code: "invalid_teacher_project_name", maximum: 120 });
  if (!Number.isSafeInteger(candidate.revision) || candidate.revision < 1) fail("invalid_teacher_project_revision");
  if (!ISO_TIMESTAMP.test(candidate.savedAt)) fail("invalid_teacher_project_timestamp");
  validateShell(candidate.shell);
  if (!candidate.assets || typeof candidate.assets !== "object" || Array.isArray(candidate.assets)) fail("invalid_teacher_assets");
  Object.entries(candidate.assets).forEach(([assetId, metadata]) => validateAssetMetadata(assetId, metadata));
  exactObject(candidate.build, ["androidApplicationIdPolicy"], "invalid_teacher_build_config");
  if (candidate.build.androidApplicationIdPolicy !== "compatibility") fail("invalid_teacher_build_config");
  const totalBytes = Object.values(candidate.assets).reduce((sum, asset) => sum + asset.sizeBytes, 0);
  if (totalBytes > TEACHER_PROJECT_LIMITS.totalAssetBytes) fail("teacher_project_assets_too_large");
  for (const assetId of referencedAssetIds(candidate.shell)) if (!candidate.assets[assetId]) fail("missing_teacher_asset_reference", { assetId });
  assertAssetReferenceTypes(candidate);
  return candidate;
}

function blankVisualSlot(definition) {
  return { ...definition, normal: null, active: null, sound: null };
}

export function createBlankTeacherProject({ projectId, displayName, now = new Date().toISOString() }) {
  assertTeacherProjectId(projectId);
  const project = {
    schemaVersion: TEACHER_PROJECT_SCHEMA_VERSION,
    kind: TEACHER_PROJECT_KIND,
    projectId,
    displayName: text(displayName, { code: "invalid_teacher_project_name", maximum: 120 }),
    revision: 1,
    savedAt: now,
    shell: {
      background: null,
      titleAnimation: { gaf: null, sdAtlases: [], hdAtlases: [] },
      chrome: Object.fromEntries(TEACHER_CHROME_SLOTS.map(({ id }) => [id, { image: null, sound: null }])),
      units: TEACHER_UNIT_SLOTS.map(blankVisualSlot),
      editions: TEACHER_EDITION_SLOTS.map(blankVisualSlot),
      toolbar: TEACHER_TOOLBAR_SLOTS.map(blankVisualSlot),
    },
    assets: {},
    build: { androidApplicationIdPolicy: "compatibility" },
  };
  return validateTeacherProject(project);
}

export function validateTeacherProjectDraft(candidate, existing) {
  exactObject(candidate, ["displayName", "expectedRevision", "shell"], "invalid_teacher_project_save");
  if (!Number.isSafeInteger(candidate.expectedRevision) || candidate.expectedRevision < 1) fail("invalid_teacher_project_revision");
  validateShell(candidate.shell);
  return {
    displayName: text(candidate.displayName, { code: "invalid_teacher_project_name", maximum: 120 }),
    expectedRevision: candidate.expectedRevision,
    shell: candidate.shell,
    assets: existing.assets,
  };
}

export function teacherProjectContentHash(project) {
  return stableHash({
    schemaVersion: project.schemaVersion,
    kind: project.kind,
    projectId: project.projectId,
    displayName: project.displayName,
    shell: project.shell,
    assets: project.assets,
    build: project.build,
  });
}

export function teacherProjectCompleteness(project) {
  validateTeacherProject(project);
  const missing = [];
  const required = (value, label) => { if (!value) missing.push(label); };
  required(project.shell.background, "Background");
  required(project.shell.titleAnimation.gaf, "GAF title animation");
  if (!project.shell.titleAnimation.sdAtlases.length) missing.push("GAF SD atlas");
  if (!project.shell.titleAnimation.hdAtlases.length) missing.push("GAF HD atlas");
  for (const { id, label } of TEACHER_CHROME_SLOTS) {
    required(project.shell.chrome[id].image, `${label} image`);
    required(project.shell.chrome[id].sound, `${label} sound`);
  }
  for (const section of [project.shell.units, project.shell.editions, project.shell.toolbar]) {
    for (const item of section) {
      required(item.normal, `${item.label} normal image`);
      required(item.active, `${item.label} active image`);
      required(item.sound, `${item.label} sound`);
    }
  }
  const requiredCount = 4
    + (TEACHER_CHROME_SLOTS.length * 2)
    + (project.shell.units.length * 3)
    + (project.shell.editions.length * 3)
    + (project.shell.toolbar.length * 3);
  return {
    complete: missing.length === 0,
    missing,
    requiredCount,
    configuredCount: requiredCount - missing.length,
    missingCount: missing.length,
  };
}

export function teacherProjectSummary(project) {
  const completeness = teacherProjectCompleteness(project);
  return {
    projectId: project.projectId,
    displayName: project.displayName,
    revision: project.revision,
    savedAt: project.savedAt,
    assetCount: Object.keys(project.assets).length,
    totalAssetBytes: Object.values(project.assets).reduce((sum, asset) => sum + asset.sizeBytes, 0),
    completeness,
  };
}

export function teacherProjectReferencedAssetIds(project) {
  validateTeacherProject(project);
  return [...new Set(referencedAssetIds(project.shell))].sort();
}
