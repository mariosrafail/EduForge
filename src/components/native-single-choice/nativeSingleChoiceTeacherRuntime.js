function visualPanels(document) {
  const presentation = document?.parts?.[0]?.interaction?.presentation;
  return presentation?.kind === "image-hotspot" ? presentation.panels || [] : [];
}

function questions(document) {
  return document?.parts?.[0]?.interaction?.questions || [];
}

function correctAnswers(teacherDocument) {
  return new Map((teacherDocument?.parts?.[0]?.solution?.correctAnswers || []).map((answer) => [answer.questionId, answer.correctOptionId]));
}

function panelIndexForQuestion(document, questionId) {
  const index = visualPanels(document).findIndex((panel) => panel.hotspots.some((hotspot) => hotspot.questionId === questionId));
  return index < 0 ? 0 : index;
}

export function createNativeSingleChoiceTeacherSession() {
  return { responses: {}, optionStates: {}, solvedQuestionIds: new Set(), panelIndex: 0 };
}

export function updateNativeSingleChoiceTeacherSession(state, publicDocument, teacherDocument, action) {
  const current = state || createNativeSingleChoiceTeacherSession();
  const panels = visualPanels(publicDocument);
  const lastPanelIndex = Math.max(0, panels.length - 1);
  if (action?.type === "reset-activity") return createNativeSingleChoiceTeacherSession();
  if (action?.type === "previous-panel") return { ...current, panelIndex: Math.max(0, current.panelIndex - 1) };
  if (action?.type === "next-panel") return { ...current, panelIndex: Math.min(lastPanelIndex, current.panelIndex + 1) };

  const answers = correctAnswers(teacherDocument);
  if (action?.type === "select") {
    if (current.solvedQuestionIds.has(action.questionId)) return current;
    const correct = answers.get(action.questionId) === action.optionId;
    return {
      responses: { ...current.responses, [action.questionId]: action.optionId },
      optionStates: { ...current.optionStates, [action.optionId]: correct ? "correct" : "incorrect" },
      solvedQuestionIds: correct ? new Set(current.solvedQuestionIds).add(action.questionId) : current.solvedQuestionIds,
      panelIndex: current.panelIndex,
    };
  }

  const unrevealed = questions(publicDocument).filter((question) => {
    const correctOptionId = answers.get(question.id);
    return correctOptionId && current.optionStates[correctOptionId] !== "correct";
  });
  if (action?.type !== "show-all" && action?.type !== "show-next") return current;
  const revealQuestions = action.type === "show-next" ? unrevealed.slice(0, 1) : unrevealed;
  if (!revealQuestions.length) return current;
  const responses = { ...current.responses };
  const optionStates = { ...current.optionStates };
  const solvedQuestionIds = new Set(current.solvedQuestionIds);
  for (const question of revealQuestions) {
    const correctOptionId = answers.get(question.id);
    responses[question.id] = correctOptionId;
    optionStates[correctOptionId] = "correct";
    solvedQuestionIds.add(question.id);
  }
  return {
    responses,
    optionStates,
    solvedQuestionIds,
    panelIndex: action.type === "show-next"
      ? panelIndexForQuestion(publicDocument, revealQuestions[0].id)
      : current.panelIndex,
  };
}

export function nativeSingleChoiceTeacherPresentationState(state, publicDocument, teacherDocument) {
  const current = state || createNativeSingleChoiceTeacherSession();
  const answers = correctAnswers(teacherDocument);
  const activityQuestions = questions(publicDocument);
  const revealed = activityQuestions.filter((question) => {
    const correctOptionId = answers.get(question.id);
    return correctOptionId && current.optionStates[correctOptionId] === "correct";
  }).length;
  return {
    panelIndex: current.panelIndex,
    panelCount: visualPanels(publicDocument).length,
    reveal: {
      supported: true,
      total: activityQuestions.length,
      revealed,
      pristine: current.panelIndex === 0
        && Object.keys(current.responses).length === 0
        && Object.keys(current.optionStates).length === 0
        && current.solvedQuestionIds.size === 0,
    },
  };
}
