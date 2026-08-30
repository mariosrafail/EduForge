import { NATIVE_ACTIVITY_KINDS } from "../../../src/data/native-activities/nativeActivityKinds.js";

const SAFE_PAGE_ID = /^[a-z0-9][a-z0-9-]{0,127}$/;

function prefixFor(componentSlug) {
  if (componentSlug === "ultimate-b2-workbook") return "ultimate-b2-wb";
  if (componentSlug === "ultimate-b2-grammar-book") return "ultimate-b2-gb";
  throw new Error("Managed native activity component is unsupported.");
}

export function createManagedNativeActivityAdapter(componentSlug) {
  const prefix = prefixFor(componentSlug);
  async function resolvePlacement(input, context, { requireActive }) {
    const { sql, bookSlug, componentSlug: requestedComponentSlug } = context || {};
    if (!SAFE_PAGE_ID.test(String(input?.pageId || "")) || typeof sql !== "function" || bookSlug !== "ultimate-b2" || requestedComponentSlug !== componentSlug) throw new Error("Managed native activity placement is invalid.");
    const stableKey = `${componentSlug}/pages/${input.pageId}`;
    const rows = await sql`
      select page.stable_key,page.sort_order,page.source_metadata,unit.id unit_id,unit.unit_number,unit.title unit_title
      from book_pages page
      join book_packages package on package.id=page.book_package_id
      join book_components component on component.id=page.book_component_id and component.book_package_id=package.id
      join units unit on unit.id=page.unit_id and unit.book_component_id=component.id
      where package.slug=${bookSlug} and component.slug=${componentSlug} and page.stable_key=${stableKey}
        and unit.unit_number between 1 and 10
      limit 1
    `;
    const row = rows[0];
    if (!row) throw new Error("Managed native activity placement is unknown.");
    const active = row.source_metadata?.is_active === true && row.source_metadata?.is_permanently_deleted !== true;
    if (requireActive && !active) throw new Error("Managed native activity placement is inactive.");
    return {
      pageId: input.pageId,
      sourcePageId: input.pageId,
      unitId: String(row.unit_id),
      unitNumber: Number(row.unit_number),
      unitTitle: row.unit_title,
      sortOrder: Number(row.sort_order),
      assignmentState: active ? "assigned" : "unassigned",
      ...(active ? {} : { unassignedReason: row.source_metadata?.is_deleted === true ? "page-deleted" : "page-unavailable" }),
    };
  }
  return Object.freeze({
    id: `${componentSlug}-native-activities`, bookSlug: "ultimate-b2", componentSlug, kinds: NATIVE_ACTIVITY_KINDS,
    ownsActivityId(activityId) { return new RegExp(`^${prefix}-[a-z0-9-]+-o\\d+$`).test(String(activityId || "")); },
    normalizePlacement(input, context) { return resolvePlacement(input, context, { requireActive: true }); },
    normalizeDestinationPlacement(input, context) { return resolvePlacement(input, context, { requireActive: true }); },
    resolveExistingPlacement(input, context) { return resolvePlacement(input, context, { requireActive: false }); },
    nextActivityId({ placement, nativeIndex, occupiedActivityIds = [] }) {
      const occupied = new Set([...(nativeIndex?.activities || []).map((item) => item.activityId), ...occupiedActivityIds]);
      const pageToken = placement.pageId.replace(/^(?:wb|gb)-page-/, "").slice(-40);
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
