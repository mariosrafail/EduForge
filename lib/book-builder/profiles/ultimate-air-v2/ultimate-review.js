import { createHash } from "node:crypto";
import { normalizeSourceLocator } from "../../detected-facts.js";

export const REVIEW_REASON_CODES = new Set([
  "malformed_iwb", "ambiguous_component_role", "uncertain_printed_page_number", "missing_hd_variant", "missing_sd_variant",
  "ambiguous_special_page", "page_dimension_mismatch", "duplicate_page_variant", "atlas_metadata_image_mismatch", "invalid_atlas_bounds", "duplicate_atlas_region",
  "unresolved_menu_texture", "unresolved_menu_destination", "part_button_object_count_mismatch", "unproven_coordinate_normalization",
  "ambiguous_media_ownership", "answer_bearing_internal_data", "unsupported_profile_deviation", "held_out_profile_difference",
  "ambiguous_activity_type", "raster_prompt_missing", "raster_option_text_missing", "raster_drag_label_missing",
  "ambiguous_answer_index_base", "unresolved_answer_reference", "ambiguous_accepted_answer_delimiter", "correct_value_option_mismatch",
  "multiple_correct_option_matches", "teacher_reveal_only", "unsupported_activity_runtime", "legacy_game_shell_unsupported",
  "malformed_activity_metadata", "unknown_activity_signature", "unresolved_image_object_answer", "activity_hotspot_unresolved",
]);

export function stableReviewId(category, locator, reasonCode) {
  const identity = `${category}\0${normalizeSourceLocator(locator).toLowerCase()}\0${reasonCode}`;
  return `review_${createHash("sha256").update(identity).digest("hex").slice(0, 24)}`;
}

export function createReviewItem({ category, severity = "warning", locator = ".", dependencyFactIds = [], reasonCode, explanation, suggestedDecisionKind = null, evidence = [], blocking = false }) {
  if (!REVIEW_REASON_CODES.has(reasonCode)) throw new Error(`Unsupported review reason code: ${reasonCode}`);
  const sourceRelativeLocator = normalizeSourceLocator(locator);
  return {
    id: stableReviewId(category, sourceRelativeLocator, reasonCode), category, severity, sourceRelativeLocator,
    dependencyFactIds: [...new Set(dependencyFactIds)].sort(), reasonCode, explanation: String(explanation), suggestedDecisionKind,
    evidence, status: "open", blocking: Boolean(blocking),
  };
}

export function createReviewQueue(items) {
  const byId = new Map();
  for (const item of items) {
    if (byId.has(item.id)) throw new Error(`Duplicate review item: ${item.id}`);
    byId.set(item.id, item);
  }
  const normalized = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  const countsByReason = {}; const countsByCategory = {};
  for (const item of normalized) {
    countsByReason[item.reasonCode] = (countsByReason[item.reasonCode] || 0) + 1;
    countsByCategory[item.category] = (countsByCategory[item.category] || 0) + 1;
  }
  return { schemaVersion: "1.0", parserId: "ultimate-air-v2-review", parserVersion: "1.0", summary: { total: normalized.length, blocking: normalized.filter((item) => item.blocking).length, byReason: Object.fromEntries(Object.entries(countsByReason).sort()), byCategory: Object.fromEntries(Object.entries(countsByCategory).sort()) }, items: normalized };
}
