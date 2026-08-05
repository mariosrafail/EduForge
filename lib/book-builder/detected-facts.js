import { createHash } from "node:crypto";
import { sortJsonValue, stableHash } from "./stable-json.js";

export const FACT_KINDS = new Set([
  "application_identity",
  "canonical_app_root",
  "main_swf_identity",
  "profile_evidence",
  "component_directory_candidate",
  "unit_directory_candidate",
  "part_directory_candidate",
  "object_directory_candidate",
  "atlas_family_candidate",
  "media_family_candidate",
  "metadata_family_candidate",
  "iwb_decoder_identity",
  "iwb_document_summary",
  "component_structure_candidate",
  "unit_structure_candidate",
  "component_hierarchy_candidate",
  "unit_group_hierarchy_candidate",
  "part_page_candidate",
  "page_asset_variant",
  "menu_layout_candidate",
  "menu_button_candidate",
  "home_branding_candidate",
  "gaf_timeline_candidate",
  "atlas_definition_candidate",
  "atlas_crop_candidate",
  "hotspot_geometry_candidate",
  "media_binding_candidate",
  "review_issue_dependency",
  "activity_signature_candidate",
  "activity_disposition_candidate",
  "activity_content_candidate",
  "activity_title_content_anchor",
  "activity_instruction_content_anchor",
  "activity_question_content_anchor",
  "activity_option_content_anchor",
  "activity_draggable_content_anchor",
  "activity_target_content_anchor",
  "activity_response_field_content_anchor",
  "activity_solution_evidence_summary",
]);

export function normalizeSourceLocator(locator) {
  const normalized = String(locator || ".").replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized === ".") return ".";
  if (/^(?:[a-z]:\/|\/|\\\\)/i.test(normalized) || normalized.split("/").includes("..")) {
    throw new Error("Fact locators must be safe source-relative paths");
  }
  return normalized.split("/").filter(Boolean).join("/");
}

export function stableFactId(kind, locator) {
  const identity = `${kind}\0${normalizeSourceLocator(locator).toLowerCase()}`;
  return `fact_${createHash("sha256").update(identity).digest("hex").slice(0, 24)}`;
}

export function createDetectedFact({ kind, locator = ".", value, parserId, parserVersion, confidence = 1, evidence = [], diagnostics = [] }) {
  if (!FACT_KINDS.has(kind)) throw new Error(`Unsupported detected fact kind: ${kind}`);
  const sourceLocator = normalizeSourceLocator(locator);
  if (!parserId || !parserVersion) throw new Error("Detected facts require parserId and parserVersion");
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error("Detected fact confidence must be between 0 and 1");
  const normalizedValue = sortJsonValue(value);
  return {
    id: stableFactId(kind, sourceLocator),
    kind,
    sourceLocator,
    value: normalizedValue,
    evidenceHash: stableHash({ value: normalizedValue, evidence }),
    parserId,
    parserVersion,
    confidence,
    evidence: [...evidence].map(sortJsonValue),
    diagnostics: [...diagnostics].map(String).sort(),
  };
}

export function normalizeDetectedFacts(facts = []) {
  const ids = new Set();
  return facts.map((fact) => {
    const normalized = createDetectedFact({
      kind: fact.kind,
      locator: fact.sourceLocator,
      value: fact.value,
      parserId: fact.parserId,
      parserVersion: fact.parserVersion,
      confidence: fact.confidence,
      evidence: fact.evidence,
      diagnostics: fact.diagnostics,
    });
    if (fact.id && fact.id !== normalized.id) throw new Error(`Detected fact ${fact.id} has an unstable identity`);
    if (fact.evidenceHash && fact.evidenceHash !== normalized.evidenceHash) throw new Error(`Detected fact ${normalized.id} has an invalid evidence hash`);
    if (ids.has(normalized.id)) throw new Error(`Duplicate detected fact: ${normalized.id}`);
    ids.add(normalized.id);
    return normalized;
  }).sort((left, right) => left.id.localeCompare(right.id));
}
