import { ultimateB2StudentsBookAuthoringActivities, ultimateB2StudentsBookAuthoringPages } from "../../src/data/ultimate-b2/studentsBookAuthoringCatalog.js";

export const ULTIMATE_B2_HOTSPOT_SCHEMA_VERSION = "1.0";
export const ULTIMATE_B2_HOTSPOT_PACKAGE = "ultimate-b2";
export const ULTIMATE_B2_HOTSPOT_COMPONENT = "students-book";

const pageById = new Map(ultimateB2StudentsBookAuthoringPages.map((page) => [page.id, page]));
const hotspotIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const activityKeyPattern = /^[a-z0-9][a-z0-9-]{0,127}$/;

function finiteCoordinate(value, field, id) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Hotspot ${id} has an invalid ${field}.`);
  return Math.round(number * 10_000) / 10_000;
}

function normalizeHotspot(hotspot, page, ids, activityByKey, requireActivityPage) {
  if (!hotspot || typeof hotspot !== "object" || Array.isArray(hotspot)) throw new Error(`Page ${page.id} contains an invalid hotspot.`);
  const id = String(hotspot.id || "");
  if (!hotspotIdPattern.test(id)) throw new Error(`Page ${page.id} contains an invalid hotspot id.`);
  if (ids.has(id)) throw new Error(`Duplicate hotspot id: ${id}`);
  ids.add(id);

  if (hotspot.pageId !== page.id) throw new Error(`Hotspot ${id} does not match page ${page.id}.`);
  if (Number(hotspot.unitNumber) !== page.unitNumber || ![1, 2].includes(Number(hotspot.unitNumber))) throw new Error(`Hotspot ${id} has an invalid unitNumber.`);
  if (Number(hotspot.pageNumber) !== page.pageNumber) throw new Error(`Hotspot ${id} has an invalid pageNumber.`);
  if (hotspot.actionType !== "normalized_activity") throw new Error(`Hotspot ${id} has an unsupported actionType.`);

  const activityKey = String(hotspot.activityKey || "");
  if (!activityKeyPattern.test(activityKey) || (activityByKey && !activityByKey.has(activityKey))) throw new Error(`Hotspot ${id} references an unavailable activityKey.`);
  if (requireActivityPage && activityByKey.get(activityKey).hotspotPageInvariant === true && activityByKey.get(activityKey).pageId !== page.id) throw new Error(`Hotspot ${id} references an activityKey on another page.`);
  const left = finiteCoordinate(hotspot.left, "left", id);
  const top = finiteCoordinate(hotspot.top, "top", id);
  const width = finiteCoordinate(hotspot.width, "width", id);
  const height = finiteCoordinate(hotspot.height, "height", id);
  if (left < 0 || top < 0 || width <= 0 || height <= 0 || left + width > 100 || top + height > 100) {
    throw new Error(`Hotspot ${id} coordinates must stay within the page image.`);
  }

  return {
    id,
    unitNumber: page.unitNumber,
    pageId: page.id,
    pageNumber: page.pageNumber,
    left,
    top,
    width,
    height,
    label: String(hotspot.label || activityByKey?.get(activityKey)?.title || activityKey).trim().slice(0, 200),
    actionType: "normalized_activity",
    activityKey,
  };
}

export function validateAndNormalizeUltimateB2HotspotManifest(input, activities = ultimateB2StudentsBookAuthoringActivities, { requireActivityPage = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Hotspot manifest must be an object.");
  if (input.schemaVersion !== ULTIMATE_B2_HOTSPOT_SCHEMA_VERSION) throw new Error("Unsupported hotspot manifest schemaVersion.");
  if (input.packageSlug !== ULTIMATE_B2_HOTSPOT_PACKAGE) throw new Error("Only ultimate-b2 hotspots can be saved.");
  if (input.componentSlug !== ULTIMATE_B2_HOTSPOT_COMPONENT) throw new Error("Only students-book hotspots can be saved.");
  if (!input.pages || typeof input.pages !== "object" || Array.isArray(input.pages)) throw new Error("Hotspot manifest pages must be an object.");
  const activityByKey = activities === null ? null : new Map();
  for (const activity of activities || []) {
    if (activityByKey.has(activity.activityKey)) throw new Error(`Ambiguous Students Book activity id: ${activity.activityKey}`);
    activityByKey.set(activity.activityKey, activity);
  }

  const unknownPageIds = Object.keys(input.pages).filter((pageId) => !pageById.has(pageId));
  if (unknownPageIds.length) throw new Error(`Unknown Students Book page id: ${unknownPageIds[0]}`);

  const ids = new Set();
  const pages = {};
  for (const page of ultimateB2StudentsBookAuthoringPages) {
    if (!(page.id in input.pages)) continue;
    if (!Array.isArray(input.pages[page.id])) throw new Error(`Hotspots for ${page.id} must be an array.`);
    const normalized = input.pages[page.id].map((hotspot) => normalizeHotspot(hotspot, page, ids, activityByKey, requireActivityPage));
    if (normalized.length) pages[page.id] = normalized;
  }

  return {
    schemaVersion: ULTIMATE_B2_HOTSPOT_SCHEMA_VERSION,
    packageSlug: ULTIMATE_B2_HOTSPOT_PACKAGE,
    componentSlug: ULTIMATE_B2_HOTSPOT_COMPONENT,
    pages,
  };
}

export function validateUltimateB2HotspotManifestStructure(input) {
  return validateAndNormalizeUltimateB2HotspotManifest(input, null);
}

export function pruneUltimateB2ActivityHotspots(input, activityId) {
  const manifest = validateUltimateB2HotspotManifestStructure(input);
  let removedCount = 0;
  const pages = {};
  for (const [pageId, hotspots] of Object.entries(manifest.pages)) {
    const retained = hotspots.filter((hotspot) => {
      const remove = hotspot.activityKey === activityId;
      if (remove) removedCount += 1;
      return !remove;
    });
    if (retained.length) pages[pageId] = retained;
  }
  return { manifest: { ...manifest, pages }, removedCount };
}

const legacyManagedComponents = new Set(["ultimate-b2-workbook", "ultimate-b2-grammar-book"]);
const managedSlugPattern = /^[a-z0-9][a-z0-9-]{0,127}$/;

function managedIdentity(value) {
  if (typeof value === "string") {
    if (!legacyManagedComponents.has(value)) throw new Error("Managed hotspot component is unsupported.");
    return { bookSlug: ULTIMATE_B2_HOTSPOT_PACKAGE, componentSlug: value };
  }
  const bookSlug = String(value?.bookSlug || "");
  const componentSlug = String(value?.componentSlug || "");
  if (!managedSlugPattern.test(bookSlug) || !managedSlugPattern.test(componentSlug) || !componentSlug.startsWith(`${bookSlug}-`)) {
    throw new Error("Managed hotspot component is unsupported.");
  }
  return { bookSlug, componentSlug };
}

export function createEmptyManagedComponentHotspotManifest(identity) {
  const { bookSlug, componentSlug } = managedIdentity(identity);
  return { schemaVersion: ULTIMATE_B2_HOTSPOT_SCHEMA_VERSION, packageSlug: bookSlug, componentSlug, pages: {} };
}

export function validateAndNormalizeManagedComponentHotspotManifest(input, { bookSlug = ULTIMATE_B2_HOTSPOT_PACKAGE, componentSlug, pages = null, activities = null, requireActivityPage = false } = {}) {
  const identity = managedIdentity({ bookSlug, componentSlug });
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Managed hotspot manifest is invalid.");
  if (input.schemaVersion !== ULTIMATE_B2_HOTSPOT_SCHEMA_VERSION || input.packageSlug !== identity.bookSlug || input.componentSlug !== identity.componentSlug
    || !input.pages || typeof input.pages !== "object" || Array.isArray(input.pages)) throw new Error("Managed hotspot manifest identity is invalid.");
  const pageById = pages === null ? null : new Map(pages.map((page) => [page.id, page]));
  const activityById = activities === null ? null : new Map(activities.map((activity) => [activity.activityId || activity.activityKey, activity]));
  const ids = new Set();
  const normalizedPages = {};
  for (const [pageId, hotspots] of Object.entries(input.pages)) {
    if (!activityKeyPattern.test(pageId) || (pageById && !pageById.has(pageId))) throw new Error(`Unknown managed component page id: ${pageId}`);
    if (!Array.isArray(hotspots)) throw new Error(`Hotspots for ${pageId} must be an array.`);
    const page = pageById?.get(pageId) || null;
    const normalized = hotspots.map((hotspot) => {
      if (!hotspot || typeof hotspot !== "object" || Array.isArray(hotspot)) throw new Error(`Page ${pageId} contains an invalid hotspot.`);
      const id = String(hotspot.id || "");
      if (!hotspotIdPattern.test(id) || ids.has(id)) throw new Error(`Page ${pageId} contains an invalid or duplicate hotspot id.`);
      ids.add(id);
      if (hotspot.pageId !== pageId || hotspot.actionType !== "normalized_activity") throw new Error(`Hotspot ${id} has an invalid page or action.`);
      const unitNumber = Number(hotspot.unitNumber);
      if (!Number.isInteger(unitNumber) || unitNumber < 1 || unitNumber > 10 || (page && unitNumber !== page.unitNumber)) throw new Error(`Hotspot ${id} has an invalid unitNumber.`);
      const activityKey = String(hotspot.activityKey || "");
      if (!activityKeyPattern.test(activityKey) || (activityById && !activityById.has(activityKey))) throw new Error(`Hotspot ${id} references an unavailable activityKey.`);
      if (requireActivityPage && activityById.get(activityKey).hotspotPageInvariant === true && activityById.get(activityKey).pageId !== pageId) throw new Error(`Hotspot ${id} references an activityKey on another page.`);
      const left = finiteCoordinate(hotspot.left, "left", id); const top = finiteCoordinate(hotspot.top, "top", id);
      const width = finiteCoordinate(hotspot.width, "width", id); const height = finiteCoordinate(hotspot.height, "height", id);
      if (left < 0 || top < 0 || width <= 0 || height <= 0 || left + width > 100 || top + height > 100) throw new Error(`Hotspot ${id} coordinates must stay within the page image.`);
      return { id, unitNumber, pageId, left, top, width, height, label: String(hotspot.label || activityById?.get(activityKey)?.title || activityKey).trim().slice(0, 200), actionType: "normalized_activity", activityKey };
    });
    if (normalized.length) normalizedPages[pageId] = normalized;
  }
  return { schemaVersion: ULTIMATE_B2_HOTSPOT_SCHEMA_VERSION, packageSlug: identity.bookSlug, componentSlug: identity.componentSlug, pages: normalizedPages };
}

export function validateManagedComponentHotspotManifestStructure(input, identity) {
  const normalizedIdentity = managedIdentity(identity);
  return validateAndNormalizeManagedComponentHotspotManifest(input, normalizedIdentity);
}

export function pruneComponentActivityHotspots(input, activityId) {
  if (input?.componentSlug === ULTIMATE_B2_HOTSPOT_COMPONENT) return pruneUltimateB2ActivityHotspots(input, activityId);
  const manifest = validateManagedComponentHotspotManifestStructure(input, { bookSlug: input?.packageSlug, componentSlug: input?.componentSlug });
  let removedCount = 0;
  const pages = {};
  for (const [pageId, hotspots] of Object.entries(manifest.pages)) {
    const retained = hotspots.filter((hotspot) => { const remove = hotspot.activityKey === activityId; if (remove) removedCount += 1; return !remove; });
    if (retained.length) pages[pageId] = retained;
  }
  return { manifest: { ...manifest, pages }, removedCount };
}
