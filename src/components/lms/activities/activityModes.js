export const ACTIVITY_MODES = Object.freeze({
  STUDENT: "student",
  TEACHER_PREVIEW: "teacher-preview",
  TEACHER_PRESENTATION: "teacher-presentation",
  OFFLINE_STUDENT: "offline-student",
  ANDROID_OFFLINE: "android-offline",
});

const studentCapabilities = Object.freeze({
  canEditAnswers: true,
  canSubmitStudentWork: true,
  canRequestSolutions: false,
  canRevealSolutions: false,
  canCheckLocally: false,
  canResetActivity: true,
  isReadOnly: false,
  isPresentation: false,
  showLargeControls: false,
  persistAttempt: true,
});

const capabilitiesByMode = Object.freeze({
  [ACTIVITY_MODES.STUDENT]: studentCapabilities,
  [ACTIVITY_MODES.OFFLINE_STUDENT]: Object.freeze({
    ...studentCapabilities,
    canSubmitStudentWork: false,
    persistAttempt: true,
  }),
  [ACTIVITY_MODES.ANDROID_OFFLINE]: Object.freeze({
    ...studentCapabilities,
    canSubmitStudentWork: false,
    persistAttempt: true,
  }),
  [ACTIVITY_MODES.TEACHER_PREVIEW]: Object.freeze({
    canEditAnswers: false,
    canSubmitStudentWork: false,
    canRequestSolutions: false,
    canRevealSolutions: false,
    canCheckLocally: false,
    canResetActivity: false,
    isReadOnly: true,
    isPresentation: false,
    showLargeControls: false,
    persistAttempt: false,
  }),
  [ACTIVITY_MODES.TEACHER_PRESENTATION]: Object.freeze({
    canEditAnswers: true,
    canSubmitStudentWork: false,
    canRequestSolutions: true,
    canRevealSolutions: true,
    canCheckLocally: true,
    canResetActivity: true,
    isReadOnly: false,
    isPresentation: true,
    showLargeControls: true,
    persistAttempt: false,
  }),
});

export function normalizeActivityMode(mode = ACTIVITY_MODES.STUDENT) {
  return capabilitiesByMode[mode] ? mode : ACTIVITY_MODES.STUDENT;
}

export function getActivityModeCapabilities(mode = ACTIVITY_MODES.STUDENT) {
  return capabilitiesByMode[normalizeActivityMode(mode)];
}

export function canOpenActivityInMode(activity, mode = ACTIVITY_MODES.STUDENT) {
  if (!activity) return false;
  const disabled = activity.availability === "disabled"
    || activity.implementationMode === "unsupported-disabled"
    || activity.implementationStatus === "disabled-editorial-only";
  if (!disabled) return true;
  return normalizeActivityMode(mode) === ACTIVITY_MODES.TEACHER_PREVIEW;
}
