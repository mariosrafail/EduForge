import fs from "node:fs/promises";
import path from "node:path";
import { ensureSourceWithinRoot, validateObjectKey } from "./object-keys.js";

export const SUPPORTED_MANIFEST_VERSIONS = new Set(["1.0"]);
export const SUPPORTED_MIME_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/svg+xml",
  "audio/mpeg", "audio/mp4", "video/mp4", "application/pdf", "application/zip", "application/json",
]);
export const AUTO_SCORED_ACTIVITY_TYPES = new Set([
  "multiple_choice", "typed_gap_fill", "listening_gap_fill", "grammar_gap_fill", "timed_quiz", "matching",
]);

const topLevelKeys = new Set(["schemaVersion", "publisher", "book", "edition", "components", "assets"]);
const publisherKeys = new Set(["id", "name", "slug"]);
const bookKeys = new Set(["id", "slug", "title", "level", "description", "version"]);
const editionKeys = new Set(["id", "identifier", "title"]);
const componentKeys = new Set(["id", "slug", "title", "type", "units"]);
const unitKeys = new Set(["id", "slug", "title", "number", "lessons", "pages"]);
const lessonKeys = new Set(["id", "slug", "title", "type", "activities"]);
const pageKeys = new Set(["id", "stableKey", "number", "label", "sourceReference", "assetIds", "hotspots"]);
const hotspotKeys = new Set(["id", "label", "left", "top", "width", "height", "activityId"]);
const activityKeys = new Set(["id", "slug", "title", "type", "instructions", "assignable", "accessLevel", "answers", "feedback", "assetIds", "sourceReference", "status"]);
const assetKeys = new Set(["id", "logicalKey", "role", "source", "mimeType", "accessLevel", "publicationStatus", "classification", "componentId", "unitId", "pageId", "activityId", "sourceReference", "imageStrategy"]);

function rejectUnknown(value, allowed, location, errors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`${location}: unknown field ${key}`);
}

function requiredString(value, location, errors) {
  if (typeof value !== "string" || !value.trim()) errors.push(`${location} must be a non-empty string`);
}

function safeText(value, location, errors) {
  if (typeof value !== "string") return;
  if (/<\/?[a-z][^>]*>/i.test(value) || /(?:javascript|data):/i.test(value)) errors.push(`${location} contains unsafe HTML or a URL scheme`);
}

function addId(id, kind, location, ids, errors) {
  requiredString(id, `${location}.id`, errors);
  if (!id) return;
  if (ids.has(id)) errors.push(`${location}.id duplicates ${ids.get(id)}`);
  else ids.set(id, `${kind} at ${location}`);
}

