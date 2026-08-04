export const PROFILE_DETECTOR_VERSION = "1.0";
export const PROFILE_CONFIDENCE_THRESHOLD = 0.7;

function evidence(id, matched, weight) { return { id, matched: Boolean(matched), weight }; }

function evaluate(profileId, rules, conflicts = []) {
  const confidence = Number((rules.reduce((sum, rule) => sum + (rule.matched ? rule.weight : 0), 0) / rules.reduce((sum, rule) => sum + rule.weight, 0)).toFixed(3));
  return {
    profileId,
    confidence,
    matchedEvidence: rules.filter((rule) => rule.matched).map((rule) => rule.id).sort(),
    missingEvidence: rules.filter((rule) => !rule.matched).map((rule) => rule.id).sort(),
    conflictingEvidence: conflicts.filter((item) => item.matched).map((item) => item.id).sort(),
  };
}

export function detectSourceProfile(fingerprint) {
  const f = fingerprint.features;
  const base = f.validAirDescriptor && f.calledutainmentApplicationId && f.hasBooksRoot;
  const ultimateRules = [
    evidence("hamilton_air_base", base, 15),
    evidence("iwb_metadata_present", f.iwbCount > 0, 20),
    evidence("ultimate_parameter_families", f.hasUltimateParameterFamilies, 25),
    evidence("hd_sd_layout", f.hasHdSdLayout, 15),
    evidence("book_menu_common", f.hasBookMenuCommon, 10),
    evidence("home_gaf_package", f.hasHomeGafPackage, 10),
    evidence("book_unit_part_object_structure", f.partDirectoryCount > 0 && f.objectDirectoryCount > 0, 5),
  ];
  const journeyRules = [
    evidence("hamilton_air_base", base, 15),
    evidence("iwb_family_absent", f.iwbCount === 0, 15),
    evidence("global_exercise_templates", f.hasJourneyExerciseTemplates, 25),
    evidence("single_resolution_parts", f.hasSingleResolutionPartImages, 20),
    evidence("flat_atlas_metadata", f.hasFlatAtlasMetadata, 15),
    evidence("hd_sd_layout_absent", !f.hasHdSdLayout, 10),
  ];
  const ultimate = evaluate("ultimate-air-v2", ultimateRules, [evidence("journey_exercise_templates_present", f.hasJourneyExerciseTemplates, 1), evidence("iwb_family_absent", f.iwbCount === 0, 1)]);
  const journey = evaluate("journey-air-v1", journeyRules, [evidence("iwb_metadata_present", f.iwbCount > 0, 1), evidence("hd_sd_layout_present", f.hasHdSdLayout, 1)]);
  const ultimateHardMatch = base && f.iwbCount > 0 && f.hasUltimateParameterFamilies && f.hasHdSdLayout;
  const journeyHardMatch = base && f.iwbCount === 0 && f.hasJourneyExerciseTemplates && f.hasSingleResolutionPartImages;
  let selected = null;
  if (ultimateHardMatch && ultimate.confidence >= PROFILE_CONFIDENCE_THRESHOLD && !ultimate.conflictingEvidence.length) selected = ultimate;
  else if (journeyHardMatch && journey.confidence >= PROFILE_CONFIDENCE_THRESHOLD && !journey.conflictingEvidence.length) selected = journey;
  if (!selected) {
    const strongest = [ultimate, journey].sort((left, right) => right.confidence - left.confidence)[0];
    selected = {
      profileId: "generic-air-fallback",
      confidence: Number(Math.max(0, 1 - strongest.confidence).toFixed(3)),
      matchedEvidence: base ? ["hamilton_air_base"] : [],
      missingEvidence: ["known_profile_confidence_threshold"],
      conflictingEvidence: [...new Set([...ultimate.conflictingEvidence, ...journey.conflictingEvidence])].sort(),
    };
  }
  return { id: selected.profileId, confidence: selected.confidence, detectorVersion: PROFILE_DETECTOR_VERSION, matchedEvidence: selected.matchedEvidence, missingEvidence: selected.missingEvidence, conflictingEvidence: selected.conflictingEvidence, candidates: [ultimate, journey] };
}
