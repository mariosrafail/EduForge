import { NATIVE_ACTIVITY_KINDS } from "../../../src/data/native-activities/nativeActivityKinds.js";
import { NativeActivityPlacementError } from "../../../src/data/native-activities/nativeActivityPlacementError.js";
import { resolveBuilderServerComponent } from "./_builder-component-registry.js";

const SAFE_PAGE_ID = /^[a-z0-9][a-z0-9-]{0,127}$/;

function registrationFor(value) {
  const registration = typeof value === "string"
    ? resolveBuilderServerComponent("ultimate-b2", value)
    : resolveBuilderServerComponent(value?.bookSlug, value?.componentSlug);
  if (!registration || registration.mode !== "managed") throw new Error("Managed native activity component is unsupported.");
  return registration;
}

export function createManagedNativeActivityAdapter(value) {
  const registration = registrationFor(value);
  const { bookSlug, componentSlug } = registration;
  const prefix = registration.nativeActivity.activityPrefix;
  const pagePrefix = `${registration.pageCatalog.pagePrefix}-page-`;
  function validateContext(context) {
    const { sql, bookSlug, componentSlug: requestedComponentSlug } = context || {};
    if (bookSlug !== registration.bookSlug || requestedComponentSlug !== componentSlug) throw new NativeActivityPlacementError("Managed native activity placement is invalid.");
    return sql;
  }
  function validatePageId(input) {
    const pageId = String(input?.pageId || "");
    if (!SAFE_PAGE_ID.test(pageId)) throw new NativeActivityPlacementError("Managed native activity placement is invalid.", { pageId });
    return pageId;
  }
  function unavailablePlacement(pageId) {
    return {
      pageId,
      sourcePageId: pageId,
      assignmentState: "unassigned",
      unassignedReason: "page-unavailable",
    };
  }
  function placementFromRow(pageId, row, { allowUnavailable }) {
    const unitNumber = Number(row?.unit_number);
    const hasValidUnit = row?.unit_id != null && Number.isInteger(unitNumber) && unitNumber >= 1 && unitNumber <= 10;
    if (!row || !hasValidUnit) {
      if (!allowUnavailable) throw new NativeActivityPlacementError("Managed native activity placement is unknown.", { pageId });
      return unavailablePlacement(pageId);
    }
    const active = row.source_metadata?.is_active === true && row.source_metadata?.is_permanently_deleted !== true;
    if (!allowUnavailable && !active) throw new NativeActivityPlacementError("Managed native activity placement is inactive.", { pageId });
    return {
      pageId,
      sourcePageId: pageId,
      unitId: String(row.unit_id),
      unitNumber,
      unitTitle: row.unit_title,
      sortOrder: Number(row.sort_order),
      assignmentState: active ? "assigned" : "unassigned",
      ...(active ? {} : { unassignedReason: row.source_metadata?.is_deleted === true ? "page-deleted" : "page-unavailable" }),
    };
  }
  async function resolvePlacements(inputs, context, { allowUnavailable }) {
    const sql = validateContext(context);
    if (!Array.isArray(inputs)) throw new NativeActivityPlacementError("Managed native activity placements are invalid.");
    const pageIds = [...new Set(inputs.map((input, placementIndex) => {
      try { return validatePageId(input); }
      catch (error) {
        if (error instanceof NativeActivityPlacementError) error.placementIndex = placementIndex;
        throw error;
      }
    }))];
    if (!pageIds.length) return new Map();
    if (typeof sql !== "function") throw new NativeActivityPlacementError("Managed native activity placement is invalid.");
    const stableKeys = pageIds.map((pageId) => `${componentSlug}/pages/${pageId}`);
    const rows = await sql`
      select page.stable_key,page.sort_order,page.source_metadata,unit.id unit_id,unit.unit_number,unit.title unit_title
      from book_pages page
      join book_packages package on package.id=page.book_package_id
      join book_components component on component.id=page.book_component_id and component.book_package_id=package.id
      left join units unit on unit.id=page.unit_id and unit.book_component_id=component.id and unit.unit_number between 1 and 10
      where package.slug=${registration.bookSlug} and component.slug=${componentSlug} and page.stable_key=any(${stableKeys}::text[])
    `;
    const requested = new Set(stableKeys);
    const rowsByStableKey = new Map();
    for (const row of rows) {
      if (!requested.has(row?.stable_key) || rowsByStableKey.has(row.stable_key)) throw new Error("Managed native activity placement result is invalid.");
      rowsByStableKey.set(row.stable_key, row);
    }
    return new Map(pageIds.map((pageId) => [
      pageId,
      placementFromRow(pageId, rowsByStableKey.get(`${componentSlug}/pages/${pageId}`), { allowUnavailable }),
    ]));
  }
  async function resolvePlacement(input, context, { allowUnavailable }) {
    const pageId = validatePageId(input);
    return (await resolvePlacements([{ pageId }], context, { allowUnavailable })).get(pageId);
  }
  return Object.freeze({
    id: `${componentSlug}-native-activities`, bookSlug, componentSlug, kinds: NATIVE_ACTIVITY_KINDS,
    ownsActivityId(activityId) { return new RegExp(`^${prefix}-[a-z0-9-]+-o\\d+$`).test(String(activityId || "")); },
    normalizePlacement(input, context) { return resolvePlacement(input, context, { allowUnavailable: false }); },
    normalizeDestinationPlacement(input, context) { return resolvePlacement(input, context, { allowUnavailable: false }); },
    resolveExistingPlacement(input, context) { return resolvePlacement(input, context, { allowUnavailable: true }); },
    resolveExistingPlacements(inputs, context) { return resolvePlacements(inputs, context, { allowUnavailable: true }); },
    nextActivityId({ placement, nativeIndex, occupiedActivityIds = [] }) {
      const occupied = new Set([...(nativeIndex?.activities || []).map((item) => item.activityId), ...occupiedActivityIds]);
      const pageToken = (placement.pageId.startsWith(pagePrefix) ? placement.pageId.slice(pagePrefix.length) : placement.pageId).slice(-40);
      for (let ordinal = 1; ordinal < 10000; ordinal += 1) {
        const candidate = `${prefix}-${pageToken}-o${ordinal}`;
        if (!occupied.has(candidate)) return candidate;
      }
      throw new Error("Managed native activity identity space is exhausted.");
    },
    sortOrder({ placement, activityId }) {
      const ordinal = Number(String(activityId).match(/-o(\d+)$/)?.[1] || 0);
      return (placement.unitNumber * 1_000_000) + (placement.sortOrder * 1_000) + ordinal;
    },
  });
}
