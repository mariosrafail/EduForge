import { ultimateB2StudentsBookAuthoringActivities, ultimateB2StudentsBookAuthoringPages } from "../../src/data/ultimate-b2/studentsBookAuthoringCatalog.js";

export const ULTIMATE_B2_HOTSPOT_SCHEMA_VERSION = "1.0";
export const ULTIMATE_B2_HOTSPOT_PACKAGE = "ultimate-b2";
export const ULTIMATE_B2_HOTSPOT_COMPONENT = "students-book";

const pageById = new Map(ultimateB2StudentsBookAuthoringPages.map((page) => [page.id, page]));
const hotspotIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;

function finiteCoordinate(value, field, id) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Hotspot ${id} has an invalid ${field}.`);
  return Math.round(number * 10_000) / 10_000;
}

function normalizeHotspot(hotspot, page, ids, activityByKey) {
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
  if (!activityByKey.has(activityKey)) throw new Error(`Hotspot ${id} references an unavailable activityKey.`);
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
    label: String(hotspot.label || activityByKey.get(activityKey).title).trim().slice(0, 200),
    actionType: "normalized_activity",
    activityKey,
  };
}

export function validateAndNormalizeUltimateB2HotspotManifest(input, activities = ultimateB2StudentsBookAuthoringActivities) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Hotspot manifest must be an object.");
  if (input.schemaVersion !== ULTIMATE_B2_HOTSPOT_SCHEMA_VERSION) throw new Error("Unsupported hotspot manifest schemaVersion.");
  if (input.packageSlug !== ULTIMATE_B2_HOTSPOT_PACKAGE) throw new Error("Only ultimate-b2 hotspots can be saved.");
  if (input.componentSlug !== ULTIMATE_B2_HOTSPOT_COMPONENT) throw new Error("Only students-book hotspots can be saved.");
  if (!input.pages || typeof input.pages !== "object" || Array.isArray(input.pages)) throw new Error("Hotspot manifest pages must be an object.");
  const activityByKey = new Map(activities.map((activity) => [activity.activityKey, activity]));

  const unknownPageIds = Object.keys(input.pages).filter((pageId) => !pageById.has(pageId));
  if (unknownPageIds.length) throw new Error(`Unknown Students Book page id: ${unknownPageIds[0]}`);

  const ids = new Set();
  const pages = {};
  for (const page of ultimateB2StudentsBookAuthoringPages) {
    if (!(page.id in input.pages)) continue;
    if (!Array.isArray(input.pages[page.id])) throw new Error(`Hotspots for ${page.id} must be an array.`);
    const normalized = input.pages[page.id].map((hotspot) => normalizeHotspot(hotspot, page, ids, activityByKey));
    if (normalized.length) pages[page.id] = normalized;
  }

  return {
    schemaVersion: ULTIMATE_B2_HOTSPOT_SCHEMA_VERSION,
    packageSlug: ULTIMATE_B2_HOTSPOT_PACKAGE,
    componentSlug: ULTIMATE_B2_HOTSPOT_COMPONENT,
    pages,
  };
}
