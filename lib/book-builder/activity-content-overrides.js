const CONTENT_OVERRIDES = Object.freeze({
  activity_display_title: { targetType: "activity", factKind: "activity_title_content_anchor", field: "displayTitle", availability: "displayTitleAvailability", label: "Activity display title", maximumCharacters: 300, maximumBytes: 1200 },
  activity_instruction_text: { targetType: "activity", factKind: "activity_instruction_content_anchor", field: "instructions", availability: "instructionAvailability", label: "Activity instructions", maximumCharacters: 4000, maximumBytes: 16000 },
  question_prompt_text: { targetType: "question", factKind: "activity_question_content_anchor", collection: "questions", field: "prompt", availability: "promptAvailability", label: "Question prompt", maximumCharacters: 4000, maximumBytes: 16000 },
  option_display_text: { targetType: "option", factKind: "activity_option_content_anchor", collection: "options", field: "text", availability: "textAvailability", label: "Option text", maximumCharacters: 1000, maximumBytes: 4000 },
  draggable_display_label: { targetType: "draggable", factKind: "activity_draggable_content_anchor", collection: "draggables", field: "label", availability: "labelAvailability", label: "Draggable label", maximumCharacters: 1000, maximumBytes: 4000 },
  target_display_label: { targetType: "target", factKind: "activity_target_content_anchor", collection: "targets", field: "label", availability: "labelAvailability", label: "Target label", maximumCharacters: 1000, maximumBytes: 4000 },
  response_field_prompt_text: { targetType: "response_field", factKind: "activity_response_field_content_anchor", collection: "responseFields", field: "prompt", availability: "promptAvailability", label: "Response-field prompt", maximumCharacters: 4000, maximumBytes: 16000 },
});