export function validateBookManifestStructure(manifest) {
  const errors = [];
  const ids = new Map();
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return { valid: false, errors: ["Manifest must be a JSON object"] };
  const scanUnsafe = (value, location = "$") => {
    if (typeof value === "string" && (/<script\b|<iframe\b|on\w+\s*=|javascript\s*:|data\s*:\s*text\/html/i.test(value))) errors.push(`${location} contains unsafe HTML or a URL scheme`);
    else if (Array.isArray(value)) value.forEach((item, index) => scanUnsafe(item, `${location}[${index}]`));
    else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => scanUnsafe(item, `${location}.${key}`));
  };
  scanUnsafe(manifest);
  rejectUnknown(manifest, topLevelKeys, "$", errors);
  if (!SUPPORTED_MANIFEST_VERSIONS.has(manifest.schemaVersion)) errors.push(`Unsupported manifest schemaVersion: ${manifest.schemaVersion || "missing"}`);

  rejectUnknown(manifest.publisher, publisherKeys, "publisher", errors);
  rejectUnknown(manifest.book, bookKeys, "book", errors);
  rejectUnknown(manifest.edition, editionKeys, "edition", errors);
  for (const [location, value] of [["publisher.slug", manifest.publisher?.slug], ["publisher.name", manifest.publisher?.name], ["book.slug", manifest.book?.slug], ["book.title", manifest.book?.title], ["book.version", manifest.book?.version], ["edition.identifier", manifest.edition?.identifier]]) requiredString(value, location, errors);
  for (const [kind, item, location] of [["publisher", manifest.publisher, "publisher"], ["book", manifest.book, "book"], ["edition", manifest.edition, "edition"]]) addId(item?.id, kind, location, ids, errors);

  const componentIds = new Set();
  const unitIds = new Set();
  const pageIds = new Set();
  const activityIds = new Set();
  const assetIds = new Set();
  const logicalKeys = new Set();

  if (!Array.isArray(manifest.components) || !manifest.components.length) errors.push("components must contain at least one component");
  for (const [componentIndex, component] of (manifest.components || []).entries()) {
    const cLoc = `components[${componentIndex}]`;
    rejectUnknown(component, componentKeys, cLoc, errors);
    addId(component.id, "component", cLoc, ids, errors); componentIds.add(component.id);
    requiredString(component.slug, `${cLoc}.slug`, errors); requiredString(component.type, `${cLoc}.type`, errors);
    for (const [unitIndex, unit] of (component.units || []).entries()) {
      const uLoc = `${cLoc}.units[${unitIndex}]`;
      rejectUnknown(unit, unitKeys, uLoc, errors);
      addId(unit.id, "unit", uLoc, ids, errors); unitIds.add(unit.id);
      requiredString(unit.slug, `${uLoc}.slug`, errors);
      for (const [lessonIndex, lesson] of (unit.lessons || []).entries()) {
        const lLoc = `${uLoc}.lessons[${lessonIndex}]`;
        rejectUnknown(lesson, lessonKeys, lLoc, errors);
        addId(lesson.id, "lesson", lLoc, ids, errors);
        for (const [activityIndex, activity] of (lesson.activities || []).entries()) {
          const aLoc = `${lLoc}.activities[${activityIndex}]`;
          rejectUnknown(activity, activityKeys, aLoc, errors);
          addId(activity.id, "activity", aLoc, ids, errors); activityIds.add(activity.id);
          requiredString(activity.type, `${aLoc}.type`, errors);
          safeText(activity.instructions, `${aLoc}.instructions`, errors);
          if (AUTO_SCORED_ACTIVITY_TYPES.has(activity.type) && (!activity.answers || !Object.keys(activity.answers).length)) errors.push(`${aLoc} is automatically scored but has no answers`);
          for (const assetId of activity.assetIds || []) if (typeof assetId !== "string") errors.push(`${aLoc}.assetIds must contain strings`);
        }
      }
      for (const [pageIndex, page] of (unit.pages || []).entries()) {
        const pLoc = `${uLoc}.pages[${pageIndex}]`;
        rejectUnknown(page, pageKeys, pLoc, errors);
        addId(page.id, "page", pLoc, ids, errors); pageIds.add(page.id);
        requiredString(page.stableKey, `${pLoc}.stableKey`, errors);
        if (!Number.isInteger(page.number) || page.number < 1) errors.push(`${pLoc}.number must be a positive integer`);
        for (const [hotspotIndex, hotspot] of (page.hotspots || []).entries()) {
          const hLoc = `${pLoc}.hotspots[${hotspotIndex}]`;
          rejectUnknown(hotspot, hotspotKeys, hLoc, errors);
          addId(hotspot.id, "hotspot", hLoc, ids, errors);
          if (hotspot.activityId && !activityIds.has(hotspot.activityId)) errors.push(`${hLoc}.activityId references an unknown activity`);
        }
      }
    }
  }

  if (!Array.isArray(manifest.assets) || !manifest.assets.length) errors.push("assets must contain at least one asset");
  for (const [assetIndex, asset] of (manifest.assets || []).entries()) {
    const location = `assets[${assetIndex}]`;
    rejectUnknown(asset, assetKeys, location, errors);
    addId(asset.id, "asset", location, ids, errors); assetIds.add(asset.id);
    requiredString(asset.logicalKey, `${location}.logicalKey`, errors);
    requiredString(asset.source, `${location}.source`, errors);
    if (asset.logicalKey && manifest.book?.slug && asset.logicalKey !== manifest.book.slug && !asset.logicalKey.startsWith(`${manifest.book.slug}.`)) errors.push(`${location}.logicalKey must be namespaced by book.slug`);
    if (logicalKeys.has(asset.logicalKey)) errors.push(`${location}.logicalKey is duplicated`); else logicalKeys.add(asset.logicalKey);
    if (!SUPPORTED_MIME_TYPES.has(asset.mimeType)) errors.push(`${location}.mimeType is unsupported: ${asset.mimeType || "missing"}`);
    if (!new Set(["public", "preview", "entitled", "internal"]).has(asset.accessLevel)) errors.push(`${location}.accessLevel is invalid`);
    if (!new Set(["draft", "processing", "published", "archived", "failed"]).has(asset.publicationStatus)) errors.push(`${location}.publicationStatus is invalid`);
    if (asset.componentId && !componentIds.has(asset.componentId)) errors.push(`${location}.componentId references an unknown component`);
    if (asset.unitId && !unitIds.has(asset.unitId)) errors.push(`${location}.unitId references an unknown unit`);
    if (asset.pageId && !pageIds.has(asset.pageId)) errors.push(`${location}.pageId references an unknown page`);
    if (asset.activityId && !activityIds.has(asset.activityId)) errors.push(`${location}.activityId references an unknown activity`);
    if (asset.imageStrategy && !new Set(["preserve", "page", "thumbnail"]).has(asset.imageStrategy)) errors.push(`${location}.imageStrategy is invalid`);
    if (/answer.?key/i.test(asset.role) && asset.accessLevel !== "internal" && asset.accessLevel !== "entitled") errors.push(`${location}: answer-key assets cannot be public or preview`);
  }

  for (const component of manifest.components || []) for (const unit of component.units || []) {
    for (const page of unit.pages || []) for (const assetId of page.assetIds || []) if (!assetIds.has(assetId)) errors.push(`Page ${page.id} references unknown asset ${assetId}`);
    for (const lesson of unit.lessons || []) for (const activity of lesson.activities || []) for (const assetId of activity.assetIds || []) if (!assetIds.has(assetId)) errors.push(`Activity ${activity.id} references unknown asset ${assetId}`);
  }
  return { valid: errors.length === 0, errors };
}

export async function validateBookManifest(manifest, { sourceRoot, checkFiles = true } = {}) {
  const result = validateBookManifestStructure(manifest);
  const errors = [...result.errors];
  if (checkFiles) {
    if (!sourceRoot) errors.push("A source root is required when source files are checked");
    else for (const [index, asset] of (manifest.assets || []).entries()) {
      try {
        const source = ensureSourceWithinRoot(sourceRoot, asset.source);
        const stat = await fs.lstat(source);
        if (stat.isSymbolicLink()) errors.push(`assets[${index}].source must not be a symbolic link`);
        else if (!stat.isFile()) errors.push(`assets[${index}].source is not a regular file`);
        const realRoot = await fs.realpath(path.resolve(sourceRoot));
        const realSource = await fs.realpath(source);
        const relative = path.relative(realRoot, realSource);
        if (relative.startsWith("..") || path.isAbsolute(relative)) errors.push(`assets[${index}].source resolves outside the source root`);
      } catch (error) {
        errors.push(`assets[${index}].source is unavailable: ${error.message}`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateManifestObjectKey(key) {
  return validateObjectKey(key);
}
