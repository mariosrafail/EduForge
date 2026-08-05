import { stableHash } from "../../stable-json.js";

function list(value) { return Array.isArray(value) ? value : []; }

function contentDigest(value) {
  return typeof value === "string" && value.length ? stableHash({ value }) : null;
}

function sourceReferences(value) {
  return list(value).map((item) => String(item?.sourceRelativePath || "").replaceAll("\\", "/"))
    .filter(Boolean).sort();
}

function referenceDigest(value) {
  const references = sourceReferences(value);
  return references.length ? stableHash(references) : null;
}

function anchorValue({ activity, targetId, parentId = null, index = 0, availability, text, geometry = null, sourceEvidence = [] }) {
  return {
    activityCandidateId: activity.activityCandidateId,
    targetId,
    parentId,
    index,
    availability,
    geometry: geometry || null,
    detectedContentDigest: contentDigest(text),
    sourceReferenceDigest: referenceDigest(sourceEvidence),
    sourceRelativeReferences: sourceReferences(sourceEvidence),
  };
}

function fieldLocator(activity, field, targetId) {
  return `${activity.sourceObjectLocator}/content-anchor/${field}/${targetId}`;
}

export function buildActivityContentAnchorFacts(activity, createFact) {
  const sourceEvidence = list(activity.sourceEvidenceDigests);
  const facts = [
    createFact("activity_title_content_anchor", fieldLocator(activity, "display-title", activity.activityCandidateId), anchorValue({
      activity, targetId: activity.activityCandidateId, availability: activity.displayTitleAvailability || "raster-only-or-missing",
      text: activity.displayTitle, sourceEvidence,
    })),
    createFact("activity_instruction_content_anchor", fieldLocator(activity, "instructions", activity.activityCandidateId), anchorValue({
      activity, targetId: activity.activityCandidateId, availability: activity.instructionAvailability || "raster-only-or-missing",
      text: activity.instructions, sourceEvidence,
    })),
  ];

  list(activity.questions).forEach((question, questionIndex) => {
    const questionEvidence = list(question.sourceEvidence).length ? question.sourceEvidence : sourceEvidence;
    facts.push(createFact("activity_question_content_anchor", fieldLocator(activity, "question-prompt", question.id), anchorValue({
      activity, targetId: question.id, parentId: activity.activityCandidateId, index: questionIndex + 1,
      availability: question.promptAvailability || (question.prompt ? "structured" : "raster-only-or-missing"),
      text: question.prompt, geometry: question.geometry, sourceEvidence: questionEvidence,
    })));
    list(question.options).forEach((option, optionIndex) => facts.push(createFact(
      "activity_option_content_anchor",
      fieldLocator(activity, "option-text", option.id),
      anchorValue({
        activity, targetId: option.id, parentId: question.id, index: option.order || optionIndex + 1,
        availability: option.textAvailability || (option.text ? "structured" : "raster-only-or-missing"),
        text: option.text, geometry: option.geometry, sourceEvidence: list(option.sourceEvidence).length ? option.sourceEvidence : questionEvidence,
      }),
    )));
  });

  list(activity.draggables).forEach((item, index) => facts.push(createFact(
    "activity_draggable_content_anchor", fieldLocator(activity, "draggable-label", item.id), anchorValue({
      activity, targetId: item.id, parentId: activity.activityCandidateId, index: index + 1,
      availability: item.labelAvailability || (item.label ? "structured" : "raster-only-or-missing"),
      text: item.label, geometry: item.geometry, sourceEvidence: list(item.sourceEvidence).length ? item.sourceEvidence : sourceEvidence,
    }),
  )));
  list(activity.targets).forEach((item, index) => facts.push(createFact(
    "activity_target_content_anchor", fieldLocator(activity, "target-label", item.id), anchorValue({
      activity, targetId: item.id, parentId: activity.activityCandidateId, index: index + 1,
      availability: item.labelAvailability || (item.label ? "structured" : "raster-only-or-missing"),
      text: item.label, geometry: item.geometry, sourceEvidence: list(item.sourceEvidence).length ? item.sourceEvidence : sourceEvidence,
    }),
  )));
  list(activity.responseFields).forEach((item, index) => facts.push(createFact(
    "activity_response_field_content_anchor", fieldLocator(activity, "response-prompt", item.id), anchorValue({
      activity, targetId: item.id, parentId: activity.activityCandidateId, index: index + 1,
      availability: item.promptAvailability || (item.prompt ? "structured" : "raster-only-or-missing"),
      text: item.prompt, geometry: item.geometry, sourceEvidence: list(item.sourceEvidence).length ? item.sourceEvidence : sourceEvidence,
    }),
  )));
  return facts;
}
