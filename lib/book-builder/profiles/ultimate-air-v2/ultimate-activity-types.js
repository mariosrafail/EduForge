export const ACTIVITY_DISPOSITIONS = new Set([
  "structured-activity-candidate", "structured-activity-with-raster-gaps", "media-only",
  "teacher-reveal-only", "display-or-print-content", "unsupported-publisher-interaction",
  "non-exercise", "malformed-or-unresolved",
]);

const LEGACY_GAMES = new Set(["tictactoe", "choosinggame", "score4", "spinningwheel"]);

const TYPE_MAP = new Map([
  ["mc", ["multiple-choice", "candidate-only", "multiple_choice"]],
  ["write", ["typed-short-answer", "candidate-only", null]],
  ["dnd", ["drag-and-drop-matching", "candidate-only", "matching"]],
  ["dndcat", ["classification-grouping", "new-runtime-required", null]],
  ["sa", ["teacher-reveal", "teacher-only-review", null]],
  ["video", ["media-only-interaction", "media-only", null]],
  ["circle", ["image-region-selection", "new-runtime-required", null]],
  ["karaokescroll", ["synchronized-media-highlight", "new-runtime-required", null]],
  ["cryptex", ["unsupported-publisher-interaction", "new-runtime-required", null]],
  ["print", ["display-content", "non-scored-content", null]],
  ["display", ["display-content", "non-scored-content", null]],
]);

export function mapPublisherActivityTypes(publisherTypes = []) {
  const rawPublisherTypes = [...new Set(publisherTypes.map(String).filter(Boolean))].sort();
  const mapped = rawPublisherTypes.map((raw) => {
    const lower = raw.toLowerCase();
    const values = TYPE_MAP.get(lower) || (LEGACY_GAMES.has(lower)
      ? ["legacy-game-question-bank", "new-runtime-required", null]
      : ["unsupported-publisher-interaction", "new-runtime-required", null]);
    return { rawPublisherType: raw, normalizedCandidateType: values[0], runtimeSupportStatus: values[1], publicationTypeCandidate: values[2] };
  });
  const normalized = [...new Set(mapped.map((item) => item.normalizedCandidateType))];
  const support = [...new Set(mapped.map((item) => item.runtimeSupportStatus))];
  const publication = [...new Set(mapped.map((item) => item.publicationTypeCandidate).filter(Boolean))];
  return {
    rawPublisherTypes,
    mappings: mapped,
    normalizedCandidateType: normalized.length === 1 ? normalized[0] : normalized.length ? "mixed-publisher-interaction" : "non-exercise",
    runtimeSupportStatus: support.length === 1 ? support[0] : support.length ? "review-required" : "not-applicable",
    publicationTypeCandidate: publication.length === 1 && mapped.every((item) => item.publicationTypeCandidate === publication[0]) ? publication[0] : null,
    unsupportedOrNewRuntime: support.some((item) => item === "new-runtime-required"),
    confidence: mapped.length ? (normalized.length === 1 ? 1 : 0.65) : 1,
    reviewRequired: mapped.some((item) => ["new-runtime-required", "teacher-only-review"].includes(item.runtimeSupportStatus)) || normalized.length > 1,
  };
}

export function classifyActivityDisposition({ publisherTypes = [], signals = {}, malformed = false }) {
  const mapped = mapPublisherActivityTypes(publisherTypes);
  if (malformed) return { disposition: "malformed-or-unresolved", confidence: 1, matchedEvidence: ["malformed-metadata"], missingEvidence: [], conflictingEvidence: [], ...mapped, reviewRequired: true };
  if (!publisherTypes.length && !signals.questionBank && !signals.answerBearing && !signals.media) return { disposition: "non-exercise", confidence: 0.95, matchedEvidence: ["no-exercise-signals"], missingEvidence: [], conflictingEvidence: [], ...mapped };
  if (publisherTypes.some((type) => type.toLowerCase() === "video") || signals.video && !signals.answerBearing) return { disposition: "media-only", confidence: 0.95, matchedEvidence: ["video-evidence"], missingEvidence: [], conflictingEvidence: [], ...mapped };
  if (publisherTypes.some((type) => type.toLowerCase() === "sa")) return { disposition: "teacher-reveal-only", confidence: 0.9, matchedEvidence: ["publisher-type:sa"], missingEvidence: [], conflictingEvidence: [], ...mapped, reviewRequired: true };
  if (publisherTypes.some((type) => ["print", "display"].includes(type.toLowerCase()))) return { disposition: "display-or-print-content", confidence: 0.95, matchedEvidence: ["display-type"], missingEvidence: [], conflictingEvidence: [], ...mapped };
  if (mapped.unsupportedOrNewRuntime) return { disposition: "unsupported-publisher-interaction", confidence: 0.95, matchedEvidence: ["unsupported-runtime-type"], missingEvidence: [], conflictingEvidence: [], ...mapped, reviewRequired: true };
  const rasterGaps = (signals.choices && !signals.structuredChoiceText) || (signals.drags && !signals.structuredDragLabels) || (signals.answerBearing && !signals.structuredPrompt);
  return { disposition: rasterGaps ? "structured-activity-with-raster-gaps" : "structured-activity-candidate", confidence: rasterGaps ? 0.8 : 0.95, matchedEvidence: [signals.questionBank ? "question-bank" : "structured-exercise"], missingEvidence: rasterGaps ? ["structured-text"] : [], conflictingEvidence: [], ...mapped, reviewRequired: rasterGaps || mapped.reviewRequired };
}
