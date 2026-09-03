export function buildLegacyFinalSubmission({ assignmentId, activityId, result } = {}) {
  return {
    assignmentId,
    activityId,
    answers: result?.answers || {},
  };
}

export function buildNativeFinalSubmission({ assignmentId, target, responses = {} } = {}) {
  const interaction = target?.entry?.document?.parts?.[0]?.interaction || {};
  const questions = target?.nativeKind === "drag-drop"
    ? (interaction.panels || []).flatMap((panel) => panel.dropTargets || [])
    : interaction.questions || interaction.items || [];
  return {
    assignmentId,
    response: {
      schemaVersion: target?.capability?.responseSchemaVersion,
      items: questions
        .filter((question) => !["single-choice", "drag-drop"].includes(target?.nativeKind) || responses[question.id])
        .map((question) => ({ id: question.id, value: responses[question.id] || "" })),
    },
  };
}

export function isDuplicateFinalSubmission(error) {
  return error?.status === 409 && /already been submitted/i.test(error?.message || error?.payload?.error || "");
}
