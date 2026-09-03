export const STUDENT_RUNTIME_MODES = Object.freeze({
  PRACTICE: "practice",
  ASSIGNED: "assigned",
  REVIEW: "review",
});

const baseCapabilities = Object.freeze({
  canRevealAnswerKey: false,
  canEnterFullscreen: true,
  canUseNormalStudentFeedback: true,
});

export function deriveStudentRuntimeCapabilities({
  mode = STUDENT_RUNTIME_MODES.PRACTICE,
  submittable = false,
  targetLoaded = true,
  closed = false,
  expired = false,
  submitted = false,
  supported = true,
} = {}) {
  if (mode === STUDENT_RUNTIME_MODES.REVIEW) {
    return Object.freeze({
      ...baseCapabilities,
      canEditResponses: false,
      canFinalSubmit: false,
      canPersistGrade: false,
      isLocked: true,
    });
  }

  if (mode === STUDENT_RUNTIME_MODES.ASSIGNED) {
    const canFinalSubmit = Boolean(submittable && targetLoaded && supported && !closed && !expired && !submitted);
    return Object.freeze({
      ...baseCapabilities,
      canEditResponses: canFinalSubmit,
      canFinalSubmit,
      canPersistGrade: canFinalSubmit,
      isLocked: !canFinalSubmit,
    });
  }

  return Object.freeze({
    ...baseCapabilities,
    canEditResponses: true,
    canFinalSubmit: false,
    canPersistGrade: false,
    isLocked: false,
  });
}

export function activityModeForStudentRuntime(mode) {
  if (mode === STUDENT_RUNTIME_MODES.REVIEW) return "student-review";
  if (mode === STUDENT_RUNTIME_MODES.PRACTICE) return "student-practice";
  return "student";
}