export const ACTIVITY_CONTENT_DECISION_KINDS = new Set(Object.keys(CONTENT_OVERRIDES));
export const ACTIVITY_CONTENT_TARGET_TYPES = new Set(Object.values(CONTENT_OVERRIDES).map((item) => item.targetType));

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
const UNSAFE_MARKUP = /<\/?[a-z][^>]*>|\b(?:javascript\s*:|data\s*:\s*text\/html)/i;
const ABSOLUTE_LOCAL_PATH = /(?:^|[\s("'`])(?:[a-z]:[\\/]|\\\\|\/(?:Users|home|var|tmp)\/)/im;

function list(value) { return Array.isArray(value) ? value : []; }
function nonEmpty(value) { return typeof value === "string" && value.length > 0; }

export function activityContentDecisionDefinition(kind) {
  return CONTENT_OVERRIDES[kind] || null;
}

export function normalizeActivityContentText(kind, value, { allowEmpty = true } = {}) {
  const definition = activityContentDecisionDefinition(kind);
  if (!definition) throw new Error(`Unsupported activity content decision kind: ${kind}`);
  if (typeof value !== "string") throw new Error(`${kind} requires a plain text string`);
  const normalized = value.replaceAll("\r\n", "\n").replaceAll("\r", "\n").trim();
  if (!allowEmpty && !normalized) throw new Error(`${kind} cannot approve an empty value`);
  if (normalized.length > definition.maximumCharacters || Buffer.byteLength(normalized, "utf8") > definition.maximumBytes) throw new Error(`${kind} exceeds its text limit`);
  if (CONTROL_CHARACTERS.test(normalized)) throw new Error(`${kind} contains control characters`);
  if (UNSAFE_MARKUP.test(normalized)) throw new Error(`${kind} must contain plain text only`);
  if (ABSOLUTE_LOCAL_PATH.test(normalized)) throw new Error(`${kind} contains an absolute local path`);
  return normalized;
}

export function findActivityContentTarget(activities, kind, targetId) {
  const definition = activityContentDecisionDefinition(kind);
  if (!definition) return null;
  const matches = [];
  for (const activity of list(activities?.candidates)) {
    if (definition.targetType === "activity" && activity.activityCandidateId === targetId) matches.push({ activity, node: activity, definition });
    if (definition.targetType === "question") for (const question of list(activity.questions)) if (question.id === targetId) matches.push({ activity, node: question, definition });
    if (definition.targetType === "option") for (const question of list(activity.questions)) for (const option of list(question.options)) if (option.id === targetId) matches.push({ activity, node: option, parent: question, definition });
    if (["draggable", "target", "response_field"].includes(definition.targetType)) {
      for (const node of list(activity[definition.collection])) if (node.id === targetId) matches.push({ activity, node, definition });
    }
  }
  return matches.length === 1 ? matches[0] : null;
}

export function detectedActivityContentValue(target) {
  return nonEmpty(target?.node?.[target?.definition?.field]) ? target.node[target.definition.field] : null;
}

function approvedDecision(decisions, kind, targetId) {
  return list(decisions).find((item) => item.kind === kind && item.targetId === targetId && item.approvalState === "approved") || null;
}

export function projectActivityContentField({ kind, targetId, detectedValue = null, availability = "unavailable", decisions = [] }) {
  const decision = approvedDecision(decisions, kind, targetId);
  const manualUsable = decision && !decision.stale && nonEmpty(decision.value);
  const detected = nonEmpty(detectedValue) ? detectedValue : null;
  return {
    kind,
    targetId,
    detectedValue: detected,
    manualValue: decision ? decision.value : null,
    effectiveValue: manualUsable ? decision.value : detected,
    valueOrigin: manualUsable ? "manual_override" : detected ? "detected" : "missing",
    availability,
    decisionId: decision?.id || null,
    approvalState: decision?.approvalState || "unresolved",
    stale: decision?.stale === true,
    staleReasons: list(decision?.staleReasons),
  };
}

function fieldProjection(kind, targetId, node, decisions) {
  const definition = activityContentDecisionDefinition(kind);
  return projectActivityContentField({
    kind, targetId, detectedValue: node?.[definition.field] ?? null,
    availability: node?.[definition.availability] || (node?.[definition.field] ? "structured" : "raster-only-or-missing"), decisions,
  });
}

export function projectEffectiveActivityContent(activity, decisions = []) {
  const title = fieldProjection("activity_display_title", activity.activityCandidateId, activity, decisions);
  const instructions = fieldProjection("activity_instruction_text", activity.activityCandidateId, activity, decisions);
  const questions = list(activity.questions).map((question) => ({
    ...question,
    promptField: fieldProjection("question_prompt_text", question.id, question, decisions),
    options: list(question.options).map((option) => ({ ...option, textField: fieldProjection("option_display_text", option.id, option, decisions) })),
  }));
  const draggables = list(activity.draggables).map((item) => ({ ...item, labelField: fieldProjection("draggable_display_label", item.id, item, decisions) }));
  const targets = list(activity.targets).map((item) => ({ ...item, labelField: fieldProjection("target_display_label", item.id, item, decisions) }));
  const responseFields = list(activity.responseFields).map((item) => ({ ...item, promptField: fieldProjection("response_field_prompt_text", item.id, item, decisions) }));
  const fields = [title, instructions, ...questions.flatMap((item) => [item.promptField, ...item.options.map((option) => option.textField)]), ...draggables.map((item) => item.labelField), ...targets.map((item) => item.labelField), ...responseFields.map((item) => item.promptField)];
  const counts = {
    totalFields: fields.length,
    missingFields: fields.filter((item) => item.valueOrigin === "missing").length,
    missingPrompts: fields.filter((item) => ["question_prompt_text", "response_field_prompt_text"].includes(item.kind) && item.valueOrigin === "missing").length,
    missingOptions: fields.filter((item) => item.kind === "option_display_text" && item.valueOrigin === "missing").length,
    missingLabels: fields.filter((item) => ["draggable_display_label", "target_display_label"].includes(item.kind) && item.valueOrigin === "missing").length,
    approvedOverrides: fields.filter((item) => item.valueOrigin === "manual_override").length,
    staleOverrides: fields.filter((item) => item.stale).length,
  };
  const completeness = counts.staleOverrides ? "stale_manual_content"
    : counts.missingFields && counts.approvedOverrides ? "partially_overridden"
      : counts.missingFields ? "unresolved_raster_gaps"
        : counts.approvedOverrides ? "complete_with_manual_overrides" : "detected_complete";
  return { title, instructions, questions, draggables, targets, responseFields, fields, counts, completeness };
}
