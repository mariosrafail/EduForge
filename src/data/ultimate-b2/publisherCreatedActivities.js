import storedRegistry from "./authoring/publisher-created-activities.json" with { type: "json" };

export const ULTIMATE_B2_PUBLISHER_ACTIVITY_REGISTRY_SCHEMA_VERSION = 1;
export const ULTIMATE_B2_PUBLISHER_ACTIVITY_KINDS = Object.freeze(["image", "open-response"]);

const activityIdPattern = /^ultimate-b2-sb-u([1-9]\d*)-p([1-9]\d*)-o([1-9]\d*)$/;

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function exactKeys(value, allowed, label) {
  const keys = Object.keys(object(value, label));
  if (keys.some((key) => !allowed.includes(key)) || allowed.some((key) => !keys.includes(key))) throw new Error(`${label} has missing or unknown fields.`);
}

function integer(value, label, minimum = 1, maximum = 10_000) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${label} is invalid.`);
  return value;
}

function text(value, label, maximum = 300) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum || /[<>]/.test(value)) throw new Error(`${label} is invalid.`);
  return value.trim();
}

export function ultimateB2PublisherRuntimeForKind(kind) {
  if (kind === "image") return Object.freeze({ activityType: "image", implementationMode: "reading-content", scoringMode: "unscored" });
  if (kind === "open-response") return Object.freeze({ activityType: "typed-short-answer", implementationMode: "teacher-reviewed", scoringMode: "pending-teacher-review" });
  throw new Error("Unsupported Ultimate B2 publisher authoring kind.");
}

export function normalizeUltimateB2PublisherActivityRecord(input) {
  const value = structuredClone(object(input, "Publisher activity record"));
  exactKeys(value, ["activityId", "publisherSourceActivityId", "stableNormalizedId", "unitNumber", "partNumber", "pageId", "printedPage", "pageSpread", "pageLabel", "sectionTitle", "title", "authoringKind", "runtime", "ownership"], "Publisher activity record");
  const activityId = text(value.activityId, "activityId", 100);
  const match = activityId.match(activityIdPattern);
  if (!match) throw new Error("Publisher activity ID does not follow the Ultimate B2 identity convention.");
  const unitNumber = integer(value.unitNumber, "unitNumber", 1, 10);
  const partNumber = integer(value.partNumber, "partNumber", 1, 100);
  if (Number(match[1]) !== unitNumber || Number(match[2]) !== partNumber) throw new Error("Publisher activity ID conflicts with its Unit/part metadata.");
  if (value.publisherSourceActivityId !== activityId || value.stableNormalizedId !== activityId) throw new Error("Publisher activity identities must be canonical and identical.");
  if (!ULTIMATE_B2_PUBLISHER_ACTIVITY_KINDS.includes(value.authoringKind)) throw new Error("Unsupported publisher activity authoring kind.");
  exactKeys(value.runtime, ["activityType", "implementationMode", "scoringMode"], "Publisher activity runtime");
  const expectedRuntime = ultimateB2PublisherRuntimeForKind(value.authoringKind);
  if (JSON.stringify(value.runtime) !== JSON.stringify(expectedRuntime)) throw new Error("Publisher activity runtime does not match its immutable authoring kind.");
  if (value.ownership !== "official-publisher") throw new Error("Publisher activity ownership is invalid.");
  return {
    activityId,
    publisherSourceActivityId: activityId,
    stableNormalizedId: activityId,
    unitNumber,
    partNumber,
    pageId: text(value.pageId, "pageId", 160),
    printedPage: integer(value.printedPage, "printedPage", 1, 1_000),
    pageSpread: text(value.pageSpread, "pageSpread", 40),
    pageLabel: text(value.pageLabel, "pageLabel", 100),
    sectionTitle: text(value.sectionTitle, "sectionTitle", 200),
    title: text(value.title, "title", 300),
    authoringKind: value.authoringKind,
    runtime: { ...expectedRuntime },
    ownership: "official-publisher",
  };
}

export function normalizeUltimateB2PublisherActivityRegistry(input) {
  const value = structuredClone(object(input, "Publisher activity registry"));
  exactKeys(value, ["schemaVersion", "activities"], "Publisher activity registry");
  if (value.schemaVersion !== ULTIMATE_B2_PUBLISHER_ACTIVITY_REGISTRY_SCHEMA_VERSION || !Array.isArray(value.activities)) throw new Error("Unsupported publisher activity registry.");
  const ids = new Set();
  const activities = value.activities.map((record, index) => {
    const normalized = normalizeUltimateB2PublisherActivityRecord(record);
    if (ids.has(normalized.activityId)) throw new Error(`Duplicate publisher activity ID at activities[${index}].`);
    ids.add(normalized.activityId);
    return normalized;
  });
  return { schemaVersion: 1, activities };
}

export function nextUltimateB2PublisherActivityId({ unitNumber, partNumber }, occupiedIds = []) {
  const prefix = `ultimate-b2-sb-u${Number(unitNumber)}-p${Number(partNumber)}-o`;
  let maximum = 0;
  for (const id of occupiedIds) {
    const match = String(id).match(activityIdPattern);
    if (match && Number(match[1]) === Number(unitNumber) && Number(match[2]) === Number(partNumber)) maximum = Math.max(maximum, Number(match[3]));
  }
  return `${prefix}${maximum + 1}`;
}

export function createUltimateB2PublisherActivityRecord({ activityId, page, authoringKind, title }) {
  const runtime = ultimateB2PublisherRuntimeForKind(authoringKind);
  return normalizeUltimateB2PublisherActivityRecord({
    activityId,
    publisherSourceActivityId: activityId,
    stableNormalizedId: activityId,
    unitNumber: Number(page.unitNumber),
    partNumber: Number(page.partNumber),
    pageId: page.id,
    printedPage: Number(page.pageNumber ?? page.physicalPageNumber),
    pageSpread: String(page.spreadNumber),
    pageLabel: page.pageNumbers?.length > 1 ? `Pages ${page.spreadNumber}` : `Page ${page.pageNumber ?? page.physicalPageNumber}`,
    sectionTitle: page.sectionTitle,
    title,
    authoringKind,
    runtime,
    ownership: "official-publisher",
  });
}

export const ultimateB2PublisherCreatedActivityRegistry = Object.freeze(normalizeUltimateB2PublisherActivityRegistry(storedRegistry));
export const ultimateB2PublisherCreatedActivities = Object.freeze(ultimateB2PublisherCreatedActivityRegistry.activities.map(Object.freeze));

export function getUltimateB2PublisherCreatedActivity(activityId, activities = ultimateB2PublisherCreatedActivities) {
  return activities.find((activity) => activity.activityId === activityId) || null;
}
